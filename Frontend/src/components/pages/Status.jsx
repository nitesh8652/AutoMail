import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle, Send, Download, Clock, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'

const formatTimestamp = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

const StatusCard = ({ company, projectName, directorName, status, email, timestamp }) => {
  const isReceived = status === 'received'
  const formattedTimestamp = formatTimestamp(timestamp)
  const displayProjectName = projectName || company

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#e3edf4] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(22,65,96,0.06)] transition hover:-translate-y-px hover:shadow-[0_12px_32px_rgba(22,65,96,0.1)]">
      <div className=

      {`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isReceived ? 'bg-green-100' : 'bg-red-100'}`}>
        {isReceived ? (
          <CheckCircle className="h-6 w-6 text-green-600" strokeWidth={1.8} />
        ) : (
          <XCircle className="h-6 w-6 text-red-500" strokeWidth={1.8} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-extrabold tracking-[-0.01em] text-[#102a43]">{displayProjectName}</h3>
        {directorName && (
          <p className="mt-0.5 truncate text-[13px] font-semibold text-[#3d5a73]">{directorName}</p>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#617487]">
          <Send className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="truncate">{email}</span>
        </div>
        {formattedTimestamp && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[#8fa1af]">
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">{formattedTimestamp}</span>
          </div>
        )}
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold tracking-[0.04em] uppercase ${
          isReceived
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-600'
        }`}
      >
        {status}
      </span>
    </div>
  )
}

const Status = () => {
  const [logs, setLogs] = useState([])
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('emailStatusLogs')
    if (stored) {
      try {
        setLogs(JSON.parse(stored))
      } catch {
        setLogs([])
      }
    }
  }, [])

  const handleDownload = () => {
    const rows = logs.map((log) => ({
      'Project Name': log.projectName || log.company || '',
      "Director's Name": log.directorName || '',
      'Email ID': log.email || '',
      Status: log.status || '',
      'Sent At': formatTimestamp(log.timestamp),
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Email Status')
    XLSX.writeFile(workbook, `email-status-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const handleClearAll = () => {
    localStorage.removeItem('emailStatusLogs')
    window.dispatchEvent(new Event('emailStatusLogsUpdated'))
    setLogs([])
    setConfirmClear(false)
  }

  return (
    <section className="relative z-10 mx-auto w-[calc(100%-2rem)] max-w-[800px] py-[45px] sm:w-[calc(100%-3rem)] sm:py-[55px] lg:py-[72px]">
      {confirmClear && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-2xl">
            <AlertTriangle className="h-12 w-12 text-red-500" strokeWidth={1.8} />
            <h2 className="text-lg font-extrabold text-slate-800">Clear all email logs?</h2>
            <p className="text-sm text-slate-500">
              This removes all {logs.length} email status record{logs.length > 1 ? 's' : ''}. This cannot be undone.
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-600 transition hover:-translate-y-px hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-xl bg-red-500 px-6 py-2.5 text-sm font-bold text-white transition hover:-translate-y-px hover:bg-red-600"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <span className="mb-[5px] block text-[10px] font-extrabold tracking-[0.13em] text-[#1070BA]">STATUS</span>
          <h1 className="font-heading text-[28px] font-extrabold tracking-[-0.03em] text-[#102a43] sm:text-[34px]">
            Email Status
          </h1>
          <p className="mt-2 text-[15px] text-[#617487]">
            {logs.length > 0
              ? `${logs.length} email${logs.length > 1 ? 's' : ''} processed.`
              : 'No email logs yet.'}
          </p>
        </div>

        {logs.length > 0 && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-[13px] font-bold text-red-500 shadow-sm transition hover:-translate-y-px hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            Clear All
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-[#1070BA] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_22px_rgba(16,112,186,0.22)] transition hover:-translate-y-px hover:bg-[#0c609f]"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            Download Excel
          </button>
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-[#c8e0f1] bg-[#f7fbfe] py-[70px] text-center">
          <Send className="h-8 w-8 text-[#1070BA]" strokeWidth={1.6} />
          <p className="text-[14px] text-[#7c8e9e]">No email logs yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map((log, index) => (
            <StatusCard
              key={index}
              company={log.company}
              projectName={log.projectName}
              directorName={log.directorName}
              status={log.status}
              email={log.email}
              timestamp={log.timestamp}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default Status