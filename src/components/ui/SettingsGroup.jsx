/**
 * Segmented list group: rows share a container shape (rounded ends, near-square
 * joins, a 2px gap) instead of divider lines. A selected row morphs fully
 * round. Styles live in `.seg-group` / `.seg-item` (src/style/index.css).
 */
import TonalIcon from './TonalIcon'

export default function SettingsGroup({ title, className = '', children }) {
  return (
    <section className={className}>
      {title && <h4 className="mb-2 px-1 type-label font-bold text-[var(--text-muted)]">{title}</h4>}
      <div className="seg-group">{children}</div>
    </section>
  )
}

export function GroupItem({ icon, title, description, trailing, onClick, selected, className = '', children, ...rest }) {
  const body = children ?? (
    <>
      {icon && <TonalIcon icon={icon} />}
      <span className="min-w-0 flex-1">
        <span className="block type-body font-semibold text-[var(--text-main)]">{title}</span>
        {description && <span className="mt-0.5 block type-label text-[var(--text-muted)]">{description}</span>}
      </span>
      {trailing}
    </>
  )
  const props = { className: `seg-item ${className}`, 'data-selected': selected || undefined, ...rest }
  return onClick
    ? <button type="button" onClick={onClick} aria-current={selected ? 'page' : undefined} {...props}>{body}</button>
    : <div {...props}>{body}</div>
}
