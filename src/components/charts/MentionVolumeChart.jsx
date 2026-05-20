import React, { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { format, startOfWeek, startOfMonth, parseISO } from 'date-fns'
import { KEYWORD_GROUPS } from '../../data/mockKeywords'
import clsx from 'clsx'

const GROUP_COLORS = Object.fromEntries(KEYWORD_GROUPS.map(g => [g.id, g.color]))

const groupByPeriod = (mentions, period) => {
  const buckets = {}
  mentions.forEach(m => {
    const d = parseISO(m.publishedAt)
    let key
    if (period === 'day') key = format(d, 'MMM d')
    else if (period === 'week') key = format(startOfWeek(d), 'MMM d')
    else key = format(startOfMonth(d), 'MMM yyyy')

    if (!buckets[key]) {
      buckets[key] = { date: key }
      KEYWORD_GROUPS.forEach(g => { buckets[key][g.id] = 0 })
    }
    buckets[key][m.keywordGroup] = (buckets[key][m.keywordGroup] || 0) + 1
  })
  return Object.values(buckets).slice(-20)
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="chart-tooltip min-w-[150px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.filter(p => p.value > 0).map(p => {
        const group = KEYWORD_GROUPS.find(g => g.id === p.dataKey)
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
              <span className="text-gray-600">{group?.name || p.dataKey}</span>
            </div>
            <span className="font-medium">{p.value}</span>
          </div>
        )
      })}
      <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex justify-between">
        <span className="text-gray-500">Total</span>
        <span className="font-semibold">{total}</span>
      </div>
    </div>
  )
}

export default function MentionVolumeChart({ mentions, height = 260 }) {
  const [period, setPeriod] = useState('day')
  const data = useMemo(() => groupByPeriod(mentions || [], period), [mentions, period])

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        {['day', 'week', 'month'].map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={clsx(
              'px-3 py-1 text-xs font-medium rounded-md transition-all capitalize',
              period === p ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {p}
          </button>
        ))}
      </div>
      {!data.length ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} formatter={(v) => {
              const g = KEYWORD_GROUPS.find(g => g.id === v)
              return <span style={{ fontSize: 11, color: '#6b7280' }}>{g?.name || v}</span>
            }} />
            {KEYWORD_GROUPS.map(g => (
              <Bar key={g.id} dataKey={g.id} stackId="a" fill={g.color} radius={g.id === 'campaigns' ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
