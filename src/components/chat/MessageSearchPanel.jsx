import React, { useState } from 'react'
import { Search, X, Filter, Calendar, Image, FileText, User, Clock, ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function MessageSearchPanel({ 
  searchProps, 
  filterProps, 
  onClose,
  onMessageSelect 
}) {
  const [showFilters, setShowFilters] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchFilters,
    setSearchFilters,
    highlightText,
    getSearchContext,
    clearSearch,
    searchStats
  } = searchProps

  const {
    filterPresets,
    savedFilters,
    activeFilter,
    setActiveFilter,
    applyPreset,
    saveCustomFilter,
    deleteSavedFilter
  } = filterProps

  const handleFilterChange = (key, value) => {
    setSearchFilters(prev => ({ ...prev, [key]: value }))
  }

  const applyPresetFilter = (preset) => {
    const filters = applyPreset(preset)
    setSearchFilters(prev => ({ ...prev, ...filters }))
  }

  const MessageResult = ({ message }) => {
    const context = getSearchContext(message)
    const timeAgo = formatDistanceToNow(new Date(message.created_at), { addSuffix: true })

    return (
      <div
        className="p-4 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors border-b border-[var(--border-subtle)] last:border-b-0"
        onClick={() => onMessageSelect(message)}
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">
              {message.profiles?.username?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-[var(--text-main)]">
                {message.profiles?.username || 'Unknown'}
              </span>
              <span className="text-xs text-[var(--text-muted)]">{timeAgo}</span>
              
              {message.image_url && (
                <Image size={14} className="text-blue-400" />
              )}
              
              {message.shared_files?.length > 0 && (
                <FileText size={14} className="text-green-400" />
              )}
            </div>
            
            <div className="text-sm text-[var(--text-secondary)]">
              {highlightText(context, searchQuery)}
            </div>
            
            {message.image_url && (
              <div className="mt-2">
                <img 
                  src={message.image_url} 
                  alt="Shared image"
                  className="w-20 h-20 object-cover rounded-lg border border-[var(--border-subtle)]"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-surface)] border-l border-[var(--border-subtle)]">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--text-main)]">Search Messages</h3>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-10 pr-4 py-2 bg-[var(--bg-element)] border border-[var(--border-subtle)] rounded-lg focus:border-indigo-500 focus:outline-none transition-colors text-[var(--text-main)]"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              showFilters || Object.values(searchFilters).some(v => v)
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-[var(--bg-element)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Filter size={16} />
            <span className="text-sm">Filters</span>
            {Object.values(searchFilters).some(v => v) && (
              <span className="w-2 h-2 bg-indigo-400 rounded-full" />
            )}
          </button>

          {activeFilter && (
            <div className="flex items-center gap-1 px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded-lg text-sm">
              <span>{activeFilter.name}</span>
              <button
                onClick={() => setActiveFilter(null)}
                className="p-0.5 hover:bg-indigo-500/30 rounded transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-element)]">
          {/* Quick Presets */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-[var(--text-main)] mb-2">Quick Filters</h4>
            <div className="flex flex-wrap gap-2">
              {filterPresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPresetFilter(preset)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                    activeFilter?.id === preset.id
                      ? 'bg-indigo-500 text-white'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
                  }`}
                  title={preset.description}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Filters */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-[var(--text-main)] hover:text-indigo-400 transition-colors cursor-pointer mb-3"
            >
              <ChevronDown size={16} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Advanced Filters
            </button>

            {showAdvanced && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="hasImages"
                    checked={searchFilters.hasImages}
                    onChange={(e) => handleFilterChange('hasImages', e.target.checked)}
                    className="w-4 h-4 text-indigo-500 bg-[var(--bg-base)] border-[var(--border-subtle)] rounded"
                  />
                  <label htmlFor="hasImages" className="text-sm text-[var(--text-main)] flex items-center gap-2 cursor-pointer">
                    <Image size={14} />
                    Has Images
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="hasFiles"
                    checked={searchFilters.hasFiles}
                    onChange={(e) => handleFilterChange('hasFiles', e.target.checked)}
                    className="w-4 h-4 text-indigo-500 bg-[var(--bg-base)] border-[var(--border-subtle)] rounded"
                  />
                  <label htmlFor="hasFiles" className="text-sm text-[var(--text-main)] flex items-center gap-2 cursor-pointer">
                    <FileText size={14} />
                    Has Files
                  </label>
                </div>

                <div>
                  <label className="text-sm text-[var(--text-main)] block mb-1">From User</label>
                  <input
                    type="text"
                    placeholder="Username..."
                    value={searchFilters.fromUser || ''}
                    onChange={(e) => handleFilterChange('fromUser', e.target.value || null)}
                    className="w-full px-3 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-main)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-[var(--text-main)] block mb-1">After</label>
                    <input
                      type="date"
                      value={searchFilters.afterDate ? new Date(searchFilters.afterDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => handleFilterChange('afterDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="w-full px-3 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-main)]"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-main)] block mb-1">Before</label>
                    <input
                      type="date"
                      value={searchFilters.beforeDate ? new Date(searchFilters.beforeDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => handleFilterChange('beforeDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="w-full px-3 py-1.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-main)]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : searchResults.length > 0 ? (
          <div>
            {/* Search Stats */}
            <div className="px-4 py-2 bg-[var(--bg-element)] border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-main)">
                  {searchStats.totalResults} results
                </span>
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  {searchStats.imageResults > 0 && (
                    <span className="flex items-center gap-1">
                      <Image size={12} />
                      {searchStats.imageResults}
                    </span>
                  )}
                  {searchStats.fileResults > 0 && (
                    <span className="flex items-center gap-1">
                      <FileText size={12} />
                      {searchStats.fileResults}
                    </span>
                  )}
                  {searchStats.userResults > 0 && (
                    <span className="flex items-center gap-1">
                      <User size={12} />
                      {searchStats.userResults}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Results List */}
            <div>
              {searchResults.map(message => (
                <MessageResult key={message.id} message={message} />
              ))}
            </div>
          </div>
        ) : searchQuery || Object.values(searchFilters).some(v => v) ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Search size={48} className="text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-secondary)]">No results found</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Try adjusting your search terms or filters
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Search size={48} className="text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-secondary)]">Search messages</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Enter keywords or use filters to find messages
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
