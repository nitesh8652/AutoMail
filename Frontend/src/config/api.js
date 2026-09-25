import { buildNbfcEmail } from './Xlsx'

const API_BASE =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:7301`

export const generateEmailContent = async (prompt) => {
  const response = await fetch(`${API_BASE}/api/generate-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to generate content.')
  return data.output
}

export const sendEmail = async ({ to, subject, text }) => {
  const response = await fetch(`${API_BASE}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, text }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to send email.')
  return data
}

// Marketing prompts return the full email; NBFC prompts return a one-line
// company description that gets dropped into the fixed NBFC template.
export const generateEmailForRecord = async (record) => {
  const output = await generateEmailContent(record.prompt)
  return record.mode === 'nbfc' ? buildNbfcEmail(record, output) : output
}
