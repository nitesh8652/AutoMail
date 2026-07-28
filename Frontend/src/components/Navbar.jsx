import { useState } from 'react'
import { NavLink } from 'react-router'
import { Menu, X } from 'lucide-react'

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/fetched', label: 'Fetched Data' },
  { to: '/automation', label: 'Automation' },
  { to: '/status', label: 'Status' },
]

const Navbar = () => {
  const [open, setOpen] = useState(false)

  const linkStyles = ({ isActive }) =>
    `relative py-1 transition-colors hover:text-[#1070BA] ${
      isActive
        ? 'text-[#1070BA] after:absolute after:-bottom-[3px] after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-[#1070BA]'
        : 'text-[#536779]'
    }`

  const mobileLinkStyles = ({ isActive }) =>
    `rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors ${
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

        <nav className="hidden items-center gap-[34px] text-m font-medium md:flex" aria-label="Primary navigation">
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} to={to} className={linkStyles} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>

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

      {open && (
        <nav
          className="mx-auto flex w-[calc(100%-2rem)] max-w-[1180px] flex-col gap-1 border-t border-[#e3edf4] py-3 sm:w-[calc(100%-3rem)] md:hidden"
          aria-label="Primary navigation"
        >
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} to={to} className={mobileLinkStyles} end={to === '/'} onClick={() => setOpen(false)}>
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}

export default Navbar
