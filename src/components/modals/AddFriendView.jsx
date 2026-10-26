/**
 * The Friends tab: friend lookup plus the full friends list. On phones the
 * lookup is portaled into the dock, which grows into an island around it; from
 * md up it pins to the top of the page — see design.md §5.
 * Supabase policies authorize the writes; this only presents them.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabaseClient'
import { ArrowRight, AtSign, Loader2, MessageSquare, Search, UserCheck, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import StatusAvatar from '../ui/StatusAvatar'
import { DOCK_ACCESSORY_ID } from '../layout/BottomBar'

const PHONE_QUERY = '(max-width: 767px)'
const subscribePhone = (onChange) => {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const isPhoneNow = () => window.matchMedia(PHONE_QUERY).matches

export default function AddFriendView({ session, allFriends = [], getPresenceLabel, getPresenceStatus, openDmContact, startingDmProfileId }) {
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [foundUser, setFoundUser] = useState(null)
  const [success, setSuccess] = useState(false)
  const isPhone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false)
  // The dock mounts after this view on first render, so its slot is looked up once committed.
  const [dockSlot, setDockSlot] = useState(null)
  useEffect(() => { setDockSlot(document.getElementById(DOCK_ACCESSORY_ID)) }, [])

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

  /* Phones: results stack above the input, inside the dock island. md+: a
     sticky bar at the top of the page. */
  const lookup = (
    <div className={isPhone ? 'flex flex-col-reverse gap-2 px-1 pt-1' : 'sticky top-0 z-20 -mx-6 mb-3 flex flex-col gap-3 bg-[var(--bg-base)] px-6 pb-2'}>
      <form onSubmit={handleSearch} className="add-friend-search flex items-center gap-2 rounded-[1.375rem] p-1.5 md:rounded-2xl">
        <Search size={20} className="ml-2 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        <label htmlFor="friend-lookup" className="sr-only">name#0000</label>
        <input
          id="friend-lookup"
          type="text"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name#0000"
          className="h-11 min-w-0 flex-1 bg-transparent px-1 type-body font-medium text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
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

      <div aria-live="polite" className="contents">
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
  )

  return (
    <section className="flex min-h-full flex-col bg-[var(--bg-base)] px-4 pb-[calc(var(--dock-clear)+var(--dock-island))] pt-4 md:px-6 md:pb-6 md:pt-6">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {/* Title lives in the app bar now; keep it for screen readers only. */}
        <h1 className="sr-only">Friends</h1>

        {!isPhone && lookup}

        <h2 className="mb-2 type-meta font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Friends {allFriends.length > 0 ? allFriends.length : ''}
        </h2>

        {allFriends.length === 0 ? (
          <p className="px-1 py-4 type-label text-[var(--text-muted)]">
            No friends yet. Search for someone by name#0000.
          </p>
        ) : (
          <div className="space-y-1">
            {allFriends.map((friend, index) => (
              <button
                key={friend.dm_room_id || friend.profiles?.id || `friend-${index}`}
                type="button"
                onClick={() => openDmContact?.(friend)}
                disabled={startingDmProfileId === friend.profiles?.id}
                className="dashboard-list-row flex min-h-16 w-full items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left transition-all disabled:opacity-50"
              >
                <StatusAvatar url={friend.profiles?.avatar_url} username={friend.profiles?.username} status={getPresenceStatus?.(friend.profiles?.id)} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <div className="truncate type-title font-semibold text-[var(--text-main)]">{friend.profiles?.username}</div>
                  <div className="truncate type-label text-[var(--text-muted)]">{getPresenceLabel?.(friend.profiles?.id) || 'Offline'}</div>
                </div>
                <MessageSquare size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

      </div>
      {isPhone && dockSlot && createPortal(lookup, dockSlot)}
    </section>
  )
}
