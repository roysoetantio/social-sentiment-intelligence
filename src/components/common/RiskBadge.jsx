import React from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import clsx from 'clsx'

const config = {
  high: {
    label: 'High Risk',
    className: 'bg-error/10 text-error border-error/30',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium Risk',
    className: 'bg-orange/10 text-orange border-orange/30',
    icon: AlertCircle,
  },
  low: {
    label: 'Low Risk',
    className: 'bg-warning/10 text-warning border-warning/30',
    icon: Info,
  },
}

export default function RiskBadge({ level }) {
  if (!level || !config[level]) return null
  const { label, className, icon: Icon } = config[level]
  return (
    <span className={clsx('badge-pill border', className)}>
      <Icon size={11} />
      {label}
    </span>
  )
}
