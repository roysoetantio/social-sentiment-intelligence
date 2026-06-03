import React, { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getPlatformBreakdown } from '../../data/analytics'
import { BRAND_COLORS } from '../../constants/colors'

const COLORS = [BRAND_COLORS.primary, BRAND_COLORS.sky, BRAND_COLORS.teal, BRAND_COLORS.orange, BRAND_COLORS.purple, '#f59e0b', '#10b981']

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="chart-tooltip">
      <p className="font-semibold text-ink dark:text-on-dark mb-1.5">{d.name}</p>
      <p className="text-body dark:text-on-dark-soft">Mentions: <span className="font-medium text-ink dark:text-on-dark">{d.total}</span></p>
      <p className="text-teal">Positive: <span className="font-medium">{d.positive}</span></p>
      <p className="text-orange">Negative: <span className="font-medium">{d.negative}</span></p>
    </div>
  )
}

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.07) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export default function PlatformBreakdownChart({ mentions, height = '100%' }) {
  const data = useMemo(() => getPlatformBreakdown(mentions || []), [mentions])

  if (!data.length) {
    return <div className="flex items-center justify-center h-64 text-sm text-muted">No data</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pie
          data={data}
          cx="50%"
          cy="48%"
          innerRadius="50%"
          outerRadius="78%"
          dataKey="total"
          nameKey="name"
          labelLine={false}
          label={renderCustomLabel}
          paddingAngle={2}
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
          formatter={(v) => <span style={{ color: '#6b7280' }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
