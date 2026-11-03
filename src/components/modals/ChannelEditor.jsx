/**
 * Channel and category settings, Discord-style (SettingsShell): Overview (name,
 * topic, theme) and Permissions (sync with the category, a private switch, and
 * advanced allow/deny per @everyone, role or member), plus Delete.
 *
 * Permissions are overwrites, VIEW_CHANNEL only for now. A synced channel uses
 * its category's overwrites; editing them here unsyncs it, starting from a copy
 * of the category's. Everything is one draft behind the unsaved-changes bar.
 * Managers only; the database enforces that.
 */
import { useMemo, useState } from 'react'
import { Link2, Lock, Plus, Shield, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../supabaseClient'
import Switch from '../ui/Switch'
import StatusAvatar from '../ui/StatusAvatar'
import SettingsShell, { FieldLabel, PageTitle } from '../ui/SettingsShell'
import { CONVERSATION_THEMES } from '../../lib/conversationThemes'
import { VIEW_CHANNEL } from '../../lib/channelPermissions'
import { debug } from '../../lib/debug'

const keyOf = row => `${row.target}:${row.role_id || row.profile_id || ''}`
const viewOf = row => (row.allow & VIEW_CHANNEL ? 'allow' : row.deny & VIEW_CHANNEL ? 'deny' : 'neutral')
const toDraft = rows => rows.map(row => ({ id: row.id, target: row.target, role_id: row.role_id || null, profile_id: row.profile_id || null, view: viewOf(row) }))
const EVERYONE = { target: 'everyone', role_id: null, profile_id: null, view: 'neutral' }
const withEveryone = rows => (rows.some(row => row.target === 'everyone') ? rows : [EVERYONE, ...rows])

const STATES = [
  { id: 'deny', label: 'Deny', glyph: '✕', active: 'bg-red-500 text-white' },
  { id: 'neutral', label: 'Inherit', glyph: '/', active: 'bg-[var(--state-pressed)] text-[var(--text-main)]' },
  { id: 'allow', label: 'Allow', glyph: '✓', active: 'bg-green-600 text-white' }
]

function TriState({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 overflow-hidden rounded-md border border-[var(--border-subtle)]">
      {STATES.map(state => (
        <button key={state.id} type="button" role="radio" aria-checked={value === state.id} aria-label={state.label} title={state.label} onClick={() => onChange(state.id)}
          className={`h-8 w-9 type-label font-bold ${value === state.id ? state.active : 'text-[var(--text-muted)] hover:bg-[var(--state-hover)]'}`}>
          {state.glyph}
        </button>
      ))}
    </div>
  )
}

export default function ChannelEditor({ kind = 'channel', item, categories = [], permissions = {}, members = [], appThemeMode = 'dark', onSaved, onDelete, onClose }) {
  const isChannel = kind === 'channel'
  const noun = isChannel ? 'Channel' : 'Category'
  const { roles = [], overwrites = [] } = permissions
  const category = isChannel ? categories.find(entry => entry.id === item.category_id) : item
  const ownRows = useMemo(() => overwrites.filter(row => (isChannel ? row.channel_id === item.id : row.category_id === item.id)), [overwrites, isChannel, item.id])
  const categoryRows = useMemo(() => overwrites.filter(row => row.category_id === category?.id), [overwrites, category?.id])
  // A copy of the category's rows without their ids: saved, they become the channel's own.
  const fromCategory = () => withEveryone(toDraft(categoryRows).map(({ id: _id, ...row }) => row))

  const initial = () => ({
    name: item.name || '',
    topic: item.topic || '',
    themeId: item.theme_id || null,
    synced: isChannel && Boolean(item.sync_permissions),
    rows: isChannel && item.sync_permissions ? fromCategory() : withEveryone(toDraft(ownRows))
  })
  const [base] = useState(initial)
  const [draft, setDraft] = useState(base)
  const [section, setSection] = useState('overview')
  const [selectedKey, setSelectedKey] = useState('everyone:')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(base)
  const set = change => setDraft(current => ({ ...current, ...change }))

  // Any permission edit on a synced channel unsyncs it, keeping what it showed.
  const editRows = change => setDraft(current => ({ ...current, synced: false, rows: change(current.synced ? fromCategory() : current.rows) }))
  const setView = (key, view) => editRows(rows => rows.map(row => (keyOf(row) === key ? { ...row, view } : row)))
  const everyone = draft.rows.find(row => row.target === 'everyone')
  const isPrivate = everyone?.view === 'deny'
  const setPrivate = value => setView('everyone:', value ? 'deny' : 'neutral')
  const removeRow = key => {
    editRows(rows => rows.filter(row => keyOf(row) !== key))
    setSelectedKey('everyone:')
  }

  const present = new Set(draft.rows.map(keyOf))
  const addable = [
    ...roles.map(role => ({ key: `role:${role.id}`, label: role.name, color: role.color, row: { target: 'role', role_id: role.id, profile_id: null } })),
    ...members.filter(member => !['owner', 'admin'].includes(member.role)).map(member => ({
      key: `member:${member.profile_id}`,
      label: member.profiles?.username || 'Member',
      profile: member.profiles || {},
      row: { target: 'member', role_id: null, profile_id: member.profile_id }
    }))
  ].filter(option => !present.has(option.key))
  const addRow = option => {
    editRows(rows => [...rows, { ...option.row, view: isPrivate ? 'allow' : 'neutral' }])
    setSelectedKey(option.key)
    setAdding(false)
  }

  const describe = row => {
    if (row.target === 'everyone') return { Icon: Users, label: '@everyone' }
    if (row.target === 'role') {
      const role = roles.find(entry => entry.id === row.role_id)
      return { Icon: Shield, label: role?.name || 'Deleted role', color: role?.color }
    }
    const member = members.find(entry => entry.profile_id === row.profile_id)
    return { profile: member?.profiles || {}, label: member?.profiles?.username || 'Member' }
  }
  const selected = draft.rows.find(row => keyOf(row) === selectedKey) || everyone

  // Rows are diffed by id: changed ones update, neutral or removed ones go, new ones insert.
  const saveOverwrites = async () => {
    const container = isChannel ? { channel_id: item.id } : { category_id: item.id }
    const wanted = draft.synced ? [] : draft.rows.filter(row => row.view !== 'neutral')
    const wantedIds = new Set(wanted.map(row => row.id).filter(Boolean))
    const stale = ownRows.filter(row => !wantedIds.has(row.id)).map(row => row.id)
    if (stale.length) {
      const { error } = await supabase.from('permission_overwrites').delete().in('id', stale)
      if (error) throw error
    }
    for (const row of wanted) {
      const before = ownRows.find(entry => entry.id === row.id)
      const bits = {
        allow: ((before?.allow || 0) & ~VIEW_CHANNEL) | (row.view === 'allow' ? VIEW_CHANNEL : 0),
        deny: ((before?.deny || 0) & ~VIEW_CHANNEL) | (row.view === 'deny' ? VIEW_CHANNEL : 0)
      }
      if (before && before.allow === bits.allow && before.deny === bits.deny) continue
      const { error } = before
        ? await supabase.from('permission_overwrites').update(bits).eq('id', row.id)
        : await supabase.from('permission_overwrites').insert({ ...container, server_id: category?.server_id, target: row.target, role_id: row.role_id, profile_id: row.profile_id, ...bits })
      if (error) throw error
    }
  }

  const save = async () => {
    const name = draft.name.trim()
    if (!name) return toast.error(`Enter a ${kind} name`)
    setSaving(true)
    try {
      const { error } = isChannel
        ? await supabase.from('channels').update({ name, topic: draft.topic.trim() || null, theme_id: draft.themeId, sync_permissions: draft.synced }).eq('id', item.id)
        : await supabase.from('categories').update({ name }).eq('id', item.id)
      if (error) throw error
      await saveOverwrites()
      toast.success(`${noun} saved`)
      await onSaved?.()
      // The parent refetch replaces ids for new rows; close rather than diff against stale ones.
      onClose()
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: `save-${kind}`, error })
      toast.error(`Could not save the ${kind}`)
    } finally {
      setSaving(false)
    }
  }

  const groups = [
    { heading: isChannel && item.type !== 'voice' ? `#${item.name}` : item.name, items: [
      { id: 'overview', label: 'Overview' },
      { id: 'permissions', label: 'Permissions' }
    ] },
    onDelete && { items: [{ id: 'delete', label: `Delete ${noun}`, danger: true, onSelect: () => { onClose(); onDelete() } }] }
  ].filter(Boolean)

  return (
    <SettingsShell
      owner="ChannelEditor"
      label={`${noun} settings`}
      title={`${noun} settings`}
      groups={groups}
      section={section}
      onSection={setSection}
      unsaved={dirty ? { saving, onReset: () => setDraft(base), onSave: save } : null}
      onClose={onClose}
    >
      {section === 'overview' && (
        <>
          <PageTitle>Overview</PageTitle>
          <div className="space-y-6">
            <div>
              <FieldLabel htmlFor="settings-name">{noun} name</FieldLabel>
              <input id="settings-name" value={draft.name} onChange={event => set({ name: event.target.value })} maxLength={100} className="ios-sheet-input h-11 w-full rounded-lg px-3 text-[var(--text-main)] outline-none" />
            </div>
            {isChannel && item.type !== 'voice' && (
              <div>
                <FieldLabel htmlFor="settings-topic">Channel topic</FieldLabel>
                <textarea id="settings-topic" value={draft.topic} onChange={event => set({ topic: event.target.value })} maxLength={1024} rows={4} placeholder="Let everyone know how to use this channel" className="ios-sheet-input w-full resize-y rounded-lg px-3 py-2.5 text-[var(--text-main)] outline-none" />
                <p className="mt-1 text-right type-meta text-[var(--text-muted)]">{1024 - draft.topic.length}</p>
              </div>
            )}
            {isChannel && (
              <div>
                <FieldLabel>Theme</FieldLabel>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {[{ id: null, name: 'Server' }, ...CONVERSATION_THEMES].map(theme => (
                    <button key={theme.id || 'server'} type="button" onClick={() => set({ themeId: theme.id })} aria-pressed={draft.themeId === theme.id} className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 type-meta ${draft.themeId === theme.id ? 'border-[var(--app-accent)] text-[var(--text-main)]' : 'border-[var(--border-subtle)] text-[var(--text-muted)]'}`}>
                      {theme.id
                        ? <span className="h-6 w-6 rounded-full border border-[var(--border-subtle)]" style={{ background: (theme[appThemeMode] || theme.dark).accent }} aria-hidden="true" />
                        : <span className="h-6 w-6 rounded-full border border-dashed border-[var(--border-hover)]" aria-hidden="true" />}
                      {theme.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {section === 'permissions' && (
        <>
          <PageTitle subtitle={isChannel ? 'Use permissions to choose who can see this channel.' : 'Synced channels in this category follow these permissions.'}>Permissions</PageTitle>

          {isChannel && (
            <div className="mb-5 flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container)] px-4 py-3">
              <Link2 size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              <p className="min-w-0 flex-1 type-label text-[var(--text-muted)]">
                {draft.synced
                  ? <>Permissions synced with category: <span className="font-semibold text-[var(--text-main)]">{category?.name || 'its category'}</span></>
                  : <>This channel is not synced with <span className="font-semibold text-[var(--text-main)]">{category?.name || 'its category'}</span>.</>}
              </p>
              {!draft.synced && (
                <button type="button" onClick={() => set({ synced: true, rows: fromCategory() })} className="h-9 shrink-0 rounded-lg bg-[var(--app-accent)] px-3 type-label font-semibold text-[var(--accent-contrast)]">Sync Now</button>
              )}
            </div>
          )}

          <div className="mb-8 rounded-lg border border-[var(--border-subtle)] px-4 py-4">
            <div className="flex items-start gap-3">
              <Lock size={20} className="mt-0.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="type-body font-semibold text-[var(--text-main)]">Private {noun}</p>
                <p className="mt-0.5 type-label text-[var(--text-muted)]">By making a {kind} private, only the roles and members you allow, plus owners and admins, can see it.</p>
              </div>
              <Switch checked={isPrivate} onChange={setPrivate} label={`Private ${kind}`} />
            </div>
          </div>

          <h3 className="mb-1 type-body font-bold text-[var(--text-main)]">Advanced permissions</h3>
          <p className="mb-3 type-label text-[var(--text-muted)]">Pick @everyone, a role or a member, then allow or deny each permission. Inherit uses the server default.</p>
          <div className="grid gap-4 md:grid-cols-[13rem_1fr]">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="type-meta font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Roles / Members</span>
                {addable.length > 0 && (
                  <button type="button" onClick={() => setAdding(open => !open)} aria-expanded={adding} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]" aria-label="Add a role or member" title="Add a role or member">
                    <Plus size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              {adding && (
                <ul className="custom-scrollbar mb-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container)] p-1">
                  {addable.map(option => (
                    <li key={option.key}>
                      <button type="button" onClick={() => addRow(option)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--state-hover)]">
                        {option.profile
                          ? <StatusAvatar url={option.profile.avatar_url} username={option.profile.username} showStatus={false} className="h-5 w-5" />
                          : <Shield size={15} className="shrink-0" style={{ color: option.color || 'var(--text-muted)' }} aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate type-label text-[var(--text-main)]">{option.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="space-y-0.5">
                {draft.rows.map(row => {
                  const key = keyOf(row)
                  const { Icon, label, color, profile } = describe(row)
                  return (
                    <li key={key}>
                      <button type="button" onClick={() => setSelectedKey(key)} aria-current={keyOf(selected) === key ? 'true' : undefined}
                        className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left type-label ${keyOf(selected) === key ? 'bg-[var(--state-pressed)] font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]'}`}>
                        {profile
                          ? <StatusAvatar url={profile.avatar_url} username={profile.username} showStatus={false} className="h-5 w-5" />
                          : <Icon size={15} className="shrink-0" style={{ color: color || undefined }} aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            {selected && (
              <div className="rounded-lg border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
                  <p className="min-w-0 flex-1 truncate type-body font-semibold text-[var(--text-main)]">{describe(selected).label}</p>
                  {selected.target !== 'everyone' && (
                    <button type="button" onClick={() => removeRow(keyOf(selected))} className="flex h-8 items-center gap-1 rounded-md px-2 type-label font-semibold text-red-400 hover:bg-red-500/10">
                      <X size={14} aria-hidden="true" />Remove
                    </button>
                  )}
                </div>
                <p className="px-4 pt-3 type-meta font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">General {noun.toLowerCase()} permissions</p>
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="type-body font-semibold text-[var(--text-main)]">View {noun}</p>
                    <p className="mt-0.5 type-label text-[var(--text-muted)]">
                      {selected.target === 'everyone'
                        ? `Lets members see this ${kind} by default. Denying it for @everyone makes the ${kind} private.`
                        : `Lets ${describe(selected).label} see this ${kind}. Allow here beats a deny on @everyone; a member's own setting beats their roles.`}
                    </p>
                  </div>
                  <TriState value={selected.view} onChange={view => setView(keyOf(selected), view)} label={`View ${kind} for ${describe(selected).label}`} />
                </div>
                <p className="border-t border-[var(--border-subtle)] px-4 py-3 type-label text-[var(--text-muted)]">More permissions (send messages, connect to voice) are coming.</p>
              </div>
            )}
          </div>
        </>
      )}
    </SettingsShell>
  )
}
