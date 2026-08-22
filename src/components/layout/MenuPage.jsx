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
import { useState } from 'react'
import { Bell, Copy, FileText, Lock, LogOut, Mic, Palette, Shield, User, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import StatusAvatar from '../ui/StatusAvatar'
import { safeMediaUrl } from '../../lib/security'
import { signOutAndReset } from '../../lib/signOut'

const STATUS_OPTIONS = [
  { id: 'online', label: 'Online', color: '#23a559' },
  { id: 'idle', label: 'Idle', color: '#f0b232' },
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

function renderStatusGlyph(option) {
  if (option.id === 'online') return <span className="h-3 w-3 rounded-full" style={{ backgroundColor: option.color }} aria-hidden="true" />
  if (option.id === 'idle') {
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
        <path d="M14.75 15.75A7 7 0 1 1 7.25 4.25a5.25 5.25 0 0 0 7.5 11.5Z" fill={option.color} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill={option.color} />
      <rect x="5.5" y="9" width="9" height="2" rx="1" fill="white" />
    </svg>
  )
}

/* One rule plus one label — the only thing separating sections now. */
function SectionHeader({ label }) {
  return (
    <h3 className="mt-5 border-t-2 border-[var(--border-hover)] pt-3 type-meta font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
      {label}
    </h3>
  )
}

export default function MenuPage(props) {
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const currentStatus = props.userStatus || 'online'
  const currentOption = STATUS_OPTIONS.find(option => option.id === currentStatus) || STATUS_OPTIONS[0]

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
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6" aria-label="Menu">
      <div className="h-24 rounded-2xl bg-cover bg-center" style={getBannerStyle()} aria-hidden="true" />
      <div className="-mt-10 mb-4 flex items-end gap-3">
        <button
          type="button"
          onClick={() => openSettings('account')}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          aria-label="Edit profile"
        >
          <StatusAvatar url={props.myAvatar} username={props.myUsername} status={currentStatus} className="h-24 w-24 rounded-full bg-[var(--bg-base)] ring-4 ring-[var(--bg-base)]" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display type-view-title font-bold leading-tight text-[var(--text-main)]">{props.myUsername}</h2>
            {/* Status is a glyph beside the name, not a row of its own: shape
                carries it, colour only reinforces it (design.md §6). */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setStatusPickerOpen(open => !open)}
                className="flex h-11 w-11 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--bg-element-hover)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                aria-label={`Status: ${currentOption.label}. Change status`}
                title={currentOption.label}
                aria-expanded={statusPickerOpen}
              >
                {renderStatusGlyph(currentOption)}
              </button>
              {statusPickerOpen && (
                <>
                  <button type="button" className="fixed inset-0 z-[60] cursor-default" onClick={() => setStatusPickerOpen(false)} aria-label="Close status picker" />
                  <div className="premium-menu absolute left-1/2 top-12 z-[70] w-48 -translate-x-1/2 rounded-xl py-1 animate-fade-in" role="group" aria-label="Set presence status">
                    {STATUS_OPTIONS.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => { props.setUserStatus?.(option.id); setStatusPickerOpen(false) }}
                        className={`flex min-h-11 w-full items-center gap-3 px-3 text-left type-body transition-colors hover:bg-[var(--bg-element)] ${currentStatus === option.id ? 'font-bold text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}
                        aria-pressed={currentStatus === option.id}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{renderStatusGlyph(option)}</span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {props.myPronouns && <span className="shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-0.5 type-meta text-[var(--text-muted)]">{props.myPronouns}</span>}
          </div>
          <p className="truncate font-mono type-label text-[var(--text-muted)]">{props.myTag}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => openSettings('account')} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--bg-element)] type-body font-bold text-[var(--text-main)] transition-colors hover:bg-[var(--bg-element-hover)]">
          <UserRound size={18} aria-hidden="true" />
          Profile
        </button>
        <button type="button" onClick={() => { navigator.clipboard.writeText(props.myTag); toast.success('User ID copied!') }} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--bg-element)] type-body font-bold text-[var(--text-main)] transition-colors hover:bg-[var(--bg-element-hover)]">
          <Copy size={18} aria-hidden="true" />
          Copy ID
        </button>
      </div>

      {SETTINGS_SECTIONS.map(section => (
        <section key={section.label}>
          <SectionHeader label={section.label} />
          {section.rows.map(({ tab, Icon, label }) => (
            <button
              key={tab}
              type="button"
              onClick={() => openSettings(tab)}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left type-body font-semibold text-[var(--text-main)] transition-colors hover:bg-[var(--bg-element-hover)]"
            >
              <Icon size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              {label}
            </button>
          ))}
        </section>
      ))}

      <section>
        <SectionHeader label="Session" />
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left type-body font-bold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-60"
        >
          <LogOut size={18} className="shrink-0" aria-hidden="true" />
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  )
}
