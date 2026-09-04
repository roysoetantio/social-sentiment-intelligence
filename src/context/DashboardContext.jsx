import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react'
import { subDays, startOfDay } from 'date-fns'
import { filterMentions } from '../services/filterService'
import { getPreviousRange } from '../data/analytics'
import { fetchAllMentions } from '../services/apiService'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import {
  fetchAlertState, fetchDirectory, fetchReviewQueue,
  markViewed as pushViewed,
  setHandled as pushHandled, resolveReviewItem as pushResolve,
  undoReviewItem as pushUndoReview,
} from '../services/notificationService'

const DashboardContext = createContext(null)

const DEFAULT_PRESET = '1y'

const DEFAULT_DATE_RANGE = {
  start: subDays(new Date(), 365),
  end: new Date(),
}

export function DashboardProvider({ children }) {
  const { allowedGroupIds, allowedKeywordIds, keywordGroupMap, currentDepartment, user } = useAuth()
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
  // Drill-down from an at-risk count (Sources leaderboard, KPI tiles). Like
  // heatmapFilter and outletFilter it has no FilterBar control of its own and is
  // surfaced as a removable chip. It is deliberately separate from `riskOnly`,
  // which means high-only — see filterService for why merging them loses rows.
  const [atRiskOnly, setAtRiskOnly] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [heatmapFilter, setHeatmapFilter] = useState(null)
  // Set by clicking a row in the Overview's Top Sources leaderboard. Like
  // heatmapFilter it has no FilterBar control of its own — it is a drill-down,
  // surfaced as a removable chip.
  const [outletFilter, setOutletFilter] = useState(null)
  const [activePreset, setActivePreset] = useState(DEFAULT_PRESET)
  const [allMentionsData, setAllMentionsData] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [dataSource, setDataSource] = useState('mock')
  const [keywordGroups, setKeywordGroups] = useState([])
  const [allKeywordsFlat, setAllKeywordsFlat] = useState([])
  // Notification state. Read marks are tenant-wide and live in Supabase — see
  // services/notificationService.js for why the old localStorage version could
  // not work. Writes update local state immediately and are pushed in the
  // background: the bell must not wait on a round trip, and if the write fails
  // the next load simply shows the item unread again, which is the safe way for
  // an alert to fail.
  const [readIds, setReadIds] = useState(new Set())
  const [handledIds, setHandledIds] = useState(new Set())
  const [alertStates, setAlertStates] = useState(new Map())
  const [viewers, setViewers] = useState(new Map())
  const [directory, setDirectory] = useState(new Map())
  const [reviewItems, setReviewItems] = useState([])

  const reloadNotificationState = useCallback(async () => {
    if (!currentDepartment) return
    const [state, dir, queue] = await Promise.all([
      fetchAlertState(currentDepartment),
      fetchDirectory(),
      fetchReviewQueue(currentDepartment),
    ])
    setReadIds(state.readIds)
    setHandledIds(state.handledIds)
    setAlertStates(state.states)
    setViewers(state.viewers)
    setDirectory(dir)
    setReviewItems(queue)
  }, [currentDepartment])

  useEffect(() => { reloadNotificationState() }, [reloadNotificationState])

  const me = user?.email || null

  /** Opening an alert: your face on the cluster, read for the tenant. */
  const markViewed = useCallback((ids) => {
    const list = Array.isArray(ids) ? ids : [ids]
    setReadIds(prev => new Set([...prev, ...list]))
    if (me) {
      setViewers(prev => {
        const next = new Map(prev)
        for (const id of list) {
          const seen = next.get(id) || []
          if (!seen.some(v => v.email === me)) {
            next.set(id, [...seen, { email: me, at: new Date().toISOString() }])
          }
        }
        return next
      })
    }
    pushViewed(list, currentDepartment).then(ok => { if (!ok) reloadNotificationState() })
  }, [currentDepartment, me, reloadNotificationState])

  const setAlertHandled = useCallback((id, handled) => {
    const at = new Date().toISOString()
    setHandledIds(prev => {
      const next = new Set(prev)
      if (handled) next.add(id); else next.delete(id)
      return next
    })
    // Handling implies reading; undo takes both back, so the row returns to the
    // list wearing the unread dot rather than a quiet "seen" tick.
    setReadIds(prev => {
      const next = new Set(prev)
      if (handled) next.add(id); else next.delete(id)
      return next
    })
    setAlertStates(prev => {
      const next = new Map(prev)
      const row = next.get(id) || { mention_id: id }
      next.set(id, handled
        ? { ...row, handled_at: at, handled_by: me, read_at: row.read_at || at, read_by: row.read_by || me }
        : { ...row, handled_at: null, handled_by: null, read_at: null, read_by: null })
      return next
    })
    pushHandled(id, currentDepartment, handled).then(ok => { if (!ok) reloadNotificationState() })
  }, [currentDepartment, reloadNotificationState, me])

  // Resolved items are kept in the list, marked resolved, rather than dropped:
  // "Show completed" in the bell needs them, and a row that vanishes gives the
  // person who clicked no confirmation of what they just did.
  const resolveReviewItem = useCallback(async (id, resolution) => {
    const at = new Date().toISOString()
    setReviewItems(prev => prev.map(r =>
      r.id === id ? { ...r, resolved_at: at, resolved_by: me } : r
    ))
    const ok = await pushResolve(id, resolution)
    if (!ok) reloadNotificationState()
  }, [reloadNotificationState, me])

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
      const [{ data: groups }, { data: kws }] = await Promise.all([
        supabase.from('keyword_groups').select('*').order('created_at'),
        supabase.from('keywords').select('id, term, group_id, match_type').eq('is_active', true).order('created_at'),
      ])
      if (groups) setKeywordGroups(groups)
      if (kws) setAllKeywordsFlat(kws)
    }
    loadKeywords()
  }, [])

  // ── Tenant scoping ──────────────────────────────────────────────────────
  // Visibility is keyword-level: a tenant sees a mention if any keyword it
  // matched is tagged to that tenant (keyword_tenants). The mention's folder
  // is then remapped to that tenant's folder for display/grouping.
  // Falls back to the legacy group model when tenant tags aren't available.
  const effKeywordIds = useMemo(() => {
    if (allowedKeywordIds) return new Set(allowedKeywordIds)
    return new Set(allKeywordsFlat.filter(k => allowedGroupIds.includes(k.group_id)).map(k => k.id))
  }, [allowedKeywordIds, allKeywordsFlat, allowedGroupIds])

  const effGroupMap = useMemo(() => {
    if (keywordGroupMap) return keywordGroupMap
    const m = {}
    for (const k of allKeywordsFlat) m[k.id] = k.group_id
    return m
  }, [keywordGroupMap, allKeywordsFlat])

  const scopedMentions = useMemo(
    () => allMentionsData
      .filter(m => (m.keywordMatched || []).some(id => effKeywordIds.has(id)))
      .map(m => {
        const g = (m.keywordMatched || []).map(id => effGroupMap[id]).find(Boolean)
        return g && g !== m.keywordGroup ? { ...m, keywordGroup: g } : m
      }),
    [allMentionsData, effKeywordIds, effGroupMap]
  )
  const scopedKeywordsFlat = useMemo(
    () => allKeywordsFlat
      .filter(k => effKeywordIds.has(k.id))
      .map(k => ({ ...k, group_id: effGroupMap[k.id] || k.group_id })),
    [allKeywordsFlat, effKeywordIds, effGroupMap]
  )
  const scopedKeywordGroups = useMemo(
    () => keywordGroups
      .filter(g => allowedGroupIds.includes(g.id))
      .map(g => ({
        ...g,
        keywords: scopedKeywordsFlat
          .filter(k => k.group_id === g.id)
          .map(k => ({ id: k.id, term: k.term, matchType: k.match_type, groupId: g.id, groupColor: g.color })),
      })),
    [keywordGroups, allowedGroupIds, scopedKeywordsFlat]
  )

  // Mentions with all filters applied except source — used for accurate source counts
  const mentionsWithoutSourceFilter = useMemo(() => {
    return filterMentions(scopedMentions, {
      dateRange, selectedKeywords, selectedGroups, selectedPlatforms,
      selectedSentiments, selectedLanguages, searchQuery, selectedMentionTypes,
      selectedSources: [], riskOnly, atRiskOnly, showExcluded, heatmapFilter, outletFilter,
    }, scopedKeywordsFlat)
  }, [scopedMentions, dateRange, selectedKeywords, selectedGroups, selectedPlatforms, selectedSentiments, selectedLanguages, searchQuery, selectedMentionTypes, riskOnly, atRiskOnly, showExcluded, heatmapFilter, outletFilter, scopedKeywordsFlat])

  // All filters — used only by Mentions Explorer
  const filteredMentions = useMemo(() => {
    return filterMentions(scopedMentions, {
      dateRange, selectedKeywords, selectedGroups, selectedPlatforms,
      selectedSentiments, selectedLanguages, searchQuery, selectedMentionTypes,
      selectedSources, riskOnly, atRiskOnly, showExcluded, heatmapFilter, outletFilter,
    }, scopedKeywordsFlat)
  }, [scopedMentions, dateRange, selectedKeywords, selectedGroups, selectedPlatforms, selectedSentiments, selectedLanguages, searchQuery, selectedMentionTypes, selectedSources, riskOnly, atRiskOnly, showExcluded, heatmapFilter, outletFilter, scopedKeywordsFlat])

  // Global filters only (date range + search) — used by Overview, Analytics, Keywords
  const globalFilteredMentions = useMemo(() => {
    return filterMentions(scopedMentions, {
      dateRange, searchQuery,
    })
  }, [scopedMentions, dateRange, searchQuery])

  // The equivalent window immediately before the selected one. Same tenant
  // scope and same search as globalFilteredMentions, so the two are comparable;
  // every "vs previous period" number on the Overview is this set.
  const previousRange = useMemo(
    () => getPreviousRange(dateRange.start, dateRange.end),
    [dateRange]
  )

  // 'All' starts at the oldest row there is, so the window before it is empty by
  // construction. Rather than let every metric read "new", the pages ask whether
  // a comparison exists at all and drop the deltas when it doesn't.
  const hasComparisonPeriod = activePreset !== 'all'

  const previousPeriodMentions = useMemo(() => {
    if (!hasComparisonPeriod) return []
    return filterMentions(scopedMentions, { dateRange: previousRange, searchQuery })
  }, [scopedMentions, previousRange, searchQuery, hasComparisonPeriod])

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

  /**
   * Reopen a review item. It touches only the queue row: the mention's
   * analyst_* fields may have been set from the Mentions Explorer, and undoing a
   * queue row is not a mandate to erase somebody's sentiment override.
   */
  const undoReviewAnswer = useCallback(async (item) => {
    setReviewItems(prev => prev.map(r =>
      r.id === item.id ? { ...r, resolved_at: null, resolved_by: null } : r
    ))
    const ok = await pushUndoReview(item.id)
    if (!ok) reloadNotificationState()
  }, [reloadNotificationState])

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
    setAtRiskOnly(false)
    setHeatmapFilter(null)
    setOutletFilter(null)
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
      case 'all': {
        // The oldest mention this tenant can see — not a fixed span, and not the
        // oldest row in the table, which may belong to another tenant.
        const oldest = scopedMentions.reduce((min, m) => {
          const t = new Date(m.publishedAt).getTime()
          return Number.isFinite(t) && t < min ? t : min
        }, Infinity)
        setDateRange({ start: Number.isFinite(oldest) ? new Date(oldest) : subDays(end, 3650), end })
        break
      }
      default:
        break
    }
    setActivePreset(preset)
  }, [scopedMentions])

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
    if (atRiskOnly) count++
    if (heatmapFilter) count++
    if (outletFilter) count++
    return count
  }, [selectedKeywords, selectedGroups, selectedPlatforms, selectedSentiments, selectedLanguages, selectedMentionTypes, selectedSources, riskOnly, atRiskOnly, heatmapFilter, outletFilter])

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
    atRiskOnly, setAtRiskOnly,
    heatmapFilter, setHeatmapFilter,
    outletFilter, setOutletFilter,
    // Derived
    filteredMentions,
    globalFilteredMentions,
    previousPeriodMentions,
    previousRange,
    hasComparisonPeriod,
    mentionsWithoutSourceFilter,
    allMentions: scopedMentions,
    isLoading,
    dataSource,
    keywordGroups: scopedKeywordGroups,
    allKeywordsFlat: scopedKeywordsFlat,
    reloadMentions,
    activePreset,
    setActivePreset,
    activeFilterCount,
    // Notifications
    readIds, handledIds, viewers, directory, reviewItems,
    alertStates,
    markViewed, setAlertHandled, resolveReviewItem, undoReviewAnswer,
    reloadNotificationState,
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
