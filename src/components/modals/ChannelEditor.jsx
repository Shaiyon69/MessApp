/**
 * One channel's settings: name, privacy (and who can see it), and a theme
 * that overrides the server's. Managers only; the database enforces that.
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Hash, Lock, Volume2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../supabaseClient'
import StatusAvatar from '../ui/StatusAvatar'
import Switch from '../ui/Switch'
import { CONVERSATION_THEMES } from '../../lib/conversationThemes'
import { debug } from '../../lib/debug'

export default function ChannelEditor({ channel, members = [], currentUserId, appThemeMode = 'dark', onSaved, onClose }) {
  const [name, setName] = useState(channel.name || '')
  const [isPrivate, setIsPrivate] = useState(Boolean(channel.is_private))
  const [themeId, setThemeId] = useState(channel.theme_id || null)
  const [accessIds, setAccessIds] = useState(() => new Set())
  const [initialAccess, setInitialAccess] = useState(() => new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    supabase.from('channel_access').select('profile_id').eq('channel_id', channel.id).then(({ data }) => {
      if (!active) return
      const ids = new Set((data || []).map(row => row.profile_id))
      setAccessIds(ids)
      setInitialAccess(new Set(ids))
    })
    return () => { active = false }
  }, [channel.id])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Owners and admins always see private channels, so only members are listed.
  const pickable = useMemo(() => members.filter(member => !['owner', 'admin'].includes(member.role)), [members])

  const toggleAccess = id => setAccessIds(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const save = async (event) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return toast.error('Enter a channel name')
    setSaving(true)
    try {
      const { error } = await supabase.from('channels')
        .update({ name: cleanName, is_private: isPrivate, theme_id: themeId })
        .eq('id', channel.id)
      if (error) throw error
      const added = [...accessIds].filter(id => !initialAccess.has(id))
      const removed = [...initialAccess].filter(id => !accessIds.has(id))
      if (added.length) {
        const { error: addError } = await supabase.from('channel_access')
          .insert(added.map(profileId => ({ channel_id: channel.id, profile_id: profileId, added_by: currentUserId })))
        if (addError) throw addError
      }
      if (removed.length) {
        const { error: removeError } = await supabase.from('channel_access')
          .delete().eq('channel_id', channel.id).in('profile_id', removed)
        if (removeError) throw removeError
      }
      toast.success('Channel saved')
      await onSaved?.()
      onClose()
    } catch (error) {
      debug.error('SERVER_ADMIN', { operation: 'save-channel', error })
      toast.error('Could not save the channel')
    } finally {
      setSaving(false)
    }
  }

  const ChannelIcon = channel.type === 'voice' ? Volume2 : Hash

  return (
    <div data-ui-overlay-owner="ChannelEditor" className="premium-backdrop fixed inset-0 z-[200] flex items-end justify-center p-4 pb-[var(--dock-space)] md:items-center md:pb-4" onClick={onClose}>
      <form onSubmit={save} role="dialog" aria-modal="true" aria-label={`Edit ${channel.name}`} className="ios-sheet flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-5 py-4">
          <ChannelIcon size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <h2 className="min-w-0 flex-1 truncate type-title font-bold text-[var(--text-main)]">Channel settings</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block type-meta font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Channel name</span>
            <input value={name} onChange={event => setName(event.target.value)} maxLength={100} className="ios-sheet-input h-11 w-full rounded-lg px-3 text-[var(--text-main)] outline-none" />
          </label>

          <section>
            <div className="flex items-start gap-3">
              <Lock size={18} className="mt-0.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="type-body font-semibold text-[var(--text-main)]">Private channel</p>
                <p className="type-label text-[var(--text-muted)]">Only the people you pick, plus owners and admins, can see it.</p>
              </div>
              <Switch checked={isPrivate} onChange={setIsPrivate} label="Private channel" />
            </div>
            {isPrivate && (
              <ul className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-[var(--border-subtle)] p-1 custom-scrollbar">
                {pickable.length === 0 && <li className="px-3 py-4 text-center type-label text-[var(--text-muted)]">No members to add yet. Owners and admins can always see it.</li>}
                {pickable.map(member => {
                  const profile = member.profiles || {}
                  const checked = accessIds.has(member.profile_id)
                  return (
                    <li key={member.profile_id}>
                      <button type="button" role="checkbox" aria-checked={checked} onClick={() => toggleAccess(member.profile_id)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[var(--state-hover)]">
                        <StatusAvatar url={profile.avatar_url} username={profile.username} showStatus={false} className="h-7 w-7" />
                        <span className="min-w-0 flex-1 truncate type-body text-[var(--text-main)]">{profile.username || 'Member'}</span>
                        <span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--accent-contrast)]' : 'border-[var(--border-hover)]'}`}>
                          {checked && <Check size={13} aria-hidden="true" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section>
            <p className="mb-2 type-meta font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Theme</p>
            <div className="grid grid-cols-4 gap-2">
              <button type="button" onClick={() => setThemeId(null)} aria-pressed={themeId === null} className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 type-meta ${themeId === null ? 'border-[var(--app-accent)] text-[var(--text-main)]' : 'border-[var(--border-subtle)] text-[var(--text-muted)]'}`}>
                <span className="h-6 w-6 rounded-full border border-dashed border-[var(--border-hover)]" aria-hidden="true" />
                Server
              </button>
              {CONVERSATION_THEMES.map(theme => (
                <button key={theme.id} type="button" onClick={() => setThemeId(theme.id)} aria-pressed={themeId === theme.id} className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 type-meta ${themeId === theme.id ? 'border-[var(--app-accent)] text-[var(--text-main)]' : 'border-[var(--border-subtle)] text-[var(--text-muted)]'}`}>
                  <span className="h-6 w-6 rounded-full border border-[var(--border-subtle)]" style={{ background: (theme[appThemeMode] || theme.dark).accent }} aria-hidden="true" />
                  {theme.name}
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 type-body font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)]">Cancel</button>
          <button type="submit" disabled={saving} className="h-10 rounded-lg bg-[var(--app-accent)] px-5 type-body font-semibold text-[var(--accent-contrast)] disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </footer>
      </form>
    </div>
  )
}
