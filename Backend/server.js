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

// Logged server-side so every device sees the same daily count. A logging failure never fails the send.
const logSend = (to, subject, status, errorMessage = null) =>
  pool
    .query('INSERT INTO email_send_log (to_email, subject, status, error_message, created_at) VALUES (?, ?, ?, ?, ?)', [
      to.slice(0, 255),
      subject.slice(0, 500) || null,
      status,
      errorMessage ? String(errorMessage).slice(0, 500) : null,
      new Date(),
    ])
    .catch((error) => console.error('Failed to log email send:', error.sqlMessage || error.message))

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
    await logSend(to, subject, 'sent')
    res.json({ success: true, messageId: info.messageId })
  } catch (error) {
    console.error(error)
    await logSend(to, subject, 'failed', error.message)
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
