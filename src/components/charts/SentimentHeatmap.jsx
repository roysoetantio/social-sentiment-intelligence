import React, { useMemo, useState } from 'react'
import { getHeatmapData } from '../../data/mockAnalytics'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const getRatioColor = (ratio, total) => {
  if (total === 0) return '#f3f4f6'
  if (ratio <= 0) return '#19C9A5'
  if (ratio < 0.2) return '#74dcc3'
  if (ratio < 0.4) return '#fbbf24'
  if (ratio < 0.6) return '#f97316'
  if (ratio < 0.8) return '#ef4444'
  return '#dc2626'
}

export default function SentimentHeatmap({ mentions }) {
  const [tooltip, setTooltip] = useState(null)
  const data = useMemo(() => getHeatmapData(mentions || []), [mentions])

  const maxTotal = useMemo(() => Math.max(...data.map(d => d.total), 1), [data])

  return (
    <div className="relative">
      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col justify-around pr-2" style={{ minWidth: 32 }}>
          {DAYS.map(d => (
            <div key={d} className="text-[10px] text-gray-400 text-right leading-none" style={{ height: 16 }}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-0.5">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="flex flex-col gap-0.5" style={{ flex: '1 1 0' }}>
                {Array.from({ length: 7 }, (_, day) => {
                  const cell = data.find(d => d.day === day && d.hour === hour)
                  const ratio = cell && cell.total > 0 ? cell.negative / cell.total : 0
                  const color = getRatioColor(ratio, cell?.total || 0)
                  const opacity = cell?.total ? 0.3 + (cell.total / maxTotal) * 0.7 : 0.15

                  return (
                    <div
                      key={day}
                      className="heatmap-cell rounded-sm cursor-pointer"
                      style={{
                        backgroundColor: color,
                        opacity,
                        height: 16,
                        width: '100%',
                      }}
                      onMouseEnter={(e) => setTooltip({
                        day: DAYS[day],
                        hour: `${hour.toString().padStart(2, '0')}:00`,
                        total: cell?.total || 0,
                        negative: cell?.negative || 0,
                        x: e.clientX,
                        y: e.clientY,
                      })}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })}
              </div>
            ))}
          </div>

          {/* Hour labels */}
          <div className="flex mt-1.5">
            <div className="flex gap-0.5" style={{ flex: 1 }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="text-[9px] text-gray-400 text-center" style={{ flex: '1 1 0' }}>
                  {h % 6 === 0 ? `${h}h` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[10px] text-gray-400">Less negative</span>
        <div className="flex gap-0.5">
          {['#19C9A5', '#74dcc3', '#fbbf24', '#f97316', '#ef4444', '#dc2626'].map((c, i) => (
            <div key={i} className="w-4 h-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span className="text-[10px] text-gray-400">More negative</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-100 p-2.5 text-xs pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
        >
          <p className="font-semibold text-gray-700">{tooltip.day} {tooltip.hour}</p>
          <p className="text-gray-500">Mentions: <span className="font-medium text-gray-700">{tooltip.total}</span></p>
          <p className="text-orange">Negative: <span className="font-medium">{tooltip.negative}</span></p>
          {tooltip.total > 0 && (
            <p className="text-gray-400">Neg rate: {Math.round(tooltip.negative / tooltip.total * 100)}%</p>
          )}
        </div>
      )}
    </div>
  )
}
