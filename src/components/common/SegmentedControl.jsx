import React from 'react'
import clsx from 'clsx'

/**
 * A single-choice control that looks like one object rather than a row of
 * loose buttons — the same track-and-thumb pattern the notification tabs use.
 *
 * Deliberately uncoloured: these sit next to tier badges and sentiment bars,
 * where colour already carries meaning, and a coloured control would read as
 * more data.
 */
export default function SegmentedControl({ value, onChange, options, className, size = 'sm' }) {
  return (
    <div
      role="tablist"
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-md bg-surface-strong dark:bg-white/5 p-0.5 flex-shrink-0',
        className
      )}
    >
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            disabled={opt.disabled && !active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'rounded font-medium transition-colors whitespace-nowrap',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm',
              opt.disabled && !active && 'opacity-40 cursor-not-allowed',
              active
                ? 'bg-canvas text-ink shadow-sm'
                : !opt.disabled && 'text-muted hover:text-ink'
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={clsx('ml-1 tabular-nums font-normal', active ? 'text-muted' : 'opacity-70')}>
                ({opt.count})
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
