import React, { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowUpRight, ArrowDownRight, Minus, Sparkles } from 'lucide-react'
import Sparkline from './Sparkline'
import { SENTIMENT_COLORS } from '../../constants/colors'

const useCountUp = (target, duration = 800) => {
  const [value, setValue] = useState(0)
  const frameRef = useRef(null)

  useEffect(() => {
    const start = performance.now()
    const startVal = 0
    const endVal = typeof target === 'number' ? target : 0

    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(startVal + (endVal - startVal) * eased)
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration])

  return value
}

/**
 * The change pill under a KPI.
 *
 * `goodWhen` decides the colour, because direction alone doesn't say whether a
 * move is good news: more mentions is usually up-is-good, a rising negative
 * rate never is. 'none' keeps it neutral where the answer depends on context.
 */
function DeltaPill({ delta, goodWhen = 'up', dark }) {
  if (!delta) return null
  const { current, previous, diff, percent, mode, hasBaseline, lowBaseline } = delta

  // Nothing before, something now — a percentage change would be a divide by
  // zero dressed up as insight.
  if (!hasBaseline) {
    if (!diff) return null
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[#2940BE]/10 dark:bg-[#6B80FF]/15"
        style={{ color: 'var(--accent-brand)' }}
      >
        <Sparkles size={10} /> new
      </span>
    )
  }

  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
  const isGood =
    goodWhen === 'none' || direction === 'flat' ? null
    : goodWhen === 'up' ? direction === 'up'
    : direction === 'down'

  const color =
    isGood === null ? (dark ? '#9CA3AF' : '#787881')
    : isGood ? SENTIMENT_COLORS.positive
    : SENTIMENT_COLORS.negative

  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus
  const sign = diff > 0 ? '+' : ''
  // A percentage off two or three rows is arithmetic, not insight — show what
  // actually moved and let the reader see how thin the comparison is.
  const text = lowBaseline && mode !== 'points'
    ? `${previous} → ${current}`
    : mode === 'points'
    ? `${sign}${diff} pts`
    : `${sign}${percent}%`

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <Icon size={10} strokeWidth={2.5} />
      {text}
    </span>
  )
}

export default function KPICard({
  title,
  value,
  unit = '',
  prefix = '',
  subtitle,
  icon: Icon,
  iconColor = '#171717',
  className,
  valueColor,
  formatter,
  dark = false,
  compact = false,
  tooltip,
  // Period-over-period comparison, from getKPIComparison().
  delta,
  deltaGoodWhen = 'up',
  // Bucketed counts for the trend line; omit to hide it.
  series,
  seriesColor,
  // The window the delta is measured against. Revealed on hover over the
  // trend row rather than printed on the page — it is the answer to "compared
  // with what?", which is a question you ask once, not a permanent caption.
  comparisonLabel,
}) {
  const isNumber = typeof value === 'number'
  const animated = useCountUp(isNumber ? value : 0)
  // The card tooltip covers half the card, so it stands down while the trend
  // row is hovered — otherwise both fire at once and neither is readable.
  const [trendHovered, setTrendHovered] = useState(false)

  const displayValue = formatter
    ? formatter(isNumber ? animated : value)
    : isNumber
    ? (animated % 1 === 0 ? Math.round(animated).toLocaleString() : animated.toFixed(1))
    : value

  const hasFooter = delta || (series && series.length > 1)

  return (
    <div className={clsx(
      'group relative rounded-lg border p-3 transition-shadow duration-200 hover:shadow-card flex flex-col justify-between',
      dark
        ? 'bg-surface-dark-elevated border-white/8 text-on-dark'
        : 'bg-canvas border-hairline-strong',
      className
    )}>
      {tooltip && (
        <div className={clsx(
          'pointer-events-none absolute top-full left-0 right-0 mt-1.5 rounded bg-gray-900 dark:bg-gray-700 px-2.5 py-2 text-[11px] leading-snug text-white transition-opacity duration-150 z-50 shadow-lg',
          trendHovered ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
        )}>
          {tooltip}
        </div>
      )}
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex-1 min-w-0">
          <p className={clsx(
            'text-xs font-semibold mb-1 truncate',
            dark ? 'text-on-dark-soft' : 'text-muted'
          )}>
            {title}
          </p>
          <div className="flex items-baseline gap-1">
            {prefix && <span className={clsx('text-sm font-medium', dark ? 'text-on-dark-soft' : 'text-muted')}>{prefix}</span>}
            <span
              className={clsx('kpi-number font-semibold leading-none tracking-tight', dark ? 'text-on-dark' : 'text-ink', compact ? 'text-xl' : 'text-3xl')}
              style={valueColor ? { color: valueColor } : undefined}
            >
              {displayValue}
            </span>
            {unit && <span className={clsx('text-sm font-medium', dark ? 'text-on-dark-soft' : 'text-muted')}>{unit}</span>}
          </div>
        </div>
        {Icon && (
          <div className="flex-shrink-0">
            <Icon size={15} style={{ color: '#787881' }} />
          </div>
        )}
      </div>

      {subtitle && (
        <p className={clsx('text-xs truncate', dark ? 'text-on-dark-soft' : 'text-body')}>{subtitle}</p>
      )}

      {hasFooter && (
        <div
          className="relative flex items-end gap-2 mt-2"
          onMouseEnter={() => setTrendHovered(true)}
          onMouseLeave={() => setTrendHovered(false)}
        >
          <DeltaPill delta={delta} goodWhen={deltaGoodWhen} dark={dark} />
          {series && series.length > 1 && (
            <div className="flex-1 min-w-0 -mb-0.5">
              <Sparkline data={series} color={seriesColor || '#2940BE'} height={20} />
            </div>
          )}
          {comparisonLabel && (
            <div className={clsx(
              'pointer-events-none absolute top-full left-0 mt-1.5 whitespace-nowrap rounded bg-gray-900 dark:bg-gray-700 px-2 py-1 text-[10px] font-medium text-white transition-opacity duration-150 z-50 shadow-lg',
              trendHovered ? 'opacity-100' : 'opacity-0'
            )}>
              vs {comparisonLabel}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
