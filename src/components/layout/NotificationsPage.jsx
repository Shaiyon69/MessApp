/**
 * The notification feed. Replaces the old "pending friend requests" tab, which
 * wore a bell icon but only ever showed one kind of thing.
 *
 * Friend requests and stored feed rows, both held by Dashboard — see
 * src/lib/notifications.js for how they merge and which kinds exist.
 */
import { useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { AtSign, Bell, ChartColumn, Check, CornerDownRight, MessagesSquare, PhoneMissed, Shield, SmilePlus, Trash2, UserCheck, UserPlus, Volume2, X } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import ConfirmDialog from '../ui/ConfirmDialog'
import useStoredState from '../../hooks/useStoredState'
import { buildNotifications, filterNotifications, groupByDay, NOTIFICATION_FILTERS } from '../../lib/notifications'
import { stripEffects } from '../../lib/messageEffects'

// Same distance as swipe-to-reply on messages.
const SWIPE_DISMISS_PX = 64

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

const withOthers = (name, count) => (count > 1 ? `${name} and ${count - 1} other${count > 2 ? 's' : ''}` : name)

const MODERATION_TEXT = {
  kick: 'removed you from',
  ban: 'banned you from',
  unban: 'unbanned you from',
  timeout: 'timed you out in',
  untimeout: 'lifted your timeout in',
  role_change: 'changed your role in',
  message_delete: 'removed your message in'
}

/* One entry per kind: icon, headline, and the optional second line. DM rows
   never show content: it is ciphertext on the server. */
const KINDS = {
  mention: { icon: AtSign, text: name => `${name} mentioned you` },
  reply: { icon: CornerDownRight, text: name => `${name} replied to you` },
  thread_reply: { icon: MessagesSquare, text: (name, data) => `${withOthers(name, data.count)} replied in a thread` },
  reaction: { icon: SmilePlus, text: (name, data) => `${withOthers(name, data.count)} reacted ${data.emoji || ''}`.trim() },
  poll_vote: { icon: ChartColumn, text: (name, data) => `${withOthers(name, data.count)} voted on your poll`, detail: row => row.data?.question },
  missed_call: { icon: PhoneMissed, tone: 'text-red-400', text: (name, data) => `Missed ${data.video ? 'video' : 'voice'} call from ${name}`, detail: () => null },
  friend_accepted: { icon: UserCheck, text: name => `${name} accepted your friend request`, detail: () => null },
  server_invite: { icon: UserPlus, text: (name, data) => `${name} invited you to ${data.server_name || 'a server'}`, detail: () => 'Tap to see the invite' },
  voice_invite: { icon: Volume2, tone: 'text-green-400', text: (name, data) => `${name} invited you to voice in ${data.server_name || 'a server'}`, detail: row => (row.data?.channel_name ? `🔊 ${row.data.channel_name}` : null) },
  moderation: {
    icon: Shield,
    text: (name, data) => `${name} ${MODERATION_TEXT[data.action] || 'moderated you in'} ${data.server_name || 'a server'}`,
    detail: row => (row.data?.action === 'role_change' && row.data.metadata?.to ? `You are now ${row.data.metadata.to}` : row.data?.reason)
  }
}

function messageDetail(row) {
  if (!row.message || row.dm_room_id) return null
  if (row.message.is_deleted) return <span className="italic text-[var(--text-muted)]">Message deleted</span>
  return stripEffects(row.message.content || '')
}

function FeedRow({ item, onOpen, onDismiss }) {
  const kind = KINDS[item.type] || { icon: Bell, text: name => `${name} sent you a notification` }
  const Icon = kind.icon
  const row = item.row
  const name = item.profile?.username || 'Someone'
  const detail = kind.detail ? kind.detail(row) : messageDetail(row)
  const where = row.channel?.name && !row.dm_room_id ? ` in #${row.channel.name}` : ''

  /* Touch-only swipe left to dismiss. The X button is the keyboard and mouse
     path to the same action. */
  const gesture = useRef(null)
  const [offset, setOffset] = useState(0)
  const onPointerDown = event => {
    if (event.pointerType !== 'mouse') gesture.current = { x: event.clientX, y: event.clientY, swiping: false }
  }
  const onPointerMove = event => {
    const start = gesture.current
    if (!start) return
    const dx = event.clientX - start.x
    if (!start.swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(event.clientY - start.y)) start.swiping = true
    if (start.swiping) setOffset(Math.min(0, dx))
  }
  const onPointerEnd = () => {
    if (gesture.current?.swiping && offset <= -SWIPE_DISMISS_PX) onDismiss()
    else setOffset(0)
    // Let the click that follows a swipe see it and bail.
    setTimeout(() => { gesture.current = null }, 0)
  }

  return (
    <div className="group relative flex items-center" style={{ touchAction: 'pan-y' }}>
      <button
        type="button"
        onClick={() => { if (!gesture.current?.swiping) onOpen() }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined, opacity: offset ? Math.max(0.3, 1 + offset / 200) : undefined }}
        className="dashboard-list-row flex w-full min-w-0 items-center gap-4 rounded-2xl p-3 pr-12 text-left transition-all"
      >
        <StatusAvatar url={item.profile?.avatar_url} username={item.profile?.username} showStatus={false} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1.5 type-snippet ${item.unread ? 'font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>
            <Icon size={12} className={`shrink-0 ${kind.tone || ''}`} aria-hidden="true" />
            <span className="truncate">{kind.text(name, row.data || {})}{where}</span>
            {item.timestamp && <span className="shrink-0 font-normal text-[var(--text-muted)]" aria-hidden="true">· {relativeTime(item.timestamp)}</span>}
          </div>
          {detail && <p className="truncate type-body text-[var(--text-main)]">{detail}</p>}
        </div>
        {item.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--app-accent)]" aria-label="Unread" />}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 rounded-full p-2 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)] focus-visible:opacity-100 group-hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function RequestRow({ item, onAccept, onDecline }) {
  return (
    <div className="dashboard-list-row group flex items-center justify-between gap-3 rounded-2xl p-3 transition-all">
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
        <button onClick={onAccept} className="ghost-border rounded-full bg-[var(--bg-surface)] p-2.5 transition-colors hover:bg-green-500 hover:text-white" aria-label={`Accept request from ${item.profile?.username}`}>
          <Check size={18} aria-hidden="true" />
        </button>
        <button onClick={onDecline} className="ghost-border rounded-full bg-[var(--bg-surface)] p-2.5 transition-colors hover:bg-red-500 hover:text-white" aria-label={`Decline request from ${item.profile?.username}`}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default function NotificationsPage(props) {
  const items = buildNotifications({ friendRequests: props.friendRequests, feed: props.notificationFeed })
  const [storedFilter, setFilter] = useStoredState('notificationsFilter', 'all')
  const [confirmClear, setConfirmClear] = useState(false)

  // Chips with nothing behind them are hidden; a stored filter that went empty falls back to All.
  const chips = NOTIFICATION_FILTERS
    .map(filter => {
      const matching = filterNotifications(items, filter.id)
      return { ...filter, total: matching.length, unread: matching.filter(item => item.unread).length }
    })
    .filter(chip => chip.id === 'all' || chip.total > 0)
  const filter = chips.some(chip => chip.id === storedFilter) ? storedFilter : 'all'
  const sections = groupByDay(filterNotifications(items, filter))
  const hasUnreadFeed = items.some(item => item.unread && item.type !== 'friend_request')
  const hasReadFeed = items.some(item => !item.unread && item.type !== 'friend_request')

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
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-[var(--dock-clear)] pt-4 md:px-6 md:pb-6 md:pt-6">
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

      {items.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <div role="tablist" aria-label="Filter notifications" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {chips.map(chip => (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={filter === chip.id}
                onClick={() => setFilter(chip.id)}
                className={`shrink-0 rounded-full px-3 h-8 type-label font-bold transition-colors ${filter === chip.id ? 'bg-[var(--app-accent)] text-[var(--accent-contrast)]' : 'ghost-border bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
              >
                {chip.label}{chip.unread > 0 && <span className="ml-1.5 opacity-80">{chip.unread}</span>}
              </button>
            ))}
          </div>
          {hasUnreadFeed && (
            <button type="button" onClick={props.markAllNotificationsRead} className="shrink-0 rounded-xl px-2 h-8 type-label font-bold text-[var(--app-accent)] hover:bg-[var(--bg-surface)]">
              Mark all read
            </button>
          )}
        </div>
      )}

      {sections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 opacity-60">
          <Bell size={44} className="mb-4 text-[var(--text-muted)]" aria-hidden="true" />
          <p className="type-body font-medium text-[var(--text-muted)]">{filter === 'all' ? <>You&apos;re all caught up.</> : 'Nothing here yet.'}</p>
        </div>
      )}

      {sections.map(section => (
        <section key={section.label} className="mb-4" aria-label={section.label}>
          <h2 className="mb-2 px-1 type-label font-bold text-[var(--text-muted)]">{section.label}</h2>
          <div className="space-y-2">
            {section.items.map(item => (item.type === 'friend_request' ? (
              <RequestRow
                key={item.id}
                item={item}
                onAccept={() => props.handleAcceptRequest(item.request)}
                onDecline={() => props.handleDeclineRequest(item.request.id)}
              />
            ) : (
              <FeedRow
                key={item.id}
                item={item}
                onOpen={() => props.openNotification?.(item.row)}
                onDismiss={() => props.dismissNotifications?.([item.row.id])}
              />
            )))}
          </div>
        </section>
      ))}

      {hasReadFeed && (
        <button type="button" onClick={() => setConfirmClear(true)} className="mx-auto mt-2 flex items-center gap-2 rounded-xl px-3 h-9 type-label font-bold text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]">
          <Trash2 size={14} aria-hidden="true" />
          Clear read notifications
        </button>
      )}

      {confirmClear && (
        <ConfirmDialog
          owner="NotificationsPage:clear-confirm"
          icon={Trash2}
          title="Clear read notifications?"
          body="Read notifications are removed from every device. Unread ones and friend requests stay."
          confirmLabel="Clear"
          onConfirm={() => { props.dismissNotifications?.(null); setConfirmClear(false) }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  )
}
