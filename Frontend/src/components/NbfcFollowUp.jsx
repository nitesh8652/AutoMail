import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, ChevronRight, Upload } from 'lucide-react'
import { extractEmailsFromFile, toNbfcFollowUpResult } from '../config/Xlsx'
import { fetchFollowUpThreads } from '../config/api'
import { safeSetItem } from '../config/storage'

const NbfcFollowUp = () => {
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const selectFile = (selectedFile) => {
    if (!selectedFile) return
    setFile(selectedFile)
    setError(null)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    selectFile(event.dataTransfer.files[0])
  }

  // Builds the follow-up emails and opens them on the review page, where they can be
  // checked, excluded and sent — the same flow as Marketing.
  const handleReview = async () => {
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const records = await extractEmailsFromFile(file)
      if (records.length === 0) {
        setError('No valid email addresses found in the uploaded file.')
        return
      }
      // Each follow-up replies to the last email sent to that address, so it lands in the same thread.
      const threads = await fetchFollowUpThreads(records.map(({ email }) => email))
      const results = records.map((record) => {
        const thread = threads[record.email.trim().toLowerCase()]
        return toNbfcFollowUpResult(record, thread?.found ? thread : null)
      })
      safeSetItem('automationResults', results)
      navigate('/automation', { state: { results } })
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to read the file.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="relative z-10 mx-auto w-[calc(100%-2rem)] max-w-[1180px] pb-[70px] sm:w-[calc(100%-3rem)] sm:pb-[90px]">
      {error && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-2xl">
            <AlertTriangle className="h-12 w-12 text-red-500" strokeWidth={1.8} />
            <h2 className="text-lg font-extrabold text-slate-800">Upload failed</h2>
            <p className="text-sm text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-2 rounded-xl bg-[#1070BA] px-8 py-2.5 text-sm font-bold text-white transition hover:-translate-y-px hover:bg-[#0c609f]"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <div className="rounded-[18px] border border-[#e3edf4] bg-white/95 p-[22px] shadow-[0_24px_70px_rgba(22,65,96,0.12)] sm:rounded-[22px] sm:p-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <span className="mb-[5px] block text-[10px] font-extrabold tracking-[0.13em] text-[#1070BA]">NBFC FOLLOW-UP</span>
            <h2 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#102a43]">Follow-up emails</h2>
            <p className="mt-1 text-[13px] text-[#7c8e9e]">Upload a sheet with <strong>Company Name</strong> and <strong>Email</strong> columns. You can review every email before sending. The company name goes in the subject.</p>
          </div>
          <span className="rounded-md bg-[#edf7fd] px-[9px] py-1.5 text-[10px] font-extrabold tracking-[0.08em] text-[#1070BA]">.XLSX / .CSV</span>
        </div>

        <button
          className={`flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-[1.5px] border-dashed px-3.5 py-[22px] transition duration-200 ${dragging ? '-translate-y-0.5 border-[#1070BA] bg-[#eff8fe]' : 'border-[#afd2e9] bg-[#f7fbfe] hover:-translate-y-0.5 hover:border-[#1070BA] hover:bg-[#eff8fe]'}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="mb-[14px] grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-white text-[#1070BA] shadow-[0_7px_20px_rgba(16,112,186,0.12)]" aria-hidden="true">
            <Upload className="w-[22px]" strokeWidth={1.8} />
          </span>
          {file ? (
            <strong className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[15px] text-[#1070BA]">{file.name}</strong>
          ) : (
            <span className="text-[13px] text-[#7c8e9e]">Drop your file here or <em className="font-bold not-italic text-[#1070BA]">browse files</em></span>
          )}
        </button>

        <input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { selectFile(event.target.files[0]); event.target.value = '' }} />

        <button
          className="mt-[14px] flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border-0 bg-[#1070BA] font-bold text-white shadow-[0_10px_22px_rgba(16,112,186,0.22)] transition hover:-translate-y-px hover:bg-[#0c609f] disabled:cursor-not-allowed disabled:bg-[#e9eff3] disabled:text-[#94a5b2] disabled:shadow-none disabled:hover:translate-y-0"
          type="button"
          disabled={!file || loading}
          onClick={handleReview}
        >
          {loading ? 'Finding earlier emails…' : 'Review emails'}
          <ChevronRight className="w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

export default NbfcFollowUp
