import React from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import clsx from 'clsx'

const config = {
  high: {
    label: 'High Risk',
    className: 'bg-error/10 border-error/30 text-red-600',
    textClassName: 'text-red-600',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium Risk',
    className: 'bg-orange/10 text-orange border-orange/30',
    textClassName: 'text-orange',
    icon: AlertCircle,
  },
  low: {
    label: 'Low Risk',
    className: 'bg-warning/10 text-warning border-warning/30',
    textClassName: 'text-warning',
    icon: Info,
  },
}

export default function RiskBadge({ level, minimal = false }) {
  if (!level || !config[level]) return null
  const { label, className, textClassName, icon: Icon } = config[level]

  if (minimal) {
    if (level === 'low') return null
    return (
      <span className={clsx('flex items-center gap-1 text-xs font-medium', textClassName)}>
        <Icon size={11} />
        {label}
      </span>
    )
  }

  return (
    <span className={clsx('badge-pill border gap-1', className)}>
      <Icon size={11} />
      {label}
    </span>
  )
}
