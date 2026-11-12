/**
 * What opening an invite shows: the server's name, picture and member count,
 * and Join. Opened by an /invite/CODE link, an invite notification, a pasted
 * link in the join box, or an invite card in chat.
 */
import { useEffect, useState } from 'react'
import { Users, Volume2, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import ServerIcon from '../ui/ServerIcon'
import { inviteErrorMessage } from '../../lib/invites'

const STATUS_TEXT = {
  invalid: 'This invite is not valid.',
  revoked: 'This invite was cancelled.',
  expired: 'This invite has expired.',
  exhausted: 'This invite has no uses left.'
}

/** `onJoined(server, voiceChannelId)` runs after a join or for a server you are already in. */
export default function InvitePreviewModal({ code, voiceChannelName = null, voiceChannelId = null, onJoined, onClose }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let active = true
    setPreview(null)
    setError('')
    supabase.rpc('preview_invite', { invite: code }).then(({ data, error: rpcError }) => {
      if (!active) return
      if (rpcError) return setError(inviteErrorMessage(rpcError))
      const row = Array.isArray(data) ? data[0] : data
      setPreview(row || { status: 'invalid' })
    })
    return () => { active = false }
  }, [code])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const join = async () => {
    if (!preview?.server_id || joining) return
    setJoining(true)
    const { data: server, error: joinError } = preview.is_member
      ? await supabase.from('servers').select('*').eq('id', preview.server_id).single()
      : await supabase.rpc('join_server_by_code', { invite: code })
    setJoining(false)
    if (joinError || !server) return setError(inviteErrorMessage(joinError))
    onJoined?.(server, voiceChannelId)
  }

  const status = preview?.status
  const usable = status === 'valid' || preview?.is_member

  return (
    <div data-ui-overlay-owner="InvitePreviewModal" className="premium-backdrop fixed inset-0 z-[210] flex items-end justify-center p-4 pb-[var(--dock-space)] md:items-center md:pb-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Server invite" className="ios-sheet relative w-full max-w-sm rounded-2xl p-6 text-center" onClick={event => event.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]" aria-label="Close">
          <X size={18} aria-hidden="true" />
        </button>
        {!preview && !error ? (
          <div className="py-8" aria-busy="true">
            <span className="skeleton mx-auto block h-16 w-16 rounded-2xl" />
            <span className="skeleton mx-auto mt-4 block h-4 w-40 rounded-full" />
          </div>
        ) : (
          <>
            <ServerIcon url={preview?.icon_url} name={preview?.server_name || '?'} className="server-list-icon mx-auto h-16 w-16 rounded-2xl text-lg" />
            <p className="mt-4 type-label text-[var(--text-muted)]">{voiceChannelName ? 'You were invited to talk in' : 'You were invited to join'}</p>
            <h2 className="mt-0.5 truncate type-title font-bold text-[var(--text-main)]">{preview?.server_name || 'Server invite'}</h2>
            {voiceChannelName && (
              <p className="mt-1 flex items-center justify-center gap-1 type-label text-[var(--text-main)]"><Volume2 size={14} aria-hidden="true" />{voiceChannelName}</p>
            )}
            {preview?.member_count != null && (
              <p className="mt-2 flex items-center justify-center gap-1 type-meta text-[var(--text-muted)]">
                <Users size={13} aria-hidden="true" />{preview.member_count} {preview.member_count === 1 ? 'member' : 'members'}
              </p>
            )}
            {(error || (!usable && STATUS_TEXT[status])) && (
              <p className="mt-4 type-label text-red-400" role="alert">{error || STATUS_TEXT[status]}</p>
            )}
            <button
              type="button"
              onClick={join}
              disabled={!usable || joining || Boolean(error)}
              className="mt-5 h-11 w-full rounded-lg bg-[var(--app-accent)] type-body font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {joining ? 'Joining…' : preview?.is_member ? (voiceChannelId ? 'Join voice' : 'Open server') : (voiceChannelId ? 'Join server and voice' : 'Join server')}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
