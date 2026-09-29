import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { fetchTodayEmailStats } from '../config/api'

// Fallback until the server replies; the server's DAILY_EMAIL_CAP is the source of truth.
const DEFAULT_DAILY_GOAL = 250
// How often other devices pick up sends made elsewhere.
const POLL_MS = 15000

const Footer = () => {
  const [sentToday, setSentToday] = useState(null)
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const stats = await fetchTodayEmailStats()
        if (!active) return
        setSentToday(stats.sent)
        setDailyGoal(stats.cap || DEFAULT_DAILY_GOAL)
      } catch (err) {
        console.warn(err.message)
      }
    }
    const refreshWhenVisible = () => document.visibilityState === 'visible' && refresh()

    refresh()
    const timer = setInterval(refreshWhenVisible, POLL_MS)
    window.addEventListener('emailStatusLogsUpdated', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('emailStatusLogsUpdated', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  const progress = Math.min(((sentToday ?? 0) / dailyGoal) * 100, 100)

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
          aria-valuenow={sentToday ?? 0}
          aria-valuemin={0}
          aria-valuemax={dailyGoal}
          aria-label="Emails sent today"
        >
          <div
            className="h-full rounded-full bg-[#1070BA] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-bold text-[#102a43]">
          {sentToday ?? '–'}
          <span className="font-medium text-[#8394a5]"> / {dailyGoal} sent</span>
        </span>
      </div>
    </footer>
  )
}

export default Footer
