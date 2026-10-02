/**
 * A server message's thread: the root on top, its replies, and a composer.
 * Replies are ordinary channel messages with thread_root_id set, so RLS,
 * timeouts and push already apply; useChatManager hides them from the channel.
 *
 * ponytail: replies are plain text — no attachments, reactions, edits or
 * markdown here yet. Reuse MemoizedMessage if threads earn that.
 */
import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Send, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import StatusAvatar from '../ui/StatusAvatar'
import { formatMessageTime } from '../../lib/messageTime'
import { stripEffects } from '../../lib/messageEffects'
import { mergeThreadReplies } from '../../lib/threads'

const REPLY_SELECT = 'id, profile_id, content, created_at, is_deleted, profiles!fk_messages_profile(username, avatar_url)'

const Row = ({ message }) => (
  <div className="flex gap-3 py-2">
    <StatusAvatar url={message.profiles?.avatar_url} username={message.profiles?.username} showStatus={false} className="h-8 w-8 shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <span className="truncate type-label font-bold text-[var(--text-main)]">{message.profiles?.username || 'Unknown user'}</span>
        <span className="shrink-0 type-meta text-[var(--text-muted)]">{formatMessageTime(message.created_at)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words type-body text-[var(--text-main)]">
        {message.is_deleted ? <span className="italic text-[var(--text-muted)]">This message was unsent.</span> : stripEffects(message.content)}
      </p>
    </div>
  </div>
)

export default function ThreadPanel({ root, channelId, currentUserId, onClose }) {
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const rootId = root?.id

  useEffect(() => {
    if (!rootId) return undefined
    let active = true
    setLoading(true)
    setReplies([])
    supabase.from('messages').select(REPLY_SELECT).eq('thread_root_id', rootId).order('created_at', { ascending: true }).limit(200)
      .then(({ data, error }) => {
        if (!active) return
        if (error) toast.error('Could not load the thread')
        setReplies(current => mergeThreadReplies(current, data || []))
        setLoading(false)
      })
    // Realtime rows arrive without the profile join; refetch that one row.
    const channel = supabase.channel(`thread:${rootId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `thread_root_id=eq.${rootId}` }, (payload) => {
        const id = payload.new?.id || payload.old?.id
        if (!id) return
        supabase.from('messages').select(REPLY_SELECT).eq('id', id).maybeSingle()
          .then(({ data }) => { if (active && data) setReplies(current => mergeThreadReplies(current, [data])) })
      })
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [rootId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [replies.length])

  const send = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id: channelId, profile_id: currentUserId, content, thread_root_id: rootId })
      .select(REPLY_SELECT)
      .single()
    setSending(false)
    if (error) return toast.error(error.message || 'Could not send')
    setDraft('')
    setReplies(current => mergeThreadReplies(current, [data]))
  }

  return (
    <aside data-ui-overlay-owner="ChatArea:thread" aria-label="Thread" className="fixed inset-0 z-[150] flex flex-col bg-[var(--bg-base)] md:inset-y-0 md:left-auto md:right-0 md:w-[24rem] md:border-l md:border-[var(--border-subtle)] md:shadow-2xl">
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
        <h2 className="type-title font-bold text-[var(--text-main)]">Thread</h2>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-label="Close thread"><X size={18} /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
        {root ? <div className="border-b border-[var(--border-subtle)] pb-2"><Row message={root} /></div> : <p className="py-4 type-body text-[var(--text-muted)]">The original message is no longer loaded.</p>}
        {loading && <p className="py-3 type-label text-[var(--text-muted)]">Loading replies…</p>}
        {!loading && replies.length === 0 && <p className="py-3 type-label text-[var(--text-muted)]">No replies yet.</p>}
        {replies.map(reply => <Row key={reply.id} message={reply} />)}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-[var(--border-subtle)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event) }}
          rows={1}
          placeholder="Reply in thread"
          aria-label="Reply in thread"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl bg-[var(--bg-element)] px-4 py-2.5 type-body text-[var(--text-main)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]"
        />
        <button type="submit" disabled={!draft.trim() || sending} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--app-accent)] text-white disabled:opacity-40" aria-label="Send reply"><Send size={18} /></button>
      </form>
    </aside>
  )
}
