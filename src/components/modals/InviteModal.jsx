/**
 * "Invite friends" for a server, or for one of its voice channels. Friends get
 * the invite in their notification feed; anyone else gets the link. The link
 * is minted when the dialog opens and re-minted when its settings change.
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, Search, Volume2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../supabaseClient'
import StatusAvatar from '../ui/StatusAvatar'
import { debug } from '../../lib/debug'
import {
  DEFAULT_EXPIRY_ID,
  DEFAULT_USES_ID,
  EXPIRY_OPTIONS,
  USES_OPTIONS,
  describeExpiry,
  expiresAtFor,
  inviteErrorMessage,
  inviteUrl,
  usesFor
} from '../../lib/invites'

export default function InviteModal({ server, voiceChannel = null, friends = [], onClose }) {
  const [expiryId, setExpiryId] = useState(DEFAULT_EXPIRY_ID)
  const [usesId, setUsesId] = useState(DEFAULT_USES_ID)
  const [invite, setInvite] = useState(null)
  const [minting, setMinting] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [query, setQuery] = useState('')
  const [sent, setSent] = useState(() => new Set())
  const [sending, setSending] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!server?.id) return undefined
    let active = true
    setMinting(true)
    supabase.rpc('create_server_invite', {
      target_server_id: server.id,
      requested_uses: usesFor(usesId),
      requested_expires_at: expiresAtFor(expiryId)
    }).then(({ data, error }) => {
      if (!active) return
      setMinting(false)
      if (error || !data?.code) {
        debug.error('SERVER_ADMIN', { operation: 'create-invite', error })
        toast.error('Could not create an invite link')
        return
      }
      setInvite(data)
    })
    return () => { active = false }
  }, [server?.id, expiryId, usesId])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const link = invite?.code ? inviteUrl(invite.code) : ''
  const shownFriends = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return friends.filter(friend => !needle || friend.username?.toLowerCase().includes(needle))
  }, [friends, query])

  const copyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy the link')
    }
  }

  const sendTo = async (friend) => {
    if (!invite?.code || sending) return
    setSending(friend.id)
    const { error } = await supabase.rpc('send_server_invite', {
      invite: invite.code,
      recipient: friend.id,
      voice_channel: voiceChannel?.id || null
    })
    setSending(null)
    if (error) {
      debug.warn('SERVER_ADMIN', { operation: 'send-invite', code: error.code })
      return toast.error(inviteErrorMessage(error))
    }
    setSent(current => new Set(current).add(friend.id))
  }

  const title = voiceChannel ? `Invite friends to ${voiceChannel.name}` : `Invite friends to ${server?.name || 'this server'}`

  return (
    <div data-ui-overlay-owner="InviteModal" className="premium-backdrop fixed inset-0 z-[200] flex items-end justify-center p-4 pb-[var(--dock-space)] md:items-center md:pb-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title} className="ios-sheet flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 truncate type-title font-bold text-[var(--text-main)]">
              {voiceChannel && <Volume2 size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />}
              <span className="truncate">{title}</span>
            </h2>
            {voiceChannel && <p className="truncate type-label text-[var(--text-muted)]">{server?.name}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="px-5">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 focus-within:border-[var(--app-accent)]">
            <Search size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search friends" aria-label="Search friends" className="min-w-0 flex-1 bg-transparent type-body text-[var(--text-main)] outline-none" />
          </label>
        </div>

        <ul className="custom-scrollbar min-h-24 flex-1 overflow-y-auto px-3 py-2">
          {shownFriends.length === 0 && (
            <li className="px-2 py-6 text-center type-label text-[var(--text-muted)]">
              {friends.length === 0 ? 'Add friends to invite them here, or share the link below.' : 'No friends match that name.'}
            </li>
          )}
          {shownFriends.map(friend => {
            const isSent = sent.has(friend.id)
            return (
              <li key={friend.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--state-hover)]">
                <StatusAvatar url={friend.avatar_url} username={friend.username} showStatus={false} className="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate type-body font-medium text-[var(--text-main)]">{friend.username}</span>
                <button
                  type="button"
                  onClick={() => sendTo(friend)}
                  disabled={isSent || minting || !invite || sending === friend.id}
                  className={`h-8 min-w-[4.5rem] shrink-0 rounded-md px-3 type-label font-semibold transition-colors disabled:cursor-default ${isSent ? 'text-[var(--text-muted)]' : 'border border-green-600 text-green-500 hover:bg-green-600 hover:text-white disabled:opacity-50'}`}
                >
                  {isSent ? 'Sent' : sending === friend.id ? '…' : 'Invite'}
                </button>
              </li>
            )
          })}
        </ul>

        <footer className="border-t border-[var(--border-subtle)] px-5 pb-5 pt-3">
          <p className="mb-1.5 type-meta font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Or send a server invite link</p>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] p-1 pl-3">
            <input readOnly value={minting ? 'Creating link…' : link} aria-label="Invite link" className="min-w-0 flex-1 bg-transparent type-label text-[var(--text-main)] outline-none" onFocus={event => event.target.select()} />
            <button type="button" onClick={copyLink} disabled={!link} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 type-label font-semibold text-white transition-colors disabled:opacity-50 ${copied ? 'bg-green-600' : 'bg-[var(--app-accent)] hover:brightness-110'}`}>
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" onClick={() => setShowSettings(value => !value)} aria-expanded={showSettings} className="mt-2 flex items-center gap-1 type-meta text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <span>{invite ? `${describeExpiry(invite.expires_at)} · ${invite.uses_left == null ? 'no use limit' : `${invite.uses_left} uses left`}` : ' '}</span>
            <span className="text-[var(--app-accent)]">Edit link</span>
            <ChevronDown size={12} className={showSettings ? 'rotate-180' : ''} aria-hidden="true" />
          </button>
          {showSettings && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block type-meta font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Expire after</span>
                <select value={expiryId} onChange={event => setExpiryId(event.target.value)} className="ios-sheet-input h-10 w-full rounded-lg px-2 type-label text-[var(--text-main)]">
                  {EXPIRY_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block type-meta font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Max uses</span>
                <select value={usesId} onChange={event => setUsesId(event.target.value)} className="ios-sheet-input h-10 w-full rounded-lg px-2 type-label text-[var(--text-main)]">
                  {USES_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <p className="col-span-2 type-meta text-[var(--text-muted)]">Changing these makes a new link. Cancel old links in Server settings → Invites.</p>
            </div>
          )}
        </footer>
      </section>
    </div>
  )
}
