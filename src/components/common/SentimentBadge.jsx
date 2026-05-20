import React from 'react'
import clsx from 'clsx'

const config = {
  positive: { label: 'Positive', className: 'badge-positive' },
  negative: { label: 'Negative', className: 'badge-negative' },
  neutral: { label: 'Neutral', className: 'badge-neutral' },
  mixed: { label: 'Mixed', className: 'badge-mixed' },
}

export default function SentimentBadge({ label, score, showScore = false, size = 'sm', overridden = false }) {
  const c = config[label] || config.neutral
  return (
    <span className={clsx(c.className, 'inline-flex items-center gap-1', size === 'xs' && 'text-[10px] px-2 py-0.5')}>
      {c.label}
      {showScore && score !== undefined && (
        <span className="opacity-70">
          ({score >= 0 ? '+' : ''}{(score * 100).toFixed(0)})
        </span>
      )}
      {overridden && (
        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      )}
    </span>
  )
}
