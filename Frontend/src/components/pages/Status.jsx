import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle, Send, Download, Clock, RefreshCw, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { fetchEmailHistory } from '../../config/api'
import MiLoader from '../MiLoader'

const TYPE_LABELS = {
  intelligence: 'Intelligence',
  nbfc: 'NBFC',
  nbfcFollowUp: 'NBFC follow-up',
  marketing: 'Marketing',
}

const TYPE_STYLES = {
  intelligence: 'bg-violet-100 text-violet-700',
  nbfc: 'bg-sky-100 text-sky-700',
  nbfcFollowUp: 'bg-amber-100 text-amber-700',
  marketing: 'bg-slate-100 text-slate-600',
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const StatusCard = ({ entry }) => {
  const isSent = entry.status === 'sent'
  const formattedTimestamp = formatTimestamp(entry.sentAt)

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#e3edf4] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(22,65,96,0.06)] transition hover:-translate-y-px hover:shadow-[0_12px_32px_rgba(22,65,96,0.1)]">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isSent ? 'bg-green-100' : 'bg-red-100'}`}>
        {isSent ? (
          <CheckCircle className="h-6 w-6 text-green-600" strokeWidth={1.8} />
        ) : (
          <XCircle className="h-6 w-6 text-red-500" strokeWidth={1.8} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[15px] font-extrabold tracking-[-0.01em] text-[#102a43]">
            {entry.companyName || entry.subject || entry.email}
          </h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.04em] ${TYPE_STYLES[entry.type] || TYPE_STYLES.marketing}`}>
            {TYPE_LABELS[entry.type] || entry.type}
          </span>
        </div>
        {entry.directorName && (
          <p className="mt-0.5 truncate text-[13px] font-semibold text-[#3d5a73]">{entry.directorName}</p>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#617487]">
          <Send className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="truncate">{entry.email}</span>
        </div>
        {formattedTimestamp && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[#8fa1af]">
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">{formattedTimestamp}</span>
          </div>
        )}
        {!isSent && entry.errorMessage && (
          <p className="mt-0.5 truncate text-[12px] text-red-500" title={entry.errorMessage}>{entry.errorMessage}</p>
        )}
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold tracking-[0.04em] uppercase ${
          isSent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
        }`}
      >
        {entry.status}
      </span>
    </div>
  )
}

const Status = () => {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const loadHistory = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setHistory(await fetchEmailHistory())
    } catch (err) {
      setLoadError(err.message || 'Failed to load the email history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const typeCounts = useMemo(() => {
    const counts = {}
    history.forEach((entry) => {
      counts[entry.type] = (counts[entry.type] || 0) + 1
    })
    return counts
  }, [history])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return history.filter(
      (entry) =>
        (typeFilter === 'all' || entry.type === typeFilter) &&
        (!term ||
          [entry.companyName, entry.directorName, entry.email, entry.subject].some((value) =>
            String(value ?? '').toLowerCase().includes(term)
          ))
    )
  }, [history, typeFilter, search])

  const sentCount = filtered.filter((entry) => entry.status === 'sent').length

  const handleDownload = () => {
    const rows = filtered.map((entry) => ({
      Type: TYPE_LABELS[entry.type] || entry.type,
      'Company Name': entry.companyName || '',
      "Director's Name": entry.directorName || '',
      'Email ID': entry.email || '',
      Subject: entry.subject || '',
      Status: entry.status || '',
      Error: entry.errorMessage || '',
      'Sent At': formatTimestamp(entry.sentAt),
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Email Status')
    XLSX.writeFile(workbook, `email-status-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const filterButtons = [
    { value: 'all', label: 'All', count: history.length },
    ...Object.keys(TYPE_LABELS).map((type) => ({ value: type, label: TYPE_LABELS[type], count: typeCounts[type] || 0 })),
  ]

  return (
    <section className="relative z-10 mx-auto w-[calc(100%-2rem)] max-w-[800px] py-[45px] sm:w-[calc(100%-3rem)] sm:py-[55px] lg:py-[72px]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="mb-[5px] block text-[10px] font-extrabold tracking-[0.13em] text-[#1070BA]">STATUS</span>
          <h1 className="font-heading text-[28px] font-extrabold tracking-[-0.03em] text-[#102a43] sm:text-[34px]">
            Email Status
          </h1>
          <p className="mt-2 text-[15px] text-[#617487]">
            {loading
              ? 'Loading email history…'
              : history.length > 0
                ? `${filtered.length} email${filtered.length === 1 ? '' : 's'} shown · ${sentCount} sent, ${filtered.length - sentCount} failed.`
                : 'No emails sent yet.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={loadHistory}
            disabled={loading}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-[#d3e4f0] bg-white px-4 py-2.5 text-[13px] font-bold text-[#1070BA] shadow-sm transition hover:-translate-y-px hover:bg-[#eff8fe] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            Refresh
          </button>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={handleDownload}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-[#1070BA] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_22px_rgba(16,112,186,0.22)] transition hover:-translate-y-px hover:bg-[#0c609f]"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              Download Excel
            </button>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {filterButtons.map(({ value, label, count }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTypeFilter(value)}
                aria-pressed={typeFilter === value}
                className={`rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition ${
                  typeFilter === value
                    ? 'border-[#1070BA] bg-[#1070BA] text-white'
                    : 'border-[#d3e4f0] bg-white text-[#476072] hover:bg-[#eff8fe]'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 w-4 text-[#94a5b2]" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by company, director, email or subject"
              aria-label="Search email history"
              className="h-10 w-full rounded-lg border border-[#d3e4f0] bg-white pl-9 pr-3 text-[13px] text-[#102a43] outline-none transition focus:border-[#1070BA] focus:ring-2 focus:ring-[#1070BA]/15"
            />
          </label>
        </div>
      )}

      {loading && history.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-[70px]">
          <MiLoader size={18} />
          <span className="text-[13px] font-semibold text-[#7c8e9e]">Loading email history…</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-red-200 bg-red-50 py-[60px] text-center">
          <AlertTriangle className="h-8 w-8 text-red-500" strokeWidth={1.6} />
          <p className="text-[14px] text-red-600">{loadError}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-[#c8e0f1] bg-[#f7fbfe] py-[70px] text-center">
          <Send className="h-8 w-8 text-[#1070BA]" strokeWidth={1.6} />
          <p className="text-[14px] text-[#7c8e9e]">
            {history.length === 0 ? 'No emails sent yet.' : 'No emails match this filter.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((entry) => (
            <StatusCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}

export default Status
