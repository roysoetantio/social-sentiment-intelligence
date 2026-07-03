import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, TrendingUp, TrendingDown, AlertTriangle, Tag, BarChart2, Eye } from 'lucide-react'
import { parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfHour, endOfHour, parse } from 'date-fns'
import { useDashboard } from '../context/DashboardContext'
import { useAuth } from '../context/AuthContext'
import { getKPIs } from '../data/analytics'
import { getAllKeywords, getGroupById } from '../data/fallbackKeywords'
import KPICard from '../components/common/KPICard'
import MentionCard from '../components/common/MentionCard'
import SentimentTimelineChart from '../components/charts/SentimentTimelineChart'
import PlatformBreakdownChart from '../components/charts/PlatformBreakdownChart'
import KeywordComparisonChart from '../components/charts/KeywordComparisonChart'
import { isAtRisk } from '../constants/sentiment'
import { BRAND_COLORS, SENTIMENT_COLORS } from '../constants/colors'
import { formatNum } from '../utils/format'
import AICard from '../components/common/AICard'
import { fetchAIDigest } from '../services/apiService'

const PRESET_CHART = {
  'today': { days: 1,   granularity: 'hour'  },
  '7d':    { days: 7,   granularity: 'day'   },
  '1m':    { days: 30,  granularity: 'day'   },
  '3m':    { days: 90,  granularity: 'week'  },
  '1y':    { days: 365, granularity: 'month' },
}

export default function Overview() {
  const { globalFilteredMentions: filteredMentions, activePreset, setDateRange, allKeywordsFlat } = useDashboard()
  const { fullName, isSuperAdmin, viewDepartment, department } = useAuth()
  const navigate = useNavigate()
  const { days, granularity } = PRESET_CHART[activePreset] || PRESET_CHART['1m']
  const [digest, setDigest] = useState(undefined)

  // The tenant whose digest we show: super admins follow the department switcher.
  const currentDepartment = isSuperAdmin ? viewDepartment : department

  useEffect(() => {
    setDigest(undefined)
    fetchAIDigest(currentDepartment).then(data => setDigest(data ?? null))
  }, [currentDepartment])

  const handleTimelineClick = useCallback((dateKey) => {
    let start, end
    if (granularity === 'month') {
      // dateKey: "yyyy-MM"
      const d = parse(dateKey, 'yyyy-MM', new Date())
      start = startOfMonth(d)
      end   = endOfMonth(d)
    } else if (granularity === 'week') {
      // dateKey: "yyyy-MM-dd" (week start)
      const d = parse(dateKey, 'yyyy-MM-dd', new Date())
      start = startOfWeek(d, { weekStartsOn: 1 })
      end   = endOfWeek(d, { weekStartsOn: 1 })
    } else if (granularity === 'hour') {
      // dateKey: "yyyy-MM-dd HH"
      const d = parse(dateKey, 'yyyy-MM-dd HH', new Date())
      start = startOfHour(d)
      end   = endOfHour(d)
    } else {
      // day: "yyyy-MM-dd"
      const d = parse(dateKey, 'yyyy-MM-dd', new Date())
      start = startOfDay(d)
      end   = endOfDay(d)
    }
    setDateRange({ start, end })
    navigate('/mentions')
  }, [granularity, setDateRange, navigate])
  const allKeywords = getAllKeywords()

  const kpis = useMemo(() => getKPIs(filteredMentions), [filteredMentions])

  const riskListRef = useRef(null)
  const [riskScrolled, setRiskScrolled] = useState(false)
  const [riskScrolledToBottom, setRiskScrolledToBottom] = useState(false)
  const handleRiskScroll = useCallback(() => {
    const el = riskListRef.current
    if (!el) return
    setRiskScrolled(el.scrollTop > 0)
    setRiskScrolledToBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4)
  }, [])

  const highRiskMentions = useMemo(() =>
    filteredMentions
      .filter(isAtRisk)
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2, null: 3 }
        return (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3)
      })
      ,
    [filteredMentions]
  )

  // Prefer the real (tenant-scoped) keywords from Supabase; fall back to the
  // hardcoded offline list only if not found there.
  const topKeyword =
    allKeywordsFlat.find(k => k.id === kpis.topKeyword) ||
    allKeywords.find(k => k.id === kpis.topKeyword)

  const greeting = (() => {
    const h = parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kuala_Lumpur' }), 10)
    if (h < 12) return 'Good Morning'
    if (h < 17) return 'Good Afternoon'
    return 'Good Evening'
  })()

  return (
    <div className="flex flex-col lg:h-full gap-3 lg:gap-4">

      {/* Greeting + AI Digest */}
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 lg:gap-4 items-stretch">

        {/* Left — Greeting */}
        <div className="sm:col-span-2 flex flex-col justify-start mb-4 sm:mb-0">
          <p className="text-sm text-muted mb-0.5">{greeting},</p>
          <p className="text-[1.75rem] font-semibold text-ink leading-tight">{fullName}</p>
        </div>

        {/* Right — AI Digest */}
        <div className="sm:col-span-4">
          <AICard
            label="AI Digest"
            aside={digest ? `Updated ${new Date(digest.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : undefined}
          >
            {digest === undefined && (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-[#2940BE]/20 rounded w-full" />
                <div className="h-3 bg-[#2940BE]/20 rounded w-5/6" />
                <div className="h-3 bg-[#2940BE]/20 rounded w-4/6" />
              </div>
            )}
            {digest === null && (
              <p className="text-sm text-gray-400 italic">No digest available — run the post-ingest workflow to generate one.</p>
            )}
            {digest && (
              <p className="text-sm text-body leading-snug">{digest.content.slice(0, 450)}</p>
            )}
          </AICard>
        </div>

      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
        <KPICard
          title="Total Mentions"
          value={kpis.totalMentions}
          icon={MessageSquare}
          iconColor={BRAND_COLORS.primary}
          subtitle={`${formatNum(kpis.totalReach)} reach`}
          tooltip="All mentions across every source in the selected date range."
        />
        <KPICard
          title="Positive Rate"
          value={kpis.positivePercent}
          unit="%"
          icon={TrendingUp}
          iconColor={SENTIMENT_COLORS.positive}
          valueColor={SENTIMENT_COLORS.positive}
          subtitle={`${kpis.positiveCount} positive mentions`}
          tooltip="Share of mentions with positive sentiment."
        />
        <KPICard
          title="Negative Rate"
          value={kpis.negativePercent}
          unit="%"
          icon={TrendingDown}
          iconColor={SENTIMENT_COLORS.negative}
          valueColor={SENTIMENT_COLORS.negative}
          subtitle={`${kpis.negativeCount} negative mentions`}
          tooltip="Share of mentions with negative sentiment."
        />
        <KPICard
          title="Net Sentiment"
          value={kpis.netSentimentScore}
          unit="%"
          icon={BarChart2}
          iconColor={kpis.netSentimentScore >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative}
          valueColor={kpis.netSentimentScore >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative}
          subtitle="Positive minus negative"
          tooltip="Positive rate minus negative rate."
        />
        <KPICard
          title="At-Risk Mentions"
          value={kpis.atRiskCount}
          icon={AlertTriangle}
          iconColor={kpis.atRiskCount > 5 ? SENTIMENT_COLORS.negative : '#f59e0b'}
          valueColor={kpis.atRiskCount > 5 ? SENTIMENT_COLORS.negative : BRAND_COLORS.darkText}
          subtitle="Flagged for review"
          tooltip="Negative mentions with Medium or High risk. Excludes Low risk."
        />
        <KPICard
          title="Top Keyword"
          value={topKeyword?.term || '—'}
          icon={Tag}
          iconColor={BRAND_COLORS.purple}
          subtitle={topKeyword ? `${kpis.topKeywordCount} mentions` : 'No data'}
          compact
          tooltip="Most-mentioned keyword in the selected period."
        />
      </div>

      {/* Row 2+3 — Left column (Timeline + Platform + Keyword) | Right column (High-Risk tall) */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 lg:gap-4 lg:items-stretch lg:flex-1 lg:min-h-0">
        {/* Left: stacked — spans 4 of 6 columns */}
        <div className="lg:col-span-4 flex flex-col gap-3 lg:gap-4 lg:min-h-0">
          <div className="card h-[320px] lg:flex-1 lg:h-auto lg:min-h-[290px] lg:max-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight">Sentiment Timeline</h2>
              <span className="text-xs text-muted dark:text-on-dark-soft">{filteredMentions.length} mentions in period</span>
            </div>
            <div className="flex-1 min-h-0">
              <SentimentTimelineChart mentions={filteredMentions} days={days} granularity={granularity} onPointClick={handleTimelineClick} />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 lg:flex-1 lg:min-h-[290px] lg:max-h-[600px]">
            <div className="card h-[320px] sm:h-auto sm:flex-1 flex flex-col min-h-0">
              <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight mb-4 flex-shrink-0">Platform Breakdown</h2>
              <div className="flex-1 min-h-0">
                <PlatformBreakdownChart mentions={filteredMentions} />
              </div>
            </div>
            <div className="card h-[320px] sm:h-auto sm:flex-1 flex flex-col min-h-0">
              <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight mb-4 flex-shrink-0">Keyword Comparison</h2>
              <div className="flex-1 min-h-0">
                <KeywordComparisonChart mentions={filteredMentions} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: tall High-Risk — spans 2 of 6 columns */}
        {/* Mobile: normal flow with 12px padding, no scroll. Desktop: absolute fill with scroll */}
        <div className="card lg:col-span-2 relative lg:min-h-[400px] p-3 lg:p-0">
          {/* Desktop inner absolute fill */}
          <div className="lg:absolute lg:inset-0 flex flex-col lg:pt-5 lg:px-5 lg:pb-0 overflow-hidden lg:overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight">Recent At-Risk Mentions</h2>
              <span className="text-xs text-muted dark:text-on-dark-soft">{kpis.atRiskCount} total mentions</span>
            </div>
            {highRiskMentions.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted dark:text-on-dark-soft">No at-risk mentions</div>
            ) : (
              <div className="relative lg:flex-1 lg:min-h-0">
                {riskScrolled && (
                  <div className="hidden lg:block absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-canvas to-transparent z-10 pointer-events-none" />
                )}
                {!riskScrolledToBottom && (
                  <div className="hidden lg:block absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-canvas to-transparent z-10 pointer-events-none" />
                )}
                <div
                  ref={riskListRef}
                  onScroll={handleRiskScroll}
                  className="space-y-2 lg:overflow-y-auto lg:h-full lg:pb-4 scrollbar-hide"
                >
                  {highRiskMentions.map(m => (
                    <MentionCard
                      key={m.id}
                      mention={m}
                      onClick={() => navigate('/mentions', { state: { mentionId: m.id, sentimentFilter: 'negative' } })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
