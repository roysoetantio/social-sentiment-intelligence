import React, { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Brush, Legend,
} from 'recharts'
import { getTimelineData } from '../../data/mockAnalytics'
import { SENTIMENT_COLORS as COLORS } from '../../constants/colors'

const CustomTooltip = ({ active, payload, label, granularity }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  const hint = granularity === 'month' ? 'Click to explore this month'
    : granularity === 'week' ? 'Click to explore this week'
    : granularity === 'hour' ? 'Click to explore this hour'
    : 'Click to explore this day'
  return (
    <div className="chart-tooltip min-w-[160px]">
      <p className="font-semibold text-ink dark:text-on-dark mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="capitalize text-body dark:text-on-dark-soft">{p.dataKey}</span>
          </div>
          <span className="font-medium text-ink dark:text-on-dark">{p.value}</span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-hairline dark:border-white/8 flex justify-between">
        <span className="text-body dark:text-on-dark-soft">Total</span>
        <span className="font-semibold dark:text-on-dark">{total}</span>
      </div>
      <p className="mt-2 text-[10px] text-blue-400 italic">{hint}</p>
    </div>
  )
}

export default function SentimentTimelineChart({ mentions, days = 30, granularity = 'day', height = '100%', onPointClick }) {
  const data = useMemo(() => getTimelineData(mentions || [], days, granularity), [mentions, days, granularity])

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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
        onClick={handleClick}
        style={{ cursor: onPointClick ? 'pointer' : 'default' }}
      >
        <defs>
          {Object.entries(COLORS).map(([key, color]) => (
            <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
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
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(v) => <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>{v}</span>}
        />
        <Area type="monotone" dataKey="positive" stroke={COLORS.positive} fill={`url(#grad-positive)`} strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="neutral" stroke={COLORS.neutral} fill={`url(#grad-neutral)`} strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="negative" stroke={COLORS.negative} fill={`url(#grad-negative)`} strokeWidth={2} dot={false} />
        <Brush
          dataKey="displayDate"
          height={20}
          stroke="#e5e7eb"
          fill="#f9fafb"
          travellerWidth={6}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
