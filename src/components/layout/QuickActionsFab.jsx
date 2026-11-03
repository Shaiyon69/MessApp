/**
 * One floating button for the "start something" actions: search, add friend,
 * create server, join server. On phones it
 * sits in --dock-space above the floating dock (Orion's spot for its AI star);
 * from md up the rail is beside the list, so it drops to the corner.
 */
import { useState } from 'react'
import { LogIn, Plus, Search, UserPlus } from 'lucide-react'

export default function QuickActionsFab({ onSearch, onAddFriend, onCreateServer, onJoinServer, lifted = false }) {
  const [open, setOpen] = useState(false)

  const actions = [
    { id: 'add', label: 'Add friend', Icon: UserPlus, run: onAddFriend },
    { id: 'create', label: 'Create server', Icon: Plus, run: onCreateServer },
    { id: 'join', label: 'Join server', Icon: LogIn, run: onJoinServer },
    // Last, so it sits right above the trigger where the thumb already is.
    { id: 'search', label: 'Find or start a chat', Icon: Search, run: onSearch }
  ]

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />}
      {/* Edge-to-edge row so the icons centre on the same axis as the dock;
          the trigger is pinned right on its own. It is a size container so
          each icon can work out, in cqw, how far it sits from the trigger it
          unfurls out of. */}
      {/* lifted: Friends' input island fills --dock-space, so sit above it. */}
      <div className={`quick-actions pointer-events-none absolute inset-x-0 ${lifted ? 'bottom-[calc(var(--dock-space)+var(--dock-island))]' : 'bottom-[var(--dock-space)]'} z-50 flex h-12 items-center justify-center md:bottom-4`}>
        <div className="quick-actions-row flex gap-2">
        {/* Always mounted so closing can play in reverse; inert keeps the
            folded icons out of the tab order and away from screen readers.
            --k counts out from the trigger: it sets each icon's travel and
            its stagger, so the nearest one leaves first and returns last. */}
        {actions.map(({ id, label, Icon, run }, index) => (
          <button
            key={id}
            type="button"
            onClick={() => { setOpen(false); run?.() }}
            aria-label={label}
            title={label}
            inert={!open}
            data-open={open || undefined}
            style={{ '--k': actions.length - index, '--n': actions.length }}
            className="quick-action pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-main)] hover:bg-[var(--bg-element-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <Icon size={20} aria-hidden="true" />
          </button>
        ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-label={open ? 'Close quick actions' : 'Quick actions'}
          data-open={open || undefined}
          className="quick-action-trigger pointer-events-auto absolute right-4 top-0 grid h-12 w-12 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          {/* One glyph that turns into the close mark, rather than a swap. */}
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>
    </>
  )
}
