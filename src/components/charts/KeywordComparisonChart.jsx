import React, { useMemo, useState } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { getKeywordComparisonData } from '../../data/analytics'
import { useDashboard } from '../../context/DashboardContext'
import { BRAND_COLORS } from '../../constants/colors'

const COLORS = [BRAND_COLORS.primary, BRAND_COLORS.sky, BRAND_COLORS.teal, BRAND_COLORS.purple, BRAND_COLORS.orange]

const DIMENSIONS = [
  { key: 'volumeScore', label: 'Volume' },
  { key: 'positiveRate', label: 'Positive %' },
  { key: 'engagementScore', label: 'Engagement' },
  { key: 'reachScore', label: 'Reach' },
  { key: 'negativeRate', label: 'Negative %' },
]

export default function KeywordComparisonChart({ mentions, height = '100%' }) {
  const { allKeywordsFlat } = useDashboard()
  const compData = useMemo(() => getKeywordComparisonData(mentions || [], allKeywordsFlat), [mentions, allKeywordsFlat])
  const [hidden, setHidden] = useState([])

  const topKeywords = useMemo(() =>
    [...compData].sort((a, b) => b.total - a.total).slice(0, 5)
  , [compData])

  const radarData = useMemo(() => {
    return DIMENSIONS.map(dim => {
      const entry = { subject: dim.label }
      topKeywords.forEach(k => { entry[k.id] = k[dim.key] })
      return entry
    })
  }, [topKeywords])

  const ids = topKeywords.map(k => k.id)
  const handleToggle = (id) => {
    setHidden(prev => {
      if (prev.length === 0) return ids.filter(k => k !== id)
      const next = prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
      return next.length === ids.length ? [] : next
    })
  }

  if (!mentions?.length || !topKeywords.length) {
    return <div className="flex items-center justify-center h-48 text-sm text-muted">No data</div>
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 0, right: 10, bottom: 0, left: 10 }} outerRadius="75%">
            <PolarGrid stroke="var(--chart-grid)" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f3f4f6' }}
              formatter={(val, name) => {
                const kw = topKeywords.find(k => k.id === name)
                return [`${val.toFixed(1)}`, kw?.term || name]
              }}
            />
            {topKeywords.map((kw, i) => (
              <Radar
                key={kw.id}
                name={kw.id}
                dataKey={kw.id}
                stroke={COLORS[i]}
                fill={COLORS[i]}
                fillOpacity={0.18}
                strokeWidth={1.5}
                dot={false}
                hide={hidden.includes(kw.id)}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 pb-1">
        {topKeywords.map((kw, i) => {
          return (
            <button
              key={kw.id}
              onClick={() => handleToggle(kw.id)}
              className="flex items-center gap-1.5 transition-opacity"
              style={{ opacity: hidden.includes(kw.id) ? 0.35 : 1 }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i] }} />
              <span className="text-[11px]" style={{ color: '#6b7280' }}>{kw.term}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
