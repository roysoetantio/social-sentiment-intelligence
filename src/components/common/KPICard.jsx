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
      'rounded-lg border p-3 transition-shadow duration-200 hover:shadow-card flex flex-col justify-between',
      dark
        ? 'bg-surface-dark-elevated border-white/8 text-on-dark'
        : 'bg-canvas dark:bg-surface-dark-elevated border-hairline-strong dark:border-white/8',
      className
    )}>
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex-1 min-w-0">
          <p className={clsx(
            'text-[11px] font-semibold mb-1 truncate',
            dark ? 'text-on-dark-soft' : 'text-muted dark:text-on-dark-soft'
          )}>
            {title}
          </p>
          <div className="flex items-baseline gap-1">
            {prefix && <span className={clsx('text-sm font-medium', dark ? 'text-on-dark-soft' : 'text-muted dark:text-on-dark-soft')}>{prefix}</span>}
            <span
              className={clsx('kpi-number font-semibold leading-none tracking-tight dark:text-on-dark', compact ? 'text-[20px]' : 'text-[26px]')}
              style={{ color: valueColor || (dark ? '#ffffff' : '#171717') }}
            >
              {displayValue}
            </span>
            {unit && <span className={clsx('text-sm font-medium', dark ? 'text-on-dark-soft' : 'text-muted dark:text-on-dark-soft')}>{unit}</span>}
          </div>
        </div>
        {Icon && (
          <div className="flex-shrink-0">
            <Icon size={15} style={{ color: '#787881' }} />
          </div>
        )}
      </div>

      {subtitle && (
        <p className={clsx('text-xs truncate', dark ? 'text-on-dark-soft' : 'text-body dark:text-on-dark-soft')}>{subtitle}</p>
      )}

    </div>
  )
}
