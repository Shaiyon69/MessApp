/** M3 switch: the thumb grows and shows a check when on. */
import { Check } from 'lucide-react'

export default function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="m3-switch disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="m3-switch-thumb">{checked && <Check size={14} strokeWidth={3} aria-hidden="true" />}</span>
    </button>
  )
}
