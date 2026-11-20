import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, RefreshCw, StopCircle } from 'lucide-react'
import { fetchWarehouseFollowUps, stopWarehouseFollowUp } from '../config/api'

const STATUS_STYLES = {
  active: { label: 'Scheduled', className: 'bg-sky-100 text-sky-700' },
  replied: { label: 'Replied', className: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', className: 'bg-slate-100 text-slate-600' },
  stopped: { label: 'Stopped', className: 'bg-red-100 text-red-600' },
}

const formatDate = (value) => {
  const date = new Date(value)
  return value && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
}

// The server sends these on its own; this panel shows where each address is in its schedule.
const WarehouseFollowUps = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stoppingId, setStoppingId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchWarehouseFollowUps())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleStop = async (id) => {
    setStoppingId(id)
    try {
      await stopWarehouseFollowUp(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setStoppingId(null)
    }
  }

  const rows = data?.followUps ?? []
  const activeCount = rows.filter((row) => row.status === 'active').length

  return (
    <section className="relative z-10 mx-auto w-[calc(100%-2rem)] max-w-[1180px] pb-[70px] sm:w-[calc(100%-3rem)] sm:pb-[90px]">
      <div className="rounded-[18px] border border-[#e3edf4] bg-white/95 p-[22px] shadow-[0_24px_70px_rgba(22,65,96,0.12)] sm:rounded-[22px] sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <span className="mb-[5px] block text-[10px] font-extrabold tracking-[0.13em] text-[#1070BA]">WAREHOUSE FOLLOW-UP</span>
            <h2 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#102a43]">Automatic follow-ups</h2>
            <p className="mt-1 text-[13px] text-[#7c8e9e]">
              Every Warehouse email gets {data?.maxFollowUps ?? 4} follow-ups, one every {data?.intervalDays ?? 10} days, as a reply in the same
              thread with <strong>{data?.cc ?? 'himanshu@expressrupya.com'}</strong> in CC. They stop automatically if the person replies.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-[#d3e4f0] bg-white px-4 py-2.5 text-[13px] font-bold text-[#1070BA] transition hover:bg-[#eff8fe] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            Refresh
          </button>
        </div>

        {error && (
          <p className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#c8e0f1] bg-[#f7fbfe] py-8 text-[13px] text-[#7c8e9e]">
            <CalendarClock className="h-4 w-4" />
            {loading ? 'Loading…' : 'No follow-ups scheduled yet. They start when a Warehouse email is sent.'}
          </p>
        ) : (
          <>
            <p className="mb-2 text-[12px] font-semibold text-[#617487]">{activeCount} of {rows.length} still scheduled</p>
            <div className="max-h-[420px] overflow-auto rounded-xl border border-[#e3edf4]">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="sticky top-0 bg-[#eaf5fc]">
                  <tr>
                    {['Company', 'Email', 'First sent', 'Follow-ups', 'Next', 'Status', ''].map((heading) => (
                      <th key={heading} className="whitespace-nowrap px-3 py-2.5 font-extrabold text-[#1070BA]">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = STATUS_STYLES[row.status] ?? { label: row.status, className: 'bg-slate-100 text-slate-600' }
                    return (
                      <tr key={row.id} className="border-t border-[#e3edf4] align-top">
                        <td className="px-3 py-2 font-semibold text-[#102a43]">
                          {row.companyName || '—'}
                          {row.directorName && <div className="text-[12px] font-normal text-[#617487]">{row.directorName}</div>}
                        </td>
                        <td className="px-3 py-2 text-[#476072]">{row.email}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#476072]">{formatDate(row.firstSentAt)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#476072]">{row.sent} / {data.maxFollowUps}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-[#476072]">{row.status === 'active' ? formatDate(row.nextDueAt) : '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.04em] ${status.className}`}>
                            {status.label}
                          </span>
                          {row.error && row.status === 'active' && (
                            <div className="mt-1 max-w-[220px] text-[11px] text-red-500" title={row.error}>{row.error}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleStop(row.id)}
                              disabled={stoppingId === row.id}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[12px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                            >
                              <StopCircle className="h-3.5 w-3.5" /> Stop
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export default WarehouseFollowUps
