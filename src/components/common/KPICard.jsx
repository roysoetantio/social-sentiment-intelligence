import React, { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

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
}) {
  const isNumber = typeof value === 'number'
  const animated = useCountUp(isNumber ? value : 0)

  const displayValue = formatter
    ? formatter(isNumber ? animated : value)
    : isNumber
    ? (animated % 1 === 0 ? Math.round(animated).toLocaleString() : animated.toFixed(1))
    : value

  return (
    <div className={clsx(
      'group relative rounded-lg border p-3 transition-shadow duration-200 hover:shadow-card flex flex-col justify-between',
      dark
        ? 'bg-surface-dark-elevated border-white/8 text-on-dark'
        : 'bg-canvas border-hairline-strong',
      className
    )}>
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded bg-gray-900 dark:bg-gray-700 px-2.5 py-2 text-[11px] leading-snug text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
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
    </div>
  )
}
