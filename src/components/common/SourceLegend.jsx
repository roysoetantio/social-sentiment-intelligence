import React from 'react'
import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import { SENTIMENT_COLORS } from '../../constants/colors'

const SENTIMENT_KEYS = ['positive', 'neutral', 'mixed', 'negative']

// The marks differ in width, so only a shared grid track lines every
// explanation up on the same left edge. Each mark sits in a fixed first column.
const Mark = ({ children }) => (
  <span className="flex items-center h-4">{children}</span>
)

/**
 * The marks used in the leaderboard, stated at rest.
 *
 * Tiers are explained in the Coverage Quality panel, where the tier numbers
 * actually live — repeating them here only made this list long enough to skip.
 */
export default function SourceLegend({ showTrend = true }) {
  return (
    <div className="grid grid-cols-[2.25rem_1fr] gap-x-2 gap-y-2.5 items-start">
      <Mark>
        <AlertTriangle size={12} style={{ color: SENTIMENT_COLORS.negative }} />
      </Mark>
      <p className="text-[11px] text-muted leading-snug">
        <span className="text-ink font-medium">At-risk coverage</span> — this source
        published mentions flagged medium or high risk and not positive.
      </p>

      {showTrend && (
        <>
          <Mark>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#2940BE]/10 dark:bg-[#6B80FF]/15"
              style={{ color: 'var(--accent-brand)' }}
            >
              new
            </span>
          </Mark>
          <p className="text-[11px] text-muted leading-snug">
            <span className="text-ink font-medium">First appearance</span> — nothing from
            this source in the previous period.
          </p>

          <Mark>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: SENTIMENT_COLORS.positive }}>
              <ArrowUpRight size={10} strokeWidth={2.5} />3
            </span>
          </Mark>
          <p className="text-[11px] text-muted leading-snug">
            <span className="text-ink font-medium">Change in volume</span> — mentions gained
            or lost against the previous period, not a percentage.
          </p>
        </>
      )}

      <Mark>
        <span className="flex h-1.5 w-8 rounded-full overflow-hidden">
          {SENTIMENT_KEYS.map(k => (
            <span key={k} className="flex-1" style={{ backgroundColor: SENTIMENT_COLORS[k] }} />
          ))}
        </span>
      </Mark>
      <p className="text-[11px] text-muted leading-snug">
        <span className="text-ink font-medium">Sentiment split</span> — positive, neutral,
        mixed, negative.
      </p>

      <Mark>
        <span className="h-1 w-8 rounded-full bg-[#2940BE]/25 dark:bg-[#6B80FF]/30" />
      </Mark>
      <p className="text-[11px] text-muted leading-snug">
        <span className="text-ink font-medium">Volume bar</span> — this source’s mentions
        against the busiest source in the list.
      </p>
    </div>
  )
}
