import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'

export function useMessageSearch(session, activeChannel, activeDm) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchFilters, setSearchFilters] = useState({
    hasImages: false,
    hasFiles: false,
    fromUser: null,
    dateRange: null,
    beforeDate: null,
    afterDate: null
  })

  // Search messages with filters
  const searchMessages = async (query, filters = {}) => {
    if (!query.trim() && !Object.values(filters).some(v => v)) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      let dbQuery = supabase
        .from('messages')
        .select(`
          *,
          profiles!messages_profile_id_fkey (
            username,
            avatar_url,
            unique_tag
          ),
          shared_files (
            filename,
            file_type,
            file_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      // Filter by channel or DM
      if (activeChannel) {
        dbQuery = dbQuery.eq('channel_id', activeChannel.id)
      } else if (activeDm) {
        dbQuery = dbQuery.eq('dm_room_id', activeDm.dm_room_id)
      }

      // Text search
      if (query.trim()) {
        dbQuery = dbQuery.ilike('content', `%${query}%`)
      }

      // Apply filters
      if (filters.hasImages) {
        dbQuery = dbQuery.not('image_url', 'is', null)
      }

      if (filters.hasFiles) {
        dbQuery = dbQuery.in('id', 
          (await supabase
            .from('shared_files')
            .select('message_id')
            .eq('file_type', 'document')
          ).data?.map(f => f.message_id) || []
        )
      }

      if (filters.fromUser) {
        dbQuery = dbQuery.eq('profile_id', filters.fromUser)
      }

      if (filters.beforeDate) {
        dbQuery = dbQuery.lte('created_at', filters.beforeDate)
      }

      if (filters.afterDate) {
        dbQuery = dbQuery.gte('created_at', filters.afterDate)
      }

      const { data, error } = await dbQuery

      if (error) throw error

      setSearchResults(data || [])
    } catch (error) {
      console.error('Search failed:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchMessages(searchQuery, searchFilters)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, searchFilters, activeChannel?.id, activeDm?.dm_room_id])

  // Highlight search terms in text (returns array of parts)
  const highlightText = (text, query) => {
    if (!query.trim()) return [{ text: text, isHighlight: false }]

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, index) => ({
      text: part,
      isHighlight: regex.test(part),
      id: index
    }))
  }

  // Get search context around matched message
  const getSearchContext = (message, contextSize = 50) => {
    if (!searchQuery.trim()) return message.content

    const query = searchQuery.toLowerCase()
    const content = message.content.toLowerCase()
    const queryIndex = content.indexOf(query)

    if (queryIndex === -1) return message.content

    const start = Math.max(0, queryIndex - contextSize)
    const end = Math.min(message.content.length, queryIndex + query.length + contextSize)

    let context = message.content.substring(start, end)
    
    if (start > 0) context = '...' + context
    if (end < message.content.length) context = context + '...'

    return context
  }

  // Clear search
  const clearSearch = () => {
    setSearchQuery('')
    setSearchFilters({
      hasImages: false,
      hasFiles: false,
      fromUser: null,
      dateRange: null,
      beforeDate: null,
      afterDate: null
    })
    setSearchResults([])
  }

  // Search statistics
  const searchStats = useMemo(() => {
    const totalResults = searchResults.length
    const imageResults = searchResults.filter(m => m.image_url).length
    const fileResults = searchResults.filter(m => m.shared_files?.length > 0).length
    const userResults = new Set(searchResults.map(m => m.profile_id)).size

    return {
      totalResults,
      imageResults,
      fileResults,
      userResults,
      dateRange: searchResults.length > 0 ? {
        earliest: new Date(searchResults[searchResults.length - 1]?.created_at),
        latest: new Date(searchResults[0]?.created_at)
      } : null
    }
  }, [searchResults])

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchFilters,
    setSearchFilters,
    searchMessages,
    highlightText,
    getSearchContext,
    clearSearch,
    searchStats
  }
}

export function useAdvancedFilters() {
  const [savedFilters, setSavedFilters] = useState([])
  const [activeFilter, setActiveFilter] = useState(null)

  const filterPresets = [
    {
      id: 'today',
      name: 'Today',
      description: 'Messages from today',
      filters: {
        afterDate: new Date().setHours(0, 0, 0, 0)
      }
    },
    {
      id: 'this-week',
      name: 'This Week',
      description: 'Messages from the past 7 days',
      filters: {
        afterDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    },
    {
      id: 'images',
      name: 'Images Only',
      description: 'Messages with images',
      filters: {
        hasImages: true
      }
    },
    {
      id: 'files',
      name: 'Files Only',
      description: 'Messages with attachments',
      filters: {
        hasFiles: true
      }
    },
    {
      id: 'links',
      name: 'With Links',
      description: 'Messages containing URLs',
      customFilter: (message) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g
        return urlRegex.test(message.content)
      }
    }
  ]

  const applyPreset = (preset) => {
    setActiveFilter(preset)
    return preset.filters || {}
  }

  const saveCustomFilter = (name, filters) => {
    const newFilter = {
      id: Date.now().toString(),
      name,
      filters,
      createdAt: new Date()
    }
    
    setSavedFilters(prev => [...prev, newFilter])
    localStorage.setItem('messapp_saved_filters', JSON.stringify([...savedFilters, newFilter]))
  }

  const deleteSavedFilter = (filterId) => {
    const updated = savedFilters.filter(f => f.id !== filterId)
    setSavedFilters(updated)
    localStorage.setItem('messapp_saved_filters', JSON.stringify(updated))
    
    if (activeFilter?.id === filterId) {
      setActiveFilter(null)
    }
  }

  // Load saved filters from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('messapp_saved_filters')
      if (saved) {
        setSavedFilters(JSON.parse(saved))
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error)
    }
  }, [])

  return {
    filterPresets,
    savedFilters,
    activeFilter,
    setActiveFilter,
    applyPreset,
    saveCustomFilter,
    deleteSavedFilter
  }
}
