import React, { useMemo, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ReferenceLine, AreaChart, Area,
} from 'recharts'
import { AlertTriangle, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard } from '../context/DashboardContext'
import { getKPIs, getPlatformBreakdown, getKeywordGroupStats, getTopEmotions, getTimelineData } from '../data/analytics'
import { KEYWORD_GROUPS } from '../data/fallbackKeywords'
import SentimentTimelineChart from '../components/charts/SentimentTimelineChart'
import SentimentHeatmap from '../components/charts/SentimentHeatmap'
import { SENTIMENT_COLORS, EMOTION_COLORS, BRAND_COLORS } from '../constants/colors'

function NetSentimentGauge({ score }) {
  const clamped = Math.max(-100, Math.min(100, score))
  const pct = (clamped + 100) / 2  // 0–100
  const color = clamped >= 20 ? SENTIMENT_COLORS.positive : clamped >= 0 ? SENTIMENT_COLORS.neutral : clamped >= -20 ? '#f59e0b' : SENTIMENT_COLORS.negative

  // SVG half-donut: cx=100 cy=100 r=80, arc goes left→right (180°)
  const r = 80
  const circumference = Math.PI * r  // half circle arc length
  const dash = (pct / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <svg width="200" height="110" viewBox="0 0 200 110">
        {/* Track */}
        <path
          d={`M 20 100 A 80 80 0 0 1 180 100`}
          fill="none"
          stroke="currentColor"
          className="text-surface-strong dark:text-white/8"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M 20 100 A 80 80 0 0 1 180 100`}
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="text-center -mt-4">
        <span className="text-4xl font-bold" style={{ color }}>
          {clamped >= 0 ? '+' : ''}{clamped.toFixed(1)}
        </span>
        <p className="text-sm text-body dark:text-on-dark-soft mt-1">Net Sentiment Score</p>
        <p className="text-xs text-muted dark:text-on-dark-soft">(Positive − Negative) / Total × 100</p>
      </div>
    </div>
  )
}

const SENTIMENT_SERIES = ['positive', 'neutral', 'negative']

function SentimentLegend({ hidden, onToggle }) {
  return (
    <div className="flex items-center justify-center gap-4 mt-3">
      {SENTIMENT_SERIES.map(key => (
        <button
          key={key}
          onClick={() => onToggle(key)}
          className="flex items-center gap-1.5 transition-opacity"
          style={{ opacity: hidden.includes(key) ? 0.35 : 1 }}
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SENTIMENT_COLORS[key] }} />
          <span className="text-[11px] capitalize" style={{ color: '#6b7280' }}>{key}</span>
        </button>
      ))}
    </div>
  )
}

function useSentimentLegend() {
  const [hidden, setHidden] = useState([])
  const toggle = (key) => setHidden(prev => {
    if (prev.length === 0) return SENTIMENT_SERIES.filter(k => k !== key)
    const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    return next.length === SENTIMENT_SERIES.length ? [] : next
  })
  return [hidden, toggle]
}

export default function SentimentAnalytics() {
  const { globalFilteredMentions: filteredMentions, setHeatmapFilter } = useDashboard()
  const navigate = useNavigate()
  const [platformHidden, togglePlatform] = useSentimentLegend()
  const [groupHidden, toggleGroup] = useSentimentLegend()

  const handleHeatmapClick = useCallback(({ day, hour }) => {
    setHeatmapFilter({ day, hour })
    navigate('/mentions')
  }, [setHeatmapFilter, navigate])
  const kpis = useMemo(() => getKPIs(filteredMentions), [filteredMentions])
  const platformData = useMemo(() => getPlatformBreakdown(filteredMentions), [filteredMentions])
  const groupStats = useMemo(() => getKeywordGroupStats(filteredMentions), [filteredMentions])
  const topEmotions = useMemo(() => getTopEmotions(filteredMentions), [filteredMentions])
  const timelineData = useMemo(() => getTimelineData(filteredMentions, 90), [filteredMentions])

  const groupBarData = useMemo(() => {
    return KEYWORD_GROUPS.map(g => ({
      name: g.name,
      ...groupStats[g.id] || { total: 0, positive: 0, negative: 0, neutral: 0, mixed: 0 },
    }))
  }, [groupStats])

  const crisisData = useMemo(() => {
    return timelineData.map(d => ({
      ...d,
      negativeRate: d.total > 0 ? parseFloat((d.negative / d.total * 100).toFixed(1)) : 0,
      isCrisis: d.negative >= 3 && d.total > 0 && (d.negative / d.total) > 0.4,
    }))
  }, [timelineData])

  const maxEmotionCount = Math.max(...topEmotions.map(e => e.count), 1)

  const CustomPlatformTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const total = payload.reduce((s, p) => s + (p.value || 0), 0)
    return (
      <div className="chart-tooltip">
        <p className="font-semibold dark:text-on-dark mb-1.5">{label}</p>
        {payload.filter(p => p.value > 0).map(p => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
              <span className="capitalize text-body dark:text-on-dark-soft">{p.dataKey}</span>
            </div>
            <span className="font-medium dark:text-on-dark">{p.value}</span>
          </div>
        ))}
        <div className="mt-1.5 pt-1.5 border-t border-hairline dark:border-white/8 flex justify-between">
          <span className="text-body dark:text-on-dark-soft">Total</span>
          <span className="font-semibold dark:text-on-dark">{total}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Hero net sentiment + Timeline side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card flex flex-col">
          <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight mb-4">Net Sentiment Score</h2>
          <div className="grid grid-cols-5 gap-4 items-stretch flex-1">
            <div className="col-span-3 flex items-center justify-center">
              <NetSentimentGauge score={kpis.netSentimentScore} />
            </div>
            <div className="col-span-2 flex flex-col gap-2 self-stretch">
              {[
                { label: 'Positive', value: kpis.positiveCount, pct: kpis.positivePercent, color: SENTIMENT_COLORS.positive },
                { label: 'Negative', value: kpis.negativeCount, pct: kpis.negativePercent, color: SENTIMENT_COLORS.negative },
                { label: 'Neutral', value: kpis.neutralCount, pct: kpis.neutralPercent, color: SENTIMENT_COLORS.neutral },
              ].map(s => (
                <div key={s.label} className="bg-surface-strong dark:bg-white/8 rounded-md px-3 flex-1 flex items-center gap-3">
                  <div className="text-xl font-bold leading-none w-10 flex-shrink-0" style={{ color: s.color }}>{s.value}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1">
                      <span className="text-xs font-medium text-body dark:text-on-dark-soft">{s.label}</span>
                      <span className="text-xs text-muted dark:text-on-dark-soft">{s.pct}%</span>
                    </div>
                    <div className="h-1 bg-surface-strong dark:bg-white/8 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight mb-4">Sentiment Over Time</h2>
          <SentimentTimelineChart mentions={filteredMentions} days={90} height={240} />
        </div>
      </div>

      {/* Platform & Group breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight mb-4">Sentiment by Platform</h2>
          {!filteredMentions.length ? (
            <div className="flex items-center justify-center h-48 text-xs text-muted">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={platformData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomPlatformTooltip />} />
                  <Bar dataKey="positive" stackId="a" fill={SENTIMENT_COLORS.positive} hide={platformHidden.includes('positive')} />
                  <Bar dataKey="neutral" stackId="a" fill={SENTIMENT_COLORS.neutral} hide={platformHidden.includes('neutral')} />
                  <Bar dataKey="negative" stackId="a" fill={SENTIMENT_COLORS.negative} radius={[3, 3, 0, 0]} hide={platformHidden.includes('negative')} />
                </BarChart>
              </ResponsiveContainer>
              <SentimentLegend hidden={platformHidden} onToggle={togglePlatform} />
            </>
          )}
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight mb-4">Sentiment by Keyword Group</h2>
          {!filteredMentions.length ? (
            <div className="flex items-center justify-center h-48 text-xs text-muted">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={groupBarData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f3" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomPlatformTooltip />} />
                  <Bar dataKey="positive" stackId="a" fill={SENTIMENT_COLORS.positive} hide={groupHidden.includes('positive')} />
                  <Bar dataKey="neutral" stackId="a" fill={SENTIMENT_COLORS.neutral} hide={groupHidden.includes('neutral')} />
                  <Bar dataKey="negative" stackId="a" fill={SENTIMENT_COLORS.negative} radius={[3, 3, 0, 0]} hide={groupHidden.includes('negative')} />
                </BarChart>
              </ResponsiveContainer>
              <SentimentLegend hidden={groupHidden} onToggle={toggleGroup} />
            </>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="card">
        <h2 className="text-base font-semibold text-ink dark:text-on-dark tracking-tight mb-4">Mention Heatmap — Day × Hour</h2>
        <p className="text-xs text-muted dark:text-on-dark-soft mb-4">Color intensity shows negative sentiment concentration. Darker red = higher negative rate at that time slot.</p>
        <SentimentHeatmap mentions={filteredMentions} onCellClick={handleHeatmapClick} />
      </div>

      {/* Emotions + Crisis side by side — hidden for now */}

      {/* AI Disclaimer */}
      <div className="rounded-lg border border-hairline-strong dark:border-white/8 bg-surface-strong dark:bg-white/8 p-4 flex items-start gap-3">
        <Info size={16} className="text-body mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-ink dark:text-on-dark mb-1">About Automated Sentiment Analysis</p>
          <p className="text-xs text-body dark:text-on-dark-soft leading-relaxed">
            Automated sentiment analysis may be imperfect for sarcasm, mixed-language content, and local dialects —
            including Malaysian English (Manglish), Bahasa Malaysia, and code-switching contexts.
            The confidence scores provided indicate the model's certainty but are not guarantees of accuracy.
            <strong> Analyst review is strongly recommended for all high-risk mentions before any action is taken.</strong>
          </p>
        </div>
      </div>
    </div>
  )
}
