import React, { useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, TrendingUp, TrendingDown, AlertTriangle, Tag, BarChart2, Eye } from 'lucide-react'
import { parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfHour, endOfHour, parse } from 'date-fns'
import { useDashboard } from '../context/DashboardContext'
import { getKPIs } from '../data/mockAnalytics'
import { getAllKeywords, getGroupById } from '../data/mockKeywords'
import KPICard from '../components/common/KPICard'
import MentionCard from '../components/common/MentionCard'
import SentimentTimelineChart from '../components/charts/SentimentTimelineChart'
import PlatformBreakdownChart from '../components/charts/PlatformBreakdownChart'
import KeywordComparisonChart from '../components/charts/KeywordComparisonChart'
import { isAtRisk } from '../constants/sentiment'
import { BRAND_COLORS, SENTIMENT_COLORS } from '../constants/colors'
import { formatNum } from '../utils/format'

const PRESET_CHART = {
  'today': { days: 1,   granularity: 'hour'  },
  '7d':    { days: 7,   granularity: 'day'   },
  '1m':    { days: 30,  granularity: 'day'   },
  '3m':    { days: 90,  granularity: 'week'  },
  '1y':    { days: 365, granularity: 'month' },
}

export default function Overview() {
  const { filteredMentions, activePreset, setDateRange } = useDashboard()
  const navigate = useNavigate()
  const { days, granularity } = PRESET_CHART[activePreset] || PRESET_CHART['1m']

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

  const topKeyword = allKeywords.find(k => k.id === kpis.topKeyword)

  return (
    <div className="flex flex-col h-full gap-4">
      {/* KPI Row */}
      <div className="grid grid-cols-6 gap-4">
        <KPICard
          title="Total Mentions"
          value={kpis.totalMentions}
          icon={MessageSquare}
          iconColor={BRAND_COLORS.primary}
          subtitle={`${formatNum(kpis.totalReach)} reach`}
        />
        <KPICard
          title="Positive Rate"
          value={kpis.positivePercent}
          unit="%"
          icon={TrendingUp}
          iconColor={SENTIMENT_COLORS.positive}
          valueColor={SENTIMENT_COLORS.positive}
          subtitle={`${kpis.positiveCount} positive mentions`}
          trend="up"
        />
        <KPICard
          title="Negative Rate"
          value={kpis.negativePercent}
          unit="%"
          icon={TrendingDown}
          iconColor={SENTIMENT_COLORS.negative}
          valueColor={SENTIMENT_COLORS.negative}
          subtitle={`${kpis.negativeCount} negative mentions`}
        />
        <KPICard
          title="Net Sentiment"
          value={kpis.netSentimentScore}
          unit="%"
          icon={BarChart2}
          iconColor={kpis.netSentimentScore >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative}
          valueColor={kpis.netSentimentScore >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative}
          subtitle="Positive minus negative"
        />
        <KPICard
          title="At-Risk Mentions"
          value={kpis.atRiskCount}
          icon={AlertTriangle}
          iconColor={kpis.atRiskCount > 5 ? SENTIMENT_COLORS.negative : '#f59e0b'}
          valueColor={kpis.atRiskCount > 5 ? SENTIMENT_COLORS.negative : BRAND_COLORS.darkText}
          subtitle="Flagged for review"
          trend={kpis.atRiskCount > 5 ? 'down' : 'flat'}
        />
        <KPICard
          title="Top Keyword"
          value={topKeyword?.term || '—'}
          icon={Tag}
          iconColor={BRAND_COLORS.purple}
          subtitle={topKeyword ? `${kpis.topKeywordCount} mentions` : 'No data'}
        />
      </div>

      {/* Row 2+3 — Left column (Timeline + Platform + Keyword) | Right column (High-Risk tall) */}
      <div className="grid grid-cols-6 gap-4 items-stretch flex-1 min-h-0">
        {/* Left: stacked — spans 4 of 6 columns */}
        <div className="col-span-4 flex flex-col gap-4 min-h-0">
          <div className="card flex-1 min-h-[300px] max-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="text-sm font-semibold text-darktext">Sentiment Timeline</h2>
              <span className="text-xs text-gray-400">{filteredMentions.length} mentions in period</span>
            </div>
            <div className="flex-1 min-h-0">
              <SentimentTimelineChart mentions={filteredMentions} days={days} granularity={granularity} onPointClick={handleTimelineClick} />
            </div>
          </div>
          <div className="flex gap-4 flex-1 min-h-[300px] max-h-[600px]">
            <div className="card flex-1 flex flex-col min-h-0">
              <h2 className="text-sm font-semibold text-darktext mb-4 flex-shrink-0">Platform Breakdown</h2>
              <div className="flex-1 min-h-0">
                <PlatformBreakdownChart mentions={filteredMentions} />
              </div>
            </div>
            <div className="card flex-1 flex flex-col min-h-0">
              <h2 className="text-sm font-semibold text-darktext mb-4 flex-shrink-0">Keyword Comparison</h2>
              <div className="flex-1 min-h-0">
                <KeywordComparisonChart mentions={filteredMentions} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: tall High-Risk — spans 2 of 6 columns */}
        <div className="card col-span-2 relative" style={{ padding: 0 }}>
          {/* absolute fill so this panel never expands the grid row */}
          <div className="absolute inset-0 flex flex-col pt-5 px-5 pb-0 overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="text-sm font-semibold text-darktext">Recent Negative Mentions</h2>
              <span className="text-xs text-gray-400">{kpis.atRiskCount} total at risk</span>
            </div>
            {highRiskMentions.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">No at-risk mentions</div>
            ) : (
              <div className="relative flex-1 min-h-0">
                {riskScrolled && (
                  <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
                )}
                {!riskScrolledToBottom && (
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none" />
                )}
                <div
                  ref={riskListRef}
                  onScroll={handleRiskScroll}
                  className="space-y-2 overflow-y-auto h-full pb-4 scrollbar-hide"
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
