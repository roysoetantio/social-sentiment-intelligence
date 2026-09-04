import React, { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { getCoverageQuality, getReachCoverage } from '../../data/analytics'
import { TIER_META } from '../../utils/outlets'
import { TIER_HEADLINES, TIER_EXAMPLES } from '../common/SourceMarks'
import { formatNum } from '../../utils/format'

const TIER_COLORS = { 1: 'var(--accent-brand)', 2: '#1490EA', 3: '#C7C7CE' }

/**
 * Where the coverage landed, by outlet tier.
 *
 * This is the honest substitute for a summed reach figure: reach is reported by
 * only some sources, but the tier of a publication is known for every published
 * row, so the split is computed over the whole set rather than a lucky subset.
 * Social rows are excluded — an account is not a publication and tiering one
 * would be a judgement the data can't support.
 *
 * Each tier expands to say what it means and which outlets are in it, so the
 * definition sits with the number instead of in a legend elsewhere. Tier 1 opens
 * by default because it is the one anyone came here to read.
 */
export default function CoverageQualityChart({ mentions, compact = false }) {
  const quality = useMemo(() => getCoverageQuality(mentions || []), [mentions])
  const reach = useMemo(() => getReachCoverage(mentions || []), [mentions])
  const [open, setOpen] = useState({ 1: true, 2: false, 3: false })

  if (quality.total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted">
        No published coverage in this period
      </div>
    )
  }

  const toggle = (tier) => setOpen(prev => ({ ...prev, [tier]: !prev[tier] }))
  // On the Overview the tier name and its headline are the whole point; the
  // outlet roll-call and the caveat belong on the page that has room for them.
  const expandable = !compact

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Headline — share of published coverage in Tier 1 */}
      <div className="flex items-baseline gap-2 flex-shrink-0">
        <span className="text-3xl font-semibold leading-none tracking-tight" style={{ color: TIER_COLORS[1] }}>
          {quality.tier1Percent}%
        </span>
        <span className="text-xs text-body">
          of {quality.total} published {quality.total === 1 ? 'item' : 'items'} in Tier 1
        </span>
      </div>

      {/* Stacked tier bar */}
      <div className="flex h-2 rounded-full overflow-hidden mt-3 mb-3 flex-shrink-0 bg-surface-strong dark:bg-white/8">
        {quality.rows.filter(r => r.count > 0).map(r => (
          <div
            key={r.tier}
            style={{ width: `${r.percent}%`, backgroundColor: TIER_COLORS[r.tier] }}
            title={`${r.label}: ${r.count} (${r.percent}%)`}
          />
        ))}
      </div>

      {/* Tiers — each opens to its definition and its outlets */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide -mx-1 px-1">
        <div className="divide-y divide-hairline">
          {quality.rows.map(r => (
            <div key={r.tier} className="py-1.5 first:pt-0">
              <button
                onClick={() => expandable && toggle(r.tier)}
                aria-expanded={expandable ? !!open[r.tier] : undefined}
                disabled={!expandable}
                className={clsx('w-full flex items-center gap-2 text-xs group', !expandable && 'cursor-default')}
              >
                {expandable && (
                  <ChevronRight
                    size={12}
                    className={clsx('text-muted transition-transform flex-shrink-0', open[r.tier] && 'rotate-90')}
                  />
                )}
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TIER_COLORS[r.tier] }} />
                <span className="text-body group-hover:text-ink transition-colors flex-1 text-left truncate">
                  {r.label}
                  <span className="text-muted"> · {TIER_HEADLINES[r.tier]}</span>
                </span>
                <span className="text-muted tabular-nums flex-shrink-0">{r.percent}%</span>
                <span className="text-ink font-semibold tabular-nums w-7 text-right flex-shrink-0">{r.count}</span>
              </button>

              {expandable && open[r.tier] && (
                <div className="pl-6 pr-1 pt-1.5 pb-1">
                  <p className="text-[11px] text-muted leading-snug mb-1.5">{TIER_META[r.tier].description}</p>
                  {r.outlets.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.outlets.map(name => (
                        <span key={name} className="text-[11px] px-1.5 py-0.5 rounded bg-surface-strong dark:bg-white/8 text-body">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted italic">
                      Nothing in this period. Typically: {TIER_EXAMPLES[r.tier]}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-hairline flex-shrink-0 space-y-1">
        {!compact && (
          <p className="text-[11px] text-muted leading-snug">
            Tiers are an editorial list of domains kept in the app, not a measured ranking —
            Tier 3 means “not on either list”. Social accounts are never tiered.
          </p>
        )}
        <p className="text-[11px] text-muted">
          {reach.rows > 0
            ? <>Reach reported on {reach.rows} of {reach.total} mentions ({reach.percent}%) — {formatNum(reach.reach)} combined</>
            : <>No source in this period reported reach</>}
        </p>
      </div>
    </div>
  )
}
