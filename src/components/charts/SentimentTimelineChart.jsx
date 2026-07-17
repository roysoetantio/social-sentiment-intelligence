import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Brush,
} from 'recharts'
import { getTimelineData } from '../../data/analytics'
import { SENTIMENT_COLORS as COLORS } from '../../constants/colors'

const SERIES = ['positive', 'neutral', 'negative']

const CustomTooltip = ({ active, payload, label, granularity }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  const hint = granularity === 'month' ? 'Click to explore this month'
    : granularity === 'week' ? 'Click to explore this week'
    : granularity === 'hour' ? 'Click to explore this hour'
    : 'Click to explore this day'
  return (
    <div className="chart-tooltip min-w-[160px]">
      <p className="font-semibold text-ink mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="capitalize text-body">{p.dataKey}</span>
          </div>
          <span className="font-medium text-ink">{p.value}</span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-hairline flex justify-between">
        <span className="text-body">Total</span>
        <span className="font-semibold">{total}</span>
      </div>
      <div className="mt-2 rounded bg-gray-100 dark:bg-white/8 px-2 py-1">
        <p className="text-[0.625rem] text-muted">{hint}</p>
      </div>
    </div>
  )
}

const CustomLegend = ({ hidden, onToggle }) => (
  <div className="flex items-center justify-center gap-4 pt-3 pb-1">
    {SERIES.map(key => (
      <button
        key={key}
        onClick={() => onToggle(key)}
        className="flex items-center gap-1.5 transition-opacity"
        style={{ opacity: hidden.includes(key) ? 0.35 : 1 }}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[key] }} />
        <span className="text-[11px] capitalize" style={{ color: '#6b7280' }}>{key}</span>
      </button>
    ))}
  </div>
)

export default function SentimentTimelineChart({ mentions, start, end, granularity, height = '100%', onPointClick }) {
  const data = useMemo(
    () => getTimelineData(mentions || [], { start, end, granularity }),
    [mentions, start && +new Date(start), end && +new Date(end), granularity]
  )
  const [hidden, setHidden] = useState([])

  const handleToggle = (key) => {
    setHidden(prev => {
      if (prev.length === 0) return SERIES.filter(k => k !== key)
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      return next.length === SERIES.length ? [] : next
    })
  }

  if (!mentions?.length) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted">
        No data for selected period
      </div>
    )
  }

  const handleClick = (chartData) => {
    if (!chartData?.activePayload?.length || !onPointClick) return
    const dateKey = chartData.activePayload[0]?.payload?.date
    if (dateKey) onPointClick(dateKey)
  }

  const isFixedHeight = typeof height === 'number'

  return (
    <div className="flex flex-col w-full" style={isFixedHeight ? { height } : { height: '100%' }}>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            onClick={handleClick}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }}
          >
            <defs>
              {SERIES.map(key => (
                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[key]} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={COLORS[key]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip granularity={granularity} />} />
            {SERIES.map(key => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[key]}
                fill={`url(#grad-${key})`}
                strokeWidth={2}
                dot={false}
                hide={hidden.includes(key)}
              />
            ))}
            <Brush
              dataKey="displayDate"
              height={20}
              stroke="var(--chart-grid)"
              fill="rgb(var(--surface-strong))"
              travellerWidth={6}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <CustomLegend hidden={hidden} onToggle={handleToggle} />
    </div>
  )
}
