import React, { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, Twitter, Newspaper, MessageSquare, Zap, Radio, Globe, Rss, Link, Check, Search } from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import KeywordFilterPanel from './KeywordFilterPanel'
import clsx from 'clsx'

// UI display groups — keys are group IDs, keys[] are the actual source values in DB
const SOURCE_GROUPS = [
  { id: 'claude_search',        label: 'Claude Search',    Icon: Globe,          keys: ['claude_search'] },
  { id: 'serper',               label: 'Serper',           Icon: Search,         keys: ['serper', 'serper_news', 'serper_social'] },
  { id: 'google_news_rapidapi', label: 'Google News',      Icon: Newspaper,      keys: ['google_news_rapidapi', 'gnews'] },
  { id: 'twitter135',           label: 'Twitter',          Icon: Twitter,        keys: ['twitter135'] },
  { id: 'realtimesnews',        label: 'Real-Time News',   Icon: Zap,            keys: ['realtimesnews'] },
  { id: 'worldnews',            label: 'World News API',   Icon: Globe,          keys: ['worldnews'] },
  { id: 'rss_my',               label: 'MY News Portals',  Icon: Rss,            keys: ['rss_my'] },
  { id: 'google_alerts',        label: 'Google Alerts',    Icon: Radio,          keys: ['google_alerts'] },
  { id: 'reddit',               label: 'Reddit',           Icon: MessageSquare,  keys: ['reddit'] },
  { id: 'apify_instagram',      label: 'Instagram',        Icon: Globe,          keys: ['apify_instagram'] },
]

const PLATFORMS = ['Twitter', 'LinkedIn', 'YouTube', 'News', 'Blog', 'Forum']
const SENTIMENTS = ['positive', 'negative', 'neutral']
const LANGUAGES = [{ value: 'en', label: 'English' }, { value: 'ms', label: 'Malay' }, { value: 'zh', label: 'Chinese' }]
const MENTION_TYPES = ['news', 'complaint', 'praise', 'question', 'rumor']

const SENTIMENT_COLORS = {
  positive: '#19C9A5',
  negative: '#E97132',
  neutral: '#1490EA',
}

const ToggleButton = ({ active, onClick, children, color, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={clsx(
      'px-2.5 py-1 text-xs rounded-md border border-hairline-strong font-medium transition-all',
      disabled ? 'opacity-35 cursor-not-allowed bg-canvas text-body' :
      active
        ? 'text-white border-transparent'
        : 'bg-canvas text-body hover:border-ink/30'
    )}
    style={active && !disabled ? { backgroundColor: color || '#000000', borderColor: color || '#000000' } : {}}
  >
    {children}
  </button>
)

export default function FilterBar({ inline = false }) {
  const {
    selectedPlatforms, togglePlatform, setSelectedPlatforms,
    selectedSentiments, toggleSentiment, setSelectedSentiments,
    selectedGroups, toggleGroup, setSelectedGroups,
    selectedKeywords, toggleKeyword, setSelectedKeywords,
    selectedLanguages, setSelectedLanguages,
    selectedMentionTypes, setSelectedMentionTypes,
    selectedSources, toggleSource, setSelectedSources,
    riskOnly, setRiskOnly,
    showExcluded, setShowExcluded,
    heatmapFilter, setHeatmapFilter,
    activeFilterCount,
    resetFilters,
    setDatePreset,
    mentionsWithoutSourceFilter,
    filteredMentions,
    keywordGroups,
    allKeywordsFlat,
  } = useDashboard()

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [showAllSources, setShowAllSources] = useState(false)

  const sourceCounts = useMemo(() => {
    const counts = {}
    ;(mentionsWithoutSourceFilter || []).forEach(m => {
      const src = m.source || 'unknown'
      counts[src] = (counts[src] || 0) + 1
    })
    return counts
  }, [mentionsWithoutSourceFilter])

  const groupCounts = useMemo(() => {
    const counts = {}
    const kwGroupMap = new Map((allKeywordsFlat || []).map(k => [k.id, k.group_id]))
    ;(filteredMentions || []).forEach(m => {
      const matchedGroups = (m.keywordMatched || []).map(id => kwGroupMap.get(id)).filter(Boolean)
      const allGroups = [...new Set([m.keywordGroup || 'unknown', ...matchedGroups])]
      allGroups.forEach(g => { counts[g] = (counts[g] || 0) + 1 })
    })
    return counts
  }, [filteredMentions, allKeywordsFlat])

  const platformCounts = useMemo(() => {
    const counts = {}
    ;(filteredMentions || []).forEach(m => {
      if (m.platform) counts[m.platform] = (counts[m.platform] || 0) + 1
    })
    return counts
  }, [filteredMentions])

  const mentionTypeCounts = useMemo(() => {
    const counts = {}
    ;(filteredMentions || []).forEach(m => {
      if (m.mentionType) counts[m.mentionType] = (counts[m.mentionType] || 0) + 1
    })
    return counts
  }, [filteredMentions])

  const sentimentCounts = useMemo(() => {
    const counts = {}
    ;(filteredMentions || []).forEach(m => {
      const label = m.sentiment?.label
      if (label) counts[label] = (counts[label] || 0) + 1
    })
    return counts
  }, [filteredMentions])

  const languageCounts = useMemo(() => {
    const counts = {}
    ;(filteredMentions || []).forEach(m => {
      if (m.language) counts[m.language] = (counts[m.language] || 0) + 1
    })
    return counts
  }, [filteredMentions])

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const content = (
    <>
        {/* Heatmap filter chip */}
        {heatmapFilter && (
          <div className="mb-4 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#2940BE]/10 border border-[#2940BE]/20">
            <span className="text-xs text-[#2940BE] font-medium flex-1">
              {DAYS[heatmapFilter.day]} {String(heatmapFilter.hour).padStart(2, '0')}:00
            </span>
            <button onClick={() => setHeatmapFilter(null)} className="text-[#2940BE] hover:opacity-70 text-xs">✕</button>
          </div>
        )}

        {/* Sentiment */}
        <div className="mb-5">
          <p className="section-label mb-1.5">Sentiment</p>
          <div className="flex flex-wrap gap-1.5">
            {SENTIMENTS.map(s => {
              const isActive = selectedSentiments.includes(s)
              const isEmpty = (sentimentCounts[s] || 0) === 0 && !isActive
              return (
                <ToggleButton
                  key={s}
                  active={isActive}
                  disabled={isEmpty}
                  onClick={() => toggleSentiment(s)}
                  color={SENTIMENT_COLORS[s]}
                >
                  <span className="capitalize">{s}</span>
                </ToggleButton>
              )
            })}
          </div>
          <button
            onClick={() => {
              const next = !riskOnly
              setRiskOnly(next)
              if (next) {
                setSelectedSentiments(['negative'])
                setSelectedKeywords([])
                setSelectedGroups([])
                setSelectedPlatforms([])
                setSelectedLanguages([])
                setSelectedMentionTypes([])
                setSelectedSources([])
              }
            }}
            className={clsx(
              'mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all text-left',
              riskOnly ? 'font-medium text-[#2940BE] bg-[#2940BE]/10' : 'text-body dark:text-on-dark-soft hover:bg-surface-strong dark:hover:bg-white/8'
            )}
          >
            <div className={clsx(
              'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
              riskOnly ? 'bg-[#2940BE] border-[#2940BE]' : 'border-hairline-strong dark:border-white/20'
            )}>
              {riskOnly && <Check size={10} className="text-white" />}
            </div>
            <span>Show high risk only</span>
          </button>
        </div>

        {/* Keyword Groups */}
        <div className="mb-5">
          <p className="section-label mb-1.5">Keyword Groups</p>
          <div className="space-y-1.5">
            {keywordGroups.map(g => {
              const count = groupCounts[g.id] || 0
              const isSelected = selectedGroups.includes(g.id)
              const isEmpty = count === 0 && !isSelected
              return (
                <div key={g.id}>
                  <button
                    onClick={() => !isEmpty && toggleGroup(g.id)}
                    disabled={isEmpty}
                    className={clsx(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all text-left',
                      isEmpty ? 'opacity-35 cursor-not-allowed bg-canvas dark:bg-white/8 text-body dark:text-on-dark-soft border-hairline-strong dark:border-white/8' :
                      isSelected
                        ? 'bg-[#2940BE] text-white border-[#2940BE]'
                        : 'bg-canvas dark:bg-white/8 text-body dark:text-on-dark-soft border-hairline-strong dark:border-white/8 hover:border-ink/30 dark:hover:border-white/20'
                    )}
                  >
                    {g.name}
                    <span className={clsx(
                      'ml-auto text-[0.625rem] font-semibold rounded-full px-1.5 py-0.5',
                      isSelected
                        ? 'bg-white/20 text-on-dark border border-transparent'
                        : 'bg-canvas dark:bg-white/8 border border-hairline-strong dark:border-white/8 text-muted dark:text-on-dark-soft'
                    )}>
                      {count}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Keywords */}
        <div className="mb-5">
          <p className="section-label mb-1.5">Keywords</p>
          <KeywordFilterPanel />
        </div>

        {/* Language */}
        <div className="mb-5">
          <p className="section-label mb-1.5">Language</p>
          <div className="flex gap-1.5">
            {LANGUAGES.map(l => {
              const isActive = selectedLanguages.includes(l.value)
              const isEmpty = (languageCounts[l.value] || 0) === 0 && !isActive
              return (
                <ToggleButton
                  key={l.value}
                  active={isActive}
                  color="#2940BE"
                  disabled={isEmpty}
                  onClick={() => setSelectedLanguages(prev =>
                    prev.includes(l.value) ? prev.filter(x => x !== l.value) : [...prev, l.value]
                  )}
                >
                  {l.label}
                </ToggleButton>
              )
            })}
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full flex items-center justify-between"
        >
          <p className="section-label">Advanced Filters</p>
          {advancedOpen ? <ChevronUp size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-5 pt-3 border-t border-hairline dark:border-white/8">

            {/* Sources */}
            {Object.keys(sourceCounts).length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="section-label">Sources</p>
                  <button
                    onClick={() => setShowAllSources(v => !v)}
                    className="text-[0.625rem] font-medium text-[#2940BE] hover:opacity-70 transition-opacity"
                  >
                    {showAllSources ? 'Hide empty' : 'Show all'}
                  </button>
                </div>
                <div className="space-y-1">
                  {SOURCE_GROUPS
                    .map(group => ({
                      ...group,
                      count: group.keys.reduce((sum, k) => sum + (sourceCounts[k] || 0), 0),
                      active: group.keys.some(k => selectedSources.includes(k)),
                    }))
                    .filter(group => showAllSources || group.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .map(group => {
                      const isEmpty = group.count === 0 && !group.active
                      return (
                        <button
                          key={group.id}
                          onClick={() => {
                            if (isEmpty) return
                            if (group.active) {
                              setSelectedSources(s => s.filter(k => !group.keys.includes(k)))
                            } else {
                              setSelectedSources(s => [...new Set([...s, ...group.keys])])
                            }
                          }}
                          disabled={isEmpty}
                          className={clsx(
                            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border text-left transition-all',
                            isEmpty ? 'opacity-35 cursor-not-allowed bg-canvas dark:bg-white/8 border-hairline-strong dark:border-white/8' :
                            group.active
                              ? 'bg-[#2940BE] border-[#2940BE] text-on-dark'
                              : 'bg-canvas dark:bg-white/8 border-hairline-strong dark:border-white/8 hover:border-ink/30 dark:hover:border-white/20'
                          )}
                        >
                          <span className={clsx('flex items-center gap-1.5 text-xs', group.active ? 'text-on-dark' : 'text-body dark:text-on-dark-soft')}>
                            <group.Icon size={12} />
                            <span>{group.label}</span>
                          </span>
                          <span className={clsx('text-[0.625rem] font-semibold rounded-full px-1.5 py-0.5', group.active ? 'bg-white/20 text-on-dark border border-transparent' : 'bg-canvas dark:bg-white/8 border border-hairline-strong dark:border-white/8 text-muted dark:text-on-dark-soft')}>
                            {group.count}
                          </span>
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Platform */}
            <div>
              <p className="section-label mb-1.5">Platform</p>
              <div className="flex flex-wrap gap-1">
                {PLATFORMS.map(p => {
                  const isActive = selectedPlatforms.includes(p)
                  const isEmpty = (platformCounts[p] || 0) === 0 && !isActive
                  return (
                    <ToggleButton
                      key={p}
                      active={isActive}
                      color="#2940BE"
                      onClick={() => !isEmpty && togglePlatform(p)}
                      disabled={isEmpty}
                    >
                      {p}
                    </ToggleButton>
                  )
                })}
              </div>
            </div>

            {/* Mention Type */}
            <div>
              <p className="section-label mb-1.5">Mention Type</p>
              <div className="flex flex-wrap gap-1">
                {MENTION_TYPES.map(t => {
                  const isActive = selectedMentionTypes.includes(t)
                  const isEmpty = (mentionTypeCounts[t] || 0) === 0 && !isActive
                  return (
                    <ToggleButton
                      key={t}
                      active={isActive}
                      color="#2940BE"
                      onClick={() => !isEmpty && setSelectedMentionTypes(prev =>
                        prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                      )}
                      disabled={isEmpty}
                    >
                      <span className="capitalize">{t}</span>
                    </ToggleButton>
                  )
                })}
              </div>
            </div>

            {/* Excluded posts */}
            <div>
              <button
                onClick={() => setShowExcluded(v => !v)}
                className={clsx(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all text-left',
                  showExcluded ? 'font-medium text-[#2940BE] bg-[#2940BE]/10' : 'text-body dark:text-on-dark-soft hover:bg-surface-strong dark:hover:bg-white/8'
                )}
              >
                <div className={clsx(
                  'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                  showExcluded ? 'bg-[#2940BE] border-[#2940BE]' : 'border-hairline-strong dark:border-white/20'
                )}>
                  {showExcluded && <Check size={10} className="text-white" />}
                </div>
                <span>Show excluded posts</span>
              </button>
            </div>
          </div>
        )}
    </>
  )

  const scrollRef = useRef(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      setCanScrollDown(el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight - 4)
      setCanScrollUp(el.scrollTop > 4)
    }
    check()
    el.addEventListener('scroll', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [])

  if (inline) {
    return <div>{content}</div>
  }

  return (
    <div className="bg-canvas dark:bg-surface-dark-elevated rounded-lg border border-hairline-strong dark:border-white/8 h-[calc(100%-1rem)] flex flex-col">
      {/* Sticky header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink dark:text-on-dark">Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2.5 py-0.5 text-[0.625rem] font-bold bg-[#2940BE] text-white rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button onClick={resetFilters} className="text-xs text-muted hover:text-orange transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Scrollable content + gradient */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 pb-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {content}
        </div>
        {canScrollUp && (
          <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-canvas dark:from-surface-dark-elevated to-transparent pointer-events-none rounded-t-lg" />
        )}
        {canScrollDown && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-canvas dark:from-surface-dark-elevated to-transparent pointer-events-none rounded-b-lg" />
        )}
      </div>
    </div>
  )
}
