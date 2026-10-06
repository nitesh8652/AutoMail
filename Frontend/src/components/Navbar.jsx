import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { Activity, Check, ChevronDown, House, Menu, Send, Table2, X } from 'lucide-react'
import { MODES, useMode } from '../config/mode'

const navLinks = [
  { to: '/', label: 'Home', Icon: House },
  { to: '/fetched', label: 'Fetched Data', Icon: Table2 },
  { to: '/automation', label: 'Automation', Icon: Send },
  { to: '/status', label: 'Status', Icon: Activity },
]

const ModeOptions = ({ mode, onSelect }) => (
  <ul className="flex flex-col gap-1" role="menu" aria-label="Switch workspace">
    {MODES.map((option) => {
      const { key, label, hint } = option
      const active = mode === key
      return (
        <li key={key}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => onSelect(key)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
              active ? 'bg-[#eaf5fc]' : 'hover:bg-[#f7fbfe]'
            }`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                active ? 'bg-[#1070BA] text-white' : 'bg-[#edf7fd] text-[#1070BA]'
              }`}
            >
              <option.Icon className="w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-bold ${active ? 'text-[#1070BA]' : 'text-[#102a43]'}`}>{label}</span>
              <span className="block truncate text-xs text-[#7c8e9e]">{hint}</span>
            </span>
            {active && <Check className="w-4 shrink-0 text-[#1070BA]" strokeWidth={2.2} aria-hidden="true" />}
          </button>
        </li>
      )
    })}
  </ul>
)

const Navbar = () => {
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)
  const navigate = useNavigate()
  const { mode, setMode } = useMode()
  const { Icon: ModeIcon, label: modeLabel } = MODES.find(({ key }) => key === mode)
  useEffect(() => {
    if (!profileOpen) return
    const handleClick = (event) => {
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false)
    }
    const handleKey = (event) => event.key === 'Escape' && setProfileOpen(false)
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [profileOpen])

  const selectMode = (nextMode) => {
    setMode(nextMode)
    setProfileOpen(false)
    setOpen(false)
    // Each workspace starts from its own upload screen.
    navigate('/')
  }

  const linkStyles = ({ isActive }) =>
    `relative flex items-center gap-1.5 py-1 transition-colors hover:text-[#1070BA] ${
      isActive
        ? 'text-[#1070BA] after:absolute after:-bottom-[3px] after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-[#1070BA]'
        : 'text-[#536779]'
    }`

  const mobileLinkStyles = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors ${
      isActive ? 'bg-[#eaf5fc] text-[#1070BA]' : 'text-[#3d5a73] hover:bg-[#f7fbfe] hover:text-[#1070BA]'
    }`

  return (
    <header className="sticky bottom-0 z-50 border-t border-transparent bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-[74px] w-[calc(100%-2rem)] max-w-[1180px] items-center justify-between sm:h-[88px] sm:w-[calc(100%-3rem)]">
        <NavLink
          to="/"
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-2 text-[41px] font-medium tracking-[-0.4px] sm:gap-[11px]"
          aria-label="Express Rupya home"
        >
          <img
            src="/express_logo_automation.png"
            alt="Express Rupya"
            style={{ height: '52px', width: '226px' }}
          />
          {/* <span>
            Express <strong className="text-[#1070BA]">Rupya</strong>
          </span> */}
        </NavLink>

        <div className="flex items-center gap-2 md:gap-[30px]">
          <nav className="hidden items-center gap-[26px] text-m font-medium md:flex" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkStyles} end={link.to === '/'}>
                <link.Icon className="w-[17px]" strokeWidth={1.8} aria-hidden="true" />
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 transition-colors ${
                profileOpen ? 'border-[#1070BA] bg-[#eaf5fc]' : 'border-[#e3edf4] bg-white hover:border-[#afd2e9]'
              }`}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              aria-label={`Workspace: ${modeLabel}. Switch workspace`}
            >
              <span className="relative grid h-8 w-8 place-items-center rounded-full bg-[#1070BA] text-white">
                <ModeIcon className="w-[17px]" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="hidden text-sm font-semibold text-[#102a43] sm:inline">{modeLabel}</span>
              <ChevronDown
                className={`w-4 text-[#536779] transition-transform ${profileOpen ? 'rotate-180' : ''}`}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[280px] rounded-2xl border border-[#e3edf4] bg-white p-2 shadow-[0_24px_60px_rgba(22,65,96,0.16)]">
                <p className="px-3 pb-2 pt-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#8394a5]">
                  Switch workspace
                </p>
                <ModeOptions mode={mode} onSelect={selectMode} />
              </div>
            )}
          </div>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl text-[#1070BA] transition-colors hover:bg-[#eaf5fc] md:hidden"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="w-6" strokeWidth={1.8} /> : <Menu className="w-6" strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          className="mx-auto flex w-[calc(100%-2rem)] max-w-[1180px] flex-col gap-1 border-t border-[#e3edf4] py-3 sm:w-[calc(100%-3rem)] md:hidden"
          aria-label="Primary navigation"
        >
          {navLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className={mobileLinkStyles} end={link.to === '/'} onClick={() => setOpen(false)}>
              <link.Icon className="w-5" strokeWidth={1.8} aria-hidden="true" />
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}

export default Navbar
