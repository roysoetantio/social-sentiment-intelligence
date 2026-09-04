import React, { useMemo, useState } from 'react'
import { ExternalLink, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { getSourceLeaderboard } from '../../data/analytics'
import { TierBadge, AtRiskMark, TrendMark, VolumeBar, SourceLabel } from '../common/SourceMarks'
import SegmentedControl from '../common/SegmentedControl'

const TABS = [
  { id: 'outlet', label: 'Outlets', empty: 'No published coverage in this period' },
  { id: 'voice',  label: 'Voices',  empty: 'No social accounts posted in this period' },
]

/**
 * Who is publishing about us, ranked.
 *
 * Two tabs rather than one mixed list: published coverage is attributed to the
 * publication and social posts to the account, which are different questions
 * for a comms team (who to pitch vs who to engage).
 */
export default function TopSourcesChart({
  mentions,
  previousMentions = [],
  onSelect,
  limit = 8,
  showTrend = true,
  // When the caller owns the tab (to render the control in a card header), the
  // internal one steps aside rather than existing as a second source of truth.
  tab: tabProp,
  onTabChange,
  showMore = true,
}) {
  const [tabState, setTabState] = useState('outlet')
  const tab = tabProp ?? tabState
  const setTab = onTabChange ?? setTabState
  const [expanded, setExpanded] = useState(false)

  const all = useMemo(
    () => getSourceLeaderboard(mentions || [], previousMentions || []),
    [mentions, previousMentions]
  )

  const rows = useMemo(() => all.filter(r => r.kind === tab), [all, tab])
  const counts = useMemo(() => ({
    outlet: all.filter(r => r.kind === 'outlet').length,
    voice: all.filter(r => r.kind === 'voice').length,
  }), [all])

  const shown = expanded ? rows : rows.slice(0, limit)
  const max = rows[0]?.total || 0
  const activeTab = TABS.find(t => t.id === tab)

  return (
    <div className="flex flex-col h-full min-h-0">
      {!tabProp && (
        <div className="mb-3 flex-shrink-0">
          <SegmentedControl
            value={tab}
            onChange={(id) => { setTab(id); setExpanded(false) }}
            options={TABS.map(t => ({ value: t.id, label: t.label, count: counts[t.id] }))}
          />
        </div>
      )}

      {shown.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted">{activeTab.empty}</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide -mx-1 px-1">
          <div className="space-y-0.5">
            {shown.map((row, i) => {
              return (
                <div
                  key={row.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect?.(row)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(row) } }}
                  className="group grid grid-cols-[1.375rem_1fr_auto] items-center gap-2 rounded-md px-1.5 py-1 cursor-pointer hover:bg-surface-strong dark:hover:bg-white/5 transition-colors"
                >
                  {/* Same rank chip as the full table — one element, one look. */}
                  <span className={clsx(
                    'inline-flex items-center justify-center w-[1.375rem] h-[1.375rem] rounded text-[11px] tabular-nums',
                    'bg-surface-strong dark:bg-white/8',
                    i < 3 ? 'text-ink font-semibold' : 'text-muted'
                  )}>
                    {i + 1}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <SourceLabel row={row} />
                      <TierBadge tier={row.tier} />
                      {row.atRisk > 0 ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelect?.(row, { atRisk: true }) }}
                          onKeyDown={(e) => e.stopPropagation()}
                          title={`Show ${row.label}'s at-risk coverage`}
                          className="inline-flex rounded hover:bg-[#E97132]/10 transition-colors flex-shrink-0"
                        >
                          <AtRiskMark count={row.atRisk} />
                        </button>
                      ) : <AtRiskMark count={row.atRisk} />}
                      {row.sampleUrl && row.sampleUrl !== '#' && (
                        <a
                          href={row.sampleUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-muted hover:text-[#2940BE]"
                          title="Open the most recent item"
                        >
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    <div className="mt-1">
                      <VolumeBar row={row} max={max} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {showTrend && <TrendMark row={row} />}
                    <span className="text-[13px] font-semibold text-ink tabular-nums w-7 text-right">{row.total}</span>
                    <ChevronRight size={13} className="text-muted group-hover:text-ink transition-colors" />
                  </div>
                </div>
              )
            })}
          </div>

          {showMore && rows.length > limit && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-full mt-2 py-1.5 text-xs font-medium hover:opacity-70 transition-opacity"
              style={{ color: 'var(--accent-brand)' }}
            >
              {expanded ? 'Show less' : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
