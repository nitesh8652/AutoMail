const express = require('express')
const { findRepliesFrom } = require('./followupThreads')

// Every Warehouse email sent from the app gets automatic follow-ups: one every 10 days, 4 in total,
// as replies in the same Gmail thread with Himanshu in CC. They stop early if the recipient replies.
const FOLLOW_UP_INTERVAL_DAYS = 10
const MAX_FOLLOW_UPS = 4
const FOLLOW_UP_CC = process.env.WAREHOUSE_FOLLOW_UP_CC || 'himanshu@expressrupya.com'

const DAY_MS = 24 * 60 * 60 * 1000
const CHECK_EVERY_MS = 15 * 60 * 1000
const FIRST_CHECK_AFTER_MS = 60 * 1000
const BATCH_SIZE = 50
// Same spacing the browser uses between bulk sends.
const SEND_GAP_MS = 3000
// A send that errors (network, Gmail hiccup) is tried again this much later.
const RETRY_AFTER_MS = DAY_MS

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const toReplySubject = (subject) => {
  const base = String(subject ?? '').replace(/^\s*((re|fwd?)\s*:\s*)+/i, '').trim()
  return base ? `Re: ${base}` : 'Re: Strategic Warehousing & Rail-Linked Logistics Opportunity – Hyderabad, Telangana'
}

const buildFollowUpText = (greeting) =>
  `${greeting}\n\n` +
  `Hope you are doing well.\n\n` +
  `Just following up on my earlier email regarding the Integrated Warehousing, Logistics & Industrial Park on the Hyderabad–Vijayawada Highway, Telangana — ` +
  `offering covered and cold storage, an operational railway siding, and industrial space for leasing, outright purchase or Built-to-Suit.\n\n` +
  `Would you be available for a brief discussion or site visit at your convenience?\n\n` +
  `Best regards,\n` +
  `Sushant Dalvi\n` +
  `Express Rupya Capital Advisors\n` +
  `+91 84540 38196 | www.expressrupya.com\n` +
  `Your partner for growth !`

const parseReferences = (value) => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// deps: pool, mailboxFor, imapAuth() -> {user, pass} | null, runInMailboxQueue, countTodayByMailbox, mailboxCaps, logSend, greetingFor
const createWarehouseFollowUps = (deps) => {
  const { pool, mailboxFor, imapAuth, runInMailboxQueue, countTodayByMailbox, mailboxCaps, logSend, greetingFor } = deps

  const ready = pool
    .query(
      `CREATE TABLE IF NOT EXISTS warehouse_followups (
         id INT AUTO_INCREMENT PRIMARY KEY,
         to_email VARCHAR(255) NOT NULL,
         company_name VARCHAR(255) NULL,
         director_name VARCHAR(255) NULL,
         subject VARCHAR(500) NULL,
         last_message_id VARCHAR(500) NULL,
         references_json TEXT NULL,
         first_sent_at DATETIME NOT NULL,
         last_sent_at DATETIME NOT NULL,
         followups_sent INT NOT NULL DEFAULT 0,
         next_due_at DATETIME NULL,
         status VARCHAR(20) NOT NULL DEFAULT 'active',
         last_error VARCHAR(500) NULL,
         UNIQUE KEY uq_warehouse_followups_email (to_email),
         KEY idx_warehouse_followups_due (status, next_due_at)
       ) CHARACTER SET utf8mb4`
    )
    .catch((error) => console.error('Failed to create warehouse_followups:', error.sqlMessage || error.message))

  // Called after a first Warehouse email goes out. Emailing the same address again restarts its schedule.
  const schedule = async ({ to, subject, messageId, companyName, directorName }) => {
    await ready
    const now = new Date()
    await pool.query(
      `INSERT INTO warehouse_followups
         (to_email, company_name, director_name, subject, last_message_id, references_json,
          first_sent_at, last_sent_at, followups_sent, next_due_at, status, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', NULL)
       ON DUPLICATE KEY UPDATE
         company_name = VALUES(company_name), director_name = VALUES(director_name), subject = VALUES(subject),
         last_message_id = VALUES(last_message_id), references_json = VALUES(references_json),
         first_sent_at = VALUES(first_sent_at), last_sent_at = VALUES(last_sent_at), followups_sent = 0,
         next_due_at = VALUES(next_due_at), status = 'active', last_error = NULL`,
      [
        String(to).trim().toLowerCase().slice(0, 255),
        companyName ? String(companyName).slice(0, 255) : null,
        directorName ? String(directorName).slice(0, 255) : null,
        String(subject ?? '').slice(0, 500),
        messageId || null,
        JSON.stringify([]),
        now,
        now,
        new Date(now.getTime() + FOLLOW_UP_INTERVAL_DAYS * DAY_MS),
      ]
    )
  }

  const setError = (id, message, retryAt) =>
    pool.query('UPDATE warehouse_followups SET last_error = ?, next_due_at = ? WHERE id = ?', [
      String(message).slice(0, 500),
      retryAt,
      id,
    ])

  // Sends the next follow-up for one row. Resolves to 'sent', 'failed' or 'cap' (daily limit reached).
  const sendOne = (row) => {
    const mailbox = mailboxFor('warehouse')
    return runInMailboxQueue(mailbox.key, async () => {
      const cap = mailboxCaps[mailbox.key]
      if ((await countTodayByMailbox())[mailbox.key].sent >= cap) return 'cap'

      const subject = toReplySubject(row.subject)
      const text = buildFollowUpText(greetingFor(row.director_name))
      const references = [...parseReferences(row.references_json), ...(row.last_message_id ? [row.last_message_id] : [])]
      const meta = { type: 'warehouseFollowUp', companyName: row.company_name, directorName: row.director_name }
      try {
        const info = await mailbox.transporter.sendMail({
          from: { name: mailbox.name, address: mailbox.user },
          to: row.to_email,
          cc: FOLLOW_UP_CC,
          subject,
          text,
          ...(row.last_message_id && { inReplyTo: row.last_message_id, references }),
        })
        await logSend(row.to_email, subject, 'sent', null, meta)
        const sentCount = row.followups_sent + 1
        const done = sentCount >= MAX_FOLLOW_UPS
        const now = new Date()
        await pool.query(
          `UPDATE warehouse_followups
             SET followups_sent = ?, last_message_id = ?, references_json = ?, last_sent_at = ?,
                 next_due_at = ?, status = ?, last_error = NULL
           WHERE id = ?`,
          [
            sentCount,
            info.messageId || row.last_message_id,
            JSON.stringify(references.slice(-20)),
            now,
            done ? null : new Date(now.getTime() + FOLLOW_UP_INTERVAL_DAYS * DAY_MS),
            done ? 'completed' : 'active',
            row.id,
          ]
        )
        return 'sent'
      } catch (error) {
        console.error(`Warehouse follow-up to ${row.to_email} failed:`, error.message)
        await logSend(row.to_email, subject, 'failed', error.message, meta)
        await setError(row.id, error.message, new Date(Date.now() + RETRY_AFTER_MS))
        return 'failed'
      }
    })
  }

  let running = false
  const runDue = async () => {
    if (running) return
    running = true
    try {
      await ready
      const [rows] = await pool.query(
        `SELECT * FROM warehouse_followups WHERE status = 'active' AND next_due_at <= ? ORDER BY next_due_at LIMIT ?`,
        [new Date(), BATCH_SIZE]
      )
      if (rows.length === 0) return

      const mailbox = mailboxFor('warehouse')
      const auth = imapAuth()
      if (mailbox.missing || !auth) {
        console.warn(`Warehouse follow-ups are due but the Debt Desk mailbox is not configured (${mailbox.missing}).`)
        return
      }

      // Anyone who has written back since the first email gets no more follow-ups.
      let replied
      try {
        replied = await findRepliesFrom(auth, Object.fromEntries(rows.map((row) => [row.to_email, row.first_sent_at])))
      } catch (error) {
        console.error('Warehouse follow-ups: reply check failed, nothing sent this round:', error.message)
        await Promise.all(rows.map((row) => setError(row.id, `Reply check failed — ${error.message}`, row.next_due_at)))
        return
      }

      for (const row of rows) {
        if (replied[row.to_email]) {
          await pool.query(
            `UPDATE warehouse_followups SET status = 'replied', next_due_at = NULL, last_error = NULL WHERE id = ?`,
            [row.id]
          )
          continue
        }
        const result = await sendOne(row)
        // Daily limit hit: the rest stay due and go out in a later round.
        if (result === 'cap') break
        await wait(SEND_GAP_MS)
      }
    } catch (error) {
      console.error('Warehouse follow-ups failed:', error.sqlMessage || error.message)
    } finally {
      running = false
    }
  }

  const start = () => {
    setTimeout(runDue, FIRST_CHECK_AFTER_MS)
    setInterval(runDue, CHECK_EVERY_MS)
  }

  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      await ready
      const [rows] = await pool.query(
        `SELECT id, to_email, company_name, director_name, first_sent_at, last_sent_at,
                followups_sent, next_due_at, status, last_error
         FROM warehouse_followups ORDER BY (status = 'active') DESC, next_due_at, id DESC`
      )
      res.json({
        maxFollowUps: MAX_FOLLOW_UPS,
        intervalDays: FOLLOW_UP_INTERVAL_DAYS,
        cc: FOLLOW_UP_CC,
        followUps: rows.map((row) => ({
          id: row.id,
          email: row.to_email,
          companyName: row.company_name,
          directorName: row.director_name,
          firstSentAt: row.first_sent_at,
          lastSentAt: row.last_sent_at,
          sent: row.followups_sent,
          nextDueAt: row.next_due_at,
          status: row.status,
          error: row.last_error,
        })),
      })
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: `Failed to load warehouse follow-ups — ${error.sqlMessage || error.message}` })
    }
  })

  // Stops the remaining follow-ups for one address (e.g. they replied by phone).
  router.post('/:id/stop', async (req, res) => {
    try {
      const [result] = await pool.query(
        `UPDATE warehouse_followups SET status = 'stopped', next_due_at = NULL WHERE id = ? AND status = 'active'`,
        [Number(req.params.id)]
      )
      res.json({ stopped: result.affectedRows > 0 })
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: `Failed to stop the follow-ups — ${error.sqlMessage || error.message}` })
    }
  })

  return { schedule, start, router }
}

module.exports = { createWarehouseFollowUps, WAREHOUSE_CC: FOLLOW_UP_CC }
