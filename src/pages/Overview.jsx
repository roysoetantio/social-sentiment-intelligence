import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, TrendingUp, TrendingDown, AlertTriangle, Tag, BarChart2, Maximize2 } from 'lucide-react'
import { parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfHour, endOfHour, parse } from 'date-fns'
import { useDashboard } from '../context/DashboardContext'
import { useAuth } from '../context/AuthContext'
import { getKPIs, pickGranularity, getTimelineData, getKPIComparison, getCoverageQuality } from '../data/analytics'
import { getAllKeywords, getGroupById } from '../data/fallbackKeywords'
import KPICard from '../components/common/KPICard'
import SentimentTimelineChart from '../components/charts/SentimentTimelineChart'
import PlatformBreakdownChart from '../components/charts/PlatformBreakdownChart'
import KeywordComparisonChart from '../components/charts/KeywordComparisonChart'
import MediaCoverage from '../components/charts/MediaCoverage'
import SegmentedControl from '../components/common/SegmentedControl'
import { BRAND_COLORS, SENTIMENT_COLORS } from '../constants/colors'
import AICard from '../components/common/AICard'
import { fetchAIDigest } from '../services/apiService'

export default function Overview() {
  const {
    globalFilteredMentions: filteredMentions,
    previousPeriodMentions,
    previousRange,
    dateRange, setDateRange, allKeywordsFlat,
    hasComparisonPeriod,
    setOutletFilter,
    setAtRiskOnly,
  } = useDashboard()
  const { fullName, isSuperAdmin, viewDepartment, department } = useAuth()
  const navigate = useNavigate()
  // Bucket size follows the actual selected range, so presets and manual ranges match.
  const granularity = useMemo(() => pickGranularity(dateRange.start, dateRange.end), [dateRange])
  const [digest, setDigest] = useState(undefined)
  // Owned here so the tabs can sit in the card header rather than above the list.
  const [sourceTab, setSourceTab] = useState('outlet')

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

  // Every headline number is diffed against the equivalent window immediately
  // before this one — same tenant scope, same search, same length.
  const prevKPIs = useMemo(() => getKPIs(previousPeriodMentions), [previousPeriodMentions])
  const comparison = useMemo(() => getKPIComparison(kpis, prevKPIs), [kpis, prevKPIs])

  // Bucketed once here and reused for every sparkline, at the same granularity
  // as the timeline chart so the small trends agree with the big one.
  const timeline = useMemo(
    () => getTimelineData(filteredMentions, { start: dateRange.start, end: dateRange.end, granularity }),
    [filteredMentions, dateRange, granularity]
  )
  const series = useMemo(() => ({
    volume:   timeline.map(b => b.total),
    positive: timeline.map(b => b.positive),
    negative: timeline.map(b => b.negative),
    net:      timeline.map(b => (b.total > 0 ? ((b.positive - b.negative) / b.total) * 100 : 0)),
  }), [timeline])

  const coverage = useMemo(() => getCoverageQuality(filteredMentions), [filteredMentions])

  const comparisonLabel = useMemo(() => {
    const start = new Date(previousRange.start)
    const end = new Date(previousRange.end)
    // A long range lands the comparison window in another year, and "3 Sep –
    // 3 Sep" then reads as a single day. Show the year whenever it isn't this one.
    const thisYear = new Date().getFullYear()
    const needsYear = start.getFullYear() !== end.getFullYear() || start.getFullYear() !== thisYear
    const opts = needsYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' }
    return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`
  }, [previousRange])

  // Drill down from a leaderboard row into exactly the mentions behind it.
  const handleSourceSelect = useCallback((row, opts = {}) => {
    setOutletFilter({ key: row.key, label: row.kind === 'voice' && row.handle ? `@${row.handle}` : row.label })
    setAtRiskOnly(Boolean(opts.atRisk))
    navigate('/mentions')
  }, [setOutletFilter, setAtRiskOnly, navigate])

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
    <div className="flex flex-col lg:min-h-full gap-3 lg:gap-4">

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
          subtitle={`${coverage.outletCount} outlet${coverage.outletCount === 1 ? '' : 's'} · ${coverage.tier1Count} tier 1`}
          comparisonLabel={hasComparisonPeriod ? comparisonLabel : undefined}
          delta={hasComparisonPeriod ? comparison.totalMentions : undefined}
          /* Volume alone is not good or bad news — a spike can be a campaign or
             a crisis — so this delta stays neutral rather than green-on-up. */
          deltaGoodWhen="none"
          series={series.volume}
          seriesColor={BRAND_COLORS.primary}
          tooltip="All mentions across every source in the selected date range. The subtitle counts distinct publications, not reach — reach is reported by only some sources."
        />
        <KPICard
          title="Positive Rate"
          value={kpis.positivePercent}
          unit="%"
          icon={TrendingUp}
          iconColor={SENTIMENT_COLORS.positive}
          valueColor={SENTIMENT_COLORS.positive}
          subtitle={`${kpis.positiveCount} positive mentions`}
          comparisonLabel={hasComparisonPeriod ? comparisonLabel : undefined}
          delta={hasComparisonPeriod ? comparison.positivePercent : undefined}
          deltaGoodWhen="up"
          series={series.positive}
          seriesColor={SENTIMENT_COLORS.positive}
          tooltip="Share of mentions with positive sentiment. The change is in percentage points against the previous period."
        />
        <KPICard
          title="Negative Rate"
          value={kpis.negativePercent}
          unit="%"
          icon={TrendingDown}
          iconColor={SENTIMENT_COLORS.negative}
          valueColor={SENTIMENT_COLORS.negative}
          subtitle={`${kpis.negativeCount} negative mentions`}
          comparisonLabel={hasComparisonPeriod ? comparisonLabel : undefined}
          delta={hasComparisonPeriod ? comparison.negativePercent : undefined}
          deltaGoodWhen="down"
          series={series.negative}
          seriesColor={SENTIMENT_COLORS.negative}
          tooltip="Share of mentions with negative sentiment. The change is in percentage points against the previous period."
        />
        <KPICard
          title="Net Sentiment"
          value={kpis.netSentimentScore}
          unit="%"
          icon={BarChart2}
          iconColor={kpis.netSentimentScore >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative}
          valueColor={kpis.netSentimentScore >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative}
          subtitle="Positive minus negative"
          comparisonLabel={hasComparisonPeriod ? comparisonLabel : undefined}
          delta={hasComparisonPeriod ? comparison.netSentimentScore : undefined}
          deltaGoodWhen="up"
          series={series.net}
          seriesColor={kpis.netSentimentScore >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative}
          tooltip="Positive rate minus negative rate. The change is in percentage points against the previous period."
        />
        <KPICard
          title="At-Risk Mentions"
          value={kpis.atRiskCount}
          icon={AlertTriangle}
          iconColor={kpis.atRiskCount > 5 ? SENTIMENT_COLORS.negative : '#f59e0b'}
          valueColor={kpis.atRiskCount > 5 ? SENTIMENT_COLORS.negative : undefined}
          subtitle="Flagged for review"
          comparisonLabel={hasComparisonPeriod ? comparisonLabel : undefined}
          delta={hasComparisonPeriod ? comparison.atRiskCount : undefined}
          deltaGoodWhen="down"
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

      {/* Row 2+3 — Left: timeline over media coverage. Right: distribution charts.
          The Recent At-Risk panel used to occupy the right column; it was removed
          because the notification bell already lists high-risk mentions. Note the
          bell is high-risk only, while the At-Risk KPI counts medium as well —
          those still surface through the risk filter in Mentions Explorer. */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 lg:gap-4 lg:items-stretch lg:flex-1 lg:min-h-[38rem]">
        {/* Left — spans 4 of 6 columns */}
        <div className="lg:col-span-4 flex flex-col gap-3 lg:gap-4 lg:min-h-0">
          <div className="card h-[320px] lg:flex-1 lg:h-auto lg:min-h-[290px] lg:max-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="text-base font-semibold text-ink tracking-tight">Sentiment Timeline</h2>
              <span className="text-xs text-muted">{filteredMentions.length} mentions in period</span>
            </div>
            <div className="flex-1 min-h-0">
              <SentimentTimelineChart mentions={filteredMentions} start={dateRange.start} end={dateRange.end} granularity={granularity} onPointClick={handleTimelineClick} />
            </div>
          </div>

          <div className="card h-auto lg:flex-1 lg:h-auto lg:min-h-[290px] lg:max-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2">
              <h2 className="text-base font-semibold text-ink tracking-tight truncate">Top 5 Sources &amp; Coverage</h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                <SegmentedControl
                  value={sourceTab}
                  onChange={setSourceTab}
                  options={[{ value: 'outlet', label: 'Outlets' }, { value: 'voice', label: 'Voices' }]}
                />
                <button
                  onClick={() => navigate('/sources')}
                  aria-label="Expand sources and coverage"
                  title="Expand"
                  className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <MediaCoverage
                mentions={filteredMentions}
                previousMentions={previousPeriodMentions}
                onSelect={handleSourceSelect}
                showTrend={hasComparisonPeriod}
                tab={sourceTab}
                onTabChange={setSourceTab}
              />
            </div>
          </div>
        </div>

        {/* Right — distribution, spans 2 of 6 columns */}
        <div className="lg:col-span-2 flex flex-col gap-3 lg:gap-4 lg:min-h-0">
          <div className="card h-[320px] lg:flex-1 lg:h-auto lg:min-h-0 flex flex-col">
            <h2 className="text-base font-semibold text-ink tracking-tight mb-4 flex-shrink-0">Platform Breakdown</h2>
            <div className="flex-1 min-h-0">
              <PlatformBreakdownChart mentions={filteredMentions} />
            </div>
          </div>
          <div className="card h-[320px] lg:flex-1 lg:h-auto lg:min-h-0 flex flex-col">
            <h2 className="text-base font-semibold text-ink tracking-tight mb-4 flex-shrink-0">Keyword Comparison</h2>
            <div className="flex-1 min-h-0">
              <KeywordComparisonChart mentions={filteredMentions} />
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
