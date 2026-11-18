require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const intelRoutes = require('./routes/intel');
const { findLastSentTo } = require('./followupThreads');
const { fetchWebsite } = require('./linkContent');
const pool = require('./db');
const { PORT } = require('./config');

const app = express()
const port = PORT
const frontendDist = path.join(__dirname, '../Frontend/dist')

app.use(cors())
app.use(express.json({ limit: '20mb' }))
// Vite fingerprints everything in /assets, so those files can be cached for a year;
// index.html is always revalidated so a new build is picked up straight away.
app.use(
  express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  })
)
app.use('/api/intel', intelRoutes)

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

// DC Advisors log in as DC_EMAIL_USER (the primary account) and send as its alias DC_EMAIL_FROM.
// Gmail only keeps the alias in "From" if it is added under the primary account's Settings > Accounts > "Send mail as".
const dcTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.DC_EMAIL_USER,
    pass: process.env.DC_EMAIL_PASS,
  },
})

// Warehouse outreach sends from the Debt Desk mailbox.
const warehouseTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.WAREHOUSE_EMAIL_USER,
    pass: process.env.WAREHOUSE_EMAIL_PASS,
  },
})

// Picks the sending mailbox for an email type; `missing` names the env vars when it isn't configured.
const mailboxFor = (type) => {
  if (type === 'dcAdvisors') {
    return {
      key: 'dc',
      transporter: dcTransporter,
      user: process.env.DC_EMAIL_FROM || process.env.DC_EMAIL_USER,
      // Must be set here: nodemailer's "From" overrides the name configured in Gmail's "Send mail as".
      name: process.env.DC_EMAIL_FROM_NAME || 'DC Advisory',
      missing: !process.env.DC_EMAIL_USER || !process.env.DC_EMAIL_PASS ? 'DC_EMAIL_USER/DC_EMAIL_PASS' : null,
    }
  }
  if (type === 'warehouse') {
    return {
      key: 'warehouse',
      transporter: warehouseTransporter,
      user: process.env.WAREHOUSE_EMAIL_USER,
      name: process.env.WAREHOUSE_EMAIL_FROM_NAME || 'Express Rupya Capital Advisors',
      missing:
        !process.env.WAREHOUSE_EMAIL_USER || !process.env.WAREHOUSE_EMAIL_PASS
          ? 'WAREHOUSE_EMAIL_USER/WAREHOUSE_EMAIL_PASS'
          : null,
    }
  }
  return {
    key: 'main',
    transporter,
    user: process.env.EMAIL_USER,
    name: 'Express Rupya Capital Advisors',
    missing: !process.env.EMAIL_USER || !process.env.EMAIL_PASS ? 'EMAIL_USER/EMAIL_PASS' : null,
  }
}

// Daily send cap per mailbox (Gmail's practical limit for each account). DC Advisors and Warehouse have their own mailboxes and caps.
const DAILY_EMAIL_CAP = 250
const DC_DAILY_EMAIL_CAP = 500
const WAREHOUSE_DAILY_EMAIL_CAP = 500
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

// Midnight India time, so "today" doesn't depend on the server's timezone.
const startOfTodayIST = () => {
  const now = Date.now() + IST_OFFSET_MS
  return new Date(now - (now % (24 * 60 * 60 * 1000)) - IST_OFFSET_MS)
}

const EMAIL_TYPES = ['realEstate', 'nbfc', 'nbfcFollowUp', 'intelligence', 'intelligenceFollowUp', 'housing', 'dcAdvisors', 'warehouse']

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
  { pattern: /^(.+?)\s+-\s+Strategic Warehousing/i, type: 'warehouse' },
]
const fromSubject = (subject) => {
  for (const { pattern, type } of SUBJECT_TYPES) {
    const match = String(subject ?? '').match(pattern)
    if (match) return { type, companyName: match[1].trim() }
  }
  return { type: 'other', companyName: null }
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

// Today's sent/failed counts per mailbox: DC Advisors and Warehouse rows count against their own mailboxes, everything else the main one.
const MAILBOX_CAPS = { main: DAILY_EMAIL_CAP, dc: DC_DAILY_EMAIL_CAP, warehouse: WAREHOUSE_DAILY_EMAIL_CAP }
const countTodayByMailbox = async () => {
  const [rows] = await pool.query(
    `SELECT CASE email_type WHEN 'dcAdvisors' THEN 'dc' WHEN 'warehouse' THEN 'warehouse' ELSE 'main' END AS mailbox,
            COALESCE(SUM(status = 'sent'), 0) AS sent, COALESCE(SUM(status = 'failed'), 0) AS failed
     FROM email_send_log WHERE created_at >= ? GROUP BY mailbox`,
    [startOfTodayIST()]
  )
  const counts = { main: { sent: 0, failed: 0 }, dc: { sent: 0, failed: 0 }, warehouse: { sent: 0, failed: 0 } }
  rows.forEach((row) => {
    counts[row.mailbox] = { sent: Number(row.sent), failed: Number(row.failed) }
  })
  return counts
}

// Sends to one mailbox run one at a time, so back-to-back or parallel sends can't slip past the cap together.
const mailboxQueues = { main: Promise.resolve(), dc: Promise.resolve(), warehouse: Promise.resolve() }
const runInMailboxQueue = (key, task) => {
  const run = mailboxQueues[key].then(task, task)
  mailboxQueues[key] = run.catch(() => {})
  return run
}

app.get('/api/email-stats/today', async (req, res) => {
  try {
    const counts = await countTodayByMailbox()
    const mailboxes = Object.fromEntries(
      Object.entries(counts).map(([key, count]) => [key, { ...count, cap: MAILBOX_CAPS[key] }])
    )
    // Top-level fields describe the main mailbox, for older frontends.
    res.json({ ...mailboxes.main, mailboxes })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: `Failed to load today's email count — ${error.sqlMessage || error.message}` })
  }
})

// The "From" of each mailbox, so the upload page can say which address the emails go out from.
app.get('/api/senders', (req, res) => {
  const senders = Object.fromEntries(
    ['realEstate', 'dcAdvisors', 'warehouse'].map((type) => {
      const { key, user, name, missing } = mailboxFor(type)
      return [key, missing ? null : { name, address: user }]
    })
  )
  res.json({ senders })
})

app.get('/', (req, res) => {
  res.send('Hello World!')
})

class OpenAIError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

const askOpenAI = async (prompt) => {
  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.6-luna',
      reasoning_effort: 'medium',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await openaiResponse.json()
  if (!openaiResponse.ok) throw new OpenAIError(data.error?.message || 'OpenAI request failed.', openaiResponse.status)
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

app.post('/api/generate-email', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim()

  if (!prompt) {
    return res.status(400).json({ error: 'A "prompt" is required.' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' })
  }

  try {
    res.json({ output: await askOpenAI(prompt) })
  } catch (error) {
    console.error(error)
    res.status(error.status || 500).json({ error: error instanceof OpenAIError ? error.message : 'Failed to generate email content.' })
  }
})

// ---------- Real Estate (company website -> personalised opening, fixed template) ----------

// LRD (lease rental discounting) only makes sense for companies holding rent-earning assets,
// so the services line and closing question have two versions.
const REAL_ESTATE_SERVICES = {
  withLrd:
    'At Express Rupya Capital Advisors, we arrange land acquisition funding, project financing, lease rental discounting (LRD) and refinancing of existing borrowings through banks and institutional lenders at competitive terms.',
  withoutLrd:
    'At Express Rupya Capital Advisors, we arrange land acquisition funding, project financing and debt refinancing through banks and institutional lenders at competitive terms.',
}
const REAL_ESTATE_QUESTION = {
  withLrd: 'Would exploring cost-effective financing options for your existing assets and upcoming developments be of interest?',
  withoutLrd: 'Would exploring cost-effective financing options for your existing and upcoming developments be of interest?',
}
const REAL_ESTATE_SIGNATURE = `Best regards,
Amit
Express Rupya Capital Advisors
+91 85914 58046`
const REAL_ESTATE_OPENING_MAX_WORDS = 60
const REAL_ESTATE_DEFAULT_TOPIC = 'Project Financing & Debt Refinancing'

// WhatsApp version: same message cut down to 100 words or fewer, with no subject or signature.
const WHATSAPP_MAX_WORDS = 100
const WHATSAPP_OPENING_MAX_WORDS = 35
const WHATSAPP_SERVICES = {
  withLrd:
    'At Express Rupya Capital Advisors, we arrange land acquisition funding, project finance, LRD and refinancing through banks and institutional lenders at competitive terms.',
  withoutLrd:
    'At Express Rupya Capital Advisors, we arrange land acquisition funding, project finance and refinancing through banks and institutional lenders at competitive terms.',
}
const WHATSAPP_CLOSING =
  'Would welcome a brief discussion to explore financing opportunities for your ongoing and upcoming projects.'
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length

// Real emails written by the team; the model copies their style, length and level of detail.
const REAL_ESTATE_EXAMPLES = [
  {
    company: 'Jayalakshmi Group',
    topic: 'Refinancing & Cost Optimisation',
    opening:
      "With Jayalakshmi Group's recent entry into residential development alongside its established commercial and warehousing portfolio, optimising borrowing costs and securing competitive funding for expansion could be valuable.",
    hasLeasedAssets: true,
  },
  {
    company: 'Vaishnavi Group',
    topic: 'Land Acquisition Funding & Debt Refinancing',
    opening:
      'As Vaishnavi Group advances its premium residential and plotted developments alongside Grade-A commercial and built-to-suit projects in Bengaluru, optimising borrowing costs and securing competitive funding for future expansion could be valuable.',
    hasLeasedAssets: true,
  },
  {
    company: 'Mista Infra',
    topic: 'Project Financing & Borrowing Cost Optimisation',
    opening:
      'As Mista Infra progresses with its integrated township developments, combining premium residences and commercial spaces across Bengaluru, competitive financing for further development and refinancing existing borrowings could help optimise overall funding costs.',
    hasLeasedAssets: false,
  },
]

// "Prestige Group" -> "Prestige Group's", "Shree Builders" -> "Shree Builders'".
const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`)

const buildRealEstatePrompt = (companyName, site) =>
  `You are writing the personalised parts of a short outreach email from Express Rupya Capital Advisors ` +
  `(a debt advisory firm) to the real estate company "${companyName}".\n\n` +
  (site.ok
    ? `TEXT FROM THE COMPANY'S WEBSITE (${site.url}):\n` + site.pages.map((page) => `--- ${page.url} ---\n${page.text}`).join('\n\n') + '\n\n'
    : `The company's website could not be read, so you know nothing specific about them beyond their name.\n\n`) +
  `Return JSON only, in exactly this shape: {"topic": "...", "opening": "...", "shortOpening": "...", "hasLeasedAssets": true|false}\n\n` +
  `EXAMPLES of what the team wants (match this style, length and level of detail):\n` +
  REAL_ESTATE_EXAMPLES.map((example) => JSON.stringify(example)).join('\n') +
  `\n\n` +
  `"topic": the subject line will read "${companyName} | <topic>". 2-6 words naming the one or two financing angles that fit this company best, ` +
  `in the style of the examples (e.g. "Land Acquisition Funding & Debt Refinancing", "Project Financing & Borrowing Cost Optimisation", ` +
  `"Refinancing & Cost Optimisation", "LRD & Refinancing"). Title Case, joined with "&".\n\n` +
  `"opening": ONE sentence, about 30-45 words (never more than ${REAL_ESTATE_OPENING_MAX_WORDS - 10}), the first line of the email after "Dear Sir,".\n` +
  `- Start with "As ${companyName} advances/progresses/expands…" or "With ${possessive(companyName)}…", like the examples ` +
  `(you may shorten the name the way the company itself does, e.g. drop "Private Limited").\n` +
  `- Name what they actually build, from the website text: segments (premium residential, plotted development, villas, integrated townships, ` +
  `Grade-A commercial, warehousing, retail, built-to-suit), a recent move or flagship project, and the city or cities they build in.\n` +
  `- Then tie it to optimising borrowing costs, securing competitive funding for expansion, or refinancing existing borrowings.\n` +
  `- Use only facts from the website text. No figures unless they appear there. Never say or imply that we looked at their website.\n` +
  (site.ok ? '' : `- Since nothing is known about them, keep it general (their real estate developments and growth) without specific claims.\n`) +
  `- Do not mention Express Rupya, our services, or ask a question — those come later in the email.\n` +
  `- British spelling (optimising), plain text, no quotes around the sentence, no markdown.\n\n` +
  `"shortOpening": the same idea for a short WhatsApp message — ONE sentence of 18-28 words (never more than ${WHATSAPP_OPENING_MAX_WORDS}), ` +
  `same rules as "opening". Example: "As Mista Infra advances its residential and commercial developments in Bengaluru, ` +
  `competitive financing could help optimise borrowing costs and support future growth."\n\n` +
  `"hasLeasedAssets": true only if the company owns or develops rent-earning assets it keeps — Grade-A offices, warehousing/logistics parks, ` +
  `malls/retail, built-to-suit or leased commercial property. False for developers who mainly build homes, plots or townships to sell ` +
  `(commercial units inside a township that are sold do not count).${site.ok ? '' : ' With nothing known, use false.'}`

// The model's JSON, checked; anything unusable falls back to a safe general line.
const parseRealEstateParts = (raw, companyName) => {
  let parsed = {}
  try {
    parsed = JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    parsed = {}
  }
  const clean = (value) =>
    String(value ?? '')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["']|["']$/g, '')

  let topic = clean(parsed.topic).replace(/^.*\|\s*/, '').replace(/\.+$/, '')
  if (!topic || topic.split(' ').length > 8) topic = REAL_ESTATE_DEFAULT_TOPIC

  // Models often write "Builders's"; English wants "Builders'".
  let opening = clean(parsed.opening).replace(/\.*$/, '.').replace(/\b(\w*s)'s\b/g, "$1'")
  const usable =
    opening.length > 20 &&
    opening.split(' ').length <= REAL_ESTATE_OPENING_MAX_WORDS &&
    !/express rupya|website|\?/i.test(opening)
  if (!usable) {
    opening = `As ${companyName} continues to grow its real estate developments, optimising borrowing costs and securing competitive funding for upcoming projects could be valuable.`
  }
  let shortOpening = clean(parsed.shortOpening).replace(/\.*$/, '.').replace(/\b(\w*s)'s\b/g, "$1'")
  const shortUsable =
    shortOpening.length > 20 &&
    wordCount(shortOpening) <= WHATSAPP_OPENING_MAX_WORDS &&
    !/express rupya|website|\?/i.test(shortOpening)
  if (!shortUsable) {
    shortOpening = `As ${companyName} grows its real estate developments, competitive financing could help optimise borrowing costs and support future growth.`
  }
  return { topic, opening, shortOpening, hasLeasedAssets: parsed.hasLeasedAssets === true }
}

const buildWhatsAppMessage = (greeting, shortOpening, variant, companyName) => {
  const build = (opening) => `${greeting}\n\n${opening}\n\n${WHATSAPP_SERVICES[variant]}\n\n${WHATSAPP_CLOSING}`
  const message = build(shortOpening)
  return wordCount(message) <= WHATSAPP_MAX_WORDS
    ? message
    : build(`As ${companyName} grows, competitive financing could help optimise borrowing costs.`)
}

const greetingFor = (contactName) => {
  const first = String(contactName ?? '')
    .trim()
    .split(/\s+/)
    .find((part) => part.replace(/[^A-Za-z]/g, '').length > 1 && !/^(mr|mrs|ms|dr|shri|smt)\.?$/i.test(part))
  return first ? `Dear ${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()},` : 'Dear Sir,'
}

// Real Estate mode: reads the company's website from the sheet and writes the subject topic and opening
// line from it; the services paragraph, question and signature are fixed.
app.post('/api/generate-real-estate-email', async (req, res) => {
  const companyName = String(req.body?.companyName ?? '').trim()
  const website = String(req.body?.website ?? '').trim()
  const contactName = String(req.body?.contactName ?? '').trim()

  if (!companyName) return res.status(400).json({ error: '"companyName" is required.' })
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' })
  }

  try {
    const site = website ? await fetchWebsite(website) : { ok: false, url: '', error: 'no website in the sheet' }
    const { topic, opening, shortOpening, hasLeasedAssets } = parseRealEstateParts(
      await askOpenAI(buildRealEstatePrompt(companyName, site)),
      companyName
    )
    const variant = hasLeasedAssets ? 'withLrd' : 'withoutLrd'
    const greeting = greetingFor(contactName)
    const output =
      `Subject: ${companyName} | ${topic}\n\n` +
      `${greeting}\n\n${opening}\n\n${REAL_ESTATE_SERVICES[variant]}\n\n${REAL_ESTATE_QUESTION[variant]}\n\n${REAL_ESTATE_SIGNATURE}`
    res.json({
      output,
      whatsapp: buildWhatsAppMessage(greeting, shortOpening, variant, companyName),
      linkWarnings: site.ok
        ? []
        : [website ? `Couldn't read ${site.url} — ${site.error}.` : 'No website for this company in the sheet.'],
    })
  } catch (error) {
    console.error(error)
    res.status(error.status || 500).json({ error: error instanceof OpenAIError ? error.message : 'Failed to generate email content.' })
  }
})

const MAX_FOLLOW_UP_LOOKUPS = 500

// Finds the last email sent to each address in Gmail's Sent folder, for threading NBFC follow-ups.
app.post('/api/followup/threads', async (req, res) => {
  const emails = [
    ...new Set(
      (Array.isArray(req.body?.emails) ? req.body.emails : [])
        .map((email) => String(email ?? '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
  if (emails.length === 0) return res.status(400).json({ error: '"emails" is required.' })
  if (emails.length > MAX_FOLLOW_UP_LOOKUPS) {
    return res.status(400).json({ error: `Too many addresses — upload at most ${MAX_FOLLOW_UP_LOOKUPS} at a time.` })
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ error: 'EMAIL_USER/EMAIL_PASS are not configured on the server.' })
  }

  try {
    res.json({ threads: await findLastSentTo(emails) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: error.message || 'Failed to look up earlier emails.' })
  }
})

app.post('/api/send-email', async (req, res) => {
  const to = String(req.body?.to ?? '').trim()
  const subject = String(req.body?.subject ?? '').trim()
  const text = String(req.body?.text ?? '').trim()
  const meta = req.body?.meta ?? {}
  // Set for follow-ups so they land as a reply in the original Gmail thread.
  const inReplyTo = String(req.body?.inReplyTo ?? '').trim() || undefined
  const references = Array.isArray(req.body?.references) ? req.body.references.map(String).filter(Boolean) : undefined

  if (!to || !text) {
    return res.status(400).json({ error: '"to" and "text" are required.' })
  }

  const mailbox = mailboxFor(meta.type)
  if (mailbox.missing) {
    return res.status(500).json({ error: `${mailbox.missing} are not configured on the server.` })
  }

  await runInMailboxQueue(mailbox.key, async () => {
    // Checked right before sending (inside the queue), so the cap holds however fast the sends arrive.
    const cap = MAILBOX_CAPS[mailbox.key]
    let sentToday
    try {
      sentToday = (await countTodayByMailbox())[mailbox.key].sent
    } catch (error) {
      console.error(error)
      return res.status(500).json({ error: `Could not check today's send count — ${error.sqlMessage || error.message}` })
    }
    if (sentToday >= cap) {
      return res.status(429).json({
        code: 'DAILY_CAP_REACHED',
        error: `Daily limit reached: ${sentToday}/${cap} emails already sent today from ${mailbox.user}. Sending resumes after midnight (IST).`,
        sent: sentToday,
        cap,
      })
    }

    try {
      const info = await mailbox.transporter.sendMail({
        from: { name: mailbox.name, address: mailbox.user },
        to,
        subject: subject || 'Regarding your project',
        text,
        inReplyTo,
        references,
      })
      // Awaited before the next queued send counts, so the count is always current.
      await logSend(to, subject, 'sent', null, meta)
      res.json({ success: true, messageId: info.messageId, sent: sentToday + 1, cap })
    } catch (error) {
      console.error(error)
      await logSend(to, subject, 'failed', error.message, meta)
      res.status(500).json({ error: 'Failed to send email.' })
    }
  })
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
