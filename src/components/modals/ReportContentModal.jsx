import { useEffect, useState } from 'react'
import { AlertTriangle, Flag, Loader2, X } from 'lucide-react'
import { REPORT_REASONS } from '../../lib/moderation'

export default function ReportContentModal({ targetLabel = 'message', onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, submitting])

  const handleSubmit = async event => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({ reason, details })
    } catch (submitError) {
      setError(submitError?.message || 'The report could not be submitted.')
      setSubmitting(false)
    }
  }

  return (
    <div className="premium-backdrop fixed inset-0 z-[250] flex items-center justify-center p-4" onMouseDown={event => {
      if (event.target === event.currentTarget && !submitting) onClose()
    }}>
      <form onSubmit={handleSubmit} className="premium-modal w-full max-w-lg overflow-hidden rounded-3xl" aria-labelledby="report-content-title">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-400"><Flag size={20} /></div>
            <div>
              <h2 id="report-content-title" className="text-lg font-bold text-[var(--text-main)]">Report {targetLabel}</h2>
              <p className="text-xs text-gray-500">A moderator will review a protected snapshot.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="premium-icon-button rounded-full p-2 cursor-pointer disabled:opacity-50" aria-label="Close report dialog"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-5">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">Reason</span>
            <select required value={reason} onChange={event => setReason(event.target.value)} className="premium-input h-12 w-full rounded-xl px-3 text-sm outline-none">
              <option value="">Choose a reason</option>
              {REPORT_REASONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-400">Details <span className="normal-case tracking-normal text-gray-600">(optional)</span></span>
            <textarea value={details} onChange={event => setDetails(event.target.value.slice(0, 1000))} rows={5} placeholder="Tell moderators what happened. Avoid adding unrelated private information." className="premium-input w-full resize-none rounded-xl p-3 text-sm outline-none" />
            <span className="mt-1 block text-right text-[10px] text-gray-600">{details.length}/1000</span>
          </label>

          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div>}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[var(--border-subtle)] p-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={submitting} className="premium-secondary-button h-11 rounded-xl px-5 font-bold cursor-pointer disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={submitting || !reason} className="premium-danger-button flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-bold cursor-pointer disabled:opacity-50">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Flag size={18} />}
            Submit report
          </button>
        </div>
      </form>
    </div>
  )
}
