/** Shared shell, field, message and submit button for the signed-out auth screens. */
import { Children, useEffect, useId, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

/** Seconds left before a resend is allowed again; call `start()` after a send. */
export function useCooldown(seconds = 30) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (remaining <= 0) return undefined
    const timer = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining])
  return [remaining, () => setRemaining(seconds)]
}

export function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="w-full max-w-md px-6 py-8 md:rounded-3xl md:border md:border-[var(--border-subtle)] md:px-10 md:py-10 text-[var(--text-main)]">
      <div className="flex items-center gap-3 mb-8">
        <div className="messapp-auth-logo flex h-10 w-10 items-center justify-center rounded-xl" aria-hidden="true">
          <img src="/messapp-mark.svg" alt="" className="h-9 w-9" />
        </div>
        <span className="font-display font-extrabold tracking-[-0.045em] text-2xl leading-none">messapp</span>
      </div>
      <h1 className="font-display type-view-title mb-2">{title}</h1>
      {subtitle && <p className="text-[var(--text-muted)] type-label mb-6">{subtitle}</p>}
      {children}
    </main>
  )
}

export function AuthField({ label, icon: Icon, hint, invalid, trailing, ...inputProps }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className="type-label font-semibold text-[var(--text-muted)] mb-1.5 block">{label}</label>
      <div className="auth-field ios-sheet-input ghost-border flex items-center rounded-xl px-4 h-12" data-invalid={invalid ? 'true' : undefined}>
        {Icon && <Icon size={18} className="text-[var(--text-muted)] mr-3 shrink-0" aria-hidden="true" />}
        <input
          id={id}
          aria-describedby={hintId}
          aria-invalid={invalid ? 'true' : undefined}
          className="bg-transparent border-none outline-none min-w-0 flex-1 h-full text-[var(--text-main)] placeholder:text-[var(--text-subtle)] font-sans type-body"
          {...inputProps}
        />
        {trailing}
      </div>
      {hint && <p id={hintId} className="type-meta text-[var(--text-muted)] mt-1.5 mb-0">{hint}</p>}
    </div>
  )
}

export function PasswordField(props) {
  const [visible, setVisible] = useState(false)
  return (
    <AuthField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={(
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-pressed={visible}
          aria-label="Show password"
          className="-mr-3 ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--app-accent)]"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      )}
    />
  )
}

/** The wrapper is always mounted so screen readers register the live region before its text changes. */
export function AuthMessage({ kind = 'error', children }) {
  return (
    <div aria-live={kind === 'error' ? 'assertive' : 'polite'} aria-atomic="true">
      {/* Callers pass `{message && …}` pairs, so an empty message is ['', '']: a truthy array with nothing to show. */}
      {Children.toArray(children).some(Boolean) && (
        <div className="auth-message mt-4 rounded-xl p-3 text-center" data-kind={kind}>
          {children}
        </div>
      )}
    </div>
  )
}

export function SubmitButton({ busy, busyLabel, waiting, disabled, icon: Icon, children }) {
  return (
    <button
      type="submit"
      disabled={busy || waiting || disabled}
      aria-busy={busy || undefined}
      className="premium-button mt-1 w-full h-12 font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      {busy ? (
        <><Loader2 size={18} className="animate-spin" aria-hidden="true" /><span className="type-label">{busyLabel}</span></>
      ) : waiting ? (
        <><Loader2 size={18} className="animate-spin" aria-hidden="true" /><span className="type-label">Verifying…</span></>
      ) : (
        <><span className="type-label">{children}</span>{Icon && <Icon size={18} aria-hidden="true" />}</>
      )}
    </button>
  )
}
