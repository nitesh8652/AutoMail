import * as XLSX from 'xlsx'

const HEADER_PATTERNS = {
  email: /^e[-\s]?mail/i,
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

const buildPrompt = (data) =>
  `Draft an email for accelerating construction & optimizing cash flow for the project name - ${data.projectName}, ` +
  `type - ${data.projectType}, start date - ${data.launchDate}, completion date - ${data.completionDate}, ` +
  `launched sqft - ${data.launchedSqft}, launched units - ${data.launchedUnits}, ` +
  `unit size sqft min - ${data.unitSizeMin}, max - ${data.unitSizeMax}, % sold - ${data.percentSold}, ` +
  `launched price - ${data.newLaunchPrice}, Absorbed units - ${data.absorbedUnits}, ${data.constructionStage}`

export const extractProjectsFromFile = (file) => {
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
            const email = String(row[headerMap.email]).trim()
            if (!email) return

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

            projects.push({ email, ...data, prompt: buildPrompt(data) })
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
