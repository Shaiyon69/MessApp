/**
 * Direct message rooms. Lifted out of the old LeftSidebar, which was the only
 * place unread state and message previews were ever rendered. Dashboard still
 * owns selection; this only presents the list.
 */
import { useEffect } from 'react'
import { Ban, EyeOff, MailOpen, MessageSquare, Pin, PinOff, Trash2 } from 'lucide-react'
import useLongPress from '../../hooks/useLongPress'
import useStoredSet from '../../hooks/useStoredSet'
import ActionSheet from '../ui/ActionSheet'
import StatusAvatar from '../ui/StatusAvatar'
import { getConversationTheme, resolveConversationThemeId } from '../../lib/conversationThemes'

export default function ChatsPage(props) {
  // Holding a row — or right-clicking it — opens its options; there is no ⋮ button.
  const bindLongPress = useLongPress(props.setDmActionMenuId)
  /* Pins and "mark as unread" are per-device and never touch dm_reads: backdating
     the read pointer would also un-see the message on the peer's receipts. */
  const userId = props.session?.user?.id
  const [pinnedRooms, togglePinned] = useStoredSet(`messapp:pinnedDms:${userId}`)
  const [manualUnread, toggleManualUnread] = useStoredSet(`messapp:unreadDms:${userId}`)
  // Opening a chat by any route (row, notification, quick switcher) reads it.
  const activeRoomId = props.view === 'home' ? props.activeDm?.dm_room_id : null
  useEffect(() => { if (activeRoomId) toggleManualUnread(activeRoomId, false) }, [activeRoomId, toggleManualUnread])
  const openDm = (dm) => {
    props.setView('home')
    props.selectDm(dm)
  }
  // Stable sort: pinned float to the top, recency order kept within each group.
  const dms = [...props.dms].sort((a, b) => pinnedRooms.has(b.dm_room_id) - pinnedRooms.has(a.dm_room_id))
  const menuDm = dms.find(dm => props.dmActionMenuId === `chats-${dm.dm_room_id}`)
  const closeMenu = () => props.setDmActionMenuId(null)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-24 pt-4 md:px-6 md:pt-6">
      <div className="space-y-1">
        {props.dmsLoading && props.dms.length === 0 && Array.from({ length: 6 }, (_, index) => (
          <div key={`dm-skeleton-${index}`} className="flex min-h-16 items-center gap-3.5 px-3 py-2.5" aria-hidden="true">
            <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 rounded-full" style={{ width: `${38 + (index % 3) * 12}%` }} />
              <div className="skeleton h-2.5 rounded-full opacity-60" style={{ width: `${56 + (index % 2) * 14}%` }} />
            </div>
          </div>
        ))}

        {!props.dmsLoading && props.dms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 opacity-60">
            <MessageSquare size={44} className="mb-4 text-[var(--text-muted)]" aria-hidden="true" />
            <p className="type-body font-medium text-[var(--text-muted)]">No conversations yet.</p>
            <button type="button" onClick={() => props.setHomeTab('add')} className="mt-2 type-body font-bold text-[var(--app-accent)] hover:underline">
              Add a friend to get started
            </button>
          </div>
        )}

        {dms.map((dm, i) => {
          const isActive = props.activeDm?.dm_room_id === dm.dm_room_id && props.view === 'home'
          const dmThemeId = resolveConversationThemeId(dm.dm_rooms?.theme_id, dm.dm_rooms?.theme_color)
          const dmColor = getConversationTheme(dmThemeId, props.appThemeMode).palette.accent
          const presenceStatus = props.getPresenceStatus?.(dm.profiles.id) || (props.onlineUsersSet.has(dm.profiles.id) ? 'online' : 'offline')
          const isUnread = (dm.is_unread || manualUnread.has(dm.dm_room_id)) && !isActive
          const messagePreview = dm.last_message_preview || (isUnread ? 'New message' : '')

          return (
            <div key={`dm-row-${dm.dm_room_id || i}`} className="long-press-target group relative flex items-center" {...bindLongPress(`chats-${dm.dm_room_id}`)}>
              <button
                onClick={() => openDm(dm)}
                className={`ios-sidebar-row min-h-16 flex-1 flex items-center gap-3.5 rounded-2xl border px-3 py-2.5 text-left outline-none transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'is-active' : isUnread ? 'border-transparent text-[var(--text-main)]' : 'border-transparent text-gray-400 hover:text-[var(--text-main)]'}`}
              >
                <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} status={presenceStatus} className="w-11 h-11" />
                <div className="min-w-0 flex-1 pr-4">
                  <p className={`truncate type-title transition-colors ${isUnread ? 'font-extrabold' : 'font-semibold'}`} style={{ color: isActive ? dmColor : '' }}>{dm.profiles.username}</p>
                  {messagePreview && <p className={`mt-0.5 truncate type-snippet ${isUnread ? 'font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>{messagePreview}</p>}
                </div>
                {/* Unread is a dot AND a weight change — colour is never the only
                    signal (design.md §6). */}
                {!isUnread && pinnedRooms.has(dm.dm_room_id) && <Pin size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-label="Pinned" />}
                {isUnread && <span className="absolute right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--theme-base)]" aria-label="Unread" />}
              </button>
            </div>
          )
        })}
      </div>

      {menuDm && (
        <ActionSheet
          data-dm-action-menu="chats-panel"
          aria-label={`${menuDm.profiles.username} options`}
          onClose={closeMenu}
          header={<>
            <StatusAvatar url={menuDm.profiles.avatar_url} username={menuDm.profiles.username} className="w-10 h-10" />
            <p className="truncate type-title font-semibold text-[var(--text-main)]">{menuDm.profiles.username}</p>
          </>}
          items={[
            pinnedRooms.has(menuDm.dm_room_id)
              ? { label: 'Unpin', Icon: PinOff, onSelect: () => togglePinned(menuDm.dm_room_id, false) }
              : { label: 'Pin', Icon: Pin, onSelect: () => togglePinned(menuDm.dm_room_id, true) },
            !(menuDm.is_unread || manualUnread.has(menuDm.dm_room_id)) && { label: 'Mark as unread', Icon: MailOpen, onSelect: () => toggleManualUnread(menuDm.dm_room_id, true) },
            { label: props.restrictedUsersSet.has(menuDm.profiles.id) ? 'Unrestrict' : 'Restrict', Icon: EyeOff, onSelect: () => props.setConfirmAction({ type: props.restrictedUsersSet.has(menuDm.profiles.id) ? 'unrestrict' : 'restrict', profile: menuDm.profiles }) },
            { label: props.blockedUsersSet.has(menuDm.profiles.id) ? 'Unblock' : 'Block', Icon: Ban, danger: true, onSelect: () => props.setConfirmAction({ type: props.blockedUsersSet.has(menuDm.profiles.id) ? 'unblock' : 'block', profile: menuDm.profiles }) },
            { label: 'Delete chat', Icon: Trash2, danger: true, onSelect: () => props.setConfirmAction({ type: 'delete_dm', profile: menuDm.profiles, dm_room_id: menuDm.dm_room_id }) }
          ]}
        />
      )}
    </div>
  )
}
