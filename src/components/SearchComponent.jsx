import { useState, useEffect, useMemo } from 'react'
import { Search, MessageSquare, User, Hash, Calendar, X, Filter } from 'lucide-react'

export default function SearchComponent({ 
  messages = [], 
  users = [], 
  channels = [], 
  onClose, 
  onSelect 
}) {
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  const filters = [
    { id: 'all', label: 'All', icon: <Search className="w-4 h-4" /> },
    { id: 'messages', label: 'Messages', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <User className="w-4 h-4" /> },
    { id: 'channels', label: 'Channels', icon: <Hash className="w-4 h-4" /> }
  ]

  // Search function
  const performSearch = useMemo(() => {
    if (!query.trim()) return []

    const searchTerm = query.toLowerCase().trim()
    const results = []

    // Search messages
    if (activeFilter === 'all' || activeFilter === 'messages') {
      messages.forEach(message => {
        if (message.content && message.content.toLowerCase().includes(searchTerm)) {
          results.push({
            type: 'message',
            id: message.id,
            title: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
            subtitle: `From ${message.profiles?.username || 'Unknown'} • ${new Date(message.created_at).toLocaleDateString()}`,
            data: message,
            timestamp: new Date(message.created_at)
          })
        }
      })
    }

    // Search users
    if (activeFilter === 'all' || activeFilter === 'users') {
      users.forEach(user => {
        if (user.username?.toLowerCase().includes(searchTerm) || 
            user.unique_tag?.toLowerCase().includes(searchTerm)) {
          results.push({
            type: 'user',
            id: user.id,
            title: user.username,
            subtitle: user.unique_tag || 'No tag',
            data: user,
            timestamp: new Date()
          })
        }
      })
    }

    // Search channels
    if (activeFilter === 'all' || activeFilter === 'channels') {
      channels.forEach(channel => {
        if (channel.name?.toLowerCase().includes(searchTerm) ||
            channel.description?.toLowerCase().includes(searchTerm)) {
          results.push({
            type: 'channel',
            id: channel.id,
            title: `#${channel.name}`,
            subtitle: channel.description || 'No description',
            data: channel,
            timestamp: new Date()
          })
        }
      })
    }

    // Sort by relevance (exact matches first, then by date)
    return results.sort((a, b) => {
      const aExact = a.title.toLowerCase().startsWith(searchTerm)
      const bExact = b.title.toLowerCase().startsWith(searchTerm)
      
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1
      
      return b.timestamp - a.timestamp
    })
  }, [query, activeFilter, messages, users, channels])

  useEffect(() => {
    setIsSearching(true)
    const timeoutId = setTimeout(() => {
      setSearchResults(performSearch)
      setIsSearching(false)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [performSearch])

  const handleSelect = (result) => {
    onSelect?.(result)
    onClose?.()
  }

  const getIcon = (type) => {
    switch (type) {
      case 'message': return <MessageSquare className="w-5 h-5" />
      case 'user': return <User className="w-5 h-5" />
      case 'channel': return <Hash className="w-5 h-5" />
      default: return <Search className="w-5 h-5" />
    }
  }

  const getIconColor = (type) => {
    switch (type) {
      case 'message': return 'text-blue-400'
      case 'user': return 'text-green-400'
      case 'channel': return 'text-purple-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[#1a1c24] w-full max-w-2xl max-h-[90vh] rounded-2xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Search className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Search</h2>
              <p className="text-gray-400 text-sm">Find messages, users, and channels</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-6 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search messages, users, or channels..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-800 text-white rounded-xl border border-gray-600 focus:border-indigo-500 focus:outline-none transition-colors"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 mt-4">
            {filters.map(filter => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === filter.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {filter.icon}
                <span>{filter.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSearching ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : query && searchResults.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-white font-medium mb-2">No results found</h3>
              <p className="text-gray-400 text-sm">
                Try adjusting your search terms or filters
              </p>
            </div>
          ) : !query ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-white font-medium mb-2">Start searching</h3>
              <p className="text-gray-400 text-sm">
                Type to search messages, users, or channels
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map(result => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getIconColor(result.type)} bg-gray-700 group-hover:bg-gray-600 transition-colors`}>
                      {getIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate">{result.title}</h4>
                      <p className="text-gray-400 text-sm truncate">{result.subtitle}</p>
                    </div>
                    <div className="text-gray-500 text-xs">
                      {result.type === 'message' && <Calendar className="w-4 h-4" />}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
            </span>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>Filter: {filters.find(f => f.id === activeFilter)?.label}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
