import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Check, CheckCircle2, ChevronDown, MailPlus, RefreshCw, Reply, Send, SkipForward, TriangleAlert, UserRoundMinusIcon, XCircle } from 'lucide-react'
import { generateEmailForRecord, logIntelligenceEmail, sendEmail } from '../../config/api'
import Loader from '../Loader'

const SEND_DELAY_MS = 3000
const DELAY_TICK_MS = 100

const parseGeneratedEmail = (text) => {
  const trimmed = String(text ?? '').trim()
  const match = trimmed.match(/^Subject:\s*(.+?)\r?\n+([\s\S]*)$/i)
  if (match) {
    return { subject: match[1].trim(), body: match[2].trim() }
  }
  return { subject: 'Regarding your project', body: trimmed }
}

// Marketing Intelligence sends are recorded in the database so "Last Email Sent" stays current.
const recordIntelligenceSend = (project, { subject, body }, status, errorMessage = null) => {
  if (project.mode !== 'intelligence') return
  logIntelligenceEmail({
    contactId: project.contactId,
    valueId: project.valueId,
    companyName: project.companyName,
    directorName: project.directorName,
    email: project.email,
    facilityName: project.facilityName,
    enquiryAmount: project.enquiryAmount,
    subject,
    body,
    status,
    errorMessage,
  }).catch((err) => console.error(err))
}

// Follow-ups with no earlier email to reply to wait for "Send as new" or "Skip".
const needsThreadChoice = (project) => Boolean(project.threadMissing) && !project.threadChoice

const formatSentDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ThreadInfo = ({ project, onToggle }) => {
  if (project.thread) {
    const sentDate = formatSentDate(project.thread.sentAt)
    return (
      <div className="col-span-6 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Reply className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="min-w-0 truncate">
          Reply to: <strong>{project.thread.subject || '(no subject)'}</strong>
          {sentDate && ` · ${sentDate}`}
        </span>
      </div>
    )
  }
  if (!project.threadMissing) return null

  const choice = project.threadChoice
  return (
    <div className="col-span-6 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <TriangleAlert className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {choice === 'new'
          ? 'No earlier email found — will be sent as a new email.'
          : choice === 'skip'
            ? 'No earlier email found — skipped.'
            : 'No earlier email found to this address. Send as a new email?'}
      </span>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={() => onToggle(true)}
          className={`flex items-center gap-1 rounded-md border px-2.5 py-1 font-bold transition ${
            choice === 'new' ? 'border-green-500 bg-green-500 text-white' : 'border-amber-300 bg-white hover:bg-green-50'
          }`}
        >
          <MailPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Send as new
        </button>
        <button
          type="button"
          onClick={() => onToggle(false)}
          className={`flex items-center gap-1 rounded-md border px-2.5 py-1 font-bold transition ${
            choice === 'skip' ? 'border-red-500 bg-red-500 text-white' : 'border-amber-300 bg-white hover:bg-red-50'
          }`}
        >
          <SkipForward className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Skip
        </button>
      </div>
    </div>
  )
}

const AutomationCard = ({ project, onToggle, onRegenerate }) => {
  const selected = project.selected !== false
  const displayText = project.generationError
    ? `Error: ${project.generationError}`
    : project.generatedEmail || 'No content generated.'

  return (
    <div className="div rounded-2xl bg-[#e4e8ec65] p-3">
      <div className="CARD w-full bg-white border border-slate-200 grid grid-cols-6 gap-2 rounded-xl p-2 text-sm">
        <div className="col-span-6 flex items-center justify-center gap-2">
          <h1 className="truncate text-center text-sm font-bold text-slate-600">
            {project.projectName || 'Project'} — {project.email}
          </h1>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={project.regenerating}
            title="Regenerate email"
            className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-[#1070BA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${project.regenerating ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <ThreadInfo project={project} onToggle={onToggle} />

        <textarea
          readOnly
          value={displayText}
          placeholder="GPT Output..."
          className="bg-slate-100 text-slate-600 h-[400px] placeholder:text-slate-600 placeholder:opacity-50 border border-slate-200 col-span-6 resize-none outline-none rounded-lg p-2 duration-300 focus:border-slate-600"
        />

        {project.sendStatus && (
          <p
            className={`col-span-6 text-center text-xs font-bold ${
              project.sendStatus === 'sent' ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {project.sendStatus === 'sent' ? 'Email sent' : `Failed: ${project.sendError || 'Unknown error'}`}
          </p>
        )}

        <button
          type="button"
          onClick={() => onToggle(false)}
          className={`col-span-3 flex h-12.5 items-center justify-center rounded-lg border duration-300 ${
            selected
              ? 'border-slate-200 bg-slate-100 hover:bg-red-200'
              : 'border-red-400 bg-red-500'
          }`}
        >
          <UserRoundMinusIcon
            className={`h-5 w-5 duration-300 ${
              selected ? 'text-black' : 'text-white'
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => onToggle(true)}
          className={`col-span-3 flex h-12.5 items-center justify-center rounded-lg border duration-300 ${
            selected
              ? 'border-green-400 bg-green-500'
              : 'border-slate-200 bg-slate-100 hover:bg-green-200'
          }`}
        >
          <Check
            className={`h-5 w-5 duration-300 ${
              selected ? 'text-white' : 'text-slate-600'
            }`}
          />
        </button>
      </div>
    </div>
  )
}

const Automation = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [totalToSend, setTotalToSend] = useState(0)
  const [delayRemaining, setDelayRemaining] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successSummary, setSuccessSummary] = useState({ sent: 0, total: 0 })
  const [showCancelled, setShowCancelled] = useState(false)
  const [cancelSummary, setCancelSummary] = useState({ sent: 0, total: 0 })
  const cancelRef = useRef(false)

  // Uses one absolute-deadline setTimeout for the real delay so it still fires on
  // schedule when the tab is backgrounded — chained short timeouts get clamped to
  // ~1 tick/sec by browsers, which was stalling the send loop when the tab lost focus.
  // The setInterval below only drives the cosmetic countdown/progress bar and cancel check.
  const waitWithCountdown = (ms) =>
    new Promise((resolve) => {
      const deadline = Date.now() + ms
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        clearInterval(tickId)
        clearTimeout(doneId)
        setDelayRemaining(0)
        resolve()
      }

      const tickId = setInterval(() => {
        if (cancelRef.current) {
          finish()
          return
        }
        setDelayRemaining(Math.max(deadline - Date.now(), 0))
      }, DELAY_TICK_MS)

      const doneId = setTimeout(finish, ms)

      setDelayRemaining(ms)
    })

  useEffect(() => {
    if (location.state?.results) {
      setProjects(location.state.results.map((project) => ({ selected: true, ...project })))
      return
    }
    const stored = localStorage.getItem('automationResults')
    if (stored) {
      try {
        setProjects(JSON.parse(stored).map((project) => ({ selected: true, ...project })))
      } catch {
        setProjects([])
      }
    }
  }, [location.state])

  const handleToggle = (index, selected) => {
    setProjects((prev) =>
      prev.map((project, i) =>
        i === index
          ? { ...project, selected, ...(project.threadMissing ? { threadChoice: selected ? 'new' : 'skip' } : {}) }
          : project
      )
    )
  }

  const handleRegenerate = async (index) => {
    const project = projects[index]
    if (!project || project.regenerating) return

    setProjects((prev) => prev.map((p, i) => (i === index ? { ...p, regenerating: true } : p)))

    try {
      const generatedEmail = await generateEmailForRecord(project)
      setProjects((prev) =>
        prev.map((p, i) =>
          i === index
            ? { ...p, generatedEmail, generationError: null, regenerating: false, sendStatus: undefined, sendError: undefined }
            : p
        )
      )
    } catch (err) {
      setProjects((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, generationError: err.message || 'Failed to generate content.', regenerating: false } : p
        )
      )
    }
  }

  const pendingChoices = projects.filter(needsThreadChoice).length

  const handleSendAll = async () => {
    const targets = projects
      .map((project, index) => ({ project, index }))
      .filter(({ project }) => project.selected !== false && project.generatedEmail && !project.generationError)

    if (targets.length === 0 || sending || pendingChoices > 0) return

    setSending(true)
    setSentCount(0)
    setTotalToSend(targets.length)
    cancelRef.current = false

    const logs = []
    let cancelled = false

    for (let i = 0; i < targets.length; i += 1) {
      if (cancelRef.current) {
        cancelled = true
        break
      }

      const { project, index } = targets[i]
      const { subject, body } = parseGeneratedEmail(project.generatedEmail)
      try {
        await sendEmail({
          to: project.email,
          subject,
          text: body,
          // Follow-ups reply in the thread of the last email sent to this address.
          ...(project.thread && {
            inReplyTo: project.thread.messageId,
            references: [...(project.thread.references || []), project.thread.messageId],
          }),
          meta: {
            type: project.mode || 'marketing',
            companyName: project.companyName || project.projectName,
            directorName: project.directorName,
          },
        })
        recordIntelligenceSend(project, { subject, body }, 'sent')
        const timestamp = new Date().toISOString()
        setProjects((prev) =>
          prev.map((p, idx) => (idx === index ? { ...p, sendStatus: 'sent', sendError: null } : p))
        )
        logs.push({
          company: project.projectName || project.email,
          projectName: project.projectName || '',
          directorName: project.directorName || '',
          email: project.email,
          status: 'received',
          timestamp,
        })
      } catch (err) {
        const message = err.message || 'Failed to send email.'
        recordIntelligenceSend(project, { subject, body }, 'failed', message)
        const timestamp = new Date().toISOString()
        setProjects((prev) =>
          prev.map((p, idx) => (idx === index ? { ...p, sendStatus: 'failed', sendError: message } : p))
        )
        logs.push({
          company: project.projectName || project.email,
          projectName: project.projectName || '',
          directorName: project.directorName || '',
          email: project.email,
          status: 'failed',
          timestamp,
        })
      }

      setSentCount(i + 1)

      // Space sends 3s apart so the mailbox doesn't rate-limit/flag us as spam.
      if (i < targets.length - 1) {
        await waitWithCountdown(SEND_DELAY_MS)
      }
    }

    setDelayRemaining(0)

    // The history itself is stored by the server on every send; this refreshes the footer's daily count.
    window.dispatchEvent(new Event('emailStatusLogsUpdated'))

    setSending(false)

    if (cancelled) {
      setCancelSummary({ sent: logs.length, total: targets.length })
      setShowCancelled(true)
    } else {
      const sentOk = logs.filter((log) => log.status === 'received').length
      setSuccessSummary({ sent: sentOk, total: targets.length })
      setShowSuccess(true)
    }
  }

  const handleCancel = () => {
    cancelRef.current = true
  }

  const handleSuccessClose = () => {
    setShowSuccess(false)
    navigate('/status')
  }

  const handleCancelledClose = () => {
    setShowCancelled(false)
  }

  if (projects.length === 0) {
    return <p className="mt-10 text-center text-sm text-slate-500">No generated emails found. Go back and click "Fetch Prompt" first.</p>
  }

  return (
    <div className="px-6 py-6">
      {sending && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-white/85 backdrop-blur-sm">
          <Loader />
          <p className="text-sm font-bold text-slate-600">
            Sending email {sentCount} of {totalToSend}…
          </p>
          <div className={`w-56 ${delayRemaining > 0 ? '' : 'invisible'}`}>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[#1070BA]"
                style={{
                  width: `${((SEND_DELAY_MS - delayRemaining) / SEND_DELAY_MS) * 100}%`,
                  transition: `width ${DELAY_TICK_MS}ms linear`,
                }}
              />
            </div>
            <p className="mt-1.5 text-center text-xs text-slate-400">
              Next email in {(delayRemaining / 1000).toFixed(1)}s…
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-red-300 bg-white px-6 py-2.5 text-sm font-bold text-red-500 shadow-sm transition hover:-translate-y-px hover:bg-red-50"
          >
            Cancel
          </button>
        </div>
      )}
      {showSuccess && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-2xl">
            <CheckCircle2 className="h-12 w-12 text-green-500" strokeWidth={1.8} />
            <h2 className="text-lg font-extrabold text-slate-800">Emails sent successfully</h2>
            <p className="text-sm text-slate-500">
              {successSummary.sent} of {successSummary.total} email{successSummary.total > 1 ? 's' : ''} delivered.
            </p>
            <button
              type="button"
              onClick={handleSuccessClose}
              className="mt-2 rounded-xl bg-[#1070BA] px-8 py-2.5 text-sm font-bold text-white transition hover:-translate-y-px hover:bg-[#0c609f]"
            >
              View Status
            </button>
          </div>
        </div>
      )}
      {showCancelled && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-2xl">
            <XCircle className="h-12 w-12 text-red-500" strokeWidth={1.8} />
            <h2 className="text-lg font-extrabold text-slate-800">Sending cancelled</h2>
            <p className="text-sm text-slate-500">
              {cancelSummary.sent} of {cancelSummary.total} email{cancelSummary.total > 1 ? 's' : ''} were sent before cancelling.
            </p>
            <button
              type="button"
              onClick={handleCancelledClose}
              className="mt-2 rounded-xl bg-[#1070BA] px-8 py-2.5 text-sm font-bold text-white transition hover:-translate-y-px hover:bg-[#0c609f]"
            >
              OK
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#1070BA] text-white shadow-lg transition hover:-translate-y-px hover:bg-[#0c609f]"
      >
        <ChevronDown className="h-5 w-5" />
      </button>
      <div className="grid grid-cols-2 gap-4">
        {projects.map((project, index) => (
          <AutomationCard
            key={`${project.email}-${index}`}
            project={project}
            onToggle={(selected) => handleToggle(index, selected)}
            onRegenerate={() => handleRegenerate(index)}
          />
        ))}
      </div>
      <div className="mt-6 flex flex-col items-center justify-center gap-2">
        <button
          type="button"
          disabled={sending || pendingChoices > 0}
          onClick={handleSendAll}
          className="flex h-[52px] items-center justify-center rounded-xl bg-[#1070BA] px-10 font-bold text-white shadow-[0_10px_22px_rgba(16,112,186,0.22)] transition hover:-translate-y-px hover:bg-[#0c609f] disabled:cursor-not-allowed disabled:bg-[#e9eff3] disabled:text-[#94a5b2] disabled:shadow-none disabled:hover:translate-y-0"
        >
          {sending ? 'Sending…' : 'Send to all'}
          <Send className="ml-2 h-5 w-5" />
        </button>
        {pendingChoices > 0 && (
          <p className="text-xs font-semibold text-amber-700">
            {pendingChoices} email{pendingChoices === 1 ? '' : 's'} with no earlier email need a choice: Send as new or Skip.
          </p>
        )}
      </div>
    </div>
  )
}

export default Automation
