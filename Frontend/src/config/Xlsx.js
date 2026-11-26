// xlsx is large, so it is only downloaded the first time a sheet is read.
const loadXlsx = () => import('xlsx')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Browsers invalidate a picked file if it is saved/moved on disk afterwards (e.g. edited in Excel).
const toReadError = (error, file) =>
  error?.name === 'NotFoundError' || error?.name === 'NotReadableError'
    ? new Error(`"${file?.name ?? 'The file'}" changed or was moved after you selected it. Close it in Excel, then select it again.`)
    : error
// Names of the sheets (tabs) in a workbook, for the "which sheet" picker on the upload page.
export const listSheetNames = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const XLSX = await loadXlsx()
        resolve(XLSX.read(event.target.result, { type: 'array', bookSheets: true }).SheetNames)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(toReadError(reader.error, file))
    reader.readAsArrayBuffer(file)
  })

// Only the chosen sheet when `sheetName` is set; every sheet otherwise.
const sheetsToRead = (workbook, sheetName) => {
  if (!sheetName) return workbook.SheetNames
  if (!workbook.SheetNames.includes(sheetName)) throw new Error(`Sheet "${sheetName}" was not found in the file.`)
  return [sheetName]
}
const inSheet = (sheetName) => (sheetName ? ` in sheet "${sheetName}"` : ' in the uploaded file')

const splitLines = (value) =>
  String(value ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)

const toFirstNameTitleCase = (name) => {
  const first = String(name ?? '').trim().split(/\s+/)[0] || ''
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

// ---------- NBFC mode ----------

const NBFC_HEADER_PATTERNS = {
  email: /^e[-\s]?mail/i,
  companyName: /^(company\s*)?name$/i,
  contactName: /^(contact|director|person|first\s*name)/i,
  website: /^(company\s*)?(website|web\s*site|web|link|url|site)s?$/i,
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
    `At Express Rupya, we assist businesses in raising structured debt through banks, NBFCs, AIFs, private credit funds and institutional lenders.\n\n` +
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

// NBFC and Housing Finance sheets share the same "Company Name" + "Email" layout.
const extractCompanyEmailsFromFile = (file, { validateEmail = true, sheetName: onlySheet } = {}, toRecord) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (event) => {
      try {
        const XLSX = await loadXlsx()
        const workbook = XLSX.read(event.target.result, { type: 'array' })
        let foundEmailColumn = false
        let foundNameColumn = false
        const records = []

        sheetsToRead(workbook, onlySheet).forEach((sheetName) => {
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
            const website = headerMap.website ? String(row[headerMap.website] ?? '').trim() : ''

            emails.forEach((email, index) => {
              if (validateEmail && !EMAIL_PATTERN.test(email)) return
              records.push(toRecord({ email, companyName, contactName: contactNames[index] ?? '', website }))
            })
          })
        })

        if (!foundEmailColumn) {
          reject(new Error(`No "Email" column found${inSheet(onlySheet)}.`))
          return
        }
        if (!foundNameColumn) {
          reject(new Error(`No "Name" column found${inSheet(onlySheet)}.`))
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

export const extractNbfcFromFile = (file, options) =>
  extractCompanyEmailsFromFile(file, options, ({ email, companyName, contactName }) => ({
    mode: 'nbfc',
    email,
    companyName,
    contactName,
    // Reused by the Automation card header and Status logs.
    projectName: companyName,
    directorName: contactName,
    prompt: buildNbfcPrompt(companyName),
  }))

// ---------- Real Estate (company website from the sheet -> personalised opening) ----------

export const extractRealEstateFromFile = (file, options) =>
  extractCompanyEmailsFromFile(file, options, ({ email, companyName, contactName, website }) => ({
    mode: 'realEstate',
    email,
    companyName,
    contactName,
    website,
    // Reused by the Automation card header and Status logs.
    projectName: companyName,
    directorName: contactName,
  }))

// ---------- Housing Finance (fixed template) ----------

export const buildHousingFinanceSubject = (companyName) => `Fund Raising- ${companyName}`

export const buildHousingFinanceText = (companyName) =>
  `Subject: ${buildHousingFinanceSubject(companyName)}

` +
  `Dear Sir/Madam,

` +
  `Greetings from Express Rupya Capital Advisors.

` +
  `At Express Rupya, we assist HFCs and NBFCs in raising capital through banks, NBFCs, AIFs, private credit funds and institutional investors.

` +
  `We would be pleased to support ${companyName} with term loans, NCDs, securitisation/PTC, direct assignment, co-lending and subordinated debt.

` +
  `Would be great to connect at your convenience for a brief call to explore how we can assist.

` +
  `Warm regards,
` +
  `Tanu
` +
  `Express Rupya Capital Advisors
` +
  `+91 7021628079 | www.expressrupya.com`

export const extractHousingFromFile = (file, options) =>
  extractCompanyEmailsFromFile(file, options, ({ email, companyName }) => ({
    mode: 'housing',
    email,
    companyName,
    // Reused by the Automation card header and Status logs.
    projectName: companyName,
    directorName: '',
  }))

// ---------- DC Advisors (data centre outreach, fixed template) ----------

// Matched by header name, so the columns can be in any order/position.
const DC_HEADER_PATTERNS = {
  // "contact_email", "Email", "E-mail ID", "Contact Email"...
  email: /(^|[-_\s])e[-_\s]?mail/i,
  contactName: /^(contact|director|person|first)[-_\s]*(name)?$|^name$/i,
  companyName: /^(company|organi[sz]ation|firm)[-_\s]*(name)?$/i,
}

// "Mr. JOHN smith" -> "John"; empty when the cell has no usable name.
const DC_TITLES = /^(mr|mrs|ms|miss|dr|prof|sir|shri|smt)\.?$/i
const toDcGreetingName = (contactName) => {
  const words = String(contactName ?? '').trim().split(/\s+/).filter((word) => !DC_TITLES.test(word))
  return toFirstNameTitleCase(words[0])
}

const DC_ADVISORS_SUBJECT_SUFFIX =
  'India Data Centre Expansion | Strategic Real Estate, Power Infrastructure & Capital Advisory'

// "<company_name> - India Data Centre Expansion | ..."; just the suffix when the company cell is empty.
export const buildDcAdvisorsSubject = (company) => {
  const name = String(company ?? '').trim().replace(/\s+/g, ' ')
  return name ? `${name} - ${DC_ADVISORS_SUBJECT_SUFFIX}` : DC_ADVISORS_SUBJECT_SUFFIX
}

const DC_SIGNATURE =
  `Best Regards,\n` +
  `Divya Jain\n` +
  `Express Rupya Capital Advisors\n` +
  `+91 84540 38196\n` +
  `www.expressrupya.com`

// Subject uses the company_name column; the greeting is always "Dear Sir/Madam".
// **...** is sent as real bold (the server turns it into HTML).
export const buildDcAdvisorsText = ({ company }) =>
  `Subject: ${buildDcAdvisorsSubject(company)}\n\n` +
  `Dear Sir/Madam,\n\n` +
  `Greetings from **Express Rupya Capital Advisors!**\n\n` +
  `I am Divya Jain, representing Express Rupya Capital Advisors, an India-based **Real Estate and Financial Advisory firm** specialising in strategic land acquisition, infrastructure advisory and capital raising for data centre developers, hyperscalers and global infrastructure investors.\n\n` +
  `India is emerging as a significant destination for global data centre investments, supported by expanding digital infrastructure, AI-driven demand and favourable government initiatives.\n\n` +
  `Notably, the **Union Budget 2026–27 introduced an income tax exemption framework extending until 31 March 2047** for eligible foreign cloud service providers utilising specified data centre infrastructure in India, subject to prescribed eligibility and regulatory conditions.\n\n` +
  `**How Express Rupya Can Support Your India Expansion**\n\n` +
  `- **Strategic Real Estate & Land Acquisition:** Identification, evaluation and facilitation of large land parcels suitable for hyperscale data centres across key Indian markets.\n` +
  `- **Power & Infrastructure Advisory:** Support for grid connectivity, power sourcing, substation infrastructure, fibre connectivity and essential utilities.\n` +
  `- **Debt & Equity Capital Advisory:** Arranging institutional financing, structured debt, private credit and equity capital for land acquisition and infrastructure development.\n` +
  `- **Cooling & Thermal Infrastructure:** Facilitating partnerships for efficient cooling, heat management and sustainable data centre solutions.\n` +
  `- **Transaction Facilitation:** Coordination with landowners, infrastructure providers, government authorities and relevant stakeholders to support project execution.\n\n` +
  `With our experience across **real estate transactions, institutional financing and infrastructure opportunities**, we aim to serve as a strategic local partner for international companies evaluating entry or expansion in India.\n\n` +
  `We would welcome an opportunity to understand your India expansion strategy and explore potential areas of collaboration.\n\n` +
  `**Would you be available for a brief 20–30 minute virtual introductory meeting at your convenience?**\n\n` +
  `We look forward to connecting with you.\n\n` +
  DC_SIGNATURE

// ---------- DC Advisors follow-up (same flow as NBFC: replies in the thread of the last email, sent from the DC mailbox) ----------

// The body is exactly what the user typed in the follow-up box (saved in localStorage); **...** becomes bold.
// With a thread, the subject is "Re: <original subject>" and the email is sent as a reply,
// so Gmail keeps it in the same conversation as the first email.
export const buildDcAdvisorsFollowUpText = ({ company }, thread = null, body = '') =>
  `Subject: ${(thread && toReplySubject(thread.subject)) || buildDcAdvisorsSubject(company)}\n\n` +
  String(body ?? '').trim()

// Same card shape as the NBFC follow-ups: no earlier email found -> "Send as new" or "Skip" on the card.
export const toDcAdvisorsFollowUpResult = (record, thread = null, _senderName, followUpBody = '') => ({
  ...record,
  mode: 'dcAdvisorsFollowUp',
  thread,
  threadMissing: !thread,
  ...(thread ? {} : { selected: false }),
  followUpBody,
  generatedEmail: buildDcAdvisorsFollowUpText(record, thread, followUpBody),
  generationError: null,
})

// Reads a sheet with email + contact name columns (company name optional) into records for `mode`.
// `columns` names the headers in error messages.
const extractContactsFromFile = (file, { validateEmail = true, sheetName: onlySheet } = {}, mode, columns) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (event) => {
      try {
        const XLSX = await loadXlsx()
        const workbook = XLSX.read(event.target.result, { type: 'array' })
        let foundEmailColumn = false
        let foundNameColumn = false
        const records = []

        sheetsToRead(workbook, onlySheet).forEach((sheetName) => {
          const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })

          // The header row may sit below a title or blank rows; use the first row (of the top 20) that has an email header.
          const findHeaders = (cells) => {
            const map = {}
            cells.forEach((cell, columnIndex) => {
              const header = String(cell ?? '').trim()
              if (!header) return
              Object.entries(DC_HEADER_PATTERNS).forEach(([field, pattern]) => {
                if (map[field] === undefined && pattern.test(header)) map[field] = columnIndex
              })
            })
            return map
          }
          const headerRowIndex = grid.slice(0, 20).findIndex((cells) => findHeaders(cells).email !== undefined)
          if (headerRowIndex === -1) return
          const headerMap = findHeaders(grid[headerRowIndex])
          foundEmailColumn = true
          if (headerMap.contactName === undefined) return
          foundNameColumn = true

          grid.slice(headerRowIndex + 1).forEach((row) => {
            const emails = splitLines(row[headerMap.email])
            const contactNames = splitLines(row[headerMap.contactName])
            const companyName = headerMap.companyName !== undefined ? String(row[headerMap.companyName] ?? '').trim() : ''

            emails.forEach((email, index) => {
              if (validateEmail && !EMAIL_PATTERN.test(email)) return
              const contactName = contactNames[index] ?? contactNames[0] ?? ''
              records.push({
                mode,
                email,
                contactName,
                // Raw company_name cell, used in the subject.
                company: companyName,
                companyName: companyName || contactName,
                // Reused by the Automation card header and Status logs.
                projectName: companyName || contactName || email,
                directorName: contactName,
              })
            })
          })
        })

        if (!foundEmailColumn) {
          reject(new Error(`No "${columns.email}" column found${inSheet(onlySheet)}.`))
          return
        }
        if (!foundNameColumn) {
          reject(new Error(`No "${columns.contactName}" column found${inSheet(onlySheet)}.`))
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

// Sheet needs contact_email and contact_name columns; company_name (for the subject) is optional.
export const extractDcAdvisorsFromFile = (file, options) =>
  extractContactsFromFile(file, options, 'dcAdvisors', { email: 'contact_email', contactName: 'contact_name' })

// ---------- Warehouse (Hyderabad warehousing & logistics park, fixed template, sent from Debt Desk) ----------

const WAREHOUSE_SUBJECT_SUFFIX =
  'Strategic Warehousing & Rail-Linked Logistics Opportunity – Hyderabad, Telangana'

// "<Company Name> - Strategic Warehousing ..."; just the suffix when the company cell is empty.
export const buildWarehouseSubject = (company) => {
  const name = String(company ?? '').trim().replace(/\s+/g, ' ')
  return name ? `${name} - ${WAREHOUSE_SUBJECT_SUFFIX}` : WAREHOUSE_SUBJECT_SUFFIX
}

// Subject uses the Company Name column; the greeting uses Director Name.
export const buildWarehouseText = ({ company, contactName }) =>
  `Subject: ${buildWarehouseSubject(company)}\n\n` +
  `Dear ${toDcGreetingName(contactName) || 'Sir/Madam'},\n\n` +
  `Greetings from Express Rupya Capital Advisors!\n\n` +
  `We are pleased to announce the soft launch of an Integrated Warehousing, Logistics & Industrial Park on the Hyderabad–Vijayawada Highway, Telangana, offering:\n` +
  `- Covered Warehousing & Dry Storage – For commodities, FMCG and industrial goods.\n` +
  `- Cold Storage – For temperature-sensitive products.\n` +
  `- Operational Railway Siding – Handling approximately 25,000 MT per month.\n` +
  `- Proposed ICD & Customs Clearance – Subject to approvals and commissioning.\n` +
  `- Weighbridge Facilities – For incoming and outgoing cargo.\n` +
  `- Logistics Support – Handling, loading, unloading, transportation and distribution.\n` +
  `- Industrial & Manufacturing Space – For factories and processing units.\n` +
  `- Green Energy Infrastructure – Solar installations supporting sustainable operations.\n\n` +
  `The park brings manufacturing, storage and distribution together, with potential onward rail movement to JNPT, subject to service availability.\n` +
  `Rail connectivity also offers an alternative during road transport disruptions, potentially supporting raw-material receipts and finished-goods dispatch during truck strikes or bottlenecks.\n\n` +
  `As part of the soft launch, we invite companies to explore warehousing, industrial land leasing, outright land purchase and Built-to-Suit options tailored to their requirements.\n\n` +
  `Would you be available for a brief discussion or site visit?\n\n` +
  `Best regards,\n` +
  `Sushant Dalvi\n` +
  `Express Rupya Capital Advisors\n` +
  `+91 84540 38196 | www.expressrupya.com\n` +
  `Your partner for growth !`

// Sheet needs Company Name, Director Name and Email id columns (any position).
export const extractWarehouseFromFile = (file, options) =>
  extractContactsFromFile(file, options, 'warehouse', { email: 'Email id', contactName: 'Director Name' })

// ---------- NBFC follow-up (bulk send, fixed template) ----------

const FOLLOW_UP_EMAIL_HEADER = /^e[-\s]?mail/i
// "Company", "Company Name", "CompanyName" or just "Name".
const FOLLOW_UP_COMPANY_HEADER = /^(company\s*(name)?|name)$/i

export const NBFC_FOLLOW_UP_SUBJECT = 'Following up – Express Rupya Capital Advisors'

export const buildNbfcFollowUpSubject = (companyName) =>
  companyName ? `Following up – ${companyName}` : NBFC_FOLLOW_UP_SUBJECT

// Team members who can sign a follow-up; the chosen name goes in the sign-off.
export const NBFC_FOLLOW_UP_SENDERS = ['Bhoomi', 'Surbhi', 'Tanu', 'Diya']
export const DEFAULT_FOLLOW_UP_SENDER = 'Diya'

export const buildNbfcFollowUpEmail = (senderName = DEFAULT_FOLLOW_UP_SENDER) =>
  `Dear Sir/Madam,\n\n` +
  `Hope you are doing well.\n\n` +
  `Kindly advise us how we can proceed further.\n\n` +
  `Would be great to connect at your convenience to explore how we can assist. Please let us know a suitable time for a quick discussion.\n\n` +
  `Best Regards,\n` +
  `${senderName || DEFAULT_FOLLOW_UP_SENDER}\n` +
  `Express Rupya Capital Advisors\n` +
  `+91 81693 45033 | www.expressrupya.com`

// "Re: Re: Fwd: Fund Raising For X" -> "Re: Fund Raising For X", so Gmail keeps it in the same thread.
const toReplySubject = (subject) => {
  const base = String(subject ?? '').replace(/^\s*((re|fwd?)\s*:\s*)+/i, '').trim()
  return base ? `Re: ${base}` : ''
}

// Full "Subject: ...\n\nbody" text, in the same shape the Automation review page parses.
// With a thread (the last email sent to this address), it goes out as a reply to it.
export const buildNbfcFollowUpText = (companyName, thread = null, senderName = DEFAULT_FOLLOW_UP_SENDER) =>
  `Subject: ${(thread && toReplySubject(thread.subject)) || buildNbfcFollowUpSubject(companyName)}\n\n${buildNbfcFollowUpEmail(senderName)}`

// Turns an uploaded follow-up row into a ready-to-review Automation card (no AI generation needed).
// `thread` comes from the Gmail Sent folder lookup; when nothing was found the user picks
// "Send as new" or "Skip" on the card before sending.
export const toNbfcFollowUpResult = ({ email, companyName }, thread = null, senderName = DEFAULT_FOLLOW_UP_SENDER) => ({
  mode: 'nbfcFollowUp',
  email,
  companyName,
  // Reused by the Automation card header and Status logs.
  projectName: companyName,
  directorName: '',
  // Kept on the record so "regenerate" signs with the same name.
  senderName,
  thread,
  threadMissing: !thread,
  ...(thread ? {} : { selected: false }),
  generatedEmail: buildNbfcFollowUpText(companyName, thread, senderName),
  generationError: null,
})

// ---------- Intelligence follow-up (same flow as NBFC, always signed by Amit) ----------

export const INTELLIGENCE_FOLLOW_UP_SENDER = 'Amit'

export const buildIntelligenceFollowUpEmail = (companyName) =>
  `Dear Sir/Madam,\n\n` +
  `Greetings!\n\n` +
  `Just following up on my earlier email regarding potential financing solutions for ${companyName || 'your company'}.\n\n` +
  `We can assist in arranging working capital facilities, term loans for capacity expansion, machinery financing, and refinancing of existing borrowings through our network of banks, NBFCs, and financial institutions.\n\n` +
  `Kindly let us know if you are evaluating any such funding requirements where we could explore competitive financing options.\n\n` +
  `Best regards,\n` +
  `${INTELLIGENCE_FOLLOW_UP_SENDER}\n` +
  `Express Rupya Capital Advisors\n` +
  `+91 85914 58046\n` +
  `www.expressrupya.com\n` +
  `Your Partner for Growth!`

export const buildIntelligenceFollowUpText = (companyName, thread = null) =>
  `Subject: ${(thread && toReplySubject(thread.subject)) || buildNbfcFollowUpSubject(companyName)}\n\n${buildIntelligenceFollowUpEmail(companyName)}`

export const toIntelligenceFollowUpResult = (record, thread = null) => ({
  ...toNbfcFollowUpResult(record, thread, INTELLIGENCE_FOLLOW_UP_SENDER),
  mode: 'intelligenceFollowUp',
  generatedEmail: buildIntelligenceFollowUpText(record.companyName, thread),
})

export const extractEmailsFromFile = (file, { validateEmail = true } = {}) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (event) => {
      try {
        const XLSX = await loadXlsx()
        const workbook = XLSX.read(event.target.result, { type: 'array' })
        let foundEmailColumn = false
        const seen = new Set()
        const records = []

        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
          if (rows.length === 0) return

          const headers = Object.keys(rows[0])
          const emailHeader = headers.find((h) => FOLLOW_UP_EMAIL_HEADER.test(h.trim()))
          if (!emailHeader) return
          foundEmailColumn = true
          const companyHeader = headers.find((h) => FOLLOW_UP_COMPANY_HEADER.test(h.trim()))

          rows.forEach((row) => {
            const companyName = companyHeader ? String(row[companyHeader] ?? '').trim() : ''
            splitLines(row[emailHeader]).forEach((email) => {
              if (validateEmail && !EMAIL_PATTERN.test(email)) return
              const key = email.toLowerCase()
              if (seen.has(key)) return
              seen.add(key)
              records.push({ email, companyName })
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

const INTEL_SIGNATURE_BLOCK = `Best regards,
Amit
Express Rupya Capital Advisors
+91 85914 58046
www.expressrupya.com
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
    reader.onload = async (event) => {
      try {
        const XLSX = await loadXlsx()
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

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "Private Limited" / "Pvt. Ltd." / "(P) Ltd" at the end of a name.
const PRIVATE_LIMITED = String.raw`[\s,.]*(?:\bprivate|\bpvt\.?|\(p\))\s*(?:limited|ltd\.?)\.?`
const PRIVATE_LIMITED_SUFFIX = new RegExp(`${PRIVATE_LIMITED}$`, 'i')

// Name as written in the email body, without the "Private Limited" suffix:
// "ARFAT PETROCHEMICALS PRIVATE LIMITED" -> "Arfat Petrochemicals". The subject keeps the full name.
export const companyNameForBody = (name) => {
  const full = formatCompanyForEmail(name)
  return full.replace(PRIVATE_LIMITED_SUFFIX, '').trim() || full
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

const CRORE = 10000000

// Uploaded amounts are plain rupees ("50,000,000"); manually typed ones may say "5 Cr" or "50 lakh".
export const parseEnquiryAmount = (value) => {
  const text = String(value ?? '').toLowerCase().replace(/,/g, '')
  const number = parseFloat(text.match(/\d+(\.\d+)?/)?.[0])
  if (Number.isNaN(number)) return null
  if (/\b(cr|crore|crores)\b/.test(text)) return number * CRORE
  if (/\b(l|lac|lacs|lakh|lakhs)\b/.test(text)) return number * 100000
  return number
}

// The email never states the sheet's amount; it offers a round band around it
// (10 Cr -> 8–12, 14 -> 10–25, 24 -> 20–40, 399 -> 200–500), capped at 500 Cr.
// Under 5 Cr (or unreadable) gets the general 5–50 Cr pitch.
const FUNDING_BANDS = [
  { below: 8, range: [5, 10] },
  { below: 12, range: [8, 12] },
  { below: 20, range: [10, 25] },
  { below: 40, range: [20, 40] },
  { below: 75, range: [40, 75] },
  { below: 120, range: [75, 150] },
  { below: 200, range: [100, 200] },
  { below: 500, range: [200, 500] },
]

export const fundingRangeFor = (enquiryAmount) => {
  const amount = parseEnquiryAmount(enquiryAmount)
  if (amount === null || amount < 5 * CRORE) return '₹5–50 crore'
  const crore = amount / CRORE
  const band = FUNDING_BANDS.find((b) => crore < b.below)
  if (!band) return crore === 500 ? '₹200–500 crore' : 'up to ₹500 crore'
  return `₹${band.range[0]}–${band.range[1]} crore`
}

// ChatGPT sometimes writes "INR 25 crore" / "Rs. 25 crore" or "20-40" despite the prompt;
// emails always use "₹20–40 crore".
const toRupeeSymbol = (text) => text.replace(/\b(?:INR|Rs\.?)\s*(?=\d)/gi, '₹').replace(/(\d)\s*(?:-|–|to)\s*(?=\d)/g, '$1–')

// The opening must not reveal we hold their data: the facility from the sheet is only a private
// hint for ChatGPT about what the business may care about (growth, assets, cash flow), and is
// never named; the amount is only ever shown as a round range.
// 45 + the two fixed paragraphs (44) + closing question (6) keeps the email under 100 words.
const OPENING_MAX_WORDS = 45

// Generic words that may appear anyway; any other word of the sheet's facility name must not.
const GENERIC_FACILITY_WORDS = new Set(['loan', 'loans', 'facility', 'facilities', 'finance', 'financing', 'funding', 'limit', 'limits', 'against', 'with', 'from', 'other', 'for', 'and', 'of', 'the'])

const buildIntelligencePrompt = ({ companyName: rawCompanyName, facilityName, fundingRange }) => {
  const companyName = companyNameForBody(rawCompanyName)
  return `Write the opening paragraph of a corporate lending outreach email from Express Rupya to ${companyName}.\n\n` +
  `PRIVATE CONTEXT — never repeat, name or paraphrase it closely: the company may be interested in "${facilityName}".\n` +
  `Use it only to judge what this business likely cares about (e.g. expanding operations, buying assets or equipment, ` +
  `managing cash flow, funding growth) and speak to that in broad business language.\n\n` +
  `Rules:\n` +
  `- Start with "Express Rupya helps companies like ${companyName}" (write the company name exactly like that, never add "Private Limited" or "Pvt Ltd") and mention that we arrange funding of "${fundingRange}" (keep that exactly, using the ₹ symbol, never "INR" or "Rs").\n` +
  `- Do NOT name any loan product, asset type or facility (no "commercial vehicle loan", "cash credit", "working capital", "machinery loan", etc.).\n` +
  `- Do NOT say or imply that we know of any requirement, enquiry, application, amount or data of theirs, and never use words like "approximately" or "proposed". It must read as a confident, general introduction that feels relevant to them.\n` +
  `- 1–2 sentences, at most ${OPENING_MAX_WORDS - 5} words in total. Professional, warm, not salesy.\n` +
  `Return only the paragraph, with no quotes or extra commentary.`
}

// True if the opening repeats a distinctive word of the sheet's facility ("vehicle", "machinery", "cc"...).
const leaksFacility = (text, facilityName, companyName) => {
  const words = text.toLowerCase().replace(companyName.toLowerCase(), ' ').split(/[^a-z0-9]+/)
  return String(facilityName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((word) => word.length >= 2 && !GENERIC_FACILITY_WORDS.has(word) && words.some((w) => w === word || w === `${word}s` || word === `${w}s`))
}

export const buildIntelligenceEmail = (record, openingLine) => {
  const greetingName = firstNameForGreeting(record.directorName) || 'Sir/Madam'
  const companyName = formatCompanyForEmail(record.companyName) || record.companyName
  const bodyCompanyName = companyNameForBody(record.companyName) || companyName
  const fundingRange = fundingRangeFor(record.enquiryAmount)
  const fallback = `Express Rupya helps companies like ${bodyCompanyName} arrange funding of ${fundingRange} to support growth, expansion and day-to-day business needs, structured around how the business actually operates`
  // ChatGPT may add the "Private Limited" back; strip it wherever the name appears.
  const generated = toRupeeSymbol(String(openingLine ?? '').trim().replace(/^["']|["']$/g, '').replace(/\.+$/, ''))
    .replace(new RegExp(`(${escapeRegExp(bodyCompanyName)})${PRIVATE_LIMITED}`, 'gi'), '$1')
  // Fall back if ChatGPT runs long, changes the range, sounds like it knows their figures,
  // or lets the sheet's facility slip through.
  const usable =
    generated &&
    generated.split(/\s+/).length <= OPENING_MAX_WORDS &&
    generated.includes(fundingRange.replace(/^up to /, '')) &&
    !/\b(approximately|approx|proposed|enquiry|requirement of)\b/i.test(generated) &&
    !leaksFacility(generated, record.facilityName, bodyCompanyName)
  const opening = usable ? generated : fallback

  return (
    `Subject: Funding Requirement – ${companyName}\n\n` +
    `Dear ${greetingName},\n\n` +
    `${opening}.\n\n` +
    `Through our regular engagement with banks, NBFCs and financial institutions, we match each requirement with the right lender on competitive terms.\n\n` +
    `If you are evaluating any funding in the coming months, we would be happy to understand your requirement and suggest a suitable structure.\n\n` +
    `Would this be relevant to discuss?\n\n` +
    INTEL_SIGNATURE_BLOCK
  )
}

// Turns a saved (database) row into a record the Automation flow can generate/send.
export const toIntelligenceRecord = (row) => {
  const record = {
    ...row,
    fundingRange: fundingRangeFor(row.enquiryAmount),
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
