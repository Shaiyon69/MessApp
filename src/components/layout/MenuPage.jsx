/**
 * The MENU tab: profile, presence status, and every settings entry point.
 * Replaces the old LeftSidebar profile popout and footer, which were the only
 * ways to reach settings or change status. It is a bottom-bar destination like
 * Chats or Servers, not an overlay — the hamburger switches tabs, it does not
 * open a sheet.
 *
 * Rows carry no outline of their own: sections are separated by a rule under a
 * category header, so the page reads as one surface instead of a stack of boxes.
 */
import { lazy, Suspense, useRef, useState } from 'react'
import { Bell, Check, ChevronRight, FileText, Lock, LogOut, Mic, Palette, Shield, Smile, User } from 'lucide-react'
import toast from 'react-hot-toast'
import StatusAvatar from '../ui/StatusAvatar'
import ConfirmDialog from '../ui/ConfirmDialog'
import SettingsGroup, { GroupItem } from '../ui/SettingsGroup'
import { safeMediaUrl } from '../../lib/security'
import { signOutAndReset } from '../../lib/signOut'
import { STATUS_NOTE_MAX, activeStatusNote, cleanStatusNote, splitStatusEmoji } from '../../lib/statusNote'

const ChatEmojiPicker = lazy(() => import('../chat/ChatEmojiPicker'))

// Left-to-right order of the swipe dots under the avatar.
const STATUS_OPTIONS = [
  { id: 'idle', label: 'Idle', color: '#f0b232' },
  { id: 'online', label: 'Online', color: '#23a559' },
  { id: 'dnd', label: 'Do Not Disturb', color: '#f23f43' }
]

/* Mirrors the tab ids in UserSettings so each row opens straight to its pane. */
const SETTINGS_SECTIONS = [
  {
    label: 'Account',
    rows: [
      { tab: 'account', Icon: User, label: 'Account' },
      { tab: 'privacy', Icon: Lock, label: 'Privacy' },
      { tab: 'security', Icon: Shield, label: 'Security' }
    ]
  },
  {
    label: 'App',
    rows: [
      { tab: 'appearance', Icon: Palette, label: 'Appearance' },
      { tab: 'voice', Icon: Mic, label: 'Voice & Video' },
      { tab: 'notifications', Icon: Bell, label: 'Notifications' }
    ]
  },
  {
    label: 'About',
    rows: [
      { tab: 'legal', Icon: FileText, label: 'Legal' }
    ]
  }
]

export default function MenuPage(props) {
  const [presenceHover, setPresenceHover] = useState(null)
  const avatarRef = useRef(null)
  const swipedRef = useRef(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [noteDraft, setNoteDraft] = useState(null)
  const [noteEmoji, setNoteEmoji] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const statusText = activeStatusNote(props.statusNote)

  const openNoteEditor = () => {
    const { emoji, text } = splitStatusEmoji(statusText)
    setNoteEmoji(emoji)
    setNoteDraft(text)
  }

  const closeNoteEditor = () => {
    setEmojiOpen(false)
    setNoteDraft(null)
  }

  const saveStatusNote = (event) => {
    event.preventDefault()
    const text = cleanStatusNote([noteEmoji, noteDraft.trim()].filter(Boolean).join(' '))
    props.setStatusNote?.(text ? { text, expiresAt: null } : null)
    closeNoteEditor()
  }

  const currentStatus = props.userStatus || 'online'
  const currentOption = STATUS_OPTIONS.find(option => option.id === currentStatus) || STATUS_OPTIONS[1]
  const shownOption = STATUS_OPTIONS.find(option => option.id === presenceHover) || currentOption

  /* The avatar (and the dots row, which is the same width) is split into
     thirds: idle, online, dnd. x past either edge clamps to the end option so
     a long swipe still lands; a release well above the avatar or below the
     dots picks nothing. */
  const optionAt = (x, y) => {
    const rect = avatarRef.current?.getBoundingClientRect()
    if (!rect || y < rect.top - 48 || y > rect.bottom + 72) return null
    const index = Math.floor((x - rect.left) / rect.width * STATUS_OPTIONS.length)
    return STATUS_OPTIONS[Math.max(0, Math.min(STATUS_OPTIONS.length - 1, index))]
  }

  const pickStatus = (id) => {
    if (id) props.setUserStatus?.(id)
    setPresenceHover(null)
  }

  /* Hold the avatar or the dots and swipe sideways: the long dot follows,
     release commits. Window listeners so the swipe keeps tracking after it
     leaves the avatar. A swipe swallows the click that follows it, so the
     avatar's tap-to-edit-profile only fires on a plain tap. */
  const startPresenceSwipe = (event) => {
    if (event.button !== 0) return
    const startX = event.clientX
    const startY = event.clientY
    let moved = false
    swipedRef.current = false
    const onMove = (moveEvent) => {
      if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= 6) return
      moved = true
      swipedRef.current = true
      setPresenceHover(optionAt(moveEvent.clientX, moveEvent.clientY)?.id ?? null)
    }
    const onUp = (upEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (moved) pickStatus(upEvent.type === 'pointerup' ? optionAt(upEvent.clientX, upEvent.clientY)?.id : null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const afterSwipe = (action) => () => {
    if (swipedRef.current) {
      swipedRef.current = false
      return
    }
    action()
  }

  const openSettings = (tab) => {
    props.setSettingsModalConfig({ isOpen: true, tab })
  }

  const getBannerStyle = () => {
    const banner = props.myBanner
    const fallback = { backgroundImage: 'none', backgroundColor: 'var(--app-accent)' }
    if (!banner) return fallback
    const safeBannerUrl = safeMediaUrl(banner)
    if (safeBannerUrl) return { backgroundImage: `url(${safeBannerUrl})`, backgroundColor: 'transparent' }
    if (/^#[0-9a-f]{3,8}$/i.test(banner) || (/^linear-gradient\(/i.test(banner) && !/url\(/i.test(banner))) {
      return { background: banner }
    }
    return fallback
  }

  const handleSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      await signOutAndReset({ profileId: props.session.user.id })
    } catch (error) {
      setIsSigningOut(false)
      toast.error('Failed to log out: ' + (error?.message || 'unknown error'))
    }
  }

  return (
    <div className="menu-page mx-auto w-full max-w-3xl p-4 pb-[var(--dock-clear)] md:p-6" aria-label="Menu">
      <div className="h-28 rounded-2xl bg-cover bg-center md:h-32" style={getBannerStyle()} aria-hidden="true" />
      {/* menu-glass: refractive like the dock under Liquid Glass (glass.css
          exempts it from flattening), OLED black with a hairline otherwise. */}
      {/* Avatar on the left, overlapping the banner, with the presence dots
          under it. Name, pronouns and custom status share the row to its right. */}
      <div className="flex gap-3 px-1">
        <div className="-mt-10 flex shrink-0 flex-col items-center gap-1.5 self-start">
          <button
            ref={avatarRef}
            type="button"
            onPointerDown={startPresenceSwipe}
            onClick={afterSwipe(() => openSettings('account'))}
            className="touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
            aria-label="Edit profile. Hold and swipe sideways to change status"
          >
            {/* The avatar ring previews the status under the swipe before it commits. */}
            {/* No frame, but the padding and transparent border keep it as wide as the dots row. */}
            <span className="block rounded-full border border-transparent p-1">
              <StatusAvatar url={props.myAvatar} username={props.myUsername} status={shownOption.id} className="h-20 w-20 rounded-full bg-[var(--bg-base)]" />
            </span>
          </button>
          {/* Idle, online, dnd left to right; the selected dot stretches. Same
              width as the avatar frame so both map x to the same thirds. */}
          <div
            onPointerDown={startPresenceSwipe}
            className="menu-glass glass-surface border border-[var(--border-subtle)] bg-[var(--surface-container-high)] flex h-6 w-[5.625rem] touch-none select-none items-center rounded-full px-1"
            role="group"
            aria-label={`Status: ${shownOption.label}`}
          >
            {STATUS_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={afterSwipe(() => pickStatus(option.id))}
                className="flex h-full flex-1 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-accent)]"
                aria-label={option.label}
                aria-pressed={currentStatus === option.id}
              >
                <span
                  className={`h-2 rounded-full transition-[width,opacity] duration-300 ease-[var(--m3-emphasized)] ${option === shownOption ? 'w-5' : 'w-2 opacity-50'}`}
                  style={{ backgroundColor: option.color }}
                />
              </button>
            ))}
          </div>
        </div>
        {/* Name and tag stack beside the note pill, so the block is about as tall as the avatar's lower half. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 pt-1.5">
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 title={props.myUsername} className="min-w-0 truncate font-display type-title font-bold leading-tight text-[var(--text-main)]">{props.myUsername}</h2>
              {props.myPronouns && <span className="shrink-0 type-label text-[var(--text-muted)]">{props.myPronouns}</span>}
            </div>
            {/* Tapping the tag copies it; the separate Copy ID button is gone. */}
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(props.myTag); toast.success('User ID copied!') }}
              className="max-w-full truncate rounded font-mono type-label text-[var(--text-muted)] outline-none hover:text-[var(--text-main)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
              title="Copy user ID"
            >
              {props.myTag}
            </button>
          </div>

        {noteDraft !== null && <button type="button" className="fixed inset-0 z-[60] cursor-default" onClick={closeNoteEditor} aria-label="Cancel custom status" />}
        <div className={`menu-glass glass-surface border border-[var(--border-subtle)] bg-[var(--surface-container-high)] relative h-11 min-w-[9rem] flex-1 rounded-full ${noteDraft !== null ? 'z-[70]' : ''}`}>
          {noteDraft === null ? (
            <button
              key="closed"
              type="button"
              onClick={openNoteEditor}
              title={statusText || undefined}
              className={`h-full w-full animate-fade-in truncate rounded-full px-4 text-left type-label outline-none transition-colors hover:bg-[var(--state-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-accent)] ${statusText ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}
            >
              {statusText || 'Set Status'}
            </button>
          ) : (
            <form
              key="open"
              onSubmit={saveStatusNote}
              onKeyDown={event => { if (event.key === 'Escape') emojiOpen ? setEmojiOpen(false) : closeNoteEditor() }}
              className="flex h-full animate-fade-in items-center gap-1 px-1"
            >
              <button
                type="button"
                onClick={() => setEmojiOpen(open => !open)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-[var(--text-muted)] outline-none hover:bg-[var(--state-hover)] hover:text-[var(--text-main)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                aria-label={noteEmoji ? `Status emoji ${noteEmoji}. Change emoji` : 'Pick a status emoji'}
                aria-expanded={emojiOpen}
              >
                {noteEmoji || <Smile size={18} aria-hidden="true" />}
              </button>
              <input
                autoFocus
                value={noteDraft}
                onChange={event => setNoteDraft(event.target.value)}
                maxLength={STATUS_NOTE_MAX - (noteEmoji ? noteEmoji.length + 1 : 0)}
                placeholder="What's up?"
                aria-label="Custom status"
                className="h-full min-w-0 flex-1 bg-transparent px-1 type-label text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
              />
              <button type="submit" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent)] text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-main)]" aria-label="Save status"><Check size={18} aria-hidden="true" /></button>
              {emojiOpen && (
                <>
                  <button type="button" className="fixed inset-0 z-[10] cursor-default" onClick={() => setEmojiOpen(false)} aria-label="Close emoji picker" />
                  <div className="absolute right-0 top-full z-[20] mt-2 flex h-[360px] w-[min(350px,calc(100vw-2rem))] border border-[var(--border-subtle)] bg-[var(--surface-container-high)] flex-col overflow-hidden rounded-xl text-left animate-fade-in">
                    {noteEmoji && (
                      <button type="button" onClick={() => { setNoteEmoji(''); setEmojiOpen(false) }} className="min-h-11 shrink-0 px-3 text-left type-label text-[var(--text-muted)] hover:text-[var(--text-main)]">No emoji</button>
                    )}
                    <div className="min-h-0 flex-1">
                      <Suspense fallback={<div className="h-full w-full" />}>
                        <ChatEmojiPicker width="100%" height="100%" onEmojiClick={emojiData => { setNoteEmoji(emojiData.emoji); setEmojiOpen(false) }} />
                      </Suspense>
                    </div>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
        </div>
      </div>

      {SETTINGS_SECTIONS.map(section => (
        <SettingsGroup key={section.label} title={section.label} className={section === SETTINGS_SECTIONS[0] ? 'mt-4' : 'mt-6'}>
          {section.rows.map(({ tab, Icon, label }) => (
            <GroupItem key={tab} icon={Icon} title={label} onClick={() => openSettings(tab)} trailing={<ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />} />
          ))}
        </SettingsGroup>
      ))}

      <SettingsGroup title="Session" className="mt-6">
        <GroupItem onClick={() => setConfirmSignOut(true)} disabled={isSigningOut} className="disabled:opacity-60">
          <span className="tonal-icon bg-red-500/10 text-red-400" aria-hidden="true"><LogOut size={20} /></span>
          <span className="type-body font-bold text-red-400">{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
        </GroupItem>
      </SettingsGroup>

      {confirmSignOut && (
        <ConfirmDialog
          owner="MenuPage:signout-confirm"
          icon={LogOut}
          title="Ready to leave?"
          body="Are you sure you want to log out of MessApp?"
          confirmLabel={isSigningOut ? 'Signing out…' : 'Yes, Log Out'}
          busy={isSigningOut}
          onConfirm={handleSignOut}
          onCancel={() => setConfirmSignOut(false)}
        />
      )}
    </div>
  )
}
