/**
 * Desktop account card floating over the foot of the rail and list, like Discord's:
 * avatar with status, name, status note, then mic / deafen / settings. It takes
 * over the rail's Menu avatar from md up; phones keep the dock's Menu tab.
 */
import { Headphones, HeadphoneOff, Mic, MicOff, Settings } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'

const STATUS_TEXT = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' }

const iconButton = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]'

export default function UserPanel({ avatarUrl, username, status = 'online', statusText, active, onOpenMenu, muted, deafened, onToggleMute, onToggleDeafen, onOpenSettings }) {
  // Deafened implies no mic, as in Discord; the icon shape (slash) carries the state, not only the red.
  const micOff = muted || deafened
  return (
    <div className="absolute inset-x-2 bottom-2 z-40 hidden items-center gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-element)] px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] md:flex">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-current={active ? 'page' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[var(--state-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${active ? 'bg-[var(--state-hover)]' : ''}`}
        title="Account and menu"
      >
        <StatusAvatar url={avatarUrl} username={username} status={status === 'invisible' ? 'offline' : status} className="h-9 w-9 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate type-body font-semibold leading-tight text-[var(--text-main)]">{username}</span>
          <span className="block truncate type-meta leading-tight text-[var(--text-muted)]">{statusText || STATUS_TEXT[status] || 'Online'}</span>
        </span>
      </button>
      <button type="button" onClick={onToggleMute} aria-pressed={micOff} aria-label={micOff ? 'Unmute' : 'Mute'} title={micOff ? 'Unmute' : 'Mute'} className={`${iconButton} ${micOff ? 'text-[#e5676f]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
        {micOff ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
      </button>
      <button type="button" onClick={onToggleDeafen} aria-pressed={Boolean(deafened)} aria-label={deafened ? 'Undeafen' : 'Deafen'} title={deafened ? 'Undeafen' : 'Deafen'} className={`${iconButton} ${deafened ? 'text-[#e5676f]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
        {deafened ? <HeadphoneOff size={18} aria-hidden="true" /> : <Headphones size={18} aria-hidden="true" />}
      </button>
      <button type="button" onClick={onOpenSettings} aria-label="User settings" title="User settings" className={`${iconButton} text-[var(--text-muted)] hover:text-[var(--text-main)]`}>
        <Settings size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
