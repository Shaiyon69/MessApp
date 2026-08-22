/**
 * The app's only navigation surface. There is no left sidebar on any
 * breakpoint, so every destination has to be reachable from these five slots.
 * Order is fixed — Menu sits at the left edge, Chats at the right, matching
 * Messenger's thumb positions. Menu is a destination like the rest, not an
 * overlay trigger. See design.md §5.
 */
import { Bell, LayoutGrid, Menu, MessageSquare, UserPlus } from 'lucide-react'

export const TABS = [
  { id: 'menu', Icon: Menu, label: 'Menu' },
  { id: 'notifs', Icon: Bell, label: 'Notifications' },
  { id: 'add', Icon: UserPlus, label: 'Friends' },
  { id: 'servers', Icon: LayoutGrid, label: 'Servers' },
  { id: 'chats', Icon: MessageSquare, label: 'Chats' }
]

export default function BottomBar({ homeTab, setHomeTab, notificationCount = 0 }) {
  return (
    <div className="home-tab-shell shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:px-6 md:pb-3 md:pt-3">
      <nav className="ios-segmented-control mx-auto grid max-w-3xl grid-cols-5 gap-1 rounded-2xl p-1" aria-label="Primary">
        {TABS.map(({ id, Icon, label }) => {
          const isActive = homeTab === id
          /* Notifications is the only tab that signals state, and it does it by
             glowing blue rather than carrying a count — see design.md §5. */
          const alerted = id === 'notifs' && notificationCount > 0
          return (
            <button
              key={id}
              type="button"
              onClick={() => setHomeTab(id)}
              data-active={isActive}
              data-alert={alerted || undefined}
              aria-current={isActive ? 'page' : undefined}
              className="home-tab-button relative flex min-h-11 items-center justify-center rounded-xl border outline-none transition-all cursor-pointer"
              aria-label={alerted ? `${label} (unread)` : label}
              title={label}
            >
              <Icon size={19} aria-hidden="true" fill={alerted ? 'currentColor' : 'none'} />
            </button>
          )
        })}
      </nav>
    </div>
  )
}
