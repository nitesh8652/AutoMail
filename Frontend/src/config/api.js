import { buildIntelligenceEmail, buildNbfcEmail, buildNbfcFollowUpText } from './Xlsx'
import { API_BASE } from './env'

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

// Marketing prompts return the full email; NBFC and Marketing Intelligence prompts
// return a single line that gets dropped into their fixed templates.
export const generateEmailForRecord = async (record) => {
  // Follow-ups use a fixed template, so "regenerate" just rebuilds it.
  if (record.mode === 'nbfcFollowUp') return buildNbfcFollowUpText(record.companyName)
  const output = await generateEmailContent(record.prompt)
  if (record.mode === 'nbfc') return buildNbfcEmail(record, output)
  if (record.mode === 'intelligence') return buildIntelligenceEmail(record, output)
  return output
}

// ---------- Marketing Intelligence (MySQL-backed) ----------

const requestJson = async (path, options, fallbackError) => {
  const response = await fetch(`${API_BASE}${path}`, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || fallbackError)
  return data
}

// Sent in small batches so big sheets stay under any request-size limit
// (a proxy in front of the server can reject large bodies with 413). Saves are
// upserts, so re-uploading after a partial failure is safe.
const UPLOAD_BATCH_SIZE = 300

export const uploadIntelligenceData = async ({ contacts, values }, onProgress = () => {}) => {
  const batches = []
  for (let i = 0; i < contacts.length; i += UPLOAD_BATCH_SIZE) {
    batches.push({ contacts: contacts.slice(i, i + UPLOAD_BATCH_SIZE), values: [] })
  }
  for (let i = 0; i < values.length; i += UPLOAD_BATCH_SIZE) {
    batches.push({ contacts: [], values: values.slice(i, i + UPLOAD_BATCH_SIZE) })
  }

  // Totals the server confirms it wrote, to compare against what was read from the files.
  const saved = { contacts: 0, values: 0 }
  for (let i = 0; i < batches.length; i += 1) {
    const result = await requestJson(
      '/api/intel/upload',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batches[i]) },
      `Failed to save the uploaded data (batch ${i + 1} of ${batches.length}).`
    )
    saved.contacts += Number(result.contacts) || 0
    saved.values += Number(result.values) || 0
    onProgress(i + 1, batches.length)
  }
  return saved
}

export const fetchIntelligenceHasData = () =>
  requestJson('/api/intel/has-data', undefined, 'Failed to check for saved data.').then((data) => data.hasData)

export const fetchIntelligenceRecords = () =>
  requestJson('/api/intel/records', undefined, 'Failed to load saved data.')

export const clearIntelligenceData = () =>
  requestJson('/api/intel/data', { method: 'DELETE' }, 'Failed to clear the fetched data.')

const postJson = (path, body, fallbackError) =>
  requestJson(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    fallbackError
  )

export const checkManualIntelligenceRows = (rows) =>
  postJson('/api/intel/manual/check', { rows }, 'Failed to check for existing names.')

export const saveManualIntelligenceRows = (rows) =>
  postJson('/api/intel/manual', { rows }, 'Failed to save the new data.')

export const logIntelligenceEmail = (entry) =>
  requestJson(
    '/api/intel/email-log',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) },
    'Failed to save the email log.'
  )

// Shared across devices: counted by the server from every email it sends.
export const fetchTodayEmailStats = () =>
  requestJson('/api/email-stats/today', undefined, "Failed to load today's email count.")
