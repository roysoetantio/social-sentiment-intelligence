import React, { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import { getShareOfVoice } from '../../data/analytics'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="chart-tooltip">
      <p className="font-semibold text-ink mb-1">{d.name}</p>
      <p className="text-body">Mentions: <span className="font-medium">{d.count}</span></p>
      <p className="text-body">Share: <span className="font-medium">{d.percent}%</span></p>
    </div>
  )
}

export default function ShareOfVoiceChart({ mentions, height = 180 }) {
  const data = useMemo(() => getShareOfVoice(mentions || []), [mentions])

  if (!data.length) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted">No data</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
        <XAxis type="number" hide domain={[0, 100]} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="percent" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
          <LabelList
            dataKey="percent"
            position="right"
            formatter={(v) => `${v}%`}
            style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
