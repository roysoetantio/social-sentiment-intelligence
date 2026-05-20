import React, { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
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
  iconColor = '#2940BE',
  trend,
  trendValue,
  className,
  valueColor,
  formatter,
}) {
  const isNumber = typeof value === 'number'
  const animated = useCountUp(isNumber ? value : 0)

  const displayValue = formatter
    ? formatter(isNumber ? animated : value)
    : isNumber
    ? (animated % 1 === 0 ? Math.round(animated).toLocaleString() : animated.toFixed(1))
    : value

  return (
    <div className={clsx('card', className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 mb-0.5 truncate">{title}</p>
          <div className="flex items-baseline gap-1">
            {prefix && <span className="text-sm font-medium text-gray-400">{prefix}</span>}
            <span
              className="kpi-number text-2xl font-bold leading-none"
              style={{ color: valueColor || '#313231' }}
            >
              {displayValue}
            </span>
            {unit && <span className="text-sm font-medium text-gray-400">{unit}</span>}
          </div>
        </div>
        {Icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${iconColor}15` }}
          >
            <Icon size={18} style={{ color: iconColor }} />
          </div>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-gray-500 truncate">{subtitle}</p>
      )}

      {(trend !== undefined || trendValue !== undefined) && (
        <div className="mt-2 flex items-center gap-1">
          {trend === 'up' && <TrendingUp size={12} className="text-teal" />}
          {trend === 'down' && <TrendingDown size={12} className="text-orange" />}
          {trend === 'flat' && <Minus size={12} className="text-gray-400" />}
          {trendValue && (
            <span className={clsx(
              'text-xs font-medium',
              trend === 'up' ? 'text-teal' : trend === 'down' ? 'text-orange' : 'text-gray-400'
            )}>
              {trendValue}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
