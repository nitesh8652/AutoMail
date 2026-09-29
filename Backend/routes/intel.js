const express = require('express')
const pool = require('../db')

const router = express.Router()

const INSERT_CHUNK = 500

// Same company can be written "ABC Pvt. Ltd." in one sheet and "ABC Private Limited" in the other.
const normalizeCompanyName = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(private|pvt|limited|ltd|llp|inc|co|company|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const clean = (value, max) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, max) : null
}

// Turns MySQL errors into something actionable in the UI instead of a bare 500.
const DB_ERROR_HINTS = {
  ER_BAD_NULL_ERROR: 'Run the ALTER TABLE that makes intel_contacts.director_email nullable (adds dedupe_key).',
  ER_NO_SUCH_TABLE: 'Run the CREATE TABLE script on the temp_autoemail database.',
  ER_BAD_DB_ERROR: 'Database not found — check DB_NAME in Backend/.env.',
  ER_ACCESS_DENIED_ERROR: 'MySQL login failed — check DB_USER / DB_PASSWORD in Backend/.env.',
  ECONNREFUSED: 'Cannot reach MySQL — is it running? Check DB_HOST / DB_PORT in Backend/.env.',
  ER_BAD_FIELD_ERROR: 'A column is missing — re-check the SQL changes were all run.',
}

const dbError = (res, fallback, error) => {
  console.error(error)
  const hint = DB_ERROR_HINTS[error.code]
  const detail = error.sqlMessage || error.message
  res.status(500).json({ error: [fallback, detail, hint].filter(Boolean).join(' — '), code: error.code })
}

const chunk = (items, size) => {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

// Saves both uploaded sheets. Re-uploading the same contact/company updates it instead of duplicating.
router.post('/upload', async (req, res) => {
  const contacts = (Array.isArray(req.body?.contacts) ? req.body.contacts : [])
    .map((c) => [
      clean(c.companyCin, 25),
      clean(c.companyName, 255),
      clean(c.directorDin, 20),
      clean(c.directorName, 255),
      clean(c.directorEmail, 255)?.toLowerCase() ?? null,
      clean(c.directorContact, 50),
      clean(c.directorPan, 15),
    ])
    // Keep directors without an email (saved as NULL) as long as we have their name.
    .filter((row) => row[1] && (row[3] || row[4]))

  const values = (Array.isArray(req.body?.values) ? req.body.values : [])
    .map((v) => [
      clean(v.name, 255),
      clean(v.facilityName, 255),
      clean(v.enquiryAmount, 100),
      clean(v.institutionType, 100),
      clean(v.city, 100),
    ])
    .filter((row) => row[0])

  if (contacts.length === 0 && values.length === 0) {
    return res.status(400).json({ error: 'Nothing to save — both files were empty.' })
  }

  let conn
  try {
    conn = await pool.getConnection()
  } catch (error) {
    return dbError(res, 'Failed to save the uploaded data.', error)
  }
  try {
    await conn.beginTransaction()

    for (const rows of chunk(contacts, INSERT_CHUNK)) {
      await conn.query(
        `INSERT INTO intel_contacts
           (company_cin, company_name, director_din, director_name, director_email, director_contact, director_pan)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           company_cin = COALESCE(VALUES(company_cin), company_cin),
           director_din = COALESCE(VALUES(director_din), director_din),
           director_name = COALESCE(VALUES(director_name), director_name),
           director_contact = COALESCE(VALUES(director_contact), director_contact),
           director_pan = COALESCE(VALUES(director_pan), director_pan)`,
        [rows]
      )
    }

    if (contacts.length > 0) {
      // A director saved earlier without an email is dropped once the same director
      // (company + name) is saved with one, so the no-email row doesn't linger as a duplicate.
      await conn.query(
        `DELETE stale FROM intel_contacts stale
         JOIN intel_contacts found
           ON found.company_name = stale.company_name
          AND LOWER(found.director_name) = LOWER(stale.director_name)
          AND found.director_email IS NOT NULL
         WHERE stale.director_email IS NULL`
      )
    }

    for (const rows of chunk(values, INSERT_CHUNK)) {
      await conn.query(
        `INSERT INTO intel_values (name, facility_name, enquiry_amount, institution_type, city)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           facility_name = VALUES(facility_name),
           enquiry_amount = VALUES(enquiry_amount),
           institution_type = VALUES(institution_type),
           city = VALUES(city)`,
        [rows]
      )
    }

    await conn.commit()
    res.json({ success: true, contacts: contacts.length, values: values.length })
  } catch (error) {
    await conn.rollback()
    dbError(res, 'Failed to save the uploaded data.', error)
  } finally {
    conn.release()
  }
})

// Cheap check for the navbar: has any Marketing Intelligence upload been saved?
router.get('/has-data', async (req, res) => {
  try {
    const [[row]] = await pool.query(`SELECT EXISTS(SELECT 1 FROM intel_contacts) OR EXISTS(SELECT 1 FROM intel_values) AS has_data`)
    res.json({ hasData: Boolean(row.has_data) })
  } catch (error) {
    dbError(res, 'Failed to check for saved data.', error)
  }
})

// Every saved contact whose company matches a saved value row, plus when they were last emailed.
router.get('/records', async (req, res) => {
  try {
    const [[contacts], [values], [lastSent], [[counts]]] = await Promise.all([
      pool.query(
        `SELECT id, company_name, director_name, director_email
         FROM intel_contacts WHERE director_email IS NOT NULL
         ORDER BY company_name, director_name`
      ),
      pool.query(`SELECT id, name, facility_name, enquiry_amount FROM intel_values`),
      pool.query(
        `SELECT LOWER(director_email) AS email, MAX(sent_at) AS last_sent_at
         FROM intel_emails WHERE status = 'sent' GROUP BY LOWER(director_email)`
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(director_email) AS with_email,
                COUNT(DISTINCT company_name) AS companies
         FROM intel_contacts`
      ),
    ])

    const valueByCompany = new Map()
    values.forEach((v) => {
      const key = normalizeCompanyName(v.name)
      if (key && !valueByCompany.has(key)) valueByCompany.set(key, v)
    })
    const lastSentByEmail = new Map(lastSent.map((row) => [row.email, row.last_sent_at]))

    const records = []
    contacts.forEach((c) => {
      const value = valueByCompany.get(normalizeCompanyName(c.company_name))
      if (!value) return
      records.push({
        contactId: c.id,
        valueId: value.id,
        companyName: c.company_name,
        directorName: c.director_name || '',
        email: c.director_email,
        facilityName: value.facility_name || '',
        enquiryAmount: value.enquiry_amount || '',
        lastSentAt: lastSentByEmail.get(String(c.director_email).toLowerCase()) || null,
      })
    })

    const withEmail = Number(counts.with_email)
    res.json({
      records,
      stats: {
        totalDirectors: Number(counts.total),
        companies: Number(counts.companies),
        emailFound: withEmail,
        emailNotFound: Number(counts.total) - withEmail,
        enquiryMatched: records.length,
        enquiryNotMatched: withEmail - records.length,
        enquiryValues: values.length,
      },
    })
  } catch (error) {
    dbError(res, 'Failed to load saved data.', error)
  }
})

// Clears everything uploaded from the two Excel files. Sent-email history (intel_emails)
// is kept, so "Last Email Sent" comes back if the same directors are uploaded again.
router.delete('/data', async (req, res) => {
  let conn
  try {
    conn = await pool.getConnection()
  } catch (error) {
    return dbError(res, 'Failed to clear the fetched data.', error)
  }
  try {
    await conn.beginTransaction()
    const [contacts] = await conn.query('DELETE FROM intel_contacts')
    const [values] = await conn.query('DELETE FROM intel_values')
    await conn.commit()
    res.json({ success: true, contacts: contacts.affectedRows, values: values.affectedRows })
  } catch (error) {
    await conn.rollback()
    dbError(res, 'Failed to clear the fetched data.', error)
  } finally {
    conn.release()
  }
})

// ---------- Manually created rows ----------

const cleanManualRows = (rows) =>
  (Array.isArray(rows) ? rows : []).map((r) => ({
    companyName: clean(r.companyName, 255),
    directorName: clean(r.directorName, 255),
    email: clean(r.email, 255)?.toLowerCase() ?? null,
    facilityName: clean(r.facilityName, 255),
    enquiryAmount: clean(r.enquiryAmount, 100),
    lastSentAt: r.lastSentAt && !Number.isNaN(Date.parse(r.lastSentAt)) ? new Date(r.lastSentAt) : null,
  }))

// For each typed row, lists which of its names/email already exist in the database.
const findExisting = async (rows) => {
  const [[contacts], [values]] = await Promise.all([
    pool.query('SELECT company_name, director_name, director_email FROM intel_contacts'),
    pool.query('SELECT name FROM intel_values'),
  ])
  const companies = new Map()
  contacts.forEach((c) => companies.set(normalizeCompanyName(c.company_name), c.company_name))
  values.forEach((v) => {
    const key = normalizeCompanyName(v.name)
    if (!companies.has(key)) companies.set(key, v.name)
  })
  const directors = new Map()
  const emails = new Map()
  contacts.forEach((c) => {
    if (c.director_name) directors.set(c.director_name.trim().toLowerCase(), c)
    if (c.director_email) emails.set(c.director_email.toLowerCase(), c)
  })

  return rows.map((row) => {
    const matches = []
    const company = row.companyName && companies.get(normalizeCompanyName(row.companyName))
    if (company) matches.push({ field: 'companyName', value: row.companyName, existing: company })
    const director = row.directorName && directors.get(row.directorName.toLowerCase())
    if (director) {
      matches.push({ field: 'directorName', value: row.directorName, existing: `${director.director_name} (${director.company_name})` })
    }
    const email = row.email && emails.get(row.email)
    if (email) matches.push({ field: 'email', value: row.email, existing: `${email.director_name || email.director_email} (${email.company_name})` })
    return matches
  })
}

router.post('/manual/check', async (req, res) => {
  try {
    res.json({ matches: await findExisting(cleanManualRows(req.body?.rows)) })
  } catch (error) {
    dbError(res, 'Failed to check for existing names.', error)
  }
})

router.post('/manual', async (req, res) => {
  const rows = cleanManualRows(req.body?.rows)
  const invalid = rows.findIndex((r) => !r.companyName || !r.directorName || !r.email)
  if (rows.length === 0 || invalid !== -1) {
    return res.status(400).json({
      error: rows.length === 0 ? 'No rows to save.' : `Row ${invalid + 1}: Company Name, Director Name and Director Email are required.`,
    })
  }

  let conn
  try {
    conn = await pool.getConnection()
  } catch (error) {
    return dbError(res, 'Failed to save the new data.', error)
  }
  try {
    await conn.beginTransaction()
    for (const r of rows) {
      await conn.query(
        `INSERT INTO intel_contacts (company_name, director_name, director_email)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE director_name = COALESCE(VALUES(director_name), director_name)`,
        [r.companyName, r.directorName, r.email]
      )
      // Blank facility/amount must not wipe what an uploaded sheet already saved for this company.
      await conn.query(
        `INSERT INTO intel_values (name, facility_name, enquiry_amount)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           facility_name = COALESCE(VALUES(facility_name), facility_name),
           enquiry_amount = COALESCE(VALUES(enquiry_amount), enquiry_amount)`,
        [r.companyName, r.facilityName, r.enquiryAmount]
      )
      if (r.lastSentAt) {
        await conn.query(
          `INSERT INTO intel_emails
             (company_name, director_name, director_email, facility_name, enquiry_amount, subject, status, sent_at)
           VALUES (?, ?, ?, ?, ?, 'Manually entered', 'sent', ?)`,
          [r.companyName, r.directorName, r.email, r.facilityName, r.enquiryAmount, r.lastSentAt]
        )
      }
    }
    await conn.commit()
    res.json({ success: true, saved: rows.length })
  } catch (error) {
    await conn.rollback()
    dbError(res, 'Failed to save the new data.', error)
  } finally {
    conn.release()
  }
})

// One row per send attempt; "sent" rows drive the Last Email Sent column.
router.post('/email-log', async (req, res) => {
  const body = req.body ?? {}
  const status = ['generated', 'sent', 'failed'].includes(body.status) ? body.status : 'generated'
  const companyName = clean(body.companyName, 255)
  const directorEmail = clean(body.email, 255)

  if (!companyName || !directorEmail) {
    return res.status(400).json({ error: '"companyName" and "email" are required.' })
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO intel_emails
         (contact_id, value_id, company_name, director_name, director_email,
          facility_name, enquiry_amount, subject, body, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'sent' ? 'NOW()' : 'NULL'})`,
      [
        Number(body.contactId) || null,
        Number(body.valueId) || null,
        companyName,
        clean(body.directorName, 255),
        directorEmail.toLowerCase(),
        clean(body.facilityName, 255),
        clean(body.enquiryAmount, 100),
        clean(body.subject, 500),
        String(body.body ?? '') || null,
        status,
        clean(body.errorMessage, 500),
      ]
    )
    res.json({ success: true, id: result.insertId })
  } catch (error) {
    dbError(res, 'Failed to save the email log.', error)
  }
})

module.exports = router
