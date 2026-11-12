/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'
import { BrainCircuit, Building, Building2, Landmark, Server } from 'lucide-react'
import { safeSetItem } from './storage'

export const MODES = [
  { key: 'realEstate', label: 'Real Estate', hint: 'Developer outreach from company websites', Icon: Building },
  { key: 'nbfc', label: 'NBFC', hint: 'Lender proposals & follow-ups', Icon: Landmark },
  { key: 'housing', label: 'Housing Finance', hint: 'HFC capital raising outreach', Icon: Building2 },
  { key: 'dcAdvisors', label: 'DC Advisors', hint: 'Data centre developer & investor outreach', Icon: Server },
  { key: 'intelligence', label: 'Intelligence', hint: 'Director contacts & enquiry values', Icon: BrainCircuit },
]

const MODE_STORAGE_KEY = 'emailMode'

const loadSavedMode = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(MODE_STORAGE_KEY))
    return MODES.some(({ key }) => key === saved) ? saved : 'realEstate'
  } catch {
    return 'realEstate'
  }
}

const ModeContext = createContext(null)

export const ModeProvider = ({ children }) => {
  const [mode, setModeState] = useState(loadSavedMode)

  const setMode = (nextMode) => {
    setModeState(nextMode)
    safeSetItem(MODE_STORAGE_KEY, nextMode)
  }

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>
}

export const useMode = () => useContext(ModeContext)
