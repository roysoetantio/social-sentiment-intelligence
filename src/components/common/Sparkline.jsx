import React, { useId } from 'react'

/**
 * A bare trend line for a KPI card — no axes, no ticks, no library.
 *
 * Recharts is used for every chart a reader inspects; a sparkline is read at a
 * glance and is drawn here as one path so that six of them in a KPI row cost
 * nothing. The viewBox is fixed and the SVG stretches, so the shape is the same
 * at any card width.
 */
export default function Sparkline({
  data = [],
  color = '#2940BE',
  height = 22,
  strokeWidth = 1.5,
  fill = true,
}) {
  const gradientId = useId()
  const points = data.filter(n => Number.isFinite(n))

  // One point can't make a line, and a flat series has no shape worth drawing.
  if (points.length < 2) return <div style={{ height }} aria-hidden="true" />

  const W = 100
  const H = 30
  const pad = 2
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1

  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W
    const y = H - pad - ((v - min) / span) * (H - pad * 2)
    return [x, y]
  })

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const [lastX, lastY] = coords[coords.length - 1]

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
