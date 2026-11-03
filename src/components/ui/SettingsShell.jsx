/**
 * Full-screen settings, Discord-style: grouped section list on the left, the
 * page on the right, a round close button with "ESC" under it, and an
 * unsaved-changes bar that holds the page until Reset or Save. On phones the
 * section list is its own screen and a page opens over it with a back button.
 *
 * `groups`: [{ heading?, items: [{ id, label, danger?, onSelect? }] }]. An item
 * with onSelect is an action (delete, leave) rather than a page.
 * `unsaved`: { saving, onReset, onSave } while the page has a draft, else null.
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, X } from 'lucide-react'

export default function SettingsShell({ owner, label, title, groups, section, onSection, unsaved = null, onClose, children }) {
  const [pageOpen, setPageOpen] = useState(false)
  const barRef = useRef(null)

  // Leaving with a draft shakes the bar instead, like Discord.
  const guarded = (action) => () => {
    if (!unsaved) return action()
    barRef.current?.animate?.(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
      { duration: 260 }
    )
  }
  const close = guarded(onClose)

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pick = item => guarded(() => {
    if (item.onSelect) return item.onSelect()
    onSection(item.id)
    setPageOpen(true)
  })

  return (
    <div data-ui-overlay-owner={owner} role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[150] flex bg-[var(--bg-base)] pt-[env(safe-area-inset-top)]">
      <nav aria-label={`${label} sections`} className={`${pageOpen ? 'hidden' : 'flex'} min-h-0 w-full flex-col overflow-y-auto custom-scrollbar bg-[var(--surface-container)] md:flex md:w-[clamp(14rem,30vw,22rem)] md:shrink-0 md:items-end`}>
        <div className="w-full px-3 py-4 md:w-56 md:px-2 md:pt-14">
          <div className="mb-2 flex items-center gap-2 px-2.5">
            <p className="min-w-0 flex-1 truncate type-meta font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">{title}</p>
            <button type="button" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)] md:hidden" aria-label="Close settings">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {groups.map((group, index) => (
            <div key={group.heading || index} className={index ? 'mt-2 border-t border-[var(--border-subtle)] pt-2' : ''}>
              {group.heading && <p className="px-2.5 pb-1 pt-2 type-meta font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">{group.heading}</p>}
              {group.items.filter(Boolean).map(item => (
                <button key={item.id} type="button" onClick={pick(item)} aria-current={section === item.id ? 'page' : undefined}
                  className={`flex min-h-11 w-full items-center rounded-md px-2.5 text-left type-body transition-colors md:min-h-8 ${item.danger
                    ? 'text-red-400 hover:bg-red-500/10'
                    : section === item.id
                      ? 'bg-[var(--state-pressed)] font-semibold text-[var(--text-main)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]'}`}>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <main className={`${pageOpen ? 'flex' : 'hidden'} relative min-h-0 min-w-0 flex-1 flex-col md:flex`}>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[46rem] px-4 pb-32 pt-3 md:px-10 md:pt-14">
            <button type="button" onClick={guarded(() => setPageOpen(false))} className="mb-3 flex h-10 items-center gap-1 rounded-lg pr-3 type-body font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] md:hidden">
              <ChevronLeft size={18} aria-hidden="true" />{title}
            </button>
            {children}
          </div>
        </div>
        <div className="absolute right-6 top-14 hidden flex-col items-center gap-1 md:flex lg:right-10">
          <button type="button" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--border-hover)] text-[var(--text-muted)] hover:bg-[var(--state-hover)] hover:text-[var(--text-main)]" aria-label="Close settings">
            <X size={18} aria-hidden="true" />
          </button>
          <span className="type-meta font-bold text-[var(--text-muted)]" aria-hidden="true">ESC</span>
        </div>
        {unsaved && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div ref={barRef} role="status" className="ios-sheet pointer-events-auto flex w-full max-w-[44rem] flex-wrap items-center gap-3 rounded-xl px-4 py-2.5 shadow-2xl">
              <p className="min-w-0 flex-1 type-body font-semibold text-[var(--text-main)]">Careful, you have unsaved changes!</p>
              <button type="button" onClick={unsaved.onReset} disabled={unsaved.saving} className="h-9 rounded-lg px-3 type-label font-semibold text-[var(--text-main)] hover:underline disabled:opacity-50">Reset</button>
              <button type="button" onClick={unsaved.onSave} disabled={unsaved.saving} className="h-9 rounded-lg bg-green-600 px-4 type-label font-semibold text-white hover:bg-green-700 disabled:opacity-60">{unsaved.saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export function PageTitle({ children, subtitle }) {
  return (
    <header className="mb-5">
      <h2 className="type-title font-bold text-[var(--text-main)]">{children}</h2>
      {subtitle && <p className="mt-1 type-label text-[var(--text-muted)]">{subtitle}</p>}
    </header>
  )
}

export function FieldLabel({ children, htmlFor }) {
  return <label htmlFor={htmlFor} className="mb-2 block type-meta font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">{children}</label>
}
