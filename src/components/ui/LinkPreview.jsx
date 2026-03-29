import React, { useState, useEffect } from 'react'

export default function LinkPreview({ url }) {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`)
        const { data } = await res.json()
        if (data && data.title) setPreview(data)
      } catch (e) {
        console.error("Failed to fetch link preview", e)
      } finally {
        setLoading(false)
      }
    }
    fetchPreview()
  }, [url])

  if (loading || !preview) return null

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2 w-fit max-w-[240px] sm:max-w-[320px] md:max-w-sm rounded-xl overflow-hidden bg-[var(--bg-element)] border border-[var(--border-subtle)] hover:border-indigo-500 transition-colors shadow-sm group cursor-pointer no-underline">
      {preview.image?.url && (
        <div className="w-full h-32 bg-[#0d0f12] overflow-hidden border-b border-[var(--border-subtle)]">
          <img src={preview.image.url} alt="Preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async" fetchPriority="low" />
        </div>
      )}
      <div className="p-3">
        <h4 className="text-[13px] font-bold text-[var(--text-main)] truncate mb-1">{preview.title}</h4>
        <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">{preview.description}</p>
        <div className="text-[10px] text-indigo-400 mt-2 uppercase tracking-widest font-bold flex items-center gap-1.5">
          {preview.logo?.url && <img src={preview.logo.url} className="w-3.5 h-3.5 rounded-sm" alt="Logo" />}
          <span className="truncate">{preview.publisher || new URL(url).hostname}</span>
        </div>
      </div>
    </a>
  )
}
