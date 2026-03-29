import React from 'react'

export default function StatusAvatar({ url, username, isOnline, showStatus = true, className = "" }) {
  const maskId = `mask-${crypto.randomUUID()}`;
  const center = 50;
  const statusOffset = 85; 
  const statusRadius = 14; 
  const cutoutRadius = 19; 
  
  const statusColor = isOnline ? '#23a559' : '#80848e';

  return (
    <div className={`relative shrink-0 flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <mask id={maskId}>
            <circle cx={center} cy={center} r={center} fill="white" />
            {showStatus && <circle cx={statusOffset} cy={statusOffset} r={cutoutRadius} fill="black" />}
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          {url ? (
            <image href={url} width="100" height="100" preserveAspectRatio="xMidYMid slice" decoding="async" />
          ) : (
            <>
              <circle cx={center} cy={center} r={center} fill="var(--border-subtle)" />
              <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill="white" fontSize="45" fontWeight="bold" fontFamily="sans-serif">
                {username?.[0]?.toUpperCase() || '?'}
              </text>
            </>
          )}
        </g>
        {showStatus && (
          <circle cx={statusOffset} cy={statusOffset} r={statusRadius} fill={statusColor} />
        )}
      </svg>
    </div>
  )
}
