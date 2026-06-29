import React from 'react'
import { safeMediaUrl } from '../../lib/security'

const STATUS_COLORS = {
  online: '#23a559',
  idle: '#f0b232',
  dnd: '#f23f43'
}

const STATUS_LABELS = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline'
}

export default function StatusAvatar({ url, username, isOnline, status, showStatus = true, className = "" }) {
  const center = 50;
  const resolvedStatus = status || (isOnline ? 'online' : 'offline')
  const statusColor = STATUS_COLORS[resolvedStatus]
  const safeUrl = safeMediaUrl(url)
  const statusLabel = STATUS_LABELS[resolvedStatus] || STATUS_LABELS.offline

  return (
    <div className={`relative shrink-0 flex items-center justify-center ${className}`} title={`${username || 'User'} · ${statusLabel}`} aria-label={`${username || 'User'} ${statusLabel}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-hidden rounded-full">
        {safeUrl ? (
          <image href={safeUrl} width="100" height="100" preserveAspectRatio="xMidYMid slice" decoding="async" style={{ imageRendering: 'auto' }} />
        ) : (
          <>
            <circle cx={center} cy={center} r={center} fill="var(--border-subtle)" />
            <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill="white" fontSize="45" fontWeight="bold" fontFamily="sans-serif">
              {username?.[0]?.toUpperCase() || '?'}
            </text>
          </>
        )}
      </svg>
      {showStatus && statusColor && (
        <span className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: `0 0 0 2px var(--bg-surface), 0 0 0 4px ${statusColor}` }}></span>
      )}
    </div>
  )
}
