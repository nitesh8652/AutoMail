/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'
import { BrainCircuit, Building2, Landmark, Megaphone } from 'lucide-react'
import { safeSetItem } from './storage'

export const MODES = [
  { key: 'marketing', label: 'Marketing', hint: 'Project outreach emails', Icon: Megaphone },
  { key: 'nbfc', label: 'NBFC', hint: 'Lender proposals & follow-ups', Icon: Landmark },
  { key: 'housing', label: 'Housing Finance', hint: 'HFC capital raising outreach', Icon: Building2 },
  { key: 'intelligence', label: 'Intelligence', hint: 'Director contacts & enquiry values', Icon: BrainCircuit },
]

const MODE_STORAGE_KEY = 'emailMode'

const loadSavedMode = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(MODE_STORAGE_KEY))
    return MODES.some(({ key }) => key === saved) ? saved : 'marketing'
  } catch {
    return 'marketing'
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
