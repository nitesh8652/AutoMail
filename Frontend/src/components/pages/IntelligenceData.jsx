import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, CheckCircle2, ChevronRight, Database, Filter, FileSpreadsheet, MailCheck, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react'
import { clearIntelligenceData, fetchIntelligenceRecords, generateEmailForRecord } from '../../config/api'
import { toIntelligenceRecord } from '../../config/Xlsx'
import { LAST_SCAN_STORAGE_KEY, safeSetItem } from '../../config/storage'
import TypewriterLoader from '../TypewriterLoader'
import CreateDataModal from '../CreateDataModal'
import MiLoader, { MiLoaderOverlay } from '../MiLoader'

// Keep ChatGPT calls to a handful at a time so large selections don't hit rate limits.
const GENERATE_CONCURRENCY = 5

const CRORE = 10000000
const MIN_ENQUIRY_AMOUNT = 5 * CRORE

// Uploaded amounts are plain rupees ("50,000,000"); manually typed ones may say "5 Cr" or "50 lakh".
const parseEnquiryAmount = (value) => {
  const text = String(value ?? '').toLowerCase().replace(/,/g, '')
  const number = parseFloat(text.match(/\d+(\.\d+)?/)?.[0])
  if (Number.isNaN(number)) return null
  if (/\b(cr|crore|crores)\b/.test(text)) return number * CRORE
  if (/\b(l|lac|lacs|lakh|lakhs)\b/.test(text)) return number * 100000
  return number
}

// Indian-style amount for the table ("₹ 25.00 Cr", "₹ 50.00 L"); the raw value stays in the tooltip.
const formatEnquiryAmount = (value) => {
  const amount = parseEnquiryAmount(value)
  if (amount === null) return value || null
  if (amount >= CRORE) return `₹ ${(amount / CRORE).toFixed(2)} Cr`
  if (amount >= 100000) return `₹ ${(amount / 100000).toFixed(2)} L`
  return `₹ ${amount.toLocaleString('en-IN')}`
}

const TABLE_COLUMNS = [
  { label: 'Sr No', width: 'w-[76px]', align: 'text-center' },
  { label: 'Company Name', width: 'w-[26%]' },
  { label: 'Director Name', width: 'w-[16%]' },
  { label: 'Director Email', width: 'w-[21%]' },
  { label: 'Facility Name', width: 'w-[14%]' },
  { label: 'Enquiry Amount', width: 'w-[130px]', align: 'text-right' },
  { label: 'Last Email Sent', width: 'w-[170px]' },
]

const cellClass = 'border-b border-r border-[#e3edf4] px-4 py-3.5 align-middle last:border-r-0'

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

const mapWithConcurrency = async (items, limit, fn, onProgress) => {
  const results = new Array(items.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index])
      done += 1
      onProgress(done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const StatCard = ({ label, value, hint, tone }) => (
  <div className={`rounded-[16px] border bg-white/95 p-4 shadow-[0_12px_40px_rgba(22,65,96,0.06)] ${tone.border}`}>
    <span className={`block text-[10px] font-extrabold uppercase tracking-[0.12em] ${tone.label}`}>{label}</span>
    <strong className="mt-1 block font-heading text-[28px] font-extrabold leading-tight text-[#102a43]">{value}</strong>
    <span className="text-[12px] text-[#7c8e9e]">{hint}</span>
  </div>
)

const TONES = {
  neutral: { border: 'border-[#e3edf4]', label: 'text-[#1070BA]' },
  good: { border: 'border-emerald-200', label: 'text-emerald-600' },
  bad: { border: 'border-red-200', label: 'text-red-500' },
  warn: { border: 'border-amber-200', label: 'text-amber-600' },
}

const loadLastScan = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_SCAN_STORAGE_KEY)) || null
  } catch {
    return null
  }
}

const ScanFileSummary = ({ title, scan, found, foundLabel, saved, extra }) => (
  <div className="min-w-0 rounded-xl bg-[#f7fbfe] p-3">
    <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#1070BA]">
      <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {title}
    </div>
    <p className="mt-0.5 truncate text-[12px] text-[#7c8e9e]" title={scan.fileName}>{scan.fileName}</p>
    <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[12px]">
      <dt className="text-[#476072]">Rows scanned</dt>
      <dd className="text-right font-bold text-[#102a43]">{scan.rows}</dd>
      <dt className="text-[#476072]">{foundLabel}</dt>
      <dd className="text-right font-bold text-[#102a43]">{found}</dd>
      {extra}
      <dt className="text-[#476072]">Rows skipped (blank)</dt>
      <dd className={`text-right font-bold ${scan.rowsSkipped ? 'text-amber-600' : 'text-[#102a43]'}`}>{scan.rowsSkipped}</dd>
      <dt className="text-[#476072]">Saved to database</dt>
      <dd className={`text-right font-bold ${saved === found ? 'text-emerald-600' : 'text-red-600'}`}>{saved}</dd>
    </dl>
    {scan.sheetsIgnored > 0 && (
      <p className="mt-2 text-[11px] text-amber-600">
        {scan.sheetsIgnored} of {scan.sheets} sheet{scan.sheets === 1 ? '' : 's'} ignored — required columns not found.
      </p>
    )}
  </div>
)

const ScanCard = ({ scan }) => {
  const totalRows = scan.contacts.rows + scan.values.rows
  const complete = scan.saved.contacts === scan.contacts.directors && scan.saved.values === scan.values.values
  const hasWarnings = scan.contacts.sheetsIgnored + scan.values.sheetsIgnored > 0

  return (
    <div className="mb-4 rounded-[16px] border border-[#e3edf4] bg-white/95 p-4 shadow-[0_12px_40px_rgba(22,65,96,0.06)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {complete && !hasWarnings ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          )}
          <strong className="text-[14px] text-[#102a43]">
            {totalRows} entr{totalRows === 1 ? 'y' : 'ies'} scanned from the two files
          </strong>
        </div>
        <span className="text-[11px] text-[#94a5b2]">Last upload · {formatDate(scan.scannedAt)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ScanFileSummary
          title="Email file"
          scan={scan.contacts}
          found={scan.contacts.directors}
          foundLabel="Directors found"
          saved={scan.saved.contacts}
          extra={
            <>
              <dt className="pl-3 text-[#7c8e9e]">with email / without</dt>
              <dd className="text-right text-[#476072]">{scan.contacts.withEmail} / {scan.contacts.withoutEmail}</dd>
            </>
          }
        />
        <ScanFileSummary
          title="Value file"
          scan={scan.values}
          found={scan.values.values}
          foundLabel="Enquiries found"
          saved={scan.saved.values}
        />
      </div>
      {!complete && (
        <p className="mt-3 text-[12px] font-semibold text-red-600">
          Not everything read from the files was saved — upload the files again.
        </p>
      )}
    </div>
  )
}

const inputClass =
  'h-10 rounded-lg border border-[#d3e4f0] bg-white px-3 text-[13px] text-[#102a43] outline-none transition focus:border-[#1070BA] focus:ring-2 focus:ring-[#1070BA]/15'

const IntelligenceData = () => {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState(null)
  const [lastScan, setLastScan] = useState(loadLastScan)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [companySearch, setCompanySearch] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [emailSearch, setEmailSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [rangeError, setRangeError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [generatedCount, setGeneratedCount] = useState(0)
  const [generateError, setGenerateError] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [sentOnly, setSentOnly] = useState(false)
  const [largeOnly, setLargeOnly] = useState(false)

  const loadRecords = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { records, stats: nextStats } = await fetchIntelligenceRecords()
      setStats(nextStats)
      setRows(records.map((record, index) => ({ ...record, srNo: index + 1 })))
      setSelected(new Set())
    } catch (err) {
      setLoadError(err.message || 'Failed to load saved data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecords()
  }, [])

  const directorsByCompany = useMemo(() => {
    const map = new Map()
    rows.forEach((row) => {
      const ids = map.get(row.companyName) || []
      ids.push(row.contactId)
      map.set(row.companyName, ids)
    })
    return map
  }, [rows])

  const sentCount = useMemo(() => rows.filter((row) => row.lastSentAt).length, [rows])
  const isLargeEnquiry = (row) => parseEnquiryAmount(row.enquiryAmount) > MIN_ENQUIRY_AMOUNT
  const largeCount = useMemo(() => rows.filter(isLargeEnquiry).length, [rows])

  const filteredRows = useMemo(() => {
    const companyTerm = companySearch.trim().toLowerCase()
    const nameTerm = nameSearch.trim().toLowerCase()
    const emailTerm = emailSearch.trim().toLowerCase()
    return rows.filter(
      (row) =>
        (!sentOnly || row.lastSentAt) &&
        (!largeOnly || isLargeEnquiry(row)) &&
        (!companyTerm || row.companyName.toLowerCase().includes(companyTerm)) &&
        (!nameTerm || row.directorName.toLowerCase().includes(nameTerm)) &&
        (!emailTerm || row.email.toLowerCase().includes(emailTerm))
    )
  }, [rows, companySearch, nameSearch, emailSearch, sentOnly, largeOnly])

  const searchSummary = [companySearch.trim(), nameSearch.trim(), emailSearch.trim()].filter(Boolean).join('" and "')

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selected.has(row.contactId))

  const toggleRow = (contactId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(contactId)) next.delete(contactId)
      else next.add(contactId)
      return next
    })
  }

  const toggleCompany = (companyName) => {
    const ids = directorsByCompany.get(companyName) || []
    setSelected((prev) => {
      const next = new Set(prev)
      const allIn = ids.every((id) => next.has(id))
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      filteredRows.forEach((row) => (allFilteredSelected ? next.delete(row.contactId) : next.add(row.contactId)))
      return next
    })
  }

  const applyRange = () => {
    const from = Number(rangeFrom)
    const to = Number(rangeTo)
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || from > rows.length) {
      setRangeError(`Enter a valid range between 1 and ${rows.length}.`)
      return
    }
    setRangeError(null)
    setSelected(new Set(rows.filter((row) => row.srNo >= from && row.srNo <= to).map((row) => row.contactId)))
  }

  const handleClear = async () => {
    setClearing(true)
    setClearError(null)
    try {
      await clearIntelligenceData()
      try {
        localStorage.removeItem(LAST_SCAN_STORAGE_KEY)
      } catch {
        // Storage unavailable — nothing to clear.
      }
      setLastScan(null)
      setConfirmClear(false)
      setCompanySearch('')
      setNameSearch('')
      setEmailSearch('')
      setRangeFrom('')
      setRangeTo('')
      await loadRecords()
    } catch (err) {
      setClearError(err.message || 'Failed to clear the fetched data.')
    } finally {
      setClearing(false)
    }
  }

  const handleGenerate = async () => {
    const targets = rows.filter((row) => selected.has(row.contactId)).map(toIntelligenceRecord)
    if (targets.length === 0 || generating) return

    setGenerating(true)
    setGeneratedCount(0)
    setGenerateError(null)
    try {
      const results = await mapWithConcurrency(
        targets,
        GENERATE_CONCURRENCY,
        async (record) => {
          try {
            const generatedEmail = await generateEmailForRecord(record)
            return { ...record, generatedEmail, generationError: null }
          } catch (err) {
            return { ...record, generatedEmail: '', generationError: err.message || 'Failed to generate content.' }
          }
        },
        setGeneratedCount
      )
      safeSetItem('automationResults', results)
      navigate('/automation', { state: { results } })
    } catch (err) {
      setGenerateError(err.message || 'Failed to generate emails.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section className="relative z-10 mx-auto w-[calc(100%-2rem)] max-w-[1800px] py-[45px] sm:w-[calc(100%-3rem)] sm:py-[55px] lg:py-[72px]">
      {generating && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-white/85 backdrop-blur-sm">
          <TypewriterLoader />
          <p className="text-sm font-bold text-slate-600">
            Generating emails… {generatedCount} of {selected.size}
          </p>
        </div>
      )}

      {creating && (
        <CreateDataModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            loadRecords()
          }}
        />
      )}

      {clearing && <MiLoaderOverlay message="Clearing fetched data…" />}

      {confirmClear && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-2xl">
            <AlertTriangle className="h-12 w-12 text-red-500" strokeWidth={1.8} />
            <h2 id="clear-title" className="text-lg font-extrabold text-slate-800">Clear all fetched data?</h2>
            <p className="text-sm text-slate-500">
              This permanently deletes every saved director (including those without an email) and all enquiry values from the database. Sent-email history is kept.
            </p>
            {clearError && <p className="text-sm text-red-600">{clearError}</p>}
            <div className="mt-2 grid w-full grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setConfirmClear(false); setClearError(null) }}
                disabled={clearing}
                className="rounded-xl border border-[#d3e4f0] bg-white py-2.5 text-sm font-bold text-[#476072] transition hover:bg-[#f4f8fb] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={clearing}
                className="rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {clearing ? 'Clearing…' : 'Yes, clear all'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="mb-[5px] block text-[10px] font-extrabold tracking-[0.13em] text-[#1070BA]">STEP 02</span>
          <h1 className="font-heading text-[28px] font-extrabold tracking-[-0.03em] text-[#102a43] sm:text-[34px]">Already Fetched</h1>
          <p className="mt-2 text-[15px] text-[#617487]">
            {loading
              ? 'Loading saved directors…'
              : `${rows.length} director${rows.length === 1 ? '' : 's'} with a matching enquiry, from ${directorsByCompany.size} compan${directorsByCompany.size === 1 ? 'y' : 'ies'}.`}
          </p>
        </div>
        <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex h-10 items-center gap-2 rounded-lg bg-[#1070BA] px-4 text-[13px] font-bold text-white transition hover:bg-[#0c609f]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create data
        </button>
        <button
          type="button"
          onClick={() => setSentOnly((prev) => !prev)}
          aria-pressed={sentOnly}
          disabled={loading || rows.length === 0}
          className={`flex h-10 items-center gap-2 rounded-lg border px-4 text-[13px] font-bold transition disabled:opacity-50 ${
            sentOnly
              ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
              : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          <MailCheck className="h-4 w-4" aria-hidden="true" />
          {sentOnly ? 'Show all' : `Sent emails (${sentCount})`}
        </button>
        <button
          type="button"
          onClick={() => setLargeOnly((prev) => !prev)}
          aria-pressed={largeOnly}
          disabled={loading || rows.length === 0}
          className={`flex h-10 items-center gap-2 rounded-lg border px-4 text-[13px] font-bold transition disabled:opacity-50 ${
            largeOnly
              ? 'border-violet-500 bg-violet-500 text-white hover:bg-violet-600'
              : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
          }`}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          Enquiry &gt; 5 Cr ({largeCount})
        </button>
        <button
          type="button"
          onClick={loadRecords}
          disabled={loading}
          className="flex h-10 items-center gap-2 rounded-lg border border-[#d3e4f0] bg-white px-4 text-[13px] font-bold text-[#1070BA] transition hover:bg-[#eff8fe] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          disabled={loading || rows.length === 0}
          className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-[13px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Clear all data
        </button>
        </div>
      </div>

      {lastScan?.contacts && lastScan?.values && lastScan?.saved && <ScanCard scan={lastScan} />}

      {stats && stats.totalDirectors > 0 && !loadError && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Directors found"
            value={stats.totalDirectors}
            hint={`across ${stats.companies} compan${stats.companies === 1 ? 'y' : 'ies'}`}
            tone={TONES.neutral}
          />
          <StatCard
            label="Email found"
            value={stats.emailFound}
            hint={`${Math.round((stats.emailFound / stats.totalDirectors) * 100)}% of directors`}
            tone={TONES.good}
          />
          <StatCard
            label="Email not found"
            value={stats.emailNotFound}
            hint="saved with no email — can't be emailed"
            tone={TONES.bad}
          />
          <StatCard
            label="No enquiry match"
            value={stats.enquiryNotMatched}
            hint={`have an email but company not in value file · ${stats.enquiryMatched} ready to send`}
            tone={TONES.warn}
          />
        </div>
      )}

      {loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-red-200 bg-red-50 py-[60px] text-center">
          <AlertTriangle className="w-8 text-red-500" strokeWidth={1.6} aria-hidden="true" />
          <p className="text-[14px] text-red-600">{loadError}</p>
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-[#c8e0f1] bg-[#f7fbfe] py-[70px] text-center">
          <Database className="w-8 text-[#1070BA]" strokeWidth={1.6} aria-hidden="true" />
          <p className="text-[14px] text-[#7c8e9e]">
            {stats?.totalDirectors > 0
              ? 'No director has both an email and a matching enquiry, so there is no one to email yet.'
              : 'No saved data yet. Upload the Email and Value files from the home page.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 rounded-[18px] border border-[#e3edf4] bg-white/95 p-4 shadow-[0_12px_40px_rgba(22,65,96,0.06)] lg:grid-cols-[1fr_auto]">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 w-4 text-[#94a5b2]" aria-hidden="true" />
                <input
                  type="search"
                  value={companySearch}
                  onChange={(event) => setCompanySearch(event.target.value)}
                  placeholder="Search by company name"
                  aria-label="Search by company name"
                  className={`${inputClass} w-full pl-9`}
                />
              </label>
              <label className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 w-4 text-[#94a5b2]" aria-hidden="true" />
                <input
                  type="search"
                  value={nameSearch}
                  onChange={(event) => setNameSearch(event.target.value)}
                  placeholder="Search by director name"
                  aria-label="Search by director name"
                  className={`${inputClass} w-full pl-9`}
                />
              </label>
              <label className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 w-4 text-[#94a5b2]" aria-hidden="true" />
                <input
                  type="search"
                  value={emailSearch}
                  onChange={(event) => setEmailSearch(event.target.value)}
                  placeholder="Search by email"
                  aria-label="Search by email"
                  className={`${inputClass} w-full pl-9`}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-extrabold tracking-[0.04em] text-[#476072]">SR NO</span>
              <input
                type="number"
                min={1}
                max={rows.length}
                value={rangeFrom}
                onChange={(event) => setRangeFrom(event.target.value)}
                placeholder="From"
                className={`${inputClass} w-[90px]`}
              />
              <span className="text-[13px] text-[#7c8e9e]">to</span>
              <input
                type="number"
                min={1}
                max={rows.length}
                value={rangeTo}
                onChange={(event) => setRangeTo(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && applyRange()}
                placeholder="To"
                className={`${inputClass} w-[90px]`}
              />
              <button
                type="button"
                onClick={applyRange}
                className="h-10 rounded-lg bg-[#1070BA] px-4 text-[13px] font-bold text-white transition hover:bg-[#0c609f]"
              >
                Select range
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
                className="h-10 rounded-lg border border-[#d3e4f0] bg-white px-4 text-[13px] font-bold text-[#476072] transition hover:bg-[#f4f8fb] disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            {rangeError && <p className="text-[12px] text-red-600 lg:col-span-2">{rangeError}</p>}
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[#e3edf4] bg-white/95 shadow-[0_24px_70px_rgba(22,65,96,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e3edf4] bg-[#f7fbfe] px-5 py-3 text-[13px]">
              <span className="font-bold text-[#102a43]">
                Showing {filteredRows.length} of {rows.length} director{rows.length === 1 ? '' : 's'}
              </span>
              <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${selected.size ? 'bg-[#1070BA] text-white' : 'bg-[#e9eff3] text-[#7c8e9e]'}`}>
                {selected.size} selected
              </span>
            </div>
            <div className="max-h-[calc(100vh-160px)] min-h-[420px] overflow-auto">
              <table className="w-full min-w-[1280px] table-fixed border-collapse text-left text-[14px]">
                <colgroup>
                  <col className="w-[52px]" />
                  {TABLE_COLUMNS.map((column) => (
                    <col key={column.label} className={column.width} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 shadow-[0_1px_0_#cfe3f1]">
                  <tr className="bg-[#eaf5fc]">
                    <th className="border-b border-r border-[#d6e8f5] px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        aria-label="Select all shown rows"
                        className="h-4 w-4 accent-[#1070BA]"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                      />
                    </th>
                    {TABLE_COLUMNS.map((column) => (
                      <th
                        key={column.label}
                        className={`whitespace-nowrap border-b border-r border-[#d6e8f5] px-4 py-3.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#1070BA] last:border-r-0 ${column.align || ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16">
                        <div className="flex flex-col items-center gap-3">
                          <MiLoader size={18} />
                          <span className="text-[13px] font-semibold text-[#7c8e9e]">Loading saved directors…</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-[#7c8e9e]">
                        {searchSummary
                          ? `No ${sentOnly ? 'emailed ' : ''}directors${largeOnly ? ' with enquiry above 5 Cr' : ''} match "${searchSummary}".`
                          : sentOnly && largeOnly
                            ? 'No emailed directors have an enquiry above 5 Cr.'
                            : sentOnly
                              ? 'No emails have been sent to any director yet.'
                              : 'No directors have an enquiry above 5 Cr.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, index) => {
                      const isSelected = selected.has(row.contactId)
                      const companyIds = directorsByCompany.get(row.companyName) || []
                      const companyAllSelected = companyIds.every((id) => selected.has(id))
                      const lastSent = formatDate(row.lastSentAt)
                      const amount = formatEnquiryAmount(row.enquiryAmount)
                      // Rows arrive grouped by company; a heavier line marks where a new company starts.
                      const newCompany = index > 0 && filteredRows[index - 1].companyName !== row.companyName
                      return (
                        <tr
                          key={row.contactId}
                          onClick={() => toggleRow(row.contactId)}
                          className={`cursor-pointer transition ${newCompany ? 'border-t-2 border-t-[#cfe3f1]' : ''} ${
                            isSelected
                              ? 'bg-[#e3f1fb] shadow-[inset_3px_0_0_#1070BA]'
                              : index % 2 === 0
                                ? 'bg-white hover:bg-[#f4f9fd]'
                                : 'bg-[#f8fbfe] hover:bg-[#f4f9fd]'
                          }`}
                        >
                          <td className={`${cellClass} text-center`} onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${row.directorName || row.email}`}
                              className="h-4 w-4 accent-[#1070BA]"
                              checked={isSelected}
                              onChange={() => toggleRow(row.contactId)}
                            />
                          </td>
                          <td className={`${cellClass} text-center font-bold tabular-nums text-[#476072]`}>{row.srNo}</td>
                          <td className={`${cellClass} text-[#102a43]`}>
                            <div className="break-words font-semibold leading-snug">{row.companyName}</div>
                            {companyIds.length > 1 && (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); toggleCompany(row.companyName) }}
                                className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[#edf7fd] px-2 py-0.5 text-[11px] font-bold text-[#1070BA] hover:bg-[#dceffb]"
                              >
                                <Users className="h-3 w-3" aria-hidden="true" />
                                {companyAllSelected ? 'Unselect' : 'Select'} all {companyIds.length} directors
                              </button>
                            )}
                          </td>
                          <td className={`${cellClass} break-words font-medium text-[#102a43]`}>
                            {row.directorName || <span className="text-[#94a5b2]">—</span>}
                          </td>
                          <td className={`${cellClass} truncate text-[#1070BA]`} title={row.email}>{row.email}</td>
                          <td className={`${cellClass} break-words text-[#476072]`}>
                            {row.facilityName || <span className="text-[#94a5b2]">—</span>}
                          </td>
                          <td
                            className={`${cellClass} whitespace-nowrap text-right font-semibold tabular-nums text-[#102a43]`}
                            title={row.enquiryAmount || undefined}
                          >
                            {amount || <span className="font-normal text-[#94a5b2]">—</span>}
                          </td>
                          <td className={cellClass}>
                            {lastSent ? (
                              <span className="inline-block whitespace-nowrap rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-700">{lastSent}</span>
                            ) : (
                              <span className="inline-block rounded-md bg-[#f1f5f8] px-2 py-1 text-[12px] font-semibold text-[#94a5b2]">Never</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        className="mt-[22px] flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border-0 bg-[#1070BA] font-bold text-white shadow-[0_10px_22px_rgba(16,112,186,0.22)] transition hover:-translate-y-px hover:bg-[#0c609f] disabled:cursor-not-allowed disabled:bg-[#e9eff3] disabled:text-[#94a5b2] disabled:shadow-none disabled:hover:translate-y-0"
        disabled={selected.size === 0 || generating}
        onClick={handleGenerate}
      >
        {selected.size === 0 ? 'Select directors to continue' : `Generate emails for ${selected.size} selected`}
        <ChevronRight className="w-[18px]" aria-hidden="true" />
      </button>
      {generateError && <p className="mt-2 text-center text-[13px] text-red-600">{generateError}</p>}
    </section>
  )
}

export default IntelligenceData
