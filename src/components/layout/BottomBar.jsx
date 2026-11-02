/**
 * The app's only navigation surface: Orion Store's floating pill dock on
 * phones, the same five slots stacked into a left icon rail from md up. Order
 * is fixed — Menu sits at the dock's left edge but at the rail's bottom, Chats
 * at the dock's right, matching Messenger's thumb positions. Menu is a
 * destination like the rest, not an overlay trigger.
 * On the dock only the active tab shows its label; the rail is icons only.
 * The shell must stay positioned (md:relative, not static): glass.css hangs
 * its backdrop-filter on ::before, which would otherwise cover the whole app.
 * The dock slides away while the list scrolls down. When a tab has an input
 * (Friends), the dock grows into an island: the tab portals its input into
 * #dock-accessory above the tabs. See design.md §5.
 * Menu shows the user's avatar instead of an icon: it is the account entry point.
 */
import { Bell, LayoutGrid, MessageSquare, Plus, UserPlus } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import ServerIcon from '../ui/ServerIcon'

export const TABS = [
  { id: 'menu', Icon: null, label: 'Menu' },
  { id: 'notifs', Icon: Bell, label: 'Notifications' },
  { id: 'add', Icon: UserPlus, label: 'Friends' },
  { id: 'servers', Icon: LayoutGrid, label: 'Servers' },
  { id: 'chats', Icon: MessageSquare, label: 'Chats' }
]

export const DOCK_ACCESSORY_ID = 'dock-accessory'

export default function BottomBar({ homeTab, setHomeTab, notificationCount = 0, hidden = false, expanded = false, avatarUrl, username, servers = [], activeServerId, onOpenServer, onAddServer }) {
  return (
    <div
      data-hidden={hidden || undefined}
      data-expanded={expanded || undefined}
      className="home-tab-shell dock-shell pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[var(--dock-lift)] md:pointer-events-auto md:relative md:w-[4.5rem] md:shrink-0 md:border-r md:border-[var(--border-subtle)] md:px-1 md:py-3"
    >
      <div className="dock pointer-events-auto flex flex-col md:h-full">
        <div id={DOCK_ACCESSORY_ID} className="dock-accessory md:hidden" />
        <nav className="flex items-center justify-between gap-0.5 p-1 md:h-full md:flex-col md:justify-start md:gap-3 md:p-0" aria-label="Primary">
          {TABS.map(({ id, Icon, label }) => {
            const isActive = homeTab === id
            /* Notifications is the only tab that signals state, and it does it by
               turning blue rather than carrying a count — see design.md §5. */
            const alerted = id === 'notifs' && notificationCount > 0
            return (
              <button
                key={id}
                type="button"
                onClick={() => setHomeTab(id)}
                data-tab={id}
                data-active={isActive}
                data-alert={alerted || undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`m3-nav-item ${id === 'menu' ? 'md:order-last md:mt-auto' : ''}`}
                aria-label={alerted ? `${label} (unread)` : label}
              >
                <span className="m3-nav-indicator">
                  {Icon
                    ? <Icon size={20} aria-hidden="true" fill={alerted ? 'currentColor' : 'none'} />
                    : <StatusAvatar url={avatarUrl} username={username} showStatus={false} className="h-6 w-6 md:h-11 md:w-11" />}
                </span>
                <span className={`m3-nav-label type-meta leading-none md:hidden ${isActive ? 'font-bold' : 'font-medium'}`} aria-hidden="true">{label}</span>
              </button>
            )
          })}
          {/* Desktop only: every server as an icon under the tabs, Discord's
              server rail. Phones reach servers through the Servers tab. */}
          {onOpenServer && (
            <div className="server-rail custom-scrollbar hidden min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto border-t border-[var(--border-subtle)] pt-3 md:flex" aria-label="Servers">
              {servers.map(server => {
                const isActive = homeTab === 'servers' && server.id === activeServerId
                return (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => onOpenServer(server)}
                    data-active={isActive || undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className="server-rail-item"
                    aria-label={server.name}
                    title={server.name}
                  >
                    <ServerIcon url={server.icon_url} name={server.name} className="server-rail-icon" />
                  </button>
                )
              })}
              {onAddServer && (
                <button type="button" onClick={onAddServer} className="server-rail-item" aria-label="Add a server" title="Add a server">
                  <span className="server-rail-icon server-rail-add"><Plus size={20} aria-hidden="true" /></span>
                </button>
              )}
            </div>
          )}
        </nav>
      </div>
    </div>
  )
}
