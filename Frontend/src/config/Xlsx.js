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

// Browsers invalidate a picked file if it is saved/moved on disk afterwards (e.g. edited in Excel).
const toReadError = (error, file) =>
  error?.name === 'NotFoundError' || error?.name === 'NotReadableError'
    ? new Error(`"${file?.name ?? 'The file'}" changed or was moved after you selected it. Close it in Excel, then select it again.`)
    : error
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

    reader.onerror = () => reject(toReadError(reader.error, file))

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
    `Subject: Fund Raising For ${company}\n\n` +
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

    reader.onerror = () => reject(toReadError(reader.error, file))

    reader.readAsArrayBuffer(file)
  })
}

// ---------- NBFC follow-up (bulk send, fixed template) ----------

const FOLLOW_UP_EMAIL_HEADER = /^e[-\s]?mail/i

export const NBFC_FOLLOW_UP_SUBJECT = 'Following up – Express Rupya Capital Advisors'

export const buildNbfcFollowUpEmail = () =>
  `Dear Sir/Madam,\n\n` +
  `Hope you are doing well.\n\n` +
  `Kindly advise us how we can proceed further.\n\n` +
  `Would be great to connect at your convenience to explore how we can assist. Please let us know a suitable time for a quick discussion.\n\n` +
  `Best Regards,\n` +
  `Diya\n` +
  `Express Rupya Capital Advisors\n` +
  `+91 81693 45033 | www.expressrupya.com`

export const extractEmailsFromFile = (file, { validateEmail = true } = {}) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array' })
        let foundEmailColumn = false
        const seen = new Set()
        const records = []

        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
          if (rows.length === 0) return

          const emailHeader = Object.keys(rows[0]).find((h) => FOLLOW_UP_EMAIL_HEADER.test(h.trim()))
          if (!emailHeader) return
          foundEmailColumn = true

          rows.forEach((row) => {
            splitLines(row[emailHeader]).forEach((email) => {
              if (validateEmail && !EMAIL_PATTERN.test(email)) return
              const key = email.toLowerCase()
              if (seen.has(key)) return
              seen.add(key)
              records.push({ email })
            })
          })
        })

        if (!foundEmailColumn) {
          reject(new Error('No "Email" column found in the uploaded file.'))
          return
        }

        resolve(records)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => reject(toReadError(reader.error, file))

    reader.readAsArrayBuffer(file)
  })
}

// ---------- Marketing Intelligence (two files: contacts + enquiry values) ----------

// Any column not listed here is ignored.
const INTEL_CONTACT_HEADER_PATTERNS = {
  companyCin: /^company\s*cin/i,
  companyName: /^company\s*name/i,
  directorDin: /^director'?s?\s*din/i,
  directorName: /^director'?s?\s*name/i,
  directorEmail: /^director'?s?\s*e[-\s]?mail/i,
  directorContact: /^director'?s?\s*(contact|phone|mobile)/i,
  directorPan: /^director'?s?\s*pan/i,
}

const INTEL_VALUE_HEADER_PATTERNS = {
  name: /^(company\s*)?name$/i,
  facilityName: /^facility\s*name/i,
  enquiryAmount: /^enquiry\s*amount/i,
  institutionType: /^institution\s*type/i,
  city: /^city/i,
}

const INTEL_SIGNATURE_BLOCK = `Regards,
Express Rupya Capital Advisors
+91 81693 45033 | www.expressrupya.com
Your partner for growth !`

const matchHeadersWith = (patterns, headers) => {
  const map = {}
  headers.forEach((header) => {
    const trimmed = header.trim()
    Object.entries(patterns).forEach(([field, pattern]) => {
      if (!map[field] && pattern.test(trimmed)) map[field] = header
    })
  })
  return map
}

const readWorkbookRows = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array' })
        resolve(
          workbook.SheetNames
            .map((sheetName) => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false }))
            .filter((rows) => rows.length > 0)
        )
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(toReadError(reader.error, file))
    reader.readAsArrayBuffer(file)
  })

const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'at'])
const UPPERCASE_WORDS = new Set(['llp', 'opc'])
// Vowel-less, but not acronyms.
const TITLE_WORDS = new Set(['pvt', 'ltd'])

// "HARYANA CITY GAS" -> "Haryana City Gas". Already mixed-case text is left as typed.
const toTitleCase = (text) => {
  if (text !== text.toUpperCase() && text !== text.toLowerCase()) return text
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((word, index) => {
      if (/^\s+$/.test(word)) return word
      if (index > 0 && SMALL_WORDS.has(word)) return word
      // Vowel-less tokens are usually acronyms ("KPR", "SRL"); LLP/OPC are legal forms.
      const bare = word.replace(/[^a-z]/g, '')
      if (bare.length > 1 && !TITLE_WORDS.has(bare) && (UPPERCASE_WORDS.has(bare) || !/[aeiouy]/.test(bare))) return word.toUpperCase()
      // Capitalise the first letter of each hyphen/bracket/dot-separated part: "a-1" -> "A-1", "(bhiwadi)" -> "(Bhiwadi)".
      return word.replace(/(^|[-(./&'])([a-z])/g, (_, sep, letter) => sep + letter.toUpperCase())
    })
    .join('')
}

const LONG_COMPANY_NAME = 45

// Name as written in the email: tidy casing, and for long or bracketed names drop the
// "(Branch)" part and the legal suffix, e.g. "HARYANA CITY GAS DISTRIBUTION (BHIWADI) LIMITED"
// -> "Haryana City Gas Distribution". Short names keep their suffix.
export const formatCompanyForEmail = (name) => {
  let text = String(name ?? '').replace(/^[^A-Za-z0-9(]+/, '').replace(/^m\/s\.?\s*/i, '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length > LONG_COMPANY_NAME || /\(.*\)/.test(text)) {
    const short = text
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .trim()
      .replace(/[\s,.]*\b(private|pvt\.?)\s*(limited|ltd\.?)\.?$/i, '')
      .replace(/[\s,.]*\b(limited|ltd\.?|llp)\.?$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (short) text = short
  }
  return toTitleCase(text)
}

// "AKHIL  JAIN" -> "Akhil"; skips salutations and initials ("Mr. K. RAMESH" -> "Ramesh").
export const firstNameForGreeting = (fullName) => {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  const first = parts.find((part) => {
    const bare = part.replace(/[^A-Za-z]/g, '')
    return bare.length > 1 && !/^(mr|mrs|ms|miss|dr|shri|smt|sri|prof|capt|col)$/i.test(bare)
  })
  if (!first) return ''
  const bare = first.replace(/[^A-Za-z'-]/g, '')
  return bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase()
}

const buildIntelligencePrompt = ({ companyName: rawCompanyName, facilityName, enquiryAmount }) => {
  const companyName = formatCompanyForEmail(rawCompanyName)
  return `Write one sentence for a corporate lending outreach email from Express Rupya Capital Advisors.\n\n` +
  `Company: ${companyName}\nFacility: ${facilityName}\nEnquiry amount: ${enquiryAmount}\n\n` +
  `The sentence must follow this shape: "We came across ${companyName}'s proposed <facility> funding requirement of approximately <amount>."\n` +
  `- Write the facility in clear, natural business English (expand abbreviations, e.g. "TL" to "term loan", "CC" to "cash credit", "WC" to "working capital").\n` +
  `- Keep the amount value exactly the same; only format it readably in Indian style (e.g. "INR 25 crore", "INR 50 lakh"). If the unit is unclear, keep it as given.\n` +
  `- Keep the company name exactly as given.\n` +
  `Return only that one sentence, with no quotes or extra commentary.`
}

export const buildIntelligenceEmail = (record, openingLine) => {
  const greetingName = firstNameForGreeting(record.directorName) || 'Sir/Madam'
  const companyName = formatCompanyForEmail(record.companyName) || record.companyName
  const fallback = `We came across ${companyName}'s proposed ${record.facilityName} funding requirement of approximately ${record.enquiryAmount}`
  const opening = String(openingLine ?? '').trim().replace(/^["']|["']$/g, '').replace(/\.+$/, '') || fallback

  return (
    `Subject: Funding Requirement – ${companyName}\n\n` +
    `Dear ${greetingName},\n\n` +
    `${opening}.\n` +
    `We thought it may be worthwhile to connect, as we are regularly in discussion with banks, NBFCs and financial institutions on similar corporate funding requirements.\n\n` +
    `If the requirement is still under consideration, we would be happy to understand the proposed end use, tenure and broad structure and explore whether there may be a suitable lending fit.\n\n` +
    `Would this be relevant to discuss?\n\n` +
    INTEL_SIGNATURE_BLOCK
  )
}

// Turns a saved (database) row into a record the Automation flow can generate/send.
export const toIntelligenceRecord = (row) => {
  const record = {
    ...row,
    mode: 'intelligence',
    // Reused by the Automation card header and Status logs.
    projectName: row.companyName,
  }
  return { ...record, prompt: buildIntelligencePrompt(record) }
}

const cell = (row, header) => (header ? String(row[header] ?? '').trim() : '')

// Reads every row of both files for saving to the database. Company matching happens on the server.
export const readIntelligenceFiles = async (contactFile, valueFile, { validateEmail = true } = {}) => {
  const [contactSheets, valueSheets] = await Promise.all([readWorkbookRows(contactFile), readWorkbookRows(valueFile)])

  // Scan counts shown on the Already Fetched page, so it's clear nothing was silently dropped.
  const contactScan = { fileName: contactFile.name, sheets: contactSheets.length, sheetsIgnored: 0, rows: 0, rowsSkipped: 0, directors: 0, withEmail: 0, withoutEmail: 0 }
  const valueScan = { fileName: valueFile.name, sheets: valueSheets.length, sheetsIgnored: 0, rows: 0, rowsSkipped: 0, values: 0 }

  const contacts = []
  let foundContactColumns = false
  contactSheets.forEach((rows) => {
    const h = matchHeadersWith(INTEL_CONTACT_HEADER_PATTERNS, Object.keys(rows[0]))
    if (!h.companyName || (!h.directorEmail && !h.directorName)) {
      contactScan.sheetsIgnored += 1
      return
    }
    foundContactColumns = true
    rows.forEach((row) => {
      contactScan.rows += 1
      const before = contacts.length
      const companyName = cell(row, h.companyName)
      if (!companyName) {
        contactScan.rowsSkipped += 1
        return
      }

      // A cell may hold several directors, one per line; pair them up by position.
      const emails = splitLines(row[h.directorEmail])
      const names = splitLines(row[h.directorName])
      const dins = splitLines(row[h.directorDin])
      const phones = splitLines(row[h.directorContact])
      const pans = splitLines(row[h.directorPan])
      for (let index = 0; index < Math.max(emails.length, names.length); index += 1) {
        const rawEmail = emails[index] ?? ''
        // Directors with no (or an invalid) email are still saved, with a NULL email.
        const email = rawEmail && (!validateEmail || EMAIL_PATTERN.test(rawEmail)) ? rawEmail : null
        const directorName = names[index] ?? ''
        if (!email && !directorName) continue
        contacts.push({
          companyCin: cell(row, h.companyCin),
          companyName,
          directorDin: dins[index] ?? '',
          directorName,
          directorEmail: email,
          directorContact: phones[index] ?? '',
          directorPan: pans[index] ?? '',
        })
        if (email) contactScan.withEmail += 1
        else contactScan.withoutEmail += 1
      }
      if (contacts.length === before) contactScan.rowsSkipped += 1
    })
  })
  contactScan.directors = contacts.length
  if (!foundContactColumns) {
    throw new Error('Email file needs "CompanyName" and "DirectorName" / "DirectorEmail" columns.')
  }

  const values = []
  let foundValueColumns = false
  valueSheets.forEach((rows) => {
    const h = matchHeadersWith(INTEL_VALUE_HEADER_PATTERNS, Object.keys(rows[0]))
    if (!h.name || !h.facilityName || !h.enquiryAmount) {
      valueScan.sheetsIgnored += 1
      return
    }
    foundValueColumns = true
    rows.forEach((row) => {
      valueScan.rows += 1
      const name = cell(row, h.name)
      if (!name) {
        valueScan.rowsSkipped += 1
        return
      }
      values.push({
        name,
        facilityName: cell(row, h.facilityName),
        enquiryAmount: cell(row, h.enquiryAmount),
        institutionType: cell(row, h.institutionType),
        city: cell(row, h.city),
      })
    })
  })
  if (!foundValueColumns) {
    throw new Error('Value file needs "NAME", "Facility Name" and "Enquiry Amount" columns.')
  }

  valueScan.values = values.length

  return { contacts, values, scan: { contacts: contactScan, values: valueScan } }
}
