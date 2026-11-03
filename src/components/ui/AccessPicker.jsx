/**
 * Who may see a private category or channel: a checklist of the server's roles
 * and members. Owners and admins always see everything, so they are not listed.
 * `value` is { roleIds: Set, profileIds: Set }; `onChange` gets a new one.
 */
import { Check, Shield } from 'lucide-react'
import StatusAvatar from './StatusAvatar'

function Row({ checked, onToggle, children }) {
  return (
    <li>
      <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[var(--state-hover)]">
        {children}
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--accent-contrast)]' : 'border-[var(--border-hover)]'}`}>
          {checked && <Check size={13} aria-hidden="true" />}
        </span>
      </button>
    </li>
  )
}

const toggled = (set, id) => {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export default function AccessPicker({ roles = [], members = [], value, onChange }) {
  const pickable = members.filter(member => !['owner', 'admin'].includes(member.role))
  return (
    <ul className="custom-scrollbar max-h-56 overflow-y-auto rounded-lg border border-[var(--border-subtle)] p-1">
      {roles.length === 0 && pickable.length === 0 && (
        <li className="px-3 py-4 text-center type-label text-[var(--text-muted)]">No roles or members to add yet. Owners and admins can always see it.</li>
      )}
      {roles.map(role => (
        <Row key={role.id} checked={value.roleIds.has(role.id)} onToggle={() => onChange({ ...value, roleIds: toggled(value.roleIds, role.id) })}>
          <Shield size={18} className="shrink-0" style={{ color: role.color || 'var(--text-muted)' }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate type-body font-semibold text-[var(--text-main)]">{role.name}</span>
        </Row>
      ))}
      {pickable.map(member => {
        const profile = member.profiles || {}
        return (
          <Row key={member.profile_id} checked={value.profileIds.has(member.profile_id)} onToggle={() => onChange({ ...value, profileIds: toggled(value.profileIds, member.profile_id) })}>
            <StatusAvatar url={profile.avatar_url} username={profile.username} showStatus={false} className="h-7 w-7" />
            <span className="min-w-0 flex-1 truncate type-body text-[var(--text-main)]">{profile.username || 'Member'}</span>
          </Row>
        )
      })}
    </ul>
  )
}

export const emptyAccess = () => ({ roleIds: new Set(), profileIds: new Set() })
export const accessToIds = value => ({ roleIds: [...value.roleIds], profileIds: [...value.profileIds] })
