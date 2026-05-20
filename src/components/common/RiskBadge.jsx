import React from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import clsx from 'clsx'

const config = {
  high: {
    label: 'High Risk',
    className: 'bg-red-50 text-red-600 border-red-200',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium Risk',
    className: 'bg-orange-50 text-orange-500 border-orange-200',
    icon: AlertCircle,
  },
  low: {
    label: 'Low Risk',
    className: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    icon: Info,
  },
}

export default function RiskBadge({ level }) {
  if (!level || !config[level]) return null
  const { label, className, icon: Icon } = config[level]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', className)}>
      <Icon size={11} />
      {label}
    </span>
  )
}
