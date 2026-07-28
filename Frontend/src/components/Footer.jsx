import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'

// Gmail's practical daily send cap for a single account.
const DAILY_GOAL = 200

const getSentToday = () => {
  try {
    const logs = JSON.parse(localStorage.getItem('emailStatusLogs') || '[]')
    const today = new Date().toDateString()
    return logs.filter((log) => log.status === 'received' && new Date(log.timestamp).toDateString() === today).length
  } catch {
    return 0
  }
}

const Footer = () => {
  const [sentToday, setSentToday] = useState(getSentToday)

  useEffect(() => {
    const refresh = () => setSentToday(getSentToday())
    window.addEventListener('storage', refresh)
    window.addEventListener('emailStatusLogsUpdated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('emailStatusLogsUpdated', refresh)
    }
  }, [])

  const progress = Math.min((sentToday / DAILY_GOAL) * 100, 100)

  return (
    <footer className="sticky bottom-0 z-40 border-t border-[#e3edf4] bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-8 w-[calc(100%-2rem)] max-w-[1180px] items-center gap-3 sm:w-[calc(100%-3rem)]">
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#536779]">
          <Send className="h-3 w-3 text-[#1070BA]" strokeWidth={2} aria-hidden="true" />
          Today
        </span>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e3edf4]"
          role="progressbar"
          aria-valuenow={sentToday}
          aria-valuemin={0}
          aria-valuemax={DAILY_GOAL}
          aria-label="Emails sent today"
        >
          <div
            className="h-full rounded-full bg-[#1070BA] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-bold text-[#102a43]">
          {sentToday}
          <span className="font-medium text-[#8394a5]"> / {DAILY_GOAL} sent</span>
        </span>
      </div>
    </footer>
  )
}

export default Footer
