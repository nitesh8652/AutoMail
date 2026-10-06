require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const intelRoutes = require('./routes/intel');
const pool = require('./db');
const { PORT } = require('./config');

const app = express()
const port = PORT
const frontendDist = path.join(__dirname, '../Frontend/dist')

app.use(cors())
app.use(express.json({ limit: '20mb' }))
app.use(express.static(frontendDist))
app.use('/api/intel', intelRoutes)

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

// Gmail's practical daily send cap for a single account.
const DAILY_EMAIL_CAP = 250
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

// Midnight India time, so "today" doesn't depend on the server's timezone.
const startOfTodayIST = () => {
  const now = Date.now() + IST_OFFSET_MS
  return new Date(now - (now % (24 * 60 * 60 * 1000)) - IST_OFFSET_MS)
}

const EMAIL_TYPES = ['marketing', 'nbfc', 'nbfcFollowUp', 'intelligence', 'housing']

// email_send_log gained columns for the Status history; add them once if this database predates them.
const HISTORY_COLUMNS = {
  email_type: 'VARCHAR(30) NULL',
  company_name: 'VARCHAR(255) NULL',
  director_name: 'VARCHAR(255) NULL',
}
const ensureHistoryColumns = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_send_log'`
    )
    const existing = new Set(rows.map((row) => row.COLUMN_NAME))
    for (const [name, definition] of Object.entries(HISTORY_COLUMNS)) {
      if (!existing.has(name)) await pool.query(`ALTER TABLE email_send_log ADD COLUMN ${name} ${definition}`)
    }
  } catch (error) {
    console.error('Failed to add email history columns:', error.sqlMessage || error.message)
  }
}
ensureHistoryColumns()

const clip = (value, length) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, length) : null
}

// Logged server-side so every device sees the same daily count and history. A logging failure never fails the send.
const logSend = (to, subject, status, errorMessage = null, meta = {}) =>
  pool
    .query(
      `INSERT INTO email_send_log
         (to_email, subject, status, error_message, created_at, email_type, company_name, director_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        to.slice(0, 255),
        subject.slice(0, 500) || null,
        status,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
        new Date(),
        EMAIL_TYPES.includes(meta.type) ? meta.type : null,
        clip(meta.companyName, 255),
        clip(meta.directorName, 255),
      ]
    )
    .catch((error) => console.error('Failed to log email send:', error.sqlMessage || error.message))

// Rows logged before the type/company columns existed: work both out from the subject line.
const SUBJECT_TYPES = [
  { pattern: /^Fund Raising For\s+(.+)$/i, type: 'nbfc' },
  { pattern: /^Following up\s+[–-]\s+(.+)$/i, type: 'nbfcFollowUp' },
  { pattern: /^Fund Raising-\s*(.+)$/i, type: 'housing' },
  { pattern: /^Funding Requirement\s+[–-]\s+(.+)$/i, type: 'intelligence' },
]
const fromSubject = (subject) => {
  for (const { pattern, type } of SUBJECT_TYPES) {
    const match = String(subject ?? '').match(pattern)
    if (match) return { type, companyName: match[1].trim() }
  }
  return { type: 'marketing', companyName: null }
}

// Every email the server has sent (or failed to send), newest first, for the Status page.
app.get('/api/email-history', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.to_email, l.subject, l.status, l.error_message, l.created_at,
              l.email_type, l.company_name, l.director_name,
              (SELECT ie.director_name FROM intel_emails ie
                WHERE ie.director_email = l.to_email AND ie.director_name IS NOT NULL
                ORDER BY ie.id DESC LIMIT 1) AS intel_director_name
       FROM email_send_log l
       ORDER BY l.created_at DESC, l.id DESC`
    )
    res.json({
      history: rows.map((row) => {
        const guessed = fromSubject(row.subject)
        return {
          id: row.id,
          email: row.to_email,
          subject: row.subject,
          status: row.status,
          errorMessage: row.error_message,
          sentAt: row.created_at,
          type: row.email_type || guessed.type,
          companyName: row.company_name || guessed.companyName,
          directorName: row.director_name || row.intel_director_name || null,
        }
      }),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: `Failed to load email history — ${error.sqlMessage || error.message}` })
  }
})

// Wipes every row from the Status history (this also resets today's sent count).
app.delete('/api/email-history', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM email_send_log')
    res.json({ deleted: result.affectedRows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: `Failed to clear the email history — ${error.sqlMessage || error.message}` })
  }
})

app.get('/api/email-stats/today', async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(status = 'sent'), 0) AS sent, COALESCE(SUM(status = 'failed'), 0) AS failed
       FROM email_send_log WHERE created_at >= ?`,
      [startOfTodayIST()]
    )
    res.json({ sent: Number(row.sent), failed: Number(row.failed), cap: DAILY_EMAIL_CAP })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: `Failed to load today's email count — ${error.sqlMessage || error.message}` })
  }
})

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.post('/api/generate-email', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim()

  if (!prompt) {
    return res.status(400).json({ error: 'A "prompt" is required.' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' })
  }

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await openaiResponse.json()

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({ error: data.error?.message || 'OpenAI request failed.' })
    }

    const output = data.choices?.[0]?.message?.content?.trim() ?? ''
    res.json({ output })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to generate email content.' })
  }
})

app.post('/api/send-email', async (req, res) => {
  const to = String(req.body?.to ?? '').trim()
  const subject = String(req.body?.subject ?? '').trim()
  const text = String(req.body?.text ?? '').trim()
  const meta = req.body?.meta ?? {}

  if (!to || !text) {
    return res.status(400).json({ error: '"to" and "text" are required.' })
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ error: 'EMAIL_USER/EMAIL_PASS are not configured on the server.' })
  }

  try {
    const info = await transporter.sendMail({
      from: `"Express Rupya Capital Advisors" <${process.env.EMAIL_USER}>`,
      to,
      subject: subject || 'Regarding your project',
      text,
    })
    await logSend(to, subject, 'sent', null, meta)
    res.json({ success: true, messageId: info.messageId })
  } catch (error) {
    console.error(error)
    await logSend(to, subject, 'failed', error.message, meta)
    res.status(500).json({ error: 'Failed to send email.' })
  }
})

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(frontendDist, 'index.html'))
  }
  next()
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
