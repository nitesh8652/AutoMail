import * as XLSX from 'xlsx'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const HEADER_PATTERNS = {
  email: /^e[-\s]?mail/i,
  directorName: /^director/i,
  projectName: /^project\s*name/i,
  projectType: /^project\s*type/i,
  launchDate: /^launch\s*date/i,
  completionDate: /^completion\s*date/i,
  launchedSqft: /^launched\s*sqft/i,
  launchedUnits: /^launched\s*units/i,
  unitSizeMin: /^unit\s*size[-\s]*sqft\s*min/i,
  unitSizeMax: /^unit\s*size[-\s]*sqft\s*max/i,
  percentSold: /^%?\s*sold/i,
  newLaunchPrice: /^new\s*launch\s*price/i,
  absorbedUnits: /^absorbed\s*units/i,
  constructionStage: /^construction\s*stage/i,
}

const splitLines = (value) =>
  String(value ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)

const matchHeaders = (headers) => {
  const map = {}
  headers.forEach((header) => {
    const trimmed = header.trim()
    Object.entries(HEADER_PATTERNS).forEach(([field, pattern]) => {
      if (!map[field] && pattern.test(trimmed)) map[field] = header
    })
  })
  return map
}

const SIGNATURE_BLOCK = `Best regards,
Amit
Express Rupya Capital Advisors
📞 +91 85914 58046
🌐 www.expressrupya.com`

const toFirstNameTitleCase = (name) => {
  const first = String(name ?? '').trim().split(/\s+/)[0] || ''
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

const buildPrompt = (data, directorName) => {
  const director = toFirstNameTitleCase(directorName) || 'Sir/Madam'
  return (
    `Write a personalized outreach email from Express Rupya Capital Advisors to ${director}, a director at "${data.projectName}", ` +
    `offering construction and cash-flow financing support. Use simple, clear, professional business English — everyday words, no jargon or hard-to-read language. ` +
    `Write fresh, natural sentences in your own words for each part; do not reuse stock phrasing, and make it feel written specifically for this project rather than a template. ` +
    `Never mention sales figures, percent sold, units sold, or pricing — the recipient should not feel we are tracking their sales numbers. ` +
    `Follow this structure and order:\n\n` +
    `1. A short, catchy subject line in the exact format "Subject: <text>" as the very first line, referencing "${data.projectName}" or its progress, followed by a blank line.\n` +
    `2. Greeting to ${director} using only their first name (e.g. "Dear ${director},"), never their full name and never in all caps.\n` +
    `3. A catchy, attention-grabbing opening line about the project (by name) or its construction stage — something that makes the reader want to keep reading, not a generic "hope you're doing well."\n` +
    `4. A short paragraph introducing Express Rupya Capital Advisors and how we help developers secure timely, flexible, large-scale financing.\n` +
    `5. A short paragraph on our track record: financing premium residential and commercial developments across India, working with private credit funds, AIFs, institutional investors, and international capital providers.\n` +
    `6. A bullet list (around 4 bullets) on how our financing helps: better cash flow and execution timelines, flexible non-bank funding structures, faster access to funds to avoid cost overruns, and support for current and upcoming projects.\n` +
    `7. A line offering to explore funding for their other ongoing or upcoming projects.\n` +
    `8. A call to action asking for a 15-20 minute call to discuss their funding needs.\n` +
    `9. A closing line referencing "${data.projectName}" again.\n` +
    `10. End with exactly this signature block, unchanged, on its own lines:\n${SIGNATURE_BLOCK}\n\n` +
    `Project details you may draw from, excluding any sales or pricing figures (use only what genuinely fits, do not force every field in):\n` +
    `Project type: ${data.projectType}\nLaunch date: ${data.launchDate}\nExpected completion: ${data.completionDate}\n` +
    `Launched area (sqft): ${data.launchedSqft}\nLaunched units: ${data.launchedUnits}\nUnit size range (sqft): ${data.unitSizeMin} - ${data.unitSizeMax}\n` +
    `Construction stage: ${data.constructionStage}\n\n` +
    `Return only the subject line and email body in the format described — no extra commentary.`
  )
}

export const extractProjectsFromFile = (file, { validateEmail = true } = {}) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array' })
        let foundEmailColumn = false
        const projects = []

        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
          if (rows.length === 0) return

          const headerMap = matchHeaders(Object.keys(rows[0]))
          if (!headerMap.email) return

          foundEmailColumn = true
          rows.forEach((row) => {
            const emails = splitLines(row[headerMap.email])
            if (emails.length === 0) return

            const directorNames = headerMap.directorName ? splitLines(row[headerMap.directorName]) : []

            const data = {
              projectName: String(row[headerMap.projectName] ?? '').trim(),
              projectType: String(row[headerMap.projectType] ?? '').trim(),
              launchDate: String(row[headerMap.launchDate] ?? '').trim(),
              completionDate: String(row[headerMap.completionDate] ?? '').trim(),
              launchedSqft: String(row[headerMap.launchedSqft] ?? '').trim(),
              launchedUnits: String(row[headerMap.launchedUnits] ?? '').trim(),
              unitSizeMin: String(row[headerMap.unitSizeMin] ?? '').trim(),
              unitSizeMax: String(row[headerMap.unitSizeMax] ?? '').trim(),
              percentSold: String(row[headerMap.percentSold] ?? '').trim(),
              newLaunchPrice: String(row[headerMap.newLaunchPrice] ?? '').trim(),
              absorbedUnits: String(row[headerMap.absorbedUnits] ?? '').trim(),
              constructionStage: String(row[headerMap.constructionStage] ?? '').trim(),
            }

            emails.forEach((email, index) => {
              if (validateEmail && !EMAIL_PATTERN.test(email)) return
              const directorName = directorNames[index] ?? ''
              projects.push({ email, directorName, ...data, prompt: buildPrompt(data, directorName) })
            })
          })
        })

        if (!foundEmailColumn) {
          reject(new Error('No "Email" column found in the uploaded file.'))
          return
        }

        resolve(projects)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => reject(reader.error)

    reader.readAsArrayBuffer(file)
  })
}

// ---------- NBFC mode ----------

const NBFC_HEADER_PATTERNS = {
  email: /^e[-\s]?mail/i,
  companyName: /^(company\s*)?name$/i,
  contactName: /^(contact|director|person|first\s*name)/i,
}

const NBFC_DESCRIPTION_INSTRUCTION =
  'For each company name shared, provide a short one-line description explaining what business the company is engaged in.'

const NBFC_SIGNATURE_BLOCK = `Best regards,
Diya
Express Rupya Capital Advisors
+91 81693 45033 | www.expressrupya.com
Your partner for growth!`

const buildNbfcPrompt = (companyName) =>
  `${NBFC_DESCRIPTION_INSTRUCTION}\n\n` +
  `Company name: ${companyName}\n\n` +
  `Write the description so it reads naturally right after the words "We understand that" — ` +
  `start with the company name, keep it to one sentence, and return only that sentence with no quotes or extra commentary.`

export const buildNbfcEmail = (record, description) => {
  const greetingName = toFirstNameTitleCase(record.contactName) || 'Sir/Madam'
  const company = record.companyName || 'your company'
  const cleaned = String(description ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^we understand that\s*/i, '')
    .replace(/\.+$/, '')

  return (
    `Subject: Structured Debt Funding Support for ${company}\n\n` +
    `Dear ${greetingName},\n\n` +
    `We understand that ${cleaned}.\n\n` +
    `At Express Rupya Capital Advisors, we assist businesses in raising structured debt through banks, NBFCs, AIFs, private credit funds and institutional lenders.\n\n` +
    `We can support ${company} with funding solutions such as working capital, project finance, refinancing and structured debt solutions.\n\n` +
    `We would be happy to connect and understand your funding requirements.\n\n` +
    NBFC_SIGNATURE_BLOCK
  )
}

const matchNbfcHeaders = (headers) => {
  const map = {}
  headers.forEach((header) => {
    const trimmed = header.trim()
    Object.entries(NBFC_HEADER_PATTERNS).forEach(([field, pattern]) => {
      if (!map[field] && pattern.test(trimmed)) map[field] = header
    })
  })
  return map
}

export const extractNbfcFromFile = (file, { validateEmail = true } = {}) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array' })
        let foundEmailColumn = false
        let foundNameColumn = false
        const records = []

        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
          if (rows.length === 0) return

          const headerMap = matchNbfcHeaders(Object.keys(rows[0]))
          if (!headerMap.email) return
          foundEmailColumn = true
          if (!headerMap.companyName) return
          foundNameColumn = true

          rows.forEach((row) => {
            const companyName = String(row[headerMap.companyName] ?? '').trim()
            const emails = splitLines(row[headerMap.email])
            if (!companyName || emails.length === 0) return

            const contactNames = headerMap.contactName ? splitLines(row[headerMap.contactName]) : []

            emails.forEach((email, index) => {
              if (validateEmail && !EMAIL_PATTERN.test(email)) return
              records.push({
                mode: 'nbfc',
                email,
                companyName,
                contactName: contactNames[index] ?? '',
                // Reused by the Automation card header and Status logs.
                projectName: companyName,
                directorName: contactNames[index] ?? '',
                prompt: buildNbfcPrompt(companyName),
              })
            })
          })
        })

        if (!foundEmailColumn) {
          reject(new Error('No "Email" column found in the uploaded file.'))
          return
        }
        if (!foundNameColumn) {
          reject(new Error('No "Name" column found in the uploaded file.'))
          return
        }

        resolve(records)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => reject(reader.error)

    reader.readAsArrayBuffer(file)
  })
}
