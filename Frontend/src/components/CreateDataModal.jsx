import { useState } from 'react'
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import { checkManualIntelligenceRows, saveManualIntelligenceRows } from '../config/api'
import { MiLoaderOverlay } from './MiLoader'

const FIELDS = [
  { key: 'companyName', label: 'Company Name', required: true },
  { key: 'directorName', label: 'Director Name', required: true },
  { key: 'email', label: 'Director Email', type: 'email', required: true },
  { key: 'facilityName', label: 'Facility Name' },
  { key: 'enquiryAmount', label: 'Enquiry Amount' },
  { key: 'lastSentAt', label: 'Last Email Sent on', type: 'date' },
]

const FIELD_LABELS = { companyName: 'Company name', directorName: 'Director name', email: 'Director email' }

const emptyRow = () => Object.fromEntries(FIELDS.map((field) => [field.key, '']))

const cellInputClass =
  'h-9 w-full min-w-[140px] rounded-md border border-[#d3e4f0] bg-white px-2 text-[13px] text-[#102a43] outline-none transition focus:border-[#1070BA] focus:ring-2 focus:ring-[#1070BA]/15'

const CreateDataModal = ({ onClose, onSaved }) => {
  const [rows, setRows] = useState(() => [emptyRow()])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // Set after "Done" finds names already in the database; the user can go back or save anyway.
  const [matches, setMatches] = useState(null)
  const [busyMessage, setBusyMessage] = useState('')

  const updateCell = (index, key, value) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
    setMatches(null)
  }

  const removeRow = (index) => {
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== index)))
    setMatches(null)
  }

  const filledRows = rows.filter((row) => FIELDS.some((field) => row[field.key].trim()))

  const save = async () => {
    setBusy(true)
    setBusyMessage('Saving new data…')
    setError(null)
    try {
      await saveManualIntelligenceRows(filledRows)
      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save the new data.')
    } finally {
      setBusy(false)
    }
  }

  const handleDone = async () => {
    if (filledRows.length === 0) {
      setError('Type at least one row.')
      return
    }
    const missing = filledRows.findIndex((row) => FIELDS.some((field) => field.required && !row[field.key].trim()))
    if (missing !== -1) {
      setError(`Row ${rows.indexOf(filledRows[missing]) + 1}: Company Name, Director Name and Director Email are required.`)
      return
    }

    setBusy(true)
    setBusyMessage('Checking for existing names…')
    setError(null)
    try {
      const { matches: found } = await checkManualIntelligenceRows(filledRows)
      const flagged = filledRows
        .map((row, i) => ({ srNo: rows.indexOf(row) + 1, items: found[i] || [] }))
        .filter((entry) => entry.items.length > 0)
      if (flagged.length > 0) {
        setMatches(flagged)
        setBusy(false)
        return
      }
      await save()
    } catch (err) {
      setError(err.message || 'Failed to check for existing names.')
      setBusy(false)
    }
  }

  const flaggedCells = new Set(
    (matches || []).flatMap((entry) => entry.items.map((item) => `${entry.srNo - 1}:${item.field}`))
  )

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-data-title">
      {busy && <MiLoaderOverlay message={busyMessage} />}
      <div className="flex max-h-[90vh] w-full max-w-[1200px] flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e3edf4] px-6 py-4">
          <h2 id="create-data-title" className="font-heading text-[20px] font-extrabold text-[#102a43]">Create data</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-[#7c8e9e] transition hover:bg-[#f4f8fb] disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-4">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-[#eaf5fc]">
                <th className="whitespace-nowrap px-3 py-2.5 font-extrabold text-[#1070BA]">Sr No</th>
                {FIELDS.map((field) => (
                  <th key={field.key} className="whitespace-nowrap px-3 py-2.5 font-extrabold text-[#1070BA]">
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </th>
                ))}
                <th className="w-[44px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-[#e3edf4]">
                  <td className="px-3 py-2 text-center font-bold text-[#476072]">{index + 1}</td>
                  {FIELDS.map((field) => (
                    <td key={field.key} className="px-1.5 py-2">
                      <input
                        type={field.type || 'text'}
                        value={row[field.key]}
                        onChange={(event) => updateCell(index, field.key, event.target.value)}
                        aria-label={`${field.label}, row ${index + 1}`}
                        className={`${cellInputClass} ${flaggedCells.has(`${index}:${field.key}`) ? 'border-amber-400 bg-amber-50' : ''}`}
                      />
                    </td>
                  ))}
                  <td className="px-1.5 py-2">
                    <button type="button" onClick={() => removeRow(index)} aria-label={`Remove row ${index + 1}`} className="rounded-md p-1.5 text-[#94a5b2] transition hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#d3e4f0] bg-white px-3 py-2 text-[13px] font-bold text-[#1070BA] transition hover:bg-[#eff8fe]"
          >
            <Plus className="h-4 w-4" /> Add row
          </button>

          {matches && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4" role="alert">
              <div className="flex items-center gap-2 font-extrabold text-amber-700">
                <AlertTriangle className="h-5 w-5" /> Caution: these names already exist in the database
              </div>
              <ul className="mt-2 space-y-1 text-[13px] text-amber-800">
                {matches.flatMap((entry) =>
                  entry.items.map((item) => (
                    <li key={`${entry.srNo}-${item.field}`}>
                      Row {entry.srNo} · {FIELD_LABELS[item.field]} <strong>"{item.value}"</strong> already exists as {item.existing}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
          {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#e3edf4] px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-[#d3e4f0] bg-white px-5 py-2.5 text-sm font-bold text-[#476072] transition hover:bg-[#f4f8fb] disabled:opacity-60">
            Cancel
          </button>
          {matches ? (
            <button type="button" onClick={save} disabled={busy} className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-60">
              {busy ? 'Saving…' : 'Save anyway'}
            </button>
          ) : (
            <button type="button" onClick={handleDone} disabled={busy} className="rounded-xl bg-[#1070BA] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#0c609f] disabled:opacity-60">
              {busy ? 'Checking…' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateDataModal
