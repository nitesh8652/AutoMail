import { useEffect, useState } from 'react'
import { FileSpreadsheet, Mail } from 'lucide-react'
import { fetchSenders } from '../config/api'

// Sending addresses come from the server's .env, fetched once and shared by every card.
let sendersRequest = null
const loadSenders = () => {
  sendersRequest ??= fetchSenders().catch((error) => {
    sendersRequest = null
    throw error
  })
  return sendersRequest
}

const useSender = (mailbox) => {
  const [sender, setSender] = useState(null)
  useEffect(() => {
    let active = true
    loadSenders()
      // false = the server has no address for this mailbox.
      .then((senders) => active && setSender(senders[mailbox]?.address ? senders[mailbox] : false))
      .catch((error) => console.warn(error.message))
    return () => {
      active = false
    }
  }, [mailbox])
  return sender
}

const Columns = ({ names }) =>
  names.map((name, index) => (
    <span key={name}>
      {index > 0 && ', '}
      <strong className="text-[#102a43]">{name}</strong>
    </span>
  ))

// What the Excel must contain, and which address the emails are sent from.
// `sheets`: [{ label?, required: [...], optional?: [...] }]
const SheetGuide = ({ sheets = [], mailbox }) => {
  const sender = useSender(mailbox)

  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-[#e3edf4] bg-[#f7fbfe] px-3.5 py-3 text-left text-[11px] leading-[1.5] text-[#536779]">
      {sheets.map(({ label, required, optional = [] }) => (
        <div key={label ?? 'sheet'} className="flex items-start gap-2">
          <FileSpreadsheet className="mt-px w-3.5 shrink-0 text-[#1070BA]" strokeWidth={2} aria-hidden="true" />
          <span>
            {label ? `${label} needs ` : 'Excel needs '}
            <Columns names={required} />
            {optional.length > 0 && (
              <>
                {' '}
                (optional: <Columns names={optional} />)
              </>
            )}
            . Columns can be in any order.
          </span>
        </div>
      ))}
      <div className="flex items-start gap-2">
        <Mail className="mt-px w-3.5 shrink-0 text-[#1070BA]" strokeWidth={2} aria-hidden="true" />
        <span>
          Sent from{' '}
          {sender ? (
            <strong className="text-[#102a43]">
              {sender.name} &lt;{sender.address}&gt;
            </strong>
          ) : (
            <em className="not-italic text-[#8394a5]">{sender === null ? 'loading…' : 'not configured'}</em>
          )}
        </span>
      </div>
    </div>
  )
}

export default SheetGuide
