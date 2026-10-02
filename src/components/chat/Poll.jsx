/**
 * Channel polls: the card a poll message renders as, and the form that
 * creates one. Both talk to Supabase directly — create_poll and vote_poll do
 * the membership checks, and RLS gates the reads.
 */
import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { BarChart3, Check, Plus, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { debug } from '../../lib/debug'
import { POLL_MAX_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX, cleanPollDraft, nextPollChoice, tallyPoll } from '../../lib/polls'

/* ponytail: one realtime channel per visible poll card. Fine for a handful of
   polls on screen; move votes onto the room channel if a busy channel ever
   holds dozens. */
export function PollCard({ messageId, currentUserId, alignRight, children }) {
  const [poll, setPoll] = useState(undefined)
  const [votes, setVotes] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const loadVotes = () => supabase.from('poll_votes').select('profile_id, option_index').eq('message_id', messageId)
      .then(({ data, error }) => { if (active && !error) setVotes(data || []) })
    supabase.from('polls').select('question, options, allow_multiple').eq('message_id', messageId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) debug.warn('SUPABASE_ERROR', { operation: 'poll-load', code: error.code })
        setPoll(data || null)
        if (data) loadVotes()
      })
    const channel = supabase.channel(`poll:${messageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes', filter: `message_id=eq.${messageId}` }, loadVotes)
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [messageId])

  // Loading, or no polls row (undeployed table, or hand-typed 📊): plain message.
  if (!poll) return children

  const { counts, voters, mine } = tallyPoll(poll.options.length, votes, currentUserId)
  const total = counts.reduce((sum, count) => sum + count, 0)

  const vote = async (index) => {
    if (busy) return
    const picked = nextPollChoice(mine, index, poll.allow_multiple)
    setBusy(true)
    // Optimistic: swap this user's rows, the realtime refetch confirms.
    setVotes(current => [
      ...current.filter(row => row.profile_id !== currentUserId),
      ...picked.map(option_index => ({ profile_id: currentUserId, option_index }))
    ])
    const { error } = await supabase.rpc('vote_poll', { target_message_id: messageId, option_indexes: picked })
    setBusy(false)
    if (error) {
      toast.error(error.message || 'Could not vote')
      supabase.from('poll_votes').select('profile_id, option_index').eq('message_id', messageId)
        .then(({ data }) => setVotes(data || []))
    }
  }

  return (
    <div className={`w-[min(80vw,22rem)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left shadow-sm ${alignRight ? 'ml-auto' : 'mr-auto'}`}>
      <div className="mb-2 flex items-start gap-2">
        <BarChart3 size={16} className="mt-0.5 shrink-0 text-[var(--theme-base)]" aria-hidden="true" />
        <p className="type-body font-semibold text-[var(--text-main)] break-words">{poll.question}</p>
      </div>
      <div className="space-y-1.5" role={poll.allow_multiple ? 'group' : 'radiogroup'} aria-label={poll.question}>
        {poll.options.map((option, index) => {
          const picked = mine.has(index)
          const share = total ? Math.round((counts[index] / total) * 100) : 0
          return (
            <button
              key={index}
              type="button"
              role={poll.allow_multiple ? 'checkbox' : 'radio'}
              aria-checked={picked}
              onClick={(event) => { event.stopPropagation(); vote(index) }}
              className={`relative flex w-full items-center gap-2 overflow-hidden rounded-xl border px-3 py-2 text-left type-label transition-colors ${picked ? 'border-[var(--theme-base)] text-[var(--text-main)]' : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
            >
              <span className="absolute inset-y-0 left-0 bg-[var(--theme-20)] transition-[width] duration-300" style={{ width: `${share}%` }} aria-hidden="true" />
              <span className={`relative grid h-4 w-4 shrink-0 place-items-center border ${poll.allow_multiple ? 'rounded' : 'rounded-full'} ${picked ? 'border-[var(--theme-base)] bg-[var(--theme-base)] text-white' : 'border-[var(--text-muted)]'}`}>
                {picked && <Check size={11} aria-hidden="true" />}
              </span>
              <span className="relative min-w-0 flex-1 break-words">{option}</span>
              <span className="relative shrink-0 font-bold tabular-nums">{counts[index]}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 type-meta text-[var(--text-muted)]">
        {voters === 1 ? '1 voter' : `${voters} voters`}{poll.allow_multiple ? ' · multiple choice' : ''}
      </p>
    </div>
  )
}

export function PollComposer({ channelId, onClose }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const draft = cleanPollDraft(question, options)
    if (draft.error) return setError(draft.error)
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('create_poll', {
      target_channel_id: channelId,
      poll_question: draft.question,
      poll_options: draft.options,
      poll_allow_multiple: allowMultiple
    })
    setBusy(false)
    if (rpcError) return setError(rpcError.message || 'Could not create the poll')
    onClose()
  }

  const inputClass = 'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-element)] px-3 py-2 type-body text-[var(--text-main)] outline-none focus:border-[var(--theme-base)]'

  return (
    <div data-ui-overlay-owner="ChatArea:poll-composer" role="dialog" aria-modal="true" aria-label="Create a poll" className="premium-backdrop fixed inset-0 z-[200] flex items-end justify-center p-4 md:items-center" onClick={onClose}>
      <form onSubmit={submit} onClick={event => event.stopPropagation()} className="premium-modal w-full max-w-sm rounded-2xl p-5 animate-settings-sheet">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="type-title font-semibold text-[var(--text-main)]">Create a poll</h3>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-label="Close"><X size={18} /></button>
        </div>
        <input autoFocus value={question} onChange={event => setQuestion(event.target.value)} maxLength={POLL_QUESTION_MAX} placeholder="Ask a question" aria-label="Question" className={inputClass} />
        <div className="mt-3 max-h-[40dvh] space-y-2 overflow-y-auto">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={option}
                onChange={event => setOptions(current => current.map((value, i) => (i === index ? event.target.value : value)))}
                maxLength={POLL_OPTION_MAX}
                placeholder={`Option ${index + 1}`}
                aria-label={`Option ${index + 1}`}
                className={inputClass}
              />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions(current => current.filter((_, i) => i !== index))} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:text-red-400" aria-label={`Remove option ${index + 1}`}><X size={16} /></button>
              )}
            </div>
          ))}
        </div>
        {options.length < POLL_MAX_OPTIONS && (
          <button type="button" onClick={() => setOptions(current => [...current, ''])} className="mt-2 flex items-center gap-1.5 type-label font-bold text-[var(--theme-base)]"><Plus size={15} aria-hidden="true" /> Add option</button>
        )}
        <label className="mt-4 flex items-center gap-2 type-label text-[var(--text-main)]">
          <input type="checkbox" checked={allowMultiple} onChange={event => setAllowMultiple(event.target.checked)} />
          Allow multiple answers
        </label>
        {error && <p role="alert" className="mt-3 type-label text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="mt-4 h-11 w-full rounded-xl bg-[var(--app-accent)] type-body font-bold text-white disabled:opacity-50">{busy ? 'Posting…' : 'Post poll'}</button>
      </form>
    </div>
  )
}
