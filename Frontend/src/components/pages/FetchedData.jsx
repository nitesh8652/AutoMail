import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ChevronRight, FileSpreadsheet } from 'lucide-react'
import { generateEmailForRecord } from '../../config/api'
import { safeSetItem } from '../../config/storage'
import TypewriterLoader from '../TypewriterLoader'

const COLUMNS = [
  { key: 'srNo', label: 'SR No' },
  { key: 'directorName', label: 'Director' },
  { key: 'email', label: 'Email' },
  { key: 'projectName', label: 'Project Name' },
  { key: 'projectType', label: 'Type' },
  { key: 'launchDate', label: 'Start Date' },
  { key: 'completionDate', label: 'Completion Date' },
  { key: 'launchedSqft', label: 'Launched Sqft' },
  { key: 'launchedUnits', label: 'Launched Units' },
  { key: 'unitSizeMin', label: 'Unit Size Min' },
  { key: 'unitSizeMax', label: 'Unit Size Max' },
  { key: 'percentSold', label: '% Sold' },
  { key: 'newLaunchPrice', label: 'Launched Price' },
  { key: 'absorbedUnits', label: 'Absorbed Units' },
  { key: 'constructionStage', label: 'Stage' },
  // { key: 'prompt', label: 'Message' },
]

const NBFC_COLUMNS = [
  { key: 'srNo', label: 'SR No' },
  { key: 'companyName', label: 'Name' },
  { key: 'email', label: 'Email' },
]

const FetchedData = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const isNbfc = projects[0]?.mode === 'nbfc'
  const columns = isNbfc ? NBFC_COLUMNS : COLUMNS

  useEffect(() => {
    if (location.state?.projects) {
      setProjects(location.state.projects)
      return
    }
    const stored = localStorage.getItem('fetchedProjects')
    if (stored) {
      try {
        setProjects(JSON.parse(stored))
      } catch {
        setProjects([])
      }
    }
  }, [location.state])

  const handleFetchPrompt = async () => {
    if (projects.length === 0 || generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const results = await Promise.all(
        projects.map(async (project) => {
          try {
            const generatedEmail = await generateEmailForRecord(project)
            return { ...project, generatedEmail, generationError: null }
          } catch (err) {
            return { ...project, generatedEmail: '', generationError: err.message || 'Failed to generate content.' }
          }
        })
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
    <section className="relative z-10 mx-auto w-[calc(100%-2rem)] max-w-[14000px] py-[45px] sm:w-[calc(100%-3rem)] sm:py-[55px] lg:py-[72px]">
      {generating && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-white/85 backdrop-blur-sm">
          <TypewriterLoader />
          <p className="text-sm font-bold text-slate-600">Generating emails…</p>
        </div>
      )}
      <div className="mb-6">
        <span className="mb-[5px] block text-[10px] font-extrabold tracking-[0.13em] text-[#1070BA]">STEP 02</span>
        <h1 className="font-heading text-[28px] font-extrabold tracking-[-0.03em] text-[#102a43] sm:text-[34px]">Fetched Data</h1>
        <p className="mt-2 text-[15px] text-[#617487]">
          {projects.length > 0
            ? `${projects.length} ${isNbfc ? (projects.length > 1 ? 'companies' : 'company') : `project${projects.length > 1 ? 's' : ''}`} parsed from your spreadsheet.`
            : 'Upload a file from the home page to see parsed project data here.'}
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-[#c8e0f1] bg-[#f7fbfe] py-[70px] text-center">
          <FileSpreadsheet className="w-8 text-[#1070BA]" strokeWidth={1.6} aria-hidden="true" />
          <p className="text-[14px] text-[#7c8e9e]">No data yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#e3edf4] bg-white/95 shadow-[0_24px_70px_rgba(22,65,96,0.08)]">
          <table className={`w-full ${isNbfc ? '' : 'min-w-[1400px]'} border-collapse text-left text-[13px]`}>
            <thead>
              <tr className="bg-[#eaf5fc]">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`whitespace-nowrap border-b border-[#e3edf4] px-4 py-3 font-extrabold tracking-[0.02em] text-[#1070BA] ${column.key === 'srNo' ? 'w-[50px]' : column.key === 'email' ? 'w-[30px]' : column.key === 'prompt' ? 'min-w-[420px]' : ''}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((project, index) => (
                <tr key={`${project.email}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-[#f8fbfe]'}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`border-b border-[#e3edf4] px-4 py-3 align-top text-[#102a43] ${column.key === 'prompt' ? 'min-w-[420px] whitespace-normal leading-[1.6]' : column.key === 'email' ? 'max-w-[700px] truncate' : column.key === 'srNo' ? 'whitespace-nowrap text-center' : 'whitespace-nowrap'}`}
                    >
                      {column.key === 'srNo' ? index + 1 : project[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        className="mt-[22px] flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border-0 bg-[#1070BA] font-bold text-white shadow-[0_10px_22px_rgba(16,112,186,0.22)] transition hover:-translate-y-px hover:bg-[#0c609f] disabled:cursor-not-allowed disabled:bg-[#e9eff3] disabled:text-[#94a5b2] disabled:shadow-none disabled:hover:translate-y-0"
        disabled={projects.length === 0 || generating}
        onClick={handleFetchPrompt}
      >
        {generating ? 'Generating emails…' : 'Fetch Prompt'}
        <ChevronRight className="w-[18px]" aria-hidden="true" />
      </button>
      {generateError && <p className="mt-2 text-center text-[13px] text-red-600">{generateError}</p>}
    </section>
  )
}

export default FetchedData
