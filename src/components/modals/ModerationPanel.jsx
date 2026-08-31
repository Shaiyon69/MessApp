import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../supabaseClient'
import { fetchModerationQueue, MODERATION_ACTIONS, moderateContentReport, REPORT_REASONS } from '../../lib/moderation'
import { formatMessageTime } from '../../lib/messageTime'

const reasonLabels = new Map(REPORT_REASONS.map(reason => [reason.value, reason.label]))

const describeTarget = report => {
  const snapshot = report.target_snapshot || {}
  if (report.target_type === 'message') return snapshot.content || 'Message content unavailable'
  if (report.target_type === 'server') return snapshot.name ? `Server: ${snapshot.name}` : `Server ${report.target_id}`
  return `User ${snapshot.profile_id || report.reported_user_id || report.target_id}`
}

export default function ModerationPanel() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [action, setAction] = useState('dismiss')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadReports = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchModerationQueue(supabase)
      setReports(data)
      setSelectedId(current => data.some(report => report.id === current) ? current : data[0]?.id || null)
    } catch (error) {
      setLoadError(error?.message || 'The moderation queue could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadReports() }, [loadReports])

  const selectedReport = useMemo(() => reports.find(report => report.id === selectedId) || null, [reports, selectedId])
  const availableActions = MODERATION_ACTIONS.filter(option => !option.messageOnly || selectedReport?.target_type === 'message')

  useEffect(() => {
    if (!availableActions.some(option => option.value === action)) setAction('dismiss')
  }, [action, availableActions])

  const handleModerate = async event => {
    event.preventDefault()
    if (!selectedReport) return
    setSubmitting(true)
    try {
      await moderateContentReport(supabase, { reportId: selectedReport.id, action, note })
      setNote('')
      toast.success(action === 'escalate' ? 'Report escalated.' : 'Report resolved.')
      await loadReports()
    } catch (error) {
      toast.error(error?.message || 'Moderation action failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex min-h-64 items-center justify-center text-gray-400"><Loader2 className="mr-2 animate-spin" size={20} />Loading moderation queue…</div>

  if (loadError) return (
    <div className="premium-section rounded-2xl p-6 text-center">
      <AlertTriangle className="mx-auto mb-3 text-red-400" size={28} />
      <p className="mb-4 type-body text-red-300">{loadError}</p>
      <button type="button" onClick={loadReports} className="premium-secondary-button inline-flex h-10 items-center gap-2 rounded-xl px-4 font-bold cursor-pointer"><RefreshCw size={16} />Retry</button>
    </div>
  )

  return (
    <div className="animate-fade-in pb-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="type-title font-semibold tracking-tight text-[var(--text-main)] font-display">Moderation Queue</h2>
          <p className="mt-1 type-label text-gray-500">Review user reports and record a supported action.</p>
        </div>
        <button type="button" onClick={loadReports} className="premium-icon-button rounded-xl p-2.5 cursor-pointer" aria-label="Refresh moderation queue"><RefreshCw size={18} /></button>
      </div>

      {reports.length === 0 ? (
        <div className="premium-section rounded-2xl p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 text-emerald-400" size={26} />
          <h3 className="font-bold text-[var(--text-main)]">Queue is clear</h3>
          <p className="mt-1 type-label text-gray-500">There are no open or escalated reports.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="premium-section max-h-[38vh] space-y-1 overflow-y-auto rounded-2xl p-2 custom-scrollbar">
            {reports.map(report => (
              <button key={report.id} type="button" onClick={() => setSelectedId(report.id)} className={`w-full rounded-xl border p-3 text-left transition-colors cursor-pointer ${selectedId === report.id ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-transparent hover:bg-[var(--bg-element)]'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="type-meta font-bold uppercase tracking-wider text-indigo-300">{report.target_type}</span>
                  <span className={`rounded-full px-2 py-0.5 type-meta font-bold uppercase ${report.status === 'reviewing' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'}`}>{report.status}</span>
                </div>
                <p className="mt-2 line-clamp-2 type-body font-semibold text-[var(--text-main)]">{reasonLabels.get(report.reason) || report.reason}</p>
                <p className="mt-1 type-meta text-gray-500">{formatMessageTime(report.created_at)}</p>
              </button>
            ))}
          </div>

          {selectedReport && (
            <form onSubmit={handleModerate} className="premium-section rounded-2xl p-4">
              <div className="mb-4 flex items-center gap-2 type-body font-bold text-[var(--text-main)]"><ShieldAlert size={18} className="text-red-400" />Report evidence</div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-3">
                <p className="whitespace-pre-wrap break-words type-body text-gray-300">{describeTarget(selectedReport)}</p>
              </div>
              {selectedReport.details && <div className="mt-3 rounded-xl bg-[var(--bg-element)] p-3 type-body text-gray-400"><span className="font-bold text-gray-300">Reporter details: </span>{selectedReport.details}</div>}
              <div className="mt-3 flex items-center gap-1 type-meta text-gray-600"><ExternalLink size={12} />Target ID: {selectedReport.target_id}</div>

              <label className="mt-4 block">
                <span className="mb-2 block type-meta font-bold uppercase tracking-widest text-gray-400">Action</span>
                <select value={action} onChange={event => setAction(event.target.value)} className="premium-input h-11 w-full rounded-xl px-3 type-body">
                  {availableActions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="mt-4 block">
                <span className="mb-2 block type-meta font-bold uppercase tracking-widest text-gray-400">Moderator note</span>
                <textarea required value={note} onChange={event => setNote(event.target.value.slice(0, 2000))} rows={3} className="premium-input w-full resize-none rounded-xl p-3 type-body" placeholder="Record why this action is appropriate." />
              </label>
              <button type="submit" disabled={submitting || !note.trim()} className="premium-button mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl font-bold cursor-pointer disabled:opacity-50">
                {submitting && <Loader2 size={17} className="animate-spin" />}
                Apply action
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
