import React, { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, Twitter, Newspaper, MessageSquare, Zap, Radio, Globe, Rss, Link, Check } from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import KeywordFilterPanel from './KeywordFilterPanel'
import clsx from 'clsx'

const SOURCE_LABELS = {
  twitter135:           { label: 'Twitter',          Icon: Twitter },
  serper_news:          { label: 'Google News',      Icon: Newspaper },
  serper_social:        { label: 'Social Media',     Icon: MessageSquare },
  realtimesnews:        { label: 'Real-Time News',   Icon: Zap },
  rss_my:               { label: 'MY News Portals',  Icon: Rss },
  google_alerts:        { label: 'Google Alerts',    Icon: Radio },
  gnews:                { label: 'GNews',            Icon: Newspaper },
  reddit:               { label: 'Reddit',           Icon: MessageSquare },
  google_news_rapidapi: { label: 'Google News',      Icon: Newspaper },
  worldnews:            { label: 'World News API',   Icon: Globe },
  claude_search:        { label: 'Claude Search',    Icon: Globe },
}

const PLATFORMS = ['Twitter', 'LinkedIn', 'YouTube', 'News', 'Blog', 'Forum']
const SENTIMENTS = ['positive', 'negative', 'neutral']
const LANGUAGES = [{ value: 'en', label: 'English' }, { value: 'ms', label: 'Malay' }, { value: 'zh', label: 'Chinese' }]
const MENTION_TYPES = ['news', 'complaint', 'praise', 'question', 'rumor', 'crisis']

const SENTIMENT_COLORS = {
  positive: '#19C9A5',
  negative: '#E97132',
  neutral: '#1490EA',
}

const ToggleButton = ({ active, onClick, children, color }) => (
  <button
    onClick={onClick}
    className={clsx(
      'px-2.5 py-1 text-xs rounded-md border border-hairline-strong font-medium transition-all',
      active
        ? 'text-white border-transparent'
        : 'bg-canvas text-body hover:border-ink/30'
    )}
    style={active ? { backgroundColor: color || '#000000', borderColor: color || '#000000' } : {}}
  >
    {children}
  </button>
)

export default function FilterBar({ inline = false }) {
  const {
    selectedPlatforms, togglePlatform,
    selectedSentiments, toggleSentiment,
    selectedGroups, toggleGroup,
    selectedKeywords, toggleKeyword,
    selectedLanguages, setSelectedLanguages,
    selectedMentionTypes, setSelectedMentionTypes,
    selectedSources, toggleSource,
    showExcluded, setShowExcluded,
    activeFilterCount,
    resetFilters,
    setDatePreset,
    mentionsWithoutSourceFilter,
    keywordGroups,
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
    ;(mentionsWithoutSourceFilter || []).forEach(m => {
      const g = m.keywordGroup || 'unknown'
      counts[g] = (counts[g] || 0) + 1
    })
    return counts
  }, [mentionsWithoutSourceFilter])

  const content = (
    <>

        {/* Sentiment */}
        <div className="mb-5">
          <p className="section-label mb-1.5">Sentiment</p>
          <div className="flex flex-wrap gap-1.5">
            {SENTIMENTS.map(s => (
              <ToggleButton
                key={s}
                active={selectedSentiments.includes(s)}
                onClick={() => toggleSentiment(s)}
                color={SENTIMENT_COLORS[s]}
              >
                <span className="capitalize">{s}</span>
              </ToggleButton>
            ))}
          </div>
        </div>

        {/* Keyword Groups */}
        <div className="mb-5">
          <p className="section-label mb-1.5">Keyword Groups</p>
          <div className="space-y-1.5">
            {keywordGroups.map(g => (
              <div key={g.id}>
                <button
                  onClick={() => toggleGroup(g.id)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all text-left',
                    selectedGroups.includes(g.id)
                      ? 'bg-[#2940BE] text-white border-[#2940BE]'
                      : 'bg-canvas dark:bg-white/8 text-body dark:text-on-dark-soft border-hairline-strong dark:border-white/8 hover:border-ink/30 dark:hover:border-white/20'
                  )}
                >
                  {g.name}
                  <span className={clsx(
                    'ml-auto text-[0.625rem] font-semibold rounded-full px-1.5 py-0.5',
                    selectedGroups.includes(g.id)
                      ? 'bg-white/20 text-on-dark border border-transparent'
                      : 'bg-canvas dark:bg-white/8 border border-hairline-strong dark:border-white/8 text-muted dark:text-on-dark-soft'
                  )}>
                    {groupCounts[g.id] || 0}
                  </span>
                </button>
              </div>
            ))}
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
            {LANGUAGES.map(l => (
              <ToggleButton
                key={l.value}
                active={selectedLanguages.includes(l.value)}
                color="#2940BE"
                onClick={() => setSelectedLanguages(prev =>
                  prev.includes(l.value) ? prev.filter(x => x !== l.value) : [...prev, l.value]
                )}
              >
                {l.label}
              </ToggleButton>
            ))}
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
                  {(showAllSources ? Object.keys(SOURCE_LABELS) : Object.keys(sourceCounts))
                    .sort((a, b) => (sourceCounts[b] || 0) - (sourceCounts[a] || 0))
                    .map(src => {
                    const count = sourceCounts[src] || 0
                    const meta = SOURCE_LABELS[src] || { label: src, Icon: Link }
                    const active = selectedSources.includes(src)
                    return (
                      <button
                        key={src}
                        onClick={() => toggleSource(src)}
                        className={clsx(
                          'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border text-left transition-all',
                          active
                            ? 'bg-[#2940BE] border-[#2940BE] text-on-dark'
                            : 'bg-canvas dark:bg-white/8 border-hairline-strong dark:border-white/8 hover:border-ink/30 dark:hover:border-white/20'
                        )}
                      >
                        <span className={clsx('flex items-center gap-1.5 text-xs', active ? 'text-on-dark' : 'text-body dark:text-on-dark-soft')}>
                          <meta.Icon size={12} />
                          <span>{meta.label}</span>
                        </span>
                        <span className={clsx('text-[0.625rem] font-semibold rounded-full px-1.5 py-0.5', active ? 'bg-white/20 text-on-dark border border-transparent' : 'bg-canvas dark:bg-white/8 border border-hairline-strong dark:border-white/8 text-muted dark:text-on-dark-soft')}>
                          {count}
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
                {PLATFORMS.map(p => (
                  <ToggleButton
                    key={p}
                    active={selectedPlatforms.includes(p)}
                    color="#2940BE"
                    onClick={() => togglePlatform(p)}
                  >
                    {p}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Mention Type */}
            <div>
              <p className="section-label mb-1.5">Mention Type</p>
              <div className="flex flex-wrap gap-1">
                {MENTION_TYPES.map(t => (
                  <ToggleButton
                    key={t}
                    active={selectedMentionTypes.includes(t)}
                    color="#2940BE"
                    onClick={() => setSelectedMentionTypes(prev =>
                      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                    )}
                  >
                    <span className="capitalize">{t}</span>
                  </ToggleButton>
                ))}
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
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 pb-6">
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
