/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'
import { BrainCircuit, Building, Building2, Landmark, Server, Warehouse } from 'lucide-react'
import { safeSetItem } from './storage'

// `sheets` lists the Excel columns each upload needs (shown on the upload card);
// `mailbox` is the server mailbox the emails go out from (see mailboxFor in Backend/server.js).
export const MODES = [
  {
    key: 'realEstate',
    label: 'Real Estate',
    hint: 'Developer outreach from company websites',
    Icon: Building,
    mailbox: 'main',
    sheets: [{ required: ['Company Name', 'Email', 'Website'], optional: ['Contact Name'] }],
  },
  {
    key: 'nbfc',
    label: 'NBFC',
    hint: 'Lender proposals & follow-ups',
    Icon: Landmark,
    mailbox: 'main',
    sheets: [{ required: ['Company Name', 'Email'], optional: ['Contact Name'] }],
  },
  {
    key: 'housing',
    label: 'Housing Finance',
    hint: 'HFC capital raising outreach',
    Icon: Building2,
    mailbox: 'main',
    sheets: [{ required: ['Company Name', 'Email'] }],
  },
  {
    key: 'dcAdvisors',
    label: 'DC Advisors',
    hint: 'Data centre developer & investor outreach',
    Icon: Server,
    mailbox: 'dc',
    sheets: [{ required: ['contact_name', 'contact_email'], optional: ['company_name'] }],
  },
  {
    key: 'warehouse',
    label: 'Warehouse',
    hint: 'Hyderabad warehousing & logistics park outreach',
    Icon: Warehouse,
    mailbox: 'warehouse',
    sheets: [{ required: ['Company Name', 'Director Name', 'Email id'] }],
  },
  {
    key: 'intelligence',
    label: 'Intelligence',
    hint: 'Director contacts & enquiry values',
    Icon: BrainCircuit,
    mailbox: 'main',
    sheets: [
      { label: 'Email file', required: ['Company Name', 'Director Name', 'Director Email'] },
      { label: 'Value file', required: ['Name', 'Enquiry Amount', 'Facility Name'] },
    ],
  },
]

// Which server mailbox an email type sends from (follow-ups use the main one).
export const mailboxForMode = (mode) => MODES.find(({ key }) => key === mode)?.mailbox ?? 'main'

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
