import React, { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import KeywordFilterPanel from './KeywordFilterPanel'
import clsx from 'clsx'

const SOURCE_LABELS = {
  twitter135:     { label: 'Twitter',          icon: '🐦' },
  serper_news:    { label: 'Google News',      icon: '📰' },
  serper_social:  { label: 'Social Media',     icon: '💬' },
  realtimesnews:  { label: 'Real-Time News',   icon: '⚡' },
  rss_my:         { label: 'MY News Portals',  icon: '🇲🇾' },
  gnews:          { label: 'GNews',            icon: '📡' },
  reddit:                { label: 'Reddit',           icon: '🔴' },
  google_news_rapidapi:  { label: 'Google News',      icon: '📰' },
  worldnews:             { label: 'World News API',   icon: '🌐' },
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
      'px-2.5 py-1 text-xs rounded-md border font-medium transition-all',
      active
        ? 'text-white border-transparent'
        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
    )}
    style={active ? { backgroundColor: color || '#2940BE', borderColor: color || '#2940BE' } : {}}
  >
    {children}
  </button>
)

export default function FilterBar() {
  const {
    selectedPlatforms, togglePlatform,
    selectedSentiments, toggleSentiment,
    selectedGroups, toggleGroup,
    selectedKeywords, toggleKeyword,
    selectedLanguages, setSelectedLanguages,
    selectedMentionTypes, setSelectedMentionTypes,
    selectedSources, toggleSource,
    riskOnly, setRiskOnly,
    showExcluded, setShowExcluded,
    activeFilterCount,
    resetFilters,
    setDatePreset,
    mentionsWithoutSourceFilter,
    keywordGroups,
  } = useDashboard()

  const [advancedOpen, setAdvancedOpen] = useState(false)

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

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="p-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary text-white rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-orange transition-colors">
              Clear all
            </button>
          )}
        </div>

        {/* Sentiment */}
        <div className="mb-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sentiment</p>
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
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Keyword Groups</p>
          <div className="space-y-1.5">
            {keywordGroups.map(g => (
              <div key={g.id}>
                <button
                  onClick={() => toggleGroup(g.id)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all text-left',
                    selectedGroups.includes(g.id)
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                  style={selectedGroups.includes(g.id) ? { backgroundColor: g.color, borderColor: g.color } : {}}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selectedGroups.includes(g.id) ? 'rgba(255,255,255,0.7)' : g.color }} />
                  {g.name}
                  <span className="ml-auto opacity-60">({g.keywords?.length || 0})</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="mb-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Language</p>
          <div className="flex gap-1.5">
            {LANGUAGES.map(l => (
              <ToggleButton
                key={l.value}
                active={selectedLanguages.includes(l.value)}
                onClick={() => setSelectedLanguages(prev =>
                  prev.includes(l.value) ? prev.filter(x => x !== l.value) : [...prev, l.value]
                )}
              >
                {l.label}
              </ToggleButton>
            ))}
          </div>
        </div>

        {/* Keywords */}
        <div className="mb-5">
          <p className="section-label mb-1.5">Keywords</p>
          <KeywordFilterPanel />
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors"
        >
          {advancedOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Advanced Filters
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-3 pt-3 border-t border-gray-100">

            {/* Sources */}
            {Object.keys(sourceCounts).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sources</p>
                <div className="space-y-1">
                  {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, count]) => {
                    const meta = SOURCE_LABELS[src] || { label: src, icon: '🔗' }
                    const active = selectedSources.includes(src)
                    return (
                      <button
                        key={src}
                        onClick={() => toggleSource(src)}
                        className={clsx(
                          'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition-all',
                          active
                            ? 'bg-primary border-primary text-white'
                            : 'bg-gray-50 border-gray-100 hover:border-gray-300'
                        )}
                      >
                        <span className={clsx('flex items-center gap-1.5 text-xs', active ? 'text-white' : 'text-gray-600')}>
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>
                        <span className={clsx('text-[10px] font-semibold rounded-full px-1.5 py-0.5', active ? 'bg-white/20 text-white' : 'bg-white border border-gray-200 text-gray-400')}>
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
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Platform</p>
              <div className="flex flex-wrap gap-1">
                {PLATFORMS.map(p => (
                  <ToggleButton
                    key={p}
                    active={selectedPlatforms.includes(p)}
                    onClick={() => togglePlatform(p)}
                  >
                    {p}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Mention Type */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Mention Type</p>
              <div className="flex flex-wrap gap-1">
                {MENTION_TYPES.map(t => (
                  <ToggleButton
                    key={t}
                    active={selectedMentionTypes.includes(t)}
                    onClick={() => setSelectedMentionTypes(prev =>
                      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                    )}
                  >
                    <span className="capitalize">{t}</span>
                  </ToggleButton>
                ))}
              </div>
            </div>

            {/* Risk */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={riskOnly}
                  onChange={e => setRiskOnly(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary"
                />
                <span className="text-xs text-gray-600 font-medium">Show risk flags only</span>
              </label>
            </div>

            {/* Excluded posts */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showExcluded}
                  onChange={e => setShowExcluded(e.target.checked)}
                  className="w-3.5 h-3.5 accent-orange"
                />
                <span className="text-xs text-gray-600 font-medium">Show excluded posts</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
