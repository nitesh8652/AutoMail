import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight, LockKeyhole, Upload } from 'lucide-react'
import { extractProjectsFromFile } from '../config/Xlsx'

const Hero = () => {
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

  const handleContinue = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const projects = await extractProjectsFromFile(file)
      console.log(projects)
      localStorage.setItem('fetchedProjects', JSON.stringify(projects))
      navigate('/fetched', { state: { projects } })
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to read the file.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="relative z-10 mx-auto grid min-h-[calc(100vh-74px)] w-[calc(100%-2rem)] max-w-[1180px] grid-cols-1 items-center gap-[42px] py-[45px] pb-[70px] sm:min-h-[calc(100vh-88px)] sm:w-[calc(100%-3rem)] sm:gap-[55px] sm:py-[55px] sm:pb-[90px] lg:grid-cols-[1fr_500px] lg:gap-[90px] lg:py-[72px] lg:pb-[110px]">
      <div className="text-center lg:text-left">
        <div className="mx-auto mb-[25px] flex w-fit items-center gap-2 rounded-full bg-[#eaf5fc] px-[13px] py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#1070BA] lg:mx-0">
          <span className="h-[7px] w-[7px] rounded-full bg-[#1070BA] shadow-[0_0_0_4px_rgba(16,112,186,0.12)]" />
          Simple. Secure. Fast.
        </div>
        <h1 className="mx-auto max-w-[620px] font-heading text-[42px] font-extrabold leading-[1.08] tracking-[-0.055em] text-[#102a43] sm:text-[clamp(44px,5.2vw,72px)] lg:mx-0">
          Turn your spreadsheet into <span className="text-[#1070BA]">action.</span>
        </h1>
        <p className="mx-auto my-[21px] mb-[30px] max-w-[560px] text-base leading-[1.65] text-[#617487] sm:my-[26px] sm:mb-[38px] sm:text-lg sm:leading-[1.75] lg:mx-0">
          Upload your Excel file and let Express Rupya handle the rest—cleanly, securely, and in just a few clicks.
        </p>

        <div className="mx-auto flex items-center justify-center lg:mx-0 lg:justify-start" aria-label="Product benefits">
          {[
            ['100%', 'Secure'],
            ['< 1 min', 'To get started'],
            ['24/7', 'Available'],
          ].map(([value, label], index) => (
            <div className={`flex min-w-0 flex-col gap-0.5 px-4 sm:min-w-[120px] sm:px-7 ${index !== 2 ? 'border-r border-[#d9e4ec]' : ''} ${index === 0 ? 'pl-0' : ''}`} key={label}>
              <strong className="font-heading text-base text-[#102a43] sm:text-[19px]">{value}</strong>
              <span className="text-xs text-[#8394a5]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[540px] rounded-[18px] border border-[#e3edf4] bg-white/95 p-[22px] shadow-[0_24px_70px_rgba(22,65,96,0.12)] before:absolute before:-inset-[14px] before:-z-10 before:rounded-[30px] before:border before:border-[#1070BA]/10 sm:rounded-[22px] sm:p-8" id="upload">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <span className="mb-[5px] block text-[10px] font-extrabold tracking-[0.13em] text-[#1070BA]">STEP 01</span>
            <h2 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#102a43]">Upload your file</h2>
          </div>
          <span className="rounded-md bg-[#edf7fd] px-[9px] py-1.5 text-[10px] font-extrabold tracking-[0.08em] text-[#1070BA]">.XLSX</span>
        </div>

        <button
          className={`flex min-h-[210px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-[1.5px] border-dashed px-3.5 py-[22px] transition duration-200 sm:min-h-[230px] sm:p-7 ${dragging ? '-translate-y-0.5 border-[#1070BA] bg-[#eff8fe]' : 'border-[#afd2e9] bg-[#f7fbfe] hover:-translate-y-0.5 hover:border-[#1070BA] hover:bg-[#eff8fe]'}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="mb-[17px] grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-white text-[#1070BA] shadow-[0_7px_20px_rgba(16,112,186,0.12)]" aria-hidden="true">
            <Upload className="w-[25px]" strokeWidth={1.8} />
          </span>
          {file ? (
            <><strong className="mb-[7px] max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[15px] text-[#1070BA]">{file.name}</strong><small className="mt-[18px] text-[10px] text-[#9aa9b6]">Click to choose a different file</small></>
          ) : (
            <><strong className="mb-[7px] text-[15px] text-[#102a43]">Drop your Excel file here</strong><span className="text-[13px] text-[#7c8e9e]">or <em className="font-bold not-italic text-[#1070BA]">browse files</em> from your device</span><small className="mt-[18px] text-[10px] text-[#9aa9b6]">Maximum file size: 10 MB</small></>
          )}
        </button>

        <input ref={inputRef} className="sr-only" type="file" accept=".xlsx,.xls" onChange={(event) => selectFile(event.target.files[0])} />
        <button className="mt-[22px] flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border-0 bg-[#1070BA] font-bold text-white shadow-[0_10px_22px_rgba(16,112,186,0.22)] transition hover:-translate-y-px hover:bg-[#0c609f] disabled:cursor-not-allowed disabled:bg-[#e9eff3] disabled:text-[#94a5b2] disabled:shadow-none disabled:hover:translate-y-0" type="button" disabled={!file || loading} onClick={handleContinue}>
          {loading ? 'Reading file…' : 'Continue with file'}
          <ChevronRight className="w-[18px]" aria-hidden="true" />
        </button>
      
        <p className="mt-[17px] flex items-center justify-center gap-[7px] text-[10px] text-[#8a9aa8]">
          <LockKeyhole className="w-[13px]" strokeWidth={1.7} aria-hidden="true" />
          Your data stays private and encrypted
        </p>
      </div>
    </section>
  )
}

export default Hero
