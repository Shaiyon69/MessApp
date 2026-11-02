/**
 * Server settings, Discord-style: a section list on the left (a tab row on
 * phones) and the section on the right. Overview, Invites, Channels, Members.
 * Members see Overview and their own invites; managers see everything.
 */
import { useCallback, useEffect, useState } from 'react'
import { Hash, Link2, Lock, Pencil, UserPlus, Users, Volume2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../supabaseClient'
import ServerIcon from '../ui/ServerIcon'
import StatusAvatar from '../ui/StatusAvatar'
import { debug } from '../../lib/debug'
import { describeExpiry, inviteState, inviteUrl } from '../../lib/invites'

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', member: 'Member' }

function SectionTitle({ children }) {
  return <h3 className="mb-4 type-title font-bold text-[var(--text-main)]">{children}</h3>
}

function Overview({ server, memberCount, canManage, onEditServer, onInvite }) {
  return (
    <>
      <SectionTitle>Overview</SectionTitle>
      <div className="flex items-center gap-4">
        <ServerIcon url={server.icon_url} name={server.name} className="server-list-icon h-20 w-20 shrink-0 rounded-2xl text-xl" />
        <div className="min-w-0">
          <p className="truncate type-title font-bold text-[var(--text-main)]">{server.name}</p>
          <p className="flex items-center gap-1 type-label text-[var(--text-muted)]"><Users size={14} aria-hidden="true" />{memberCount} {memberCount === 1 ? 'member' : 'members'}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {canManage && (
          <button type="button" onClick={onEditServer} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-4 type-label font-semibold text-[var(--text-main)] hover:bg-[var(--state-hover)]">
            <Pencil size={15} aria-hidden="true" />Edit name and picture
          </button>
        )}
        <button type="button" onClick={onInvite} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--app-accent)] px-4 type-label font-semibold text-[var(--accent-contrast)]">
          <UserPlus size={15} aria-hidden="true" />Invite people
        </button>
      </div>
    </>
  )
}

function Invites({ server, members, onInvite }) {
  const [invites, setInvites] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('invites')
      .select('id, code, created_by, created_at, uses_left, expires_at, revoked_at')
      .eq('server_id', server.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
    if (error) debug.warn('SERVER_ADMIN', { operation: 'list-invites', code: error.code })
    setInvites((data || []).filter(invite => inviteState(invite) === 'valid'))
  }, [server.id])
  useEffect(() => { void load() }, [load])

  const revoke = async (invite) => {
    const { error } = await supabase.rpc('revoke_server_invite', { target_invite_id: invite.id })
    if (error) return toast.error('Could not cancel the invite')
    toast.success('Invite cancelled')
    setInvites(current => current.filter(item => item.id !== invite.id))
  }
  const nameOf = id => members.find(member => member.profile_id === id)?.profiles?.username || 'Someone'

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="type-title font-bold text-[var(--text-main)]">Invites</h3>
        <button type="button" onClick={onInvite} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 type-label font-semibold text-[var(--accent-contrast)]">
          <Link2 size={14} aria-hidden="true" />New link
        </button>
      </div>
      {invites === null && <p className="type-label text-[var(--text-muted)]">Loading…</p>}
      {invites?.length === 0 && <p className="type-label text-[var(--text-muted)]">No active invite links.</p>}
      <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
        {invites?.map(invite => (
          <li key={invite.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono type-label text-[var(--text-main)]" title={inviteUrl(invite.code)}>{invite.code}</p>
              <p className="truncate type-meta text-[var(--text-muted)]">
                {nameOf(invite.created_by)} · {describeExpiry(invite.expires_at)} · {invite.uses_left == null ? 'no use limit' : `${invite.uses_left} uses left`}
              </p>
            </div>
            <button type="button" onClick={() => revoke(invite)} className="h-8 shrink-0 rounded-md px-3 type-label font-semibold text-red-400 hover:bg-red-500/10">Cancel</button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Channels({ categories, onEditChannel }) {
  return (
    <>
      <SectionTitle>Channels</SectionTitle>
      <div className="space-y-4">
        {categories.map(category => (
          <section key={category.id}>
            <p className="mb-1 type-meta font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">{category.name}</p>
            <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
              {(category.channels || []).map(channel => (
                <li key={channel.id}>
                  <button type="button" onClick={() => onEditChannel(channel)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--state-hover)]">
                    {channel.type === 'voice' ? <Volume2 size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" /> : <Hash size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate type-body text-[var(--text-main)]">{channel.name}</span>
                    {channel.is_private && <Lock size={13} className="shrink-0 text-[var(--text-muted)]" aria-label="Private" />}
                    {channel.theme_id && <span className="shrink-0 type-meta capitalize text-[var(--text-muted)]">{channel.theme_id}</span>}
                    <Pencil size={14} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {(category.channels || []).length === 0 && <li className="px-3 py-2.5 type-label text-[var(--text-muted)]">No channels</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

function Members({ members }) {
  const order = { owner: 0, admin: 1, moderator: 2, member: 3 }
  const sorted = [...members].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9))
  return (
    <>
      <SectionTitle>Members · {members.length}</SectionTitle>
      <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
        {sorted.map(member => (
          <li key={member.profile_id} className="flex items-center gap-3 px-3 py-2">
            <StatusAvatar url={member.profiles?.avatar_url} username={member.profiles?.username} showStatus={false} className="h-8 w-8" />
            <span className="min-w-0 flex-1 truncate type-body text-[var(--text-main)]">{member.profiles?.username || 'Member'}</span>
            <span className="shrink-0 type-meta text-[var(--text-muted)]">{ROLE_LABEL[member.role] || member.role}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 type-meta text-[var(--text-muted)]">Change roles, time out, kick or ban from a member's profile in the members list.</p>
    </>
  )
}

export default function ServerSettings({ server, categories = [], members = [], canManage, onEditServer, onInvite, onEditChannel, onClose }) {
  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'invites', label: 'Invites' },
    canManage && { id: 'channels', label: 'Channels' },
    { id: 'members', label: 'Members' }
  ].filter(Boolean)
  const [section, setSection] = useState('overview')

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div data-ui-overlay-owner="ServerSettings" className="premium-backdrop fixed inset-0 z-[150] flex items-stretch justify-center md:items-center md:p-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`${server.name} settings`} className="ios-sheet flex h-full w-full max-w-4xl flex-col overflow-hidden md:h-[min(42rem,90dvh)] md:flex-row md:rounded-2xl" onClick={event => event.stopPropagation()}>
        <nav className="shrink-0 border-b border-[var(--border-subtle)] pt-[env(safe-area-inset-top)] md:w-56 md:border-b-0 md:border-r md:p-3 md:pt-6" aria-label="Server settings sections">
          <div className="flex items-center gap-2 px-4 py-3 md:px-2 md:py-0 md:pb-3">
            <p className="min-w-0 flex-1 truncate type-meta font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">{server.name}</p>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)] md:hidden" aria-label="Close settings">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-col md:px-0 md:pb-0">
            {sections.map(item => (
              <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={section === item.id ? 'page' : undefined} className={`shrink-0 rounded-md px-3 py-2 text-left type-body transition-colors ${section === item.id ? 'bg-[var(--state-pressed)] font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]'}`}>
                {item.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="custom-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:px-8">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] md:flex" aria-label="Close settings">
            <X size={18} aria-hidden="true" />
          </button>
          {section === 'overview' && <Overview server={server} memberCount={members.length} canManage={canManage} onEditServer={onEditServer} onInvite={onInvite} />}
          {section === 'invites' && <Invites server={server} members={members} onInvite={onInvite} />}
          {section === 'channels' && <Channels categories={categories} onEditChannel={onEditChannel} />}
          {section === 'members' && <Members members={members} />}
        </div>
      </section>
    </div>
  )
}
