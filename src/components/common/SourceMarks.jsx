import React from 'react'
import { ArrowUpRight, ArrowDownRight, AlertTriangle, Minus } from 'lucide-react'
import clsx from 'clsx'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { SENTIMENT_COLORS } from '../../constants/colors'
import { TIER_META } from '../../utils/outlets'

/**
 * The small marks used to annotate a source, in one place.
 *
 * Both the compact list on the Overview and the full table on the Sources page
 * render these, so a badge can never mean one thing in one view and something
 * else in the other. Each carries its own explanation on hover — the legend
 * panel says the same things at rest, for anyone who never hovers.
 */

export const TIER_STYLES = {
  1: { cls: 'bg-[#2940BE]/12 dark:bg-[#6B80FF]/18', fg: 'var(--accent-brand)', dot: 'var(--accent-brand)' },
  2: { cls: 'bg-[#1490EA]/12 dark:bg-[#1490EA]/20', fg: '#1490EA', dot: '#1490EA' },
  3: { cls: 'bg-[#787881]/12 dark:bg-white/10',     fg: '#8B9099', dot: '#C7C7CE' },
}

export const TIER_HEADLINES = {
  1: 'National press & wires',
  2: 'Trade, investor & niche titles',
  3: 'Unclassified',
}

export const TIER_EXAMPLES = {
  1: 'Bernama, The Star, NST, The Edge, Reuters',
  2: 'BusinessToday, EdgeProp, Paul Tan, i3investor',
  3: 'Blogs, aggregators, PR wires, foreign syndication and any outlet not yet on either list',
}

export function TierBadge({ tier, size = 'sm' }) {
  if (!tier) return null
  const style = TIER_STYLES[tier]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={clsx(
            'font-semibold rounded flex-shrink-0 cursor-help',
            size === 'sm' ? 'text-[9px] px-1 py-px' : 'text-[10px] px-1.5 py-0.5',
            style.cls
          )}
          style={{ color: style.fg }}
        >
          T{tier}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[15rem]">
        <p className="font-semibold mb-0.5">Tier {tier} — {TIER_HEADLINES[tier]}</p>
        <p className="text-muted leading-snug">{TIER_META[tier].description}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function AtRiskMark({ count }) {
  if (!count) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex-shrink-0 cursor-help inline-flex">
          <AlertTriangle size={11} style={{ color: SENTIMENT_COLORS.negative }} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[15rem]">
        <p className="font-semibold mb-0.5">{count} at-risk mention{count > 1 ? 's' : ''}</p>
        <p className="text-muted leading-snug">
          Flagged medium or high risk and not positive — the same rule behind the At-Risk KPI.
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

export function TrendMark({ row }) {
  if (row.isNew) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-help bg-[#2940BE]/10 dark:bg-[#6B80FF]/15"
            style={{ color: 'var(--accent-brand)' }}
          >
            new
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[15rem]">
          <p className="text-muted leading-snug">
            First appearance — this source published nothing about us in the previous period of the same length.
          </p>
        </TooltipContent>
      </Tooltip>
    )
  }
  if (row.diff === 0) return <span className="text-[10px] text-muted">—</span>

  const up = row.diff > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const color = up ? SENTIMENT_COLORS.positive : '#787881'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold cursor-help" style={{ color }}>
          <Icon size={10} strokeWidth={2.5} />{Math.abs(row.diff)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[15rem]">
        <p className="text-muted leading-snug">
          {row.total} now vs {row.previous} in the previous period of the same length.
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * A source's name, with the one case that needs explaining explained: rows the
 * ingest could not attribute to an account. The API returned the network but no
 * author, so they are bucketed per platform rather than invented — and said so
 * on hover, since "Unattributed · LinkedIn" is not self-evident.
 */
export function SourceLabel({ row, className }) {
  const text = row.kind === 'voice' && row.handle ? `@${row.handle}` : row.label

  if (!row.unattributed) {
    return <span className={clsx('text-[13px] text-ink truncate', className)}>{text}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={clsx('text-[13px] text-muted italic truncate cursor-help', className)}>{text}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[17rem]">
        <p className="font-semibold mb-0.5">No author recorded</p>
        <p className="text-muted leading-snug">
          The source API returned the network but no account for these {row.total} post{row.total === 1 ? '' : 's'},
          so they are grouped per platform rather than credited to an invented handle.
          They rank below every identified account.
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

const segmentsOf = (row) => [
  { key: 'positive', value: row.positive, color: SENTIMENT_COLORS.positive },
  { key: 'neutral',  value: row.neutral,  color: SENTIMENT_COLORS.neutral },
  { key: 'mixed',    value: row.mixed,    color: SENTIMENT_COLORS.mixed },
  { key: 'negative', value: row.negative, color: SENTIMENT_COLORS.negative },
].filter(s => s.value > 0)

/** Full-width sentiment split — proportions only, no volume encoding. */
export function SentimentBar({ row, height = 6 }) {
  return (
    <div className="rounded-full overflow-hidden bg-surface-strong dark:bg-white/8 w-full" style={{ height }}>
      <div className="flex h-full w-full">
        {segmentsOf(row).map(s => (
          <div
            key={s.key}
            style={{ width: `${(s.value / row.total) * 100}%`, backgroundColor: s.color }}
            title={`${s.value} ${s.key}`}
          />
        ))}
      </div>
    </div>
  )
}

/** Width encodes volume against the busiest source; segments encode sentiment. */
export function VolumeBar({ row, max, height = 6 }) {
  const width = max > 0 ? Math.max((row.total / max) * 100, 3) : 0
  return (
    <div className="rounded-full overflow-hidden bg-surface-strong dark:bg-white/8" style={{ width: `${width}%`, height }}>
      <div className="flex h-full w-full">
        {segmentsOf(row).map(s => (
          <div
            key={s.key}
            style={{ width: `${(s.value / row.total) * 100}%`, backgroundColor: s.color }}
            title={`${s.value} ${s.key}`}
          />
        ))}
      </div>
    </div>
  )
}
