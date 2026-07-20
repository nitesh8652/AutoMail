import { NavLink } from 'react-router'
import { MessageSquareText } from 'lucide-react'

const Navbar = () => {
  const linkStyles = 'transition-colors hover:text-[#1070BA]'

  return (
    <header className="relative z-10 mx-auto flex h-[74px] w-[calc(100%-2rem)] max-w-[1180px] items-center justify-between sm:h-[88px] sm:w-[calc(100%-3rem)]">
      <a className="inline-flex items-center gap-2 text-base font-medium tracking-[-0.4px] sm:gap-[11px] sm:text-[19px]" href="#" aria-label="Express Rupya home">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-[11px] bg-[#1070BA] text-white shadow-[0_8px_20px_rgba(16,112,186,0.22)] sm:h-[38px] sm:w-[38px]" aria-hidden="true">
          <MessageSquareText className="w-[23px]" strokeWidth={1.8} />
        </span>
        <span>Express <strong className="text-[#1070BA]">Rupya</strong></span>
      </a>

      <nav className="hidden items-center gap-[34px] text-sm font-medium text-[#536779] md:flex" aria-label="Primary navigation">
        <NavLink className={linkStyles} to="/fetched">Fetched Data</NavLink>
        <a className={linkStyles} href="#security">Security</a>
        <a className={linkStyles} href="#support">Support</a>
      </nav>

      <a className="rounded-[10px] border border-[#c8e0f1] px-[13px] py-2.5 text-xs font-bold text-[#1070BA] transition-colors hover:border-[#1070BA] hover:bg-[#1070BA] hover:text-white sm:px-[19px] sm:py-[11px] sm:text-sm" href="#upload">Get started</a>
    </header>
  )
}

export default Navbar
