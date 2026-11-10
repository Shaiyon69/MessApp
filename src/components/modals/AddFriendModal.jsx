/**
 * Add friend: a name#0000 lookup in a dialog shaped like the quick switcher.
 * The friends themselves live in the Chats list and the quick switcher.
 * Supabase policies authorize the writes; this only presents them.
 */
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { ArrowRight, AtSign, Loader2, UserCheck, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AddFriendModal({ session, onClose }) {
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundUser, setFoundUser] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleSearch = async (event) => {
    event.preventDefault()
    const searchTag = tag.trim().replace(/\s*#\s*/g, '#')
    if (!searchTag) return setError('Enter a name#0000.')
    setLoading(true)
    setError('')
    setFoundUser(null)
    setSuccess(false)

    const { data, error: userError } = await supabase.rpc('search_profiles_for_friend', { search_query: searchTag })
    const targetUser = data?.[0] || null

    if (userError || !targetUser) {
      setError('No user matched that name#0000.')
      setLoading(false)
      return
    }
    if (targetUser.id === session.user.id) {
      setError('You cannot add yourself.')
      setLoading(false)
      return
    }
    setFoundUser(targetUser)
    setTag(searchTag)
    setLoading(false)
  }

  const handleSendRequest = async () => {
    setLoading(true)
    setError('')
    const { error: requestError } = await supabase.from('friendships').insert([{
      sender_id: session.user.id,
      receiver_id: foundUser.id,
      status: 'pending'
    }])

    if (requestError) {
      setError(requestError.code === '23505' ? 'A request already exists.' : 'Could not send the request.')
      setLoading(false)
      return
    }
    setSuccess(true)
    setLoading(false)
    toast.success('Friend request sent')
  }

  return (
    <div data-ui-overlay-owner="Dashboard:add-friend" className="premium-backdrop fixed inset-0 z-[200] flex items-center justify-center animate-fade-in px-4 py-[max(1rem,env(safe-area-inset-top))]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add friend" className="premium-modal menu-glass w-full max-w-md sm:max-w-xl rounded-2xl flex flex-col overflow-hidden animate-quick-switch" onClick={e => e.stopPropagation()}>
      <form onSubmit={handleSearch} className="relative z-10 px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3 sm:gap-4 bg-[var(--surface-strong)] border-b border-[var(--border-subtle)]">
        <UserPlus size={22} className="text-indigo-400 shrink-0" aria-hidden="true" />
        <label htmlFor="friend-lookup" className="sr-only">name#0000</label>
        <input
          id="friend-lookup"
          type="text"
          autoFocus
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Add a friend by name#0000"
          className="w-full min-w-0 flex-1 bg-transparent text-[var(--text-main)] outline-none type-view-title font-display placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={loading || !tag.trim()}
          className="add-friend-search-button flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-3.5 font-bold disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Search for user"
        >
          {loading && !foundUser ? <Loader2 size={19} className="animate-spin" /> : <ArrowRight size={20} />}
        </button>
      </form>

      <div aria-live="polite" className="relative z-10 flex flex-col gap-2 p-2 sm:p-3 empty:hidden">
        {error && (
          <div className="add-friend-error rounded-[1.375rem] md:rounded-2xl px-4 py-2.5 type-body font-semibold text-red-300">
            {error}
          </div>
        )}

        {foundUser && (
          <article className="add-friend-result rounded-[1.375rem] md:rounded-2xl p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-container-highest)]">
                {foundUser.avatar_url
                  ? <img src={foundUser.avatar_url} className="h-full w-full object-cover" alt="" />
                  : <span className="type-body font-black uppercase text-[var(--text-main)]">{foundUser.username?.[0] || '?'}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate type-body font-bold text-[var(--text-main)]">{foundUser.username}</h2>
                <p className="mt-0.5 flex items-center gap-1 truncate type-label font-semibold text-[var(--text-muted)]">
                  <AtSign size={13} aria-hidden="true" />
                  {foundUser.unique_tag}
                </p>
              </div>
              {success && (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-300" aria-label="Request sent">
                  <UserCheck size={18} />
                </span>
              )}
            </div>

            {!success && (
              <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFoundUser(null)
                    setError('')
                    setTag('')
                  }}
                  className="add-friend-secondary h-10 rounded-xl px-4 type-body font-bold"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleSendRequest}
                  disabled={loading}
                  className="add-friend-primary flex h-10 items-center justify-center gap-2 rounded-xl px-4 type-body font-bold disabled:opacity-50"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                  Send request
                </button>
              </div>
            )}
          </article>
        )}
      </div>
      </div>
    </div>
  )
}
