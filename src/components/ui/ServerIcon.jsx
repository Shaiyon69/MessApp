/** Server picture with the two-letter fallback the app has always shown. Every
    URL goes through safeMediaUrl before it reaches an <img>. */
import React from 'react'
import { safeMediaUrl } from '../../lib/security'

export default function ServerIcon({ url, name, className = 'server-list-icon shrink-0' }) {
  const iconUrl = safeMediaUrl(url)
  return (
    <span className={className}>
      {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-cover" /> : name?.slice(0, 2)}
    </span>
  )
}
