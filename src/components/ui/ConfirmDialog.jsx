/**
 * The app's danger prompt: one styled sheet behind every irreversible action,
 * so a delete or a sign-out never drops to the browser's own confirm() dialog
 * (which the native shells render as system chrome, outside the theme).
 *
 * Presentational only — the caller owns the pending action and closes this by
 * clearing that state.
 */
import { AlertTriangle } from 'lucide-react'

export default function ConfirmDialog({ owner, icon: Icon = AlertTriangle, title, body, confirmLabel = 'Confirm', onConfirm, onCancel, busy = false }) {
  /* Docked just above the bottom bar rather than centred: both callers are
     bottom-bar destinations, and the buttons have to land under a thumb. The
     offset clears the bar (3.75rem of shell + nav) plus its safe-area inset.
     Desktop has the reach anyway, so it re-centres at md. */
  return (
    <div data-ui-overlay-owner={owner} role="dialog" aria-modal="true" aria-label={title} className="premium-backdrop fixed inset-0 z-[200] flex items-end justify-center p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:items-center md:pb-4">
      <div className="premium-modal w-full max-w-xs rounded-2xl p-5 text-center animate-settings-sheet">
        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
          <Icon size={22} className="text-red-400" aria-hidden="true" />
        </div>
        <h3 className="relative z-10 type-title font-semibold text-[var(--text-main)] mb-1.5">{title}</h3>
        <p className="relative z-10 text-gray-400 type-label mb-5">{body}</p>
        <div className="relative z-10 flex flex-col gap-3">
          <button type="button" onClick={onConfirm} disabled={busy} className="premium-danger-button w-full h-12 rounded-xl font-bold cursor-pointer type-body disabled:opacity-50">{confirmLabel}</button>
          <button type="button" onClick={onCancel} disabled={busy} className="premium-secondary-button w-full h-12 rounded-xl font-bold cursor-pointer type-body disabled:opacity-50">Cancel</button>
        </div>
      </div>
    </div>
  )
}
