/**
 * Server settings, Discord-style (SettingsShell): Overview (name and picture),
 * Roles (Display and Members per role), Members (ranks and roles), Invites,
 * and Delete or Leave. Members who cannot manage see Overview, Invites and
 * Members read-only. RLS authorizes every write; the gates here are display.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Link2, Plus, Search, Shield, Trash2, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../supabaseClient'
import ServerIcon from '../ui/ServerIcon'
import StatusAvatar from '../ui/StatusAvatar'
import AccessPicker from '../ui/AccessPicker'
import SettingsShell, { FieldLabel, PageTitle } from '../ui/SettingsShell'
import { debug } from '../../lib/debug'
import { describeExpiry, inviteState, inviteUrl } from '../../lib/invites'
import { assertAvatarFile, avatarObjectName, deleteAvatarImage, uploadAvatarImage, MAX_AVATAR_SOURCE_SIZE_BYTES } from '../../lib/avatarUpload'

const MediaEditorModal = lazy(() => import('../media/MediaEditorModal'))

const RANK_LABEL = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', member: 'Member' }
const ROLE_COLORS = ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63', '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#607d8b']
const DEFAULT_ROLE_COLOR = '#99aab5'

function Overview({ server, canManage, draft, setDraft, userId, uploading, setUploading }) {
  const inputRef = useRef(null)
  const [editingFile, setEditingFile] = useState(null)

  const pick = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      assertAvatarFile(file, { maxBytes: MAX_AVATAR_SOURCE_SIZE_BYTES })
      setEditingFile(file)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const upload = async (edited) => {
    setUploading(true)
    try {
      const url = await uploadAvatarImage(supabase, edited, avatarObjectName(userId, edited, 'server-'))
      setDraft(current => ({ ...current, icon: url }))
      setEditingFile(null)
    } catch (error) {
      toast.error(error.message || 'Could not upload the picture')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <PageTitle>Server Overview</PageTitle>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <button type="button" disabled={!canManage || uploading} onClick={() => inputRef.current?.click()} className="group relative rounded-[1.75rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] disabled:cursor-default" aria-label="Change server picture">
            <ServerIcon url={draft.icon} name={draft.name || server.name} className="server-list-icon h-24 w-24 rounded-[1.75rem] text-2xl" />
            {canManage && (
              <span className="absolute inset-0 flex items-center justify-center rounded-[1.75rem] bg-black/55 type-meta font-bold uppercase text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {uploading ? 'Uploading…' : 'Change'}
              </span>
            )}
            {canManage && (
              <span className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-[var(--app-accent)] text-[var(--accent-contrast)]">
                <ImagePlus size={14} aria-hidden="true" />
              </span>
            )}
          </button>
          {canManage && draft.icon && (
            <button type="button" onClick={() => setDraft(current => ({ ...current, icon: '' }))} className="type-label font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:underline">Remove</button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {canManage && <p className="mb-4 type-label text-[var(--text-muted)]">We recommend an image of at least 512×512 for the server.</p>}
          <FieldLabel htmlFor="server-name">Server name</FieldLabel>
          <input id="server-name" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} readOnly={!canManage} maxLength={100} className="ios-sheet-input h-11 w-full rounded-lg px-3 text-[var(--text-main)] outline-none" />
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" onChange={pick} className="hidden" />
      {editingFile && (
        <Suspense fallback={null}>
          <MediaEditorModal file={editingFile} profile onCancel={() => setEditingFile(null)} onSave={upload} />
        </Suspense>
      )}
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
      <div className="flex items-start justify-between gap-3">
        <PageTitle subtitle="Active invite links for this server.">Invites</PageTitle>
        <button type="button" onClick={onInvite} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 type-label font-semibold text-[var(--accent-contrast)]">
          <Link2 size={14} aria-hidden="true" />New link
        </button>
      </div>
      {invites === null && <p className="type-label text-[var(--text-muted)]">Loading…</p>}
      {invites?.length === 0 && <p className="type-label text-[var(--text-muted)]">No active invite links.</p>}
      {invites?.length > 0 && (
        <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
          {invites.map(invite => (
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
      )}
    </>
  )
}

function RoleChip({ role, onRemove }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-container)] pl-2 pr-1.5 type-meta font-semibold text-[var(--text-main)]">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: role.color || DEFAULT_ROLE_COLOR }} aria-hidden="true" />
      {role.name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="grid h-4 w-4 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]" aria-label={`Remove ${role.name}`}>
          <X size={11} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

function Roles({ roles, memberRoles, members, selectedId, setSelectedId, tab, setTab, draft, setDraft, onCreate, onDelete, onSetHolders }) {
  const role = roles.find(entry => entry.id === selectedId)
  const holderIds = new Set(memberRoles.filter(row => row.role_id === selectedId).map(row => row.profile_id))
  const [adding, setAdding] = useState(false)
  useEffect(() => setAdding(false), [selectedId])

  return (
    <>
      <PageTitle subtitle="Use roles to group members and decide who sees private categories and channels. Owners and admins always see everything.">Roles</PageTitle>
      <div className="grid gap-5 md:grid-cols-[13rem_1fr]">
        <div>
          <button type="button" onClick={onCreate} className="mb-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 type-label font-semibold text-[var(--accent-contrast)]">
            <Plus size={15} aria-hidden="true" />Create Role
          </button>
          {roles.length === 0 && <p className="type-label text-[var(--text-muted)]">No roles yet.</p>}
          <ul className="space-y-0.5">
            {roles.map(entry => {
              const count = memberRoles.filter(row => row.role_id === entry.id).length
              return (
                <li key={entry.id}>
                  <button type="button" onClick={() => setSelectedId(entry.id)} aria-current={selectedId === entry.id ? 'true' : undefined}
                    className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left type-label ${selectedId === entry.id ? 'bg-[var(--state-pressed)] font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]'}`}>
                    <Shield size={15} className="shrink-0" style={{ color: entry.color || DEFAULT_ROLE_COLOR }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="flex shrink-0 items-center gap-0.5 type-meta"><Users size={12} aria-hidden="true" />{count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {role && (
          <div className="min-w-0">
            <div role="tablist" aria-label="Role sections" className="mb-5 flex gap-5 border-b border-[var(--border-subtle)]">
              {[{ id: 'display', label: 'Display' }, { id: 'members', label: `Manage Members (${holderIds.size})` }].map(entry => (
                <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} onClick={() => setTab(entry.id)}
                  className={`-mb-px border-b-2 pb-2 type-body font-semibold ${tab === entry.id ? 'border-[var(--app-accent)] text-[var(--text-main)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                  {entry.label}
                </button>
              ))}
            </div>

            {tab === 'display' && draft && (
              <div className="space-y-6">
                <div>
                  <FieldLabel htmlFor="role-name">Role name</FieldLabel>
                  <input id="role-name" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} maxLength={100} className="ios-sheet-input h-11 w-full rounded-lg px-3 text-[var(--text-main)] outline-none" />
                </div>
                <div>
                  <FieldLabel>Role color</FieldLabel>
                  <p className="mb-3 type-label text-[var(--text-muted)]">Shown on the role in member lists and permissions.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative h-12 w-14 cursor-pointer overflow-hidden rounded-md border border-[var(--border-subtle)]" style={{ background: draft.color }} title="Custom color">
                      <input type="color" value={draft.color} onChange={event => setDraft({ ...draft, color: event.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Custom role color" />
                    </label>
                    {[DEFAULT_ROLE_COLOR, ...ROLE_COLORS].map(color => (
                      <button key={color} type="button" onClick={() => setDraft({ ...draft, color })} aria-pressed={draft.color === color} aria-label={`Color ${color}`}
                        className={`h-6 w-6 rounded-md ${draft.color === color ? 'ring-2 ring-[var(--text-main)] ring-offset-2 ring-offset-[var(--bg-base)]' : ''}`} style={{ background: color }} />
                    ))}
                  </div>
                </div>
                <div className="border-t border-[var(--border-subtle)] pt-5">
                  <button type="button" onClick={() => onDelete(role)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-500/50 px-3 type-label font-semibold text-red-400 hover:bg-red-500/10">
                    <Trash2 size={14} aria-hidden="true" />Delete Role
                  </button>
                </div>
              </div>
            )}

            {tab === 'members' && (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="type-label text-[var(--text-muted)]">Members with this role.</p>
                  <button type="button" onClick={() => setAdding(open => !open)} aria-expanded={adding} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 type-label font-semibold text-[var(--accent-contrast)]">
                    <Plus size={14} aria-hidden="true" />Add Members
                  </button>
                </div>
                {adding && (
                  <div className="mb-4">
                    <AccessPicker members={members.filter(member => member.role !== 'owner')} value={{ roleIds: new Set(), profileIds: holderIds }} onChange={value => onSetHolders(role, holderIds, value.profileIds)} />
                  </div>
                )}
                {holderIds.size === 0 && !adding && <p className="type-label text-[var(--text-muted)]">No members have this role yet.</p>}
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {members.filter(member => holderIds.has(member.profile_id)).map(member => (
                    <li key={member.profile_id} className="flex items-center gap-3 py-2">
                      <StatusAvatar url={member.profiles?.avatar_url} username={member.profiles?.username} showStatus={false} className="h-8 w-8" />
                      <span className="min-w-0 flex-1 truncate type-body text-[var(--text-main)]">{member.profiles?.username || 'Member'}</span>
                      <button type="button" onClick={() => { const next = new Set(holderIds); next.delete(member.profile_id); onSetHolders(role, holderIds, next) }} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]" aria-label={`Remove ${member.profiles?.username || 'member'} from ${role.name}`}>
                        <X size={15} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function Members({ members, roles, memberRoles, canManage, onSetHolders }) {
  const [query, setQuery] = useState('')
  const [addingFor, setAddingFor] = useState(null)
  const order = { owner: 0, admin: 1, moderator: 2, member: 3 }
  const holdersOf = roleId => new Set(memberRoles.filter(row => row.role_id === roleId).map(row => row.profile_id))
  const rolesOf = profileId => roles.filter(role => memberRoles.some(row => row.role_id === role.id && row.profile_id === profileId))
  const toggle = (role, profileId, on) => {
    const holders = holdersOf(role.id)
    const next = new Set(holders)
    if (on) next.add(profileId)
    else next.delete(profileId)
    onSetHolders(role, holders, next)
  }
  const needle = query.trim().toLowerCase()
  const sorted = [...members]
    .filter(member => !needle || (member.profiles?.username || '').toLowerCase().includes(needle))
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9))

  return (
    <>
      <PageTitle subtitle={`${members.length} ${members.length === 1 ? 'member' : 'members'}. Change ranks, time out, kick or ban from a member's profile.`}>Members</PageTitle>
      <label className="ios-sheet-input mb-4 flex h-10 items-center gap-2 rounded-lg px-3">
        <Search size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search members" aria-label="Search members" className="min-w-0 flex-1 bg-transparent text-[var(--text-main)] outline-none" />
      </label>
      <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
        {sorted.map(member => {
          const held = rolesOf(member.profile_id)
          const missing = roles.filter(role => !held.includes(role))
          return (
            <li key={member.profile_id} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <StatusAvatar url={member.profiles?.avatar_url} username={member.profiles?.username} showStatus={false} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate type-body font-semibold text-[var(--text-main)]">{member.profiles?.username || 'Member'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="type-meta text-[var(--text-muted)]">{RANK_LABEL[member.role] || member.role}</span>
                    {held.map(role => <RoleChip key={role.id} role={role} onRemove={canManage ? () => toggle(role, member.profile_id, false) : null} />)}
                    {canManage && missing.length > 0 && (
                      <button type="button" onClick={() => setAddingFor(addingFor === member.profile_id ? null : member.profile_id)} aria-expanded={addingFor === member.profile_id} className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-[var(--border-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-label={`Add a role to ${member.profiles?.username || 'member'}`} title="Add role">
                        <Plus size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {addingFor === member.profile_id && (
                <div className="ml-12 mt-2 flex flex-wrap gap-1.5">
                  {missing.map(role => (
                    <button key={role.id} type="button" onClick={() => { toggle(role, member.profile_id, true); setAddingFor(null) }} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 type-meta font-semibold text-[var(--text-main)] hover:bg-[var(--state-hover)]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: role.color || DEFAULT_ROLE_COLOR }} aria-hidden="true" />{role.name}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

export default function ServerSettings({ server, members = [], roles = [], memberRoles = [], canManage, isOwner, userId, onServerSaved, onInvite, onRolesChanged, onDeleteServer, onLeaveServer, onClose }) {
  const [section, setSection] = useState('overview')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Overview draft: name and icon ('' = removed).
  const overviewBase = { name: server.name || '', icon: server.icon_url || '' }
  const [overview, setOverview] = useState(overviewBase)
  const overviewDirty = overview.name !== overviewBase.name || overview.icon !== overviewBase.icon

  // Roles: the selected role's Display draft.
  const [roleId, setRoleId] = useState(null)
  const [roleTab, setRoleTab] = useState('display')
  const selectedRole = roles.find(role => role.id === roleId)
  const roleBase = selectedRole ? { name: selectedRole.name, color: selectedRole.color || DEFAULT_ROLE_COLOR } : null
  const [roleDraft, setRoleDraft] = useState(null)
  // Reset the draft only when the role itself changes, not on every render's new roleBase object.
  useEffect(() => { setRoleDraft(roleBase) }, [roleId, selectedRole?.name, selectedRole?.color]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!selectedRole && roles.length) setRoleId(roles[0].id) }, [selectedRole, roles])
  const roleDirty = Boolean(roleDraft && roleBase && (roleDraft.name !== roleBase.name || roleDraft.color !== roleBase.color))

  const runRoleWrite = async (operation, work) => {
    try {
      const { error } = await work()
      if (error) throw error
      await onRolesChanged?.()
      return true
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation, error })
      toast.error('Could not save the role')
      return false
    }
  }

  const createRole = async () => {
    const id = crypto.randomUUID()
    if (await runRoleWrite('create-role', () => supabase.from('server_roles').insert({ id, server_id: server.id, name: 'new role', color: DEFAULT_ROLE_COLOR, position: roles.length }))) {
      setRoleId(id)
      setRoleTab('display')
    }
  }
  const deleteRole = async (role) => {
    if (await runRoleWrite('delete-role', () => supabase.from('server_roles').delete().eq('id', role.id))) setRoleId(null)
  }
  const setHolders = (role, before, next) => runRoleWrite('assign-role', async () => {
    const added = [...next].filter(id => !before.has(id))
    const removed = [...before].filter(id => !next.has(id))
    // server_id is overwritten from the role by a trigger.
    if (added.length) {
      const result = await supabase.from('server_member_roles').insert(added.map(profileId => ({ role_id: role.id, profile_id: profileId, server_id: server.id })))
      if (result.error) return result
    }
    if (removed.length) return supabase.from('server_member_roles').delete().eq('role_id', role.id).in('profile_id', removed)
    return { error: null }
  })

  const resetOverview = async () => {
    // A picture uploaded but never saved would be stranded in storage.
    if (overview.icon && overview.icon !== overviewBase.icon) await deleteAvatarImage(supabase, overview.icon)
    setOverview(overviewBase)
  }

  const saveOverview = async () => {
    const name = overview.name.trim()
    if (!name) return toast.error('Enter a server name')
    setSaving(true)
    try {
      // update_server rewrites name and icon together.
      const { data, error } = await supabase.rpc('update_server', { target_server_id: server.id, new_name: name, new_icon_url: overview.icon || null })
      if (error) throw error
      // Only after the save lands, so a failed save keeps the live picture.
      if (overviewBase.icon && overviewBase.icon !== data?.icon_url) await deleteAvatarImage(supabase, overviewBase.icon)
      await onServerSaved?.(data)
      setOverview({ name: data?.name || name, icon: data?.icon_url || '' })
      toast.success('Server updated')
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: 'update-server', error })
      toast.error('Could not update server')
    } finally {
      setSaving(false)
    }
  }

  const saveRole = async () => {
    const name = roleDraft.name.trim()
    if (!name) return toast.error('Enter a role name')
    setSaving(true)
    await runRoleWrite('update-role', () => supabase.from('server_roles').update({ name, color: roleDraft.color }).eq('id', roleId))
    setSaving(false)
  }

  const unsaved = section === 'overview' && overviewDirty
    ? { saving: saving || uploading, onReset: resetOverview, onSave: saveOverview }
    : section === 'roles' && roleTab === 'display' && roleDirty
      ? { saving, onReset: () => setRoleDraft(roleBase), onSave: saveRole }
      : null

  const groups = [
    { items: [
      { id: 'overview', label: 'Overview' },
      canManage && { id: 'roles', label: 'Roles' }
    ] },
    { heading: 'People', items: [
      { id: 'members', label: 'Members' },
      { id: 'invites', label: 'Invites' }
    ] },
    { items: [isOwner
      ? { id: 'delete', label: 'Delete Server', danger: true, onSelect: () => { onClose(); onDeleteServer?.() } }
      : { id: 'leave', label: 'Leave Server', danger: true, onSelect: () => { onClose(); onLeaveServer?.() } }] }
  ]

  return (
    <SettingsShell owner="ServerSettings" label={`${server.name} settings`} title={server.name} groups={groups} section={section} onSection={setSection} unsaved={unsaved} onClose={onClose}>
      {section === 'overview' && <Overview server={server} canManage={canManage} draft={overview} setDraft={setOverview} userId={userId} uploading={uploading} setUploading={setUploading} />}
      {section === 'roles' && (
        <Roles roles={roles} memberRoles={memberRoles} members={members} selectedId={roleId} setSelectedId={setRoleId} tab={roleTab} setTab={setRoleTab}
          draft={roleDraft} setDraft={setRoleDraft} onCreate={createRole} onDelete={deleteRole} onSetHolders={setHolders} />
      )}
      {section === 'members' && <Members members={members} roles={roles} memberRoles={memberRoles} canManage={canManage} onSetHolders={setHolders} />}
      {section === 'invites' && <Invites server={server} members={members} onInvite={onInvite} />}
    </SettingsShell>
  )
}
