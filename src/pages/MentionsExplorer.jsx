import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { X, ExternalLink, Heart, Share2, MessageCircle, Eye, Globe, ChevronDown, CheckSquare, Save, Loader, Trash2, SlidersHorizontal, ArrowLeft, ChevronUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { formatDateTime } from '../utils/format'
import { useDashboard } from '../context/DashboardContext'
import { sortMentions } from '../services/filterService'
import { isSocialUrl } from '../services/apiService'
import MentionCard from '../components/common/MentionCard'
import SentimentBadge from '../components/common/SentimentBadge'
import RiskBadge from '../components/common/RiskBadge'
import FilterBar from '../components/filters/FilterBar'
import { getKeywordById } from '../data/fallbackKeywords'
import { supabase } from '../lib/supabase'
import { SENTIMENT_OPTIONS, ANALYST_NAME } from '../constants/sentiment'
import { EMOTION_COLORS } from '../constants/colors'
import { formatNum } from '../utils/format'
import Sentiment from 'sentiment'
import clsx from 'clsx'
import AICard from '../components/common/AICard'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

const sentimentAnalyzer = new Sentiment()

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'reach', label: 'Highest Reach' },
  { value: 'engagement', label: 'Most Engaged' },
  { value: 'risk', label: 'Risk Level' },
  { value: 'sentiment-neg', label: 'Most Negative' },
  { value: 'sentiment-pos', label: 'Most Positive' },
]

export function calcLiveConfidence(text, fullText) {
  const combined = `${text} ${fullText || ''}`.trim()
  const result = sentimentAnalyzer.analyze(combined)
  return parseFloat(Math.max(0.3, Math.min(1, Math.abs(result.score) / 10)).toFixed(3))
}

function AfinnTooltip({ text, fullText }) {
  const result = useMemo(() => {
    const combined = `${text} ${fullText || ''}`.trim()
    return sentimentAnalyzer.analyze(combined)
  }, [text, fullText])

  return (
    <div className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-surface-dark-elevated border border-hairline-strong dark:border-white/8 rounded-xl shadow-xl p-3 w-72">
      <p className="section-label mb-2">How AFINN calculated this</p>
      <div className="flex items-center gap-3 mb-3">
        <div className="text-center">
          <p className="text-lg font-bold text-ink dark:text-on-dark">{result.score}</p>
          <p className="text-[0.625rem] text-muted dark:text-on-dark-soft">Raw score</p>
        </div>
        <div className="flex-1 text-xs text-body dark:text-on-dark-soft leading-relaxed">
          Each matched word has a value from −5 to +5. Scores are summed, then divided by 10 and clamped to [−1, 1].
        </div>
      </div>
      {result.positive.length > 0 && (
        <div className="mb-2">
          <p className="text-[0.625rem] font-semibold text-teal mb-1">Positive words</p>
          <div className="flex flex-wrap gap-1">
            {result.positive.map(w => (
              <span key={w} className="px-1.5 py-0.5 bg-teal/10 text-teal rounded text-[0.625rem] font-medium">{w}</span>
            ))}
          </div>
        </div>
      )}
      {result.negative.length > 0 && (
        <div className="mb-2">
          <p className="text-[0.625rem] font-semibold text-orange mb-1">Negative words</p>
          <div className="flex flex-wrap gap-1">
            {result.negative.map(w => (
              <span key={w} className="px-1.5 py-0.5 bg-orange/10 text-orange rounded text-[0.625rem] font-medium">{w}</span>
            ))}
          </div>
        </div>
      )}
      {result.positive.length === 0 && result.negative.length === 0 && (
        <p className="text-xs text-muted">No AFINN-recognised words found in this text.</p>
      )}
      <p className="text-[0.625rem] text-gray-300 dark:text-white/30 mt-2 border-t border-hairline dark:border-white/8 pt-2">
        Threshold: &gt;+0.05 = Positive · &lt;−0.05 = Negative · else Neutral
      </p>
    </div>
  )
}

function DetailPanel({ mention, onClose, onSaved, onPrev, onNext, hasPrev, hasNext }) {
  const { updateMentionSentiment, clearMentionOverride, toggleExcludeMention } = useDashboard()
  const [excluded, setExcluded] = useState(mention.excluded || false)
  const [closing, setClosing] = useState(false)

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 240)
  }
  const matchedKeywords = mention.keywordMatched.map(id => getKeywordById(id)).filter(Boolean)

  const [showAfinn, setShowAfinn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [overrideSentiment, setOverrideSentiment] = useState(mention.analystReview.overriddenSentiment || null)
  const [reason, setReason] = useState(mention.analystReview.reason || '')
  const [reviewed, setReviewed] = useState(mention.analystReview.reviewed || false)
  const [displayFlag, setDisplayFlag] = useState(
    mention.analystReview.overriddenSentiment
      ? { sentiment: mention.analystReview.overriddenSentiment, at: mention.analystReview.flaggedAt, by: mention.analystReview.flaggedBy }
      : null
  )

  useEffect(() => {
    setShowAfinn(false)
    setSaving(false)
    setOverrideSentiment(mention.analystReview.overriddenSentiment || null)
    setReason(mention.analystReview.reason || '')
    setReviewed(mention.analystReview.reviewed || false)
    setExcluded(mention.excluded || false)
    setDisplayFlag(
      mention.analystReview.overriddenSentiment
        ? { sentiment: mention.analystReview.overriddenSentiment, at: mention.analystReview.flaggedAt, by: mention.analystReview.flaggedBy }
        : null
    )
  }, [mention.id])

  const handleSaveReview = async () => {
    setSaving(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('mentions').update({
      analyst_reviewed: true,
      analyst_sentiment: overrideSentiment,
      analyst_reason: reason || null,
      analyst_flagged_by: ANALYST_NAME,
      analyst_flagged_at: now,
    }).eq('id', mention.id)

    if (!error) {
      const flag = { sentiment: overrideSentiment, at: now, by: ANALYST_NAME }
      setDisplayFlag(flag)
      setReviewed(true)
      updateMentionSentiment(mention.id, overrideSentiment)
      onSaved?.({ overriddenSentiment: overrideSentiment, reason, flaggedBy: ANALYST_NAME, flaggedAt: now, reviewed: true })
    }
    setSaving(false)
  }

  const handleDeleteReview = async () => {
    if (!confirm('Remove this review? The status will revert to its original sentiment.')) return
    setSaving(true)
    const { error } = await supabase.from('mentions').update({
      analyst_reviewed: false,
      analyst_sentiment: null,
      analyst_reason: null,
      analyst_flagged_by: null,
      analyst_flagged_at: null,
    }).eq('id', mention.id)

    if (!error) {
      setDisplayFlag(null)
      setOverrideSentiment(null)
      setReason('')
      setReviewed(false)
      clearMentionOverride(mention.id)
      onSaved?.({ overriddenSentiment: null, reason: '', flaggedBy: null, flaggedAt: null, reviewed: false })
    }
    setSaving(false)
  }

  const handleToggleExclude = async () => {
    const next = !excluded
    const msg = next
      ? 'Exclude this post? It will be hidden from all lists, charts and calculations.'
      : 'Un-exclude this post? It will reappear in all lists and calculations.'
    if (!confirm(msg)) return
    setSaving(true)
    const { error } = await supabase.from('mentions').update({ analyst_excluded: next }).eq('id', mention.id)
    if (!error) {
      setExcluded(next)
      toggleExcludeMention(mention.id, next)
    }
    setSaving(false)
  }

  return (
    <div className={`fixed inset-0 z-50 md:top-16 md:inset-x-auto md:right-0 md:bottom-0 md:w-96 md:z-30 bg-canvas dark:bg-surface-dark-elevated border-l border-hairline-strong dark:border-white/8 flex flex-col shadow-xl ${closing ? 'slide-out-right' : 'slide-in-right'}`}>
      <div className="flex items-center gap-2 px-4 border-b border-hairline dark:border-white/8 h-14 flex-shrink-0">
        {/* Back — mobile only */}
        <button onClick={handleClose} className="md:hidden p-1 text-muted hover:text-ink dark:hover:text-on-dark transition-colors flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <h3 className="flex-1 text-base md:text-lg font-semibold text-ink dark:text-on-dark tracking-tight truncate">Mention Detail</h3>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="md:hidden p-1.5 rounded-md hover:bg-surface-strong dark:hover:bg-white/8 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous mention"
          >
            <ChevronUp size={16} className="text-body dark:text-on-dark-soft" />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="md:hidden p-1.5 rounded-md hover:bg-surface-strong dark:hover:bg-white/8 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next mention"
          >
            <ChevronDown size={16} className="text-body dark:text-on-dark-soft" />
          </button>
          {/* Close — desktop only */}
          <button
            onClick={handleClose}
            className="hidden md:flex p-1.5 rounded-md hover:bg-surface-strong dark:hover:bg-white/8 transition-colors text-muted hover:text-ink dark:hover:text-on-dark ml-1"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-ink dark:text-on-dark">{mention.author.name}</p>
            {isSocialUrl(mention.url) && <p className="text-xs text-muted dark:text-on-dark-soft">@{mention.author.handle}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted dark:text-on-dark-soft">{mention.platform}</p>
            <p className="text-[0.625rem] text-muted dark:text-on-dark-soft">{formatDateTime(mention.publishedAt)}</p>
          </div>
        </div>

        {/* Full text */}
        <div className="bg-surface-strong dark:bg-white/8 rounded-lg p-3">
          <p className="text-sm text-ink dark:text-on-dark leading-relaxed">{mention.text}</p>
        </div>

        {/* AI Summary */}
        {mention.summary && (
          <AICard label="AI Summary">
            <p className="text-sm text-ink dark:text-on-dark leading-relaxed">{mention.summary}</p>
          </AICard>
        )}

        {/* Sentiment */}
        <div>
          <p className="section-label mb-1.5">Sentiment Analysis</p>
          <div className="flex items-center gap-2">
            <div className="relative" onMouseEnter={() => setShowAfinn(true)} onMouseLeave={() => setShowAfinn(false)}>
              <SentimentBadge
                label={displayFlag ? displayFlag.sentiment : mention.sentiment.label}
                showScore={!displayFlag}
                score={mention.sentiment.score}
                overridden={!!displayFlag}
              />
              {showAfinn && <AfinnTooltip text={mention.text} fullText={mention.fullText} />}
            </div>
            <span className="text-xs text-muted dark:text-on-dark-soft">Confidence: {Math.round(calcLiveConfidence(mention.text, mention.fullText) * 100)}%</span>
            {displayFlag && (
              <span className="text-[0.625rem] text-muted italic">
                was <span className="font-medium">{mention.sentiment.originalLabel || mention.sentiment.label}</span>
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 bg-surface-strong dark:bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.abs(mention.sentiment.score) * 100}%`,
                backgroundColor: mention.sentiment.score >= 0 ? '#19C9A5' : '#E97132',
                marginLeft: 0,
              }}
            />
          </div>
        </div>

        {/* Risk */}
        {mention.riskLevel && (
          <div>
            <p className="section-label mb-1.5">Risk Assessment</p>
            <RiskBadge level={mention.riskLevel} />
          </div>
        )}

        {/* Emotions */}
        {(mention.emotions || []).length > 0 && (
          <div>
            <p className="section-label mb-1.5">Detected Emotions</p>
            <div className="flex flex-wrap gap-1.5">
              {(mention.emotions || []).map(e => (
                <span
                  key={e}
                  className="tag-chip capitalize"
                  style={{
                    color: EMOTION_COLORS[e] || '#6b7280',
                    backgroundColor: `${EMOTION_COLORS[e] || '#6b7280'}15`,
                    borderColor: `${EMOTION_COLORS[e] || '#6b7280'}30`,
                  }}
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Keywords */}
        {matchedKeywords.length > 0 && (
          <div>
            <p className="section-label mb-1.5">Matched Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {matchedKeywords.map(kw => (
                <span
                  key={kw.id}
                  className="tag-chip"
                >
                  {kw.term}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Topics */}
        {mention.topics.length > 0 && (
          <div>
            <p className="section-label mb-1.5">Topics</p>
            <div className="flex flex-wrap gap-1">
              {mention.topics.map(t => (
                <span key={t} className="px-2 py-0.5 bg-surface-strong dark:bg-white/8 text-body dark:text-on-dark-soft rounded text-xs">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Engagement */}
        <div>
          <p className="section-label mb-2">Engagement</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Heart, label: 'Likes', value: mention.engagement.likes },
              { icon: Share2, label: 'Shares', value: mention.engagement.shares },
              { icon: MessageCircle, label: 'Comments', value: mention.engagement.comments },
              { icon: Eye, label: 'Reach', value: mention.engagement.reach },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-surface-strong dark:bg-white/8 rounded-lg p-2.5 flex items-center gap-2">
                <Icon size={13} className="text-muted dark:text-on-dark-soft" />
                <div>
                  <p className="text-[0.625rem] text-muted dark:text-on-dark-soft">{label}</p>
                  <p className="text-xs font-semibold text-ink dark:text-on-dark">{formatNum(value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Geography — hidden */}

        {/* Source */}
        {mention.source && (
          <div>
            <p className="section-label mb-1.5">Source</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs px-2 py-1 rounded-md bg-surface-strong dark:bg-white/8 border border-hairline-strong dark:border-white/8 text-body dark:text-on-dark-soft font-medium">
                {{
                  twitter135:    '🐦 Twitter',
                  serper_news:   '📰 Google News (Serper)',
                  serper_social: '💬 Social Media (Serper)',
                  realtimesnews: '⚡ Real-Time News',
                  rss_my:        '🇲🇾 MY News Portals',
                  google_alerts: '🔔 Google Alerts',
                  gnews:         '📡 GNews',
                  reddit:               '🔴 Reddit',
                  google_news_rapidapi: '📰 Google News',
                  worldnews:            '🌐 World News API',
                  claude_search:        'Claude Search',
                  apify_instagram:      '📸 Instagram (Apify)',
                }[mention.source] || `🔗 ${mention.source}`}
              </span>
            </div>
          </div>
        )}

        {/* Analyst Review */}
        <div className="border border-hairline-strong dark:border-white/8 rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="section-label">Analyst Review</p>
            {reviewed && (
              <span className="text-[0.625rem] text-teal font-medium flex items-center gap-1">
                <CheckSquare size={11} /> Reviewed
              </span>
            )}
          </div>

          {/* Existing flag notice */}
          {displayFlag && (() => {
            const opt = SENTIMENT_OPTIONS.find(s => s.value === displayFlag.sentiment)
            return (
              <div className="rounded-lg px-3 py-2 text-xs space-y-0.5 border" style={{ backgroundColor: opt?.bg, borderColor: opt?.border }}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold" style={{ color: opt?.color }}>
                    Flagged as {displayFlag.sentiment.charAt(0).toUpperCase() + displayFlag.sentiment.slice(1)}
                  </p>
                  <button
                    onClick={handleDeleteReview}
                    disabled={saving}
                    className="p-1 rounded hover:bg-red-50 transition-colors"
                    title="Remove review"
                  >
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
                <p className="text-body">
                  by {displayFlag.by} · {displayFlag.at ? format(parseISO(displayFlag.at), 'MMM d, yyyy h:mma') : ''}
                </p>
                {reason && <p className="text-body italic mt-1">"{reason}"</p>}
              </div>
            )
          })()}

          {/* Override sentiment buttons */}
          <div>
            <p className="text-[0.625rem] text-muted dark:text-on-dark-soft mb-1.5">Override sentiment</p>
            <div className="flex gap-1.5">
              {SENTIMENT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setOverrideSentiment(overrideSentiment === opt.value ? null : opt.value)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all dark:border-white/8"
                  style={overrideSentiment === opt.value ? {
                    backgroundColor: opt.bg,
                    color: opt.color,
                    borderColor: opt.color,
                  } : {
                    color: '#9ca3af',
                    borderColor: '#e5e7eb',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <p className="text-[0.625rem] text-muted dark:text-on-dark-soft mb-1.5">Reason <span className="text-gray-300 dark:text-white/30">(optional)</span></p>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Farewell post is celebratory, not negative…"
              rows={2}
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSaveReview}
            disabled={saving || !overrideSentiment}
            className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium text-on-dark bg-ink hover:bg-primary-active rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save Review'}
          </button>

          {/* Exclude / Unexclude */}
          <div className={clsx(
            'rounded-lg px-3 py-2.5 flex items-center justify-between border',
            excluded ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40' : 'bg-surface-strong dark:bg-white/8 border-hairline-strong dark:border-white/8'
          )}>
            <div>
              <p className={clsx('text-xs font-semibold', excluded ? 'text-red-600' : 'text-body')}>
                {excluded ? '⊘ This post is excluded' : 'Exclude this post'}
              </p>
              <p className="text-[0.625rem] text-muted mt-0.5">
                {excluded ? 'Hidden from all lists, charts & scores' : 'Remove from all lists, charts & calculations'}
              </p>
            </div>
            <button
              onClick={handleToggleExclude}
              disabled={saving}
              className={clsx(
                'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40',
                excluded
                  ? 'text-body dark:text-on-dark-soft border-gray-300 dark:border-white/20 bg-white dark:bg-white/8 hover:bg-surface-strong dark:hover:bg-white/12'
                  : 'text-red-600 border-red-300 dark:border-red-700/50 bg-white dark:bg-transparent hover:bg-red-50 dark:hover:bg-red-950/30'
              )}
            >
              {excluded ? 'Unexclude' : 'Exclude'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-hairline dark:border-white/8">
        <a
          href={mention.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full py-2 text-sm font-medium text-ink dark:text-on-dark border border-hairline-strong dark:border-white/8 rounded-md hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
        >
          <ExternalLink size={13} />
          View Original
        </a>
      </div>
    </div>
  )
}

export default function MentionsExplorer() {
  const { filteredMentions, allMentions, selectedSentiments, toggleSentiment, activeFilterCount, resetFilters, setSelectedSentiments, setRiskOnly, markRead } = useDashboard()
  const location = useLocation()
  const [selectedMention, setSelectedMention] = useState(null)
  const [sortBy, setSortBy] = useState('recent')
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [listCanScrollDown, setListCanScrollDown] = useState(false)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const listRef = useRef(null)
  const loaderRef = useRef(null)
  const PAGE_SIZE = 20
  const didHandleNav = useRef(false)

  // Handle deep-link from Overview high-risk cards
  useEffect(() => {
    const { mentionId, sentimentFilter } = location.state || {}
    if (!mentionId || didHandleNav.current || allMentions.length === 0) return
    didHandleNav.current = true

    if (sentimentFilter) {
      resetFilters()
      setSelectedSentiments([sentimentFilter])
      setRiskOnly(true)
    }

    const target = allMentions.find(m => m.id === mentionId)
    if (target) setSelectedMention(target)
  }, [allMentions, location.state])

  const sorted = useMemo(() => sortMentions(filteredMentions, sortBy), [filteredMentions, sortBy])
  const paginated = useMemo(() => sorted.slice(0, page * PAGE_SIZE), [sorted, page])

  useEffect(() => {
    if (!selectedMention) return
    const handleKey = (e) => {
      if (e.key === 'Escape') { setSelectedMention(null); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const idx = sorted.findIndex(m => m.id === selectedMention.id)
      if (e.key === 'ArrowDown') {
        // Load next page if we're at the end of paginated results
        if (idx === paginated.length - 1 && paginated.length < sorted.length) {
          setPage(p => p + 1)
        }
        const next = sorted[idx + 1]
        if (next) setSelectedMention(next)
      } else {
        const prev = sorted[idx - 1]
        if (prev) setSelectedMention(prev)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedMention, sorted, paginated])

  // Scroll active card into view when navigating with keyboard
  useEffect(() => {
    if (!selectedMention || !listRef.current) return
    const card = listRef.current.querySelector(`[data-id="${selectedMention.id}"]`)
    if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedMention])

  // Mark high risk mention as read when detail panel opens
  useEffect(() => {
    if (selectedMention?.riskLevel === 'high') markRead(selectedMention.id)
  }, [selectedMention?.id])

  // Init scroll-down indicator
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const check = () => setListCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Infinite scroll — observe sentinel at bottom of list
  useEffect(() => {
    const sentinel = loaderRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      if (loadingMore) return
      if (page * PAGE_SIZE >= sorted.length) return
      setLoadingMore(true)
      setTimeout(() => {
        setPage(p => p + 1)
        setLoadingMore(false)
      }, 600)
    }, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadingMore, page, sorted.length])

  return (
    <div className="flex gap-4 h-[calc(100vh-5rem)] -mb-4">
      {/* Left sidebar filters — desktop only */}
      <div className="hidden md:block w-64 flex-shrink-0 h-full">
        <FilterBar />
      </div>

      {/* Mobile filter drawer backdrop */}
      {filterDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setFilterDrawerOpen(false)}
        />
      )}

      {/* Mobile filter drawer — slides up from bottom */}
      <div className={clsx(
        'md:hidden fixed inset-x-0 bottom-0 z-50 bg-canvas dark:bg-surface-dark rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out max-h-[85vh] flex flex-col',
        filterDrawerOpen ? 'translate-y-0' : 'translate-y-full'
      )}>
        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-hairline dark:border-white/8 flex-shrink-0 pt-5">
          <div className="absolute left-1/2 -translate-x-1/2 top-3 w-10 h-1 rounded-full bg-hairline-strong dark:bg-white/20" />
          <span className="text-sm font-semibold text-ink dark:text-on-dark">Filters</span>
          <button onClick={() => setFilterDrawerOpen(false)} className="p-1.5 rounded-md hover:bg-surface-strong text-muted">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-10">
          <FilterBar inline />
        </div>
      </div>

      {/* Main feed */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${selectedMention ? 'md:pr-96' : ''}`}>
        {/* Feed header — sticky */}
        <div className="flex items-center justify-between mb-3 sticky top-0 z-10 bg-canvas dark:bg-surface-dark py-2 -mt-2">
          <span className="text-xs text-muted dark:text-on-dark-soft">{filteredMentions.length} mentions</span>
          <div className="flex items-center gap-2">
            {/* Filters button — mobile only */}
            <button
              onClick={() => setFilterDrawerOpen(true)}
              className={clsx(
                'md:hidden flex items-center gap-1.5 text-xs rounded-md px-3 py-1.5 transition-colors border',
                activeFilterCount > 0
                  ? 'border-[#2940BE] text-[#2940BE] bg-[#2940BE]/8 font-semibold'
                  : 'border-hairline-strong dark:border-white/8 bg-canvas dark:bg-surface-dark-elevated text-body dark:text-on-dark-soft hover:border-ink/30'
              )}
            >
              <SlidersHorizontal size={12} />
              Filters
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#2940BE] text-white text-[0.5625rem] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 w-auto gap-1 text-xs bg-canvas dark:bg-surface-dark-elevated border-hairline-strong dark:border-white/8 text-body dark:text-on-dark-soft">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mentions list */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={listRef}
            className="h-full overflow-y-auto space-y-2 pb-4 scroll-pb-2 scroll-pt-8"
            onScroll={e => {
              const el = e.currentTarget
              setScrolled(el.scrollTop > 10)
              setListCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
            }}
          >
          {paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted">
              <MessageCircle size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No mentions match your filters</p>
            </div>
          ) : (
            <>
              {paginated.map(m => (
                <div key={m.id} data-id={m.id}>
                  <MentionCard
                    mention={m}
                    onClick={setSelectedMention}
                    selected={selectedMention?.id === m.id}
                  />
                </div>
              ))}
              <div ref={loaderRef} className="flex justify-center py-4">
                {loadingMore && (
                  <svg className="animate-spin h-5 w-5 text-[#2940BE]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
              </div>
            </>
          )}
          </div>
          {scrolled && (
            <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-canvas dark:from-surface-dark to-transparent pointer-events-none" />
          )}
          {listCanScrollDown && (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-canvas dark:from-surface-dark to-transparent pointer-events-none" />
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedMention && (
        <DetailPanel
          mention={selectedMention}
          onClose={() => setSelectedMention(null)}
          onSaved={(updated) => setSelectedMention(m => ({ ...m, analystReview: { ...m.analystReview, ...updated } }))}
          hasPrev={sorted.findIndex(m => m.id === selectedMention.id) > 0}
          hasNext={sorted.findIndex(m => m.id === selectedMention.id) < sorted.length - 1}
          onPrev={() => {
            const idx = sorted.findIndex(m => m.id === selectedMention.id)
            if (idx > 0) setSelectedMention(sorted[idx - 1])
          }}
          onNext={() => {
            const idx = sorted.findIndex(m => m.id === selectedMention.id)
            if (idx < sorted.length - 1) {
              if (idx === paginated.length - 1) setPage(p => p + 1)
              setSelectedMention(sorted[idx + 1])
            }
          }}
        />
      )}
    </div>
  )
}
