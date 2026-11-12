/** Renders a sanitized avatar plus presence state without owning profile data. */
import React, { useId } from 'react'
import { safeMediaUrl } from '../../lib/security'

const STATUS_COLORS = {
  online: '#23a559',
  idle: '#f0b232',
  dnd: '#f23f43'
}

// Shape as well as hue, so presence reads without color vision (design.md §6):
// online is a full dot, idle a crescent, dnd a dot with a bar cut out.
const STATUS_CUTOUT = {
  idle: <circle cx="3.6" cy="3.6" r="3" fill="black" />,
  dnd: <rect x="3" y="5.1" width="6" height="1.8" rx="0.9" fill="black" />
}

const STATUS_LABELS = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline'
}

export default function StatusAvatar({ url, username, isOnline, status, showStatus = true, className = "", loading = "lazy" }) {
  const center = 50;
  const maskId = useId()
  const resolvedStatus = status || (isOnline ? 'online' : 'offline')
  const statusColor = STATUS_COLORS[resolvedStatus]
  const safeUrl = safeMediaUrl(url)
  const statusLabel = STATUS_LABELS[resolvedStatus] || STATUS_LABELS.offline

  return (
    // Without the dot the caller passes no real status, so the label must not claim one.
    <div className={`relative shrink-0 flex items-center justify-center rounded-full ${className}`} title={showStatus ? `${username || 'User'} · ${statusLabel}` : username || 'User'} role="img" aria-label={showStatus ? `${username || 'User'}, ${statusLabel}` : username || 'User'}>
      {safeUrl ? (
        <img src={safeUrl} alt="" className="h-full w-full rounded-full object-cover" loading={loading} decoding="async" draggable={false} />
      ) : (
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-hidden rounded-full">
            <circle cx={center} cy={center} r={center} fill="var(--border-subtle)" />
            <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill="var(--text-main)" fontSize="45" fontWeight="bold">
              {username?.[0]?.toUpperCase() || '?'}
            </text>
        </svg>
      )}
      {showStatus && statusColor && (
        /* Corner dot like Discord/Messenger; the ring cuts it out of the avatar. */
        <svg viewBox="0 0 12 12" className="absolute -bottom-[2%] -right-[2%] h-[34%] w-[34%] min-h-2.5 min-w-2.5 pointer-events-none" aria-hidden="true">
          <mask id={maskId}>
            <circle cx="6" cy="6" r="4.5" fill="white" />
            {STATUS_CUTOUT[resolvedStatus]}
          </mask>
          <circle cx="6" cy="6" r="6" fill="var(--status-ring, var(--bg-base))" />
          <circle cx="6" cy="6" r="4.5" fill={statusColor} mask={`url(#${CSS.escape(maskId)})`} />
        </svg>
      )}
    </div>
  )
}
