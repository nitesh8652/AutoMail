require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express()
const port = 3000

app.use(cors())
app.use(express.json())

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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
    res.json({ success: true, messageId: info.messageId })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to send email.' })
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
