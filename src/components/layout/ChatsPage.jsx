/**
 * Direct message rooms. Lifted out of the old LeftSidebar, which was the only
 * place unread state and message previews were ever rendered. Dashboard still
 * owns selection; this only presents the list.
 */
import { MessageSquare, MoreVertical, Trash2 } from 'lucide-react'
import StatusAvatar from '../ui/StatusAvatar'
import { getConversationTheme, resolveConversationThemeId } from '../../lib/conversationThemes'

export default function ChatsPage(props) {
  const openDm = (dm) => {
    props.setView('home')
    props.selectDm(dm)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-24 pt-4 md:px-6 md:pt-6">
      <div className="space-y-1">
        {props.dmsLoading && props.dms.length === 0 && Array.from({ length: 6 }, (_, index) => (
          <div key={`dm-skeleton-${index}`} className="flex min-h-[4.5rem] items-center gap-4 px-3.5 py-3.5" aria-hidden="true">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[var(--bg-element)]" />
            <div className="h-3.5 animate-pulse rounded-full bg-[var(--bg-element)]" style={{ width: `${58 + (index % 3) * 12}%` }} />
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

        {props.dms.map((dm, i) => {
          const isActive = props.activeDm?.dm_room_id === dm.dm_room_id && props.view === 'home'
          const dmThemeId = resolveConversationThemeId(dm.dm_rooms?.theme_id, dm.dm_rooms?.theme_color)
          const dmColor = getConversationTheme(dmThemeId, props.appThemeMode).palette.accent
          const presenceStatus = props.getPresenceStatus?.(dm.profiles.id) || (props.onlineUsersSet.has(dm.profiles.id) ? 'online' : 'offline')
          const isMenuOpen = props.dmActionMenuId === `chats-${dm.dm_room_id}`
          const isUnread = dm.is_unread && !isActive
          const messagePreview = dm.last_message_preview || (isUnread ? 'New message' : '')

          return (
            <div key={`dm-row-${dm.dm_room_id || i}`} className="group relative flex items-center">
              <button
                onClick={() => openDm(dm)}
                className={`ios-sidebar-row min-h-[4.5rem] flex-1 flex items-center gap-4 rounded-2xl border px-3.5 py-3.5 text-left outline-none transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--theme-base)] ${isActive ? 'is-active' : isUnread ? 'border-transparent text-[var(--text-main)]' : 'border-transparent text-gray-400 hover:text-[var(--text-main)]'}`}
              >
                <StatusAvatar url={dm.profiles.avatar_url} username={dm.profiles.username} status={presenceStatus} className="w-11 h-11" />
                <div className="min-w-0 flex-1 pr-6">
                  <p className={`truncate type-title transition-colors ${isUnread ? 'font-extrabold' : 'font-semibold'}`} style={{ color: isActive ? dmColor : '' }}>{dm.profiles.username}</p>
                  {messagePreview && <p className={`mt-0.5 truncate type-snippet ${isUnread ? 'font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>{messagePreview}</p>}
                </div>
                {/* Unread is a dot AND a weight change — colour is never the only
                    signal (design.md §6). */}
                {isUnread && <span className="absolute right-9 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--theme-base)]" aria-label="Unread" />}
              </button>

              <button
                data-dm-action-menu="chats-trigger"
                onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(isMenuOpen ? null : `chats-${dm.dm_room_id}`) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 transition-colors hover:bg-[var(--bg-element)] hover:text-[var(--text-main)]"
                aria-label={`${dm.profiles.username} options`}
              >
                <MoreVertical size={16} aria-hidden="true" />
              </button>

              {isMenuOpen && (
                <div data-dm-action-menu="chats-panel" className="premium-menu absolute right-8 top-10 z-[70] w-48 origin-top-right rounded-xl py-1 animate-fade-in">
                  <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); openDm(dm) }} className="w-full px-4 py-2 text-left type-body text-[var(--text-main)] transition-colors hover:bg-[var(--bg-element)]">Open Chat</button>
                  <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: props.restrictedUsersSet.has(dm.profiles.id) ? 'unrestrict' : 'restrict', profile: dm.profiles }) }} className="w-full px-4 py-2 text-left type-body text-[var(--text-main)] transition-colors hover:bg-[var(--bg-element)]">{props.restrictedUsersSet.has(dm.profiles.id) ? 'Unrestrict' : 'Mute (Restrict)'}</button>
                  <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: props.blockedUsersSet.has(dm.profiles.id) ? 'unblock' : 'block', profile: dm.profiles }) }} className="w-full px-4 py-2 text-left type-body text-red-400 transition-colors hover:bg-red-500/10">{props.blockedUsersSet.has(dm.profiles.id) ? 'Unblock' : 'Block User'}</button>
                  <div className="mx-2 my-1 h-[1px] bg-[var(--border-subtle)]" />
                  <button onClick={(e) => { e.stopPropagation(); props.setDmActionMenuId(null); props.setConfirmAction({ type: 'delete_dm', profile: dm.profiles, dm_room_id: dm.dm_room_id }) }} className="group flex w-full items-center justify-between px-4 py-2 text-left type-body text-red-400 transition-colors hover:bg-red-500/10"><span>Delete Chat</span><Trash2 size={14} className="opacity-50 group-hover:opacity-100" /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
