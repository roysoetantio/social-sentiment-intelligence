import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react'
import { subDays, startOfDay } from 'date-fns'
import { filterMentions } from '../services/filterService'
import { fetchAllMentions } from '../services/apiService'
import { supabase } from '../lib/supabase'

const DashboardContext = createContext(null)

const DEFAULT_PRESET = '1y'

const DEFAULT_DATE_RANGE = {
  start: subDays(new Date(), 365),
  end: new Date(),
}

export function DashboardProvider({ children }) {
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE)
  const [selectedKeywords, setSelectedKeywords] = useState([])
  const [selectedGroups, setSelectedGroups] = useState([])
  const [selectedPlatforms, setSelectedPlatforms] = useState([])
  const [selectedSentiments, setSelectedSentiments] = useState([])
  const [selectedLanguages, setSelectedLanguages] = useState([])
  const [selectedMentionTypes, setSelectedMentionTypes] = useState([])
  const [selectedSources, setSelectedSources] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [riskOnly, setRiskOnly] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [activePreset, setActivePreset] = useState(DEFAULT_PRESET)
  const [allMentionsData, setAllMentionsData] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [dataSource, setDataSource] = useState('mock')
  const [keywordGroups, setKeywordGroups] = useState([])
  const [allKeywordsFlat, setAllKeywordsFlat] = useState([])
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('notif_read_ids') || '[]')) }
    catch { return new Set() }
  })

  const markRead = useCallback((id) => {
    setReadIds(prev => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem('notif_read_ids', JSON.stringify([...next]))
      return next
    })
  }, [])

  const markAllRead = useCallback((ids) => {
    setReadIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      localStorage.setItem('notif_read_ids', JSON.stringify([...next]))
      return next
    })
  }, [])

  const reloadMentions = useCallback(async () => {
    setIsLoading(true)
    try {
      const { mentions, source, liveCount } = await fetchAllMentions()
      setAllMentionsData(mentions)
      setDataSource(source)
      if (source === 'live') console.info(`[Dashboard] Loaded ${liveCount} live mentions`)
    } catch (e) {
      console.warn('[Dashboard] fetch failed, using mock data', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { reloadMentions() }, [reloadMentions])

  useEffect(() => {
    const loadKeywords = async () => {
      const [{ data: groups }, { data: kws }, { data: allKws }] = await Promise.all([
        supabase.from('keyword_groups').select('*').order('created_at'),
        supabase.from('keywords').select('*').eq('is_active', true).order('created_at'),
        supabase.from('keywords').select('id, term, group_id').order('created_at'),
      ])
      if (groups && kws) {
        setKeywordGroups(groups.map(g => ({
          ...g,
          keywords: kws.filter(k => k.group_id === g.id).map(k => ({
            id: k.id,
            term: k.term,
            matchType: k.match_type,
            groupId: g.id,
            groupColor: g.color,
          })),
        })))
      }
      if (allKws) setAllKeywordsFlat(allKws)
    }
    loadKeywords()
  }, [])

  // Mentions with all filters applied except source — used for accurate source counts
  const mentionsWithoutSourceFilter = useMemo(() => {
    return filterMentions(allMentionsData, {
      dateRange, selectedKeywords, selectedGroups, selectedPlatforms,
      selectedSentiments, selectedLanguages, searchQuery, selectedMentionTypes,
      selectedSources: [], riskOnly, showExcluded,
    }, allKeywordsFlat)
  }, [allMentionsData, dateRange, selectedKeywords, selectedGroups, selectedPlatforms, selectedSentiments, selectedLanguages, searchQuery, selectedMentionTypes, riskOnly, showExcluded, allKeywordsFlat])

  // All filters — used only by Mentions Explorer
  const filteredMentions = useMemo(() => {
    return filterMentions(allMentionsData, {
      dateRange, selectedKeywords, selectedGroups, selectedPlatforms,
      selectedSentiments, selectedLanguages, searchQuery, selectedMentionTypes,
      selectedSources, riskOnly, showExcluded,
    }, allKeywordsFlat)
  }, [allMentionsData, dateRange, selectedKeywords, selectedGroups, selectedPlatforms, selectedSentiments, selectedLanguages, searchQuery, selectedMentionTypes, selectedSources, riskOnly, showExcluded, allKeywordsFlat])

  // Global filters only (date range + search) — used by Overview, Analytics, Keywords
  const globalFilteredMentions = useMemo(() => {
    return filterMentions(allMentionsData, {
      dateRange, searchQuery,
    })
  }, [allMentionsData, dateRange, searchQuery])

  const updateMentionSentiment = useCallback((mentionId, newLabel) => {
    setAllMentionsData(prev => prev.map(m =>
      m.id === mentionId
        ? {
            ...m,
            sentiment: {
              ...m.sentiment,
              label: newLabel,
              originalLabel: m.sentiment.originalLabel ?? m.sentiment.label,
            },
          }
        : m
    ))
  }, [])

  const toggleExcludeMention = useCallback((mentionId, excluded) => {
    setAllMentionsData(prev => prev.map(m =>
      m.id === mentionId ? { ...m, excluded } : m
    ))
  }, [])

  const updateMentionGroups = useCallback((keywordId, newGroupId) => {
    setAllMentionsData(prev => prev.map(m =>
      m.keywordMatched?.includes(keywordId) ? { ...m, keywordGroup: newGroupId } : m
    ))
  }, [])

  const clearMentionOverride = useCallback((mentionId) => {
    setAllMentionsData(prev => prev.map(m =>
      m.id === mentionId
        ? {
            ...m,
            sentiment: {
              ...m.sentiment,
              label: m.sentiment.originalLabel ?? m.sentiment.label,
              originalLabel: null,
            },
          }
        : m
    ))
  }, [])

  const resetFilters = useCallback(() => {
    setDateRange(DEFAULT_DATE_RANGE)
    setSelectedKeywords([])
    setSelectedGroups([])
    setSelectedPlatforms([])
    setSelectedSentiments([])
    setSelectedLanguages([])
    setSelectedMentionTypes([])
    setSelectedSources([])
    setSearchQuery('')
    setRiskOnly(false)
  }, [])

  const setDatePreset = useCallback((preset) => {
    const end = new Date()
    switch (preset) {
      case 'today':
        setDateRange({ start: startOfDay(end), end })
        break
      case '7d':
        setDateRange({ start: subDays(end, 7), end })
        break
      case '1m':
        setDateRange({ start: subDays(end, 30), end })
        break
      case '3m':
        setDateRange({ start: subDays(end, 90), end })
        break
      case '1y':
        setDateRange({ start: subDays(end, 365), end })
        break
      default:
        break
    }
    setActivePreset(preset)
  }, [])

  const togglePlatform = useCallback((platform) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    )
  }, [])

  const toggleSentiment = useCallback((sentiment) => {
    setSelectedSentiments(prev =>
      prev.includes(sentiment) ? prev.filter(s => s !== sentiment) : [...prev, sentiment]
    )
  }, [])

  const toggleGroup = useCallback((groupId) => {
    setSelectedGroups(prev =>
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    )
  }, [])

  const toggleKeyword = useCallback((keywordId) => {
    setSelectedKeywords(prev =>
      prev.includes(keywordId) ? prev.filter(k => k !== keywordId) : [...prev, keywordId]
    )
  }, [])

  const toggleSource = useCallback((source) => {
    setSelectedSources(prev =>
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]
    )
  }, [])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedKeywords.length) count++
    if (selectedGroups.length) count++
    if (selectedPlatforms.length) count++
    if (selectedSentiments.length) count++
    if (selectedLanguages.length) count++
    if (selectedMentionTypes.length) count++
    if (selectedSources.length) count++
    if (riskOnly) count++
    return count
  }, [selectedKeywords, selectedGroups, selectedPlatforms, selectedSentiments, selectedLanguages, selectedMentionTypes, selectedSources, riskOnly])

  const value = {
    // State
    dateRange, setDateRange,
    selectedKeywords, setSelectedKeywords,
    selectedGroups, setSelectedGroups,
    selectedPlatforms, setSelectedPlatforms,
    selectedSentiments, setSelectedSentiments,
    selectedLanguages, setSelectedLanguages,
    selectedMentionTypes, setSelectedMentionTypes,
    selectedSources, setSelectedSources,
    searchQuery, setSearchQuery,
    riskOnly, setRiskOnly,
    showExcluded, setShowExcluded,
    // Derived
    filteredMentions,
    globalFilteredMentions,
    mentionsWithoutSourceFilter,
    allMentions: allMentionsData,
    isLoading,
    dataSource,
    keywordGroups,
    allKeywordsFlat,
    reloadMentions,
    activePreset,
    setActivePreset,
    activeFilterCount,
    // Notifications
    readIds, markRead, markAllRead,
    // Actions
    updateMentionSentiment,
    updateMentionGroups,
    clearMentionOverride,
    toggleExcludeMention,
    resetFilters,
    setDatePreset,
    togglePlatform,
    toggleSentiment,
    toggleGroup,
    toggleKeyword,
    toggleSource,
  }

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  )
}

export const useDashboard = () => {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}
