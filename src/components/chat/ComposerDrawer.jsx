/**
 * Half-height drawer under the composer with two tabs: emoji and message
 * effects. It sits in normal flow below the message bar, so opening it pushes
 * the bar and the thread up instead of covering them.
 */
import React, { Suspense, lazy } from 'react'
import { SmilePlus, Sparkles, Check } from 'lucide-react'
import { BUBBLE_EFFECTS, LETTER_EFFECTS, SCREEN_EFFECTS, SCREEN_EFFECT_EVENT, WORD_EFFECTS } from '../../lib/messageEffects'

const ChatEmojiPicker = lazy(() => import('./ChatEmojiPicker'))

const TABS = [
  { id: 'emoji', label: 'Emoji', Icon: SmilePlus },
  { id: 'effects', label: 'Effects', Icon: Sparkles }
]

// The chip label animates with the same classes a received message uses.
const WordEffectPreview = ({ effect }) => (
  <span className={`fx fx-${effect}`} aria-hidden="true">
    {LETTER_EFFECTS.has(effect)
      ? Array.from(effect, (letter, i) => <span key={i} style={{ '--i': i }}>{letter}</span>)
      : effect}
  </span>
)

const SectionTitle = ({ children, hint }) => (
  <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
    <p className="type-meta font-bold uppercase tracking-widest text-[var(--text-muted)]">{children}</p>
    {hint && <p className="truncate type-meta text-[var(--text-subtle,var(--text-muted))]">{hint}</p>}
  </div>
)

export default function ComposerDrawer({
  tab,
  onTabChange,
  onEmojiSelect,
  onWordEffect,
  composerEffect,
  onComposerEffect,
  sendEffectsDisabled = false
}) {
  const chipBase = 'min-h-11 rounded-xl px-2 py-2 text-center type-label font-bold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-base)]'
  const chipIdle = 'bg-[var(--bg-element)] text-[var(--text-main)] hover:bg-[var(--bg-element-hover)]'
  const chipOn = 'bg-[var(--theme-20)] text-[var(--theme-base)] ring-1 ring-inset ring-[var(--theme-base)]'

  const pickSendEffect = (effect) => {
    const next = composerEffect === effect ? null : effect
    onComposerEffect(next)
    // Show what a screen effect looks like the moment it is picked.
    if (next && SCREEN_EFFECTS.includes(next)) window.dispatchEvent(new CustomEvent(SCREEN_EFFECT_EVENT, { detail: next }))
  }

  return (
    <div
      className="composer-drawer mt-2 flex h-[45dvh] max-h-[26rem] min-h-[16rem] flex-col overflow-hidden rounded-2xl border border-[var(--chat-border,var(--border-subtle))] bg-[var(--chat-bg-surface,var(--bg-surface))] animate-slide-up"
      data-no-long-press
    >
      <div className="flex shrink-0 gap-1 border-b border-[var(--chat-border,var(--border-subtle))] p-1.5" role="tablist" aria-label="Emoji and effects">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`composer-drawer-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`composer-drawer-panel-${id}`}
            onClick={() => onTabChange(id)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl type-label font-bold transition-colors ${tab === id ? 'bg-[var(--bg-element)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'emoji' && (
        <div id="composer-drawer-panel-emoji" role="tabpanel" aria-labelledby="composer-drawer-tab-emoji" className="min-h-0 flex-1">
          <Suspense fallback={<div className="h-full w-full" />}>
            <ChatEmojiPicker
              width="100%"
              height="100%"
              searchDisabled={false}
              onEmojiClick={onEmojiSelect}
              style={{ border: 'none', borderRadius: 0, background: 'transparent' }}
            />
          </Suspense>
        </div>
      )}

      {tab === 'effects' && (
        <div id="composer-drawer-panel-effects" role="tabpanel" aria-labelledby="composer-drawer-tab-effects" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 custom-scrollbar">
          <section aria-label="Text effects">
            <SectionTitle hint="Sends selected words, or the whole message, with it">Text</SectionTitle>
            <div className="grid grid-cols-4 gap-1.5">
              {WORD_EFFECTS.map(effect => (
                <button
                  key={effect}
                  type="button"
                  onClick={() => onWordEffect(effect)}
                  className={`${chipBase} ${chipIdle}`}
                  aria-label={`Send with ${effect} effect`}
                >
                  <WordEffectPreview effect={effect} />
                </button>
              ))}
            </div>
          </section>

          {[
            ['Bubble', BUBBLE_EFFECTS, 'Plays on the next message'],
            ['Screen', SCREEN_EFFECTS, 'Fills the chat for everyone']
          ].map(([title, effects, hint]) => (
            <section key={title} aria-label={`${title} effects`}>
              <SectionTitle hint={hint}>{title}</SectionTitle>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`${title} effect`}>
                {effects.map(effect => {
                  const selected = composerEffect === effect
                  return (
                    <button
                      key={effect}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={sendEffectsDisabled}
                      onClick={() => pickSendEffect(effect)}
                      className={`${chipBase} ${selected ? chipOn : chipIdle} flex items-center justify-center gap-1.5 disabled:opacity-40`}
                    >
                      {selected && <Check size={14} aria-hidden="true" />}
                      {effect}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {sendEffectsDisabled && <p className="px-1 type-meta text-[var(--text-muted)]">Bubble and screen effects can't be added while editing.</p>}
        </div>
      )}
    </div>
  )
}
