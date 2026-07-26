/** Owns friend lookup/request UI while Supabase policies authorize writes. */
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { ArrowRight, AtSign, Loader2, Search, ShieldCheck, UserCheck, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AddFriendView({ session }) {
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundUser, setFoundUser] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleSearch = async (event) => {
    event.preventDefault()
    const searchTag = tag.trim().replace(/\s*#\s*/g, '#')
    if (!searchTag) return setError('Enter a username or tag.')
    setLoading(true)
    setError('')
    setFoundUser(null)
    setSuccess(false)

    const { data, error: userError } = await supabase.rpc('search_profiles_for_friend', { search_query: searchTag })
    const targetUser = data?.[0] || null

    if (userError || !targetUser) {
      setError('No user matched that username or tag.')
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
    <section className="add-friend-page min-h-full bg-[var(--bg-base)] px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-8 md:px-8 md:pt-14">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-7">
          <span className="add-friend-mark mb-5 flex h-12 w-12 items-center justify-center rounded-2xl" aria-hidden="true">
            <UserPlus size={23} />
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--text-main)] md:text-4xl">Add someone</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Search with their exact username or tag.</p>
        </header>

        <form onSubmit={handleSearch} className="add-friend-search flex items-center gap-2 rounded-[1.4rem] p-2">
          <Search size={20} className="ml-2 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <label htmlFor="friend-lookup" className="sr-only">Username or tag</label>
          <input
            id="friend-lookup"
            type="text"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Username or name#0000"
            className="h-12 min-w-0 flex-1 bg-transparent px-1 text-[16px] font-medium text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] md:text-sm"
          />
          <button
            type="submit"
            disabled={loading || !tag.trim()}
            className="add-friend-search-button flex h-12 min-w-12 shrink-0 items-center justify-center rounded-2xl px-4 font-bold disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Search for user"
          >
            {loading && !foundUser ? <Loader2 size={19} className="animate-spin" /> : <ArrowRight size={20} />}
          </button>
        </form>

        <div className="mt-3 flex items-center gap-2 px-2 text-xs text-[var(--text-muted)]">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>Only they can accept your request.</span>
        </div>

        <div aria-live="polite" className="mt-7">
          {error && (
            <div className="add-friend-error rounded-2xl px-4 py-3 text-sm font-semibold text-red-300">
              {error}
            </div>
          )}

          {foundUser && (
            <article className="add-friend-result mt-3 rounded-[1.6rem] p-4 sm:p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1.15rem] bg-[var(--surface-container-highest)]">
                  {foundUser.avatar_url
                    ? <img src={foundUser.avatar_url} className="h-full w-full object-cover" alt="" />
                    : <span className="text-lg font-black uppercase text-[var(--text-main)]">{foundUser.username?.[0] || '?'}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-[var(--text-main)]">{foundUser.username}</h2>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-[var(--text-muted)]">
                    <AtSign size={13} aria-hidden="true" />
                    {foundUser.unique_tag}
                  </p>
                </div>
                {success && (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-300" aria-label="Request sent">
                    <UserCheck size={21} />
                  </span>
                )}
              </div>

              {!success && (
                <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFoundUser(null)
                      setError('')
                      setTag('')
                    }}
                    className="add-friend-secondary h-12 rounded-2xl px-4 text-sm font-bold"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleSendRequest}
                    disabled={loading}
                    className="add-friend-primary flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold disabled:opacity-50"
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
    </section>
  )
}
