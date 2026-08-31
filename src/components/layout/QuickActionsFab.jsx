/**
 * One floating button for the four "start something" actions that used to be
 * scattered across the tabs: search/jump, add friend, create server, join
 * server. It floats in the bottom-right corner of the scroll region, which ends
 * where the bottom bar begins — no hardcoded bar height, no safe-area math.
 * The corner is the same on every tab: screens that dock their own action bar
 * reserve an equal gutter on both sides rather than moving this button.
 */
import { useState } from 'react'
import { LogIn, Plus, Search, UserPlus, X } from 'lucide-react'

export default function QuickActionsFab({ onSearch, onAddFriend, onCreateServer, onJoinServer }) {
  const [open, setOpen] = useState(false)

  const actions = [
    { id: 'search', label: 'Search', Icon: Search, run: onSearch },
    { id: 'add', label: 'Add friend', Icon: UserPlus, run: onAddFriend },
    { id: 'create', label: 'Create server', Icon: Plus, run: onCreateServer },
    { id: 'join', label: 'Join server', Icon: LogIn, run: onJoinServer }
  ]

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />}
      {/* The trigger is the last child so the action list grows upward. */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {open && actions.map(({ id, label, Icon, run }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setOpen(false); run?.() }}
            className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 type-body font-bold text-[var(--text-main)] transition-colors animate-fade-in hover:bg-[var(--bg-element-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-label={open ? 'Close quick actions' : 'Quick actions'}
          className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--app-accent)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          {open ? <X size={24} aria-hidden="true" /> : <Plus size={26} aria-hidden="true" />}
        </button>
      </div>
    </>
  )
}
