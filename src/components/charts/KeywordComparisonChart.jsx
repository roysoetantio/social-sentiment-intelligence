import React, { useMemo } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { getKeywordComparisonData } from '../../data/mockAnalytics'
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

  if (!mentions?.length || !topKeywords.length) {
    return <div className="flex items-center justify-center h-48 text-sm text-muted">No data</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={radarData} margin={{ top: 0, right: 10, bottom: 0, left: 10 }} outerRadius="75%">
        <PolarGrid stroke="#e5e7eb" />
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
          />
        ))}
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
          formatter={(v) => {
            const kw = topKeywords.find(k => k.id === v)
            return <span style={{ color: '#6b7280' }}>{kw?.term || v}</span>
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
