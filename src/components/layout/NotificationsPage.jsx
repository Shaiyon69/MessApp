/**
 * The notification feed. Replaces the old "pending friend requests" tab, which
 * wore a bell icon but only ever showed one kind of thing.
 *
 * Everything here is derived from state Dashboard already holds — see
 * src/lib/notifications.js for what that does and does not buy us.
 */
import { Capacitor } from '@capacitor/core'
import { Bell, Check, UserPlus, X } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { buildNotifications } from '../../lib/notifications'

function relativeTime(timestamp) {
  if (!timestamp) return ''
  const seconds = Math.round((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export default function NotificationsPage(props) {
  const items = buildNotifications({ friendRequests: props.friendRequests })

  /* Native only: the web build already plays a sound in the open tab, so the
     browser permission prompt buys nothing there.

     ponytail: per-install opt-in state is read from the same localStorage flag
     Settings writes, not from the push_devices table — a device that opted in
     elsewhere still sees this prompt until it opts in here, which is the right
     answer for a per-installation permission anyway. Hidden once the OS-level
     permission is denied, since the toggle cannot recover from that either. */
  const canPromptForPush = Capacitor.isNativePlatform()
    && typeof Notification !== "undefined"
    && Notification.permission !== "denied"
    && localStorage.getItem("notificationsEnabled") !== "true"

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-24 pt-4 md:px-6 md:pt-6">
      {canPromptForPush && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
          <Bell size={18} className="shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
          <p className="min-w-0 flex-1 type-label text-[var(--text-muted)]">Get notified when someone messages you.</p>
          <button
            type="button"
            onClick={() => props.setSettingsModalConfig({ isOpen: true, tab: "notifications" })}
            className="shrink-0 rounded-xl bg-[var(--app-accent)] px-3 h-9 type-label font-bold text-[var(--accent-contrast)]"
          >
            Allow
          </button>
        </div>
      )}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 opacity-60">
          <Bell size={44} className="mb-4 text-[var(--text-muted)]" aria-hidden="true" />
          <p className="type-body font-medium text-[var(--text-muted)]">You&apos;re all caught up.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="dashboard-list-row group flex items-center justify-between gap-3 rounded-2xl p-3 transition-all">
            <div className="flex min-w-0 items-center gap-4">
              <StatusAvatar url={item.profile?.avatar_url} username={item.profile?.username} showStatus={false} className="h-10 w-10" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 type-title font-bold text-[var(--text-main)]">
                  <span className="truncate">{item.profile?.username}</span>
                  <span className="hidden type-label font-normal text-gray-500 group-hover:inline">{item.profile?.unique_tag}</span>
                </div>
                <div className="flex items-center gap-1.5 type-snippet text-[var(--text-muted)]">
                  <UserPlus size={12} aria-hidden="true" />
                  <span>Sent you a friend request</span>
                  {item.timestamp && <span aria-hidden="true">· {relativeTime(item.timestamp)}</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => props.handleAcceptRequest(item.request)} className="ghost-border rounded-full bg-[var(--bg-surface)] p-2.5 transition-colors hover:bg-green-500 hover:text-white" aria-label={`Accept request from ${item.profile?.username}`}>
                <Check size={18} aria-hidden="true" />
              </button>
              <button onClick={() => props.handleDeclineRequest(item.request.id)} className="ghost-border rounded-full bg-[var(--bg-surface)] p-2.5 transition-colors hover:bg-red-500 hover:text-white" aria-label={`Decline request from ${item.profile?.username}`}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
