import {
  buildDcAdvisorsText,
  buildHousingFinanceText,
  buildIntelligenceEmail,
  buildIntelligenceFollowUpText,
  buildNbfcEmail,
  buildNbfcFollowUpText,
  buildWarehouseText,
} from './Xlsx'
import { API_BASE } from './env'

// Reads a JSON reply. An HTML reply ("Cannot POST ...") means the backend doesn't have this route,
// almost always because it is still running an older version and needs a restart.
const readJson = async (response) => {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    const missingRoute = /Cannot (GET|POST|DELETE|PUT)/i.test(text)
    throw new Error(
      missingRoute
        ? 'The backend server is out of date and does not know this request. Restart the backend (npm start in the Backend folder) and try again.'
        : `The server sent an unexpected reply (status ${response.status}). Check that the backend is running.`
    )
  }
}

export const generateEmailContent = async (prompt) => {
  const response = await fetch(`${API_BASE}/api/generate-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const data = await readJson(response)
  if (!response.ok) throw new Error(data.error || 'Failed to generate content.')
  return data.output
}

// Real Estate: the server reads the company's website and fills the fixed template.
export const generateRealEstateEmail = async (record) => {
  const response = await fetch(`${API_BASE}/api/generate-real-estate-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName: record.companyName, website: record.website, contactName: record.contactName }),
  })
  const data = await readJson(response)
  if (!response.ok) throw new Error(data.error || 'Failed to generate content.')
  return { output: data.output, whatsapp: data.whatsapp || '', linkWarnings: data.linkWarnings || [] }
}

// `meta` ({ type, companyName, directorName }) is stored with the send for the Status history.
export const sendEmail = async ({ to, subject, text, meta, inReplyTo, references }) => {
  const response = await fetch(`${API_BASE}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, text, meta, inReplyTo, references }),
  })
  const data = await readJson(response)
  if (!response.ok) {
    // `code` is 'DAILY_CAP_REACHED' when the mailbox has hit today's limit, so the send loop can stop.
    throw Object.assign(new Error(data.error || 'Failed to send email.'), { code: data.code })
  }
  return data
}

// The body calls the firm just "Express Rupya"; only the signature (from the
// "Regards" sign-off down) keeps the full "Express Rupya Capital Advisors".
const shortenFirmNameInBody = (text) => {
  const signOff = text.search(/^(best\s+)?regards,?\s*$/im)
  const body = signOff === -1 ? text : text.slice(0, signOff)
  const rest = signOff === -1 ? '' : text.slice(signOff)
  return body.replace(/Express Rupya Capital Advisors/gi, 'Express Rupya') + rest
}

// Real Estate returns the full email; NBFC and Marketing Intelligence prompts
// return a single line that gets dropped into their fixed templates.
// Resolves to { generatedEmail, linkWarnings } (+ whatsappMessage for Real Estate).
export const generateEmailForRecord = async (record) => {
  if (record.mode === 'realEstate') {
    const { output, whatsapp, linkWarnings } = await generateRealEstateEmail(record)
    return { generatedEmail: output, whatsappMessage: whatsapp, linkWarnings }
  }
  return { generatedEmail: await generateTemplatedEmail(record), linkWarnings: [] }
}

const generateTemplatedEmail = async (record) => {
  // Follow-ups use a fixed template, so "regenerate" just rebuilds it.
  if (record.mode === 'nbfcFollowUp') return buildNbfcFollowUpText(record.companyName, record.thread, record.senderName)
  if (record.mode === 'intelligenceFollowUp') return buildIntelligenceFollowUpText(record.companyName, record.thread)
  // Housing Finance uses a fixed template; the company name goes in exactly as written in the sheet.
  if (record.mode === 'housing') return buildHousingFinanceText(record.companyName)
  // DC Advisors: fixed template; subject from company_name, greeting from contact_name.
  if (record.mode === 'dcAdvisors') return buildDcAdvisorsText(record)
  // Warehouse: fixed template; subject from Company Name, greeting from Director Name.
  if (record.mode === 'warehouse') return buildWarehouseText(record)
  const output = await generateEmailContent(record.prompt)
  if (record.mode === 'nbfc') return shortenFirmNameInBody(buildNbfcEmail(record, output))
  if (record.mode === 'intelligence') return shortenFirmNameInBody(buildIntelligenceEmail(record, output))
  throw new Error(`Unknown email type "${record.mode}".`)
}

// ---------- Marketing Intelligence (MySQL-backed) ----------

const requestJson = async (path, options, fallbackError) => {
  const response = await fetch(`${API_BASE}${path}`, options)
  const data = await readJson(response)
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

// Every email the server has sent or failed to send (all modes), newest first.
export const fetchEmailHistory = async () =>
  (await requestJson('/api/email-history', undefined, 'Failed to load the email history.')).history

// Last email sent to each address (looked up in Gmail's Sent folder), keyed by lowercased email.
export const fetchFollowUpThreads = async (emails) => {
  const { threads } = await requestJson(
    '/api/followup/threads',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails }) },
    'Failed to look up earlier emails in Gmail.'
  )
  return threads
}

export const clearEmailHistory = () =>
  requestJson('/api/email-history', { method: 'DELETE' }, 'Failed to clear the email history.')

// The "From" name and address of each mailbox ({ main, dc, warehouse }), as configured on the server.
export const fetchSenders = async () =>
  (await requestJson('/api/senders', undefined, 'Failed to load the sending addresses.')).senders

// Automatic Warehouse follow-ups: { followUps, maxFollowUps, intervalDays, cc }.
export const fetchWarehouseFollowUps = () =>
  requestJson('/api/warehouse-followups', undefined, 'Failed to load the warehouse follow-ups.')

export const stopWarehouseFollowUp = (id) =>
  postJson(`/api/warehouse-followups/${id}/stop`, {}, 'Failed to stop the follow-ups.')

// Shared across devices: counted by the server from every email it sends.
export const fetchTodayEmailStats = () =>
  requestJson('/api/email-stats/today', undefined, "Failed to load today's email count.")
