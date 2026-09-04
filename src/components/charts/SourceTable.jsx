import React, { useMemo, useState } from 'react'
import { Search, ExternalLink, ArrowUp, ArrowDown, ChevronRight, AlertTriangle, Check } from 'lucide-react'
import clsx from 'clsx'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { getSourceLeaderboard } from '../../data/analytics'
import { SENTIMENT_COLORS } from '../../constants/colors'
import { TierBadge, AtRiskMark, TrendMark, SentimentBar, SourceLabel, TIER_HEADLINES } from '../common/SourceMarks'
import SegmentedControl from '../common/SegmentedControl'

const TABS = [
  { id: 'outlet', label: 'Outlets', empty: 'No published coverage in this period' },
  { id: 'voice',  label: 'Voices',  empty: 'No social accounts posted in this period' },
]

// `hint` is the hover explanation. Every column that reports a number a reader
// could misread carries one, because a column heading has room for a word and
// these each need a sentence — what is counted, and what deliberately is not.
const COLUMNS = [
  { key: 'rank',      label: '#',         sortable: false, className: 'w-[4%]' },
  { key: 'label',     label: 'Source',    sortable: true,  className: 'w-[28%]',
    hint: 'Published coverage is attributed to the publication (its domain); social posts to the account that wrote them — hence the Outlets and Voices tabs rather than one mixed ranking. Rows the source API gave no author for appear as “Unattributed”.' },
  // Outlets only — a social account has no tier, so the column goes on Voices.
  { key: 'tier',      label: 'Tier',      sortable: true,  className: 'w-[7%]', outletOnly: true,
    hint: 'An editorial list kept in the app, not a measured ranking. T1 national press and wires, T2 trade, investor and niche titles, T3 means “on neither list” rather than low quality.' },
  { key: 'total',     label: 'Mentions',  sortable: true,  className: 'w-[14%]', align: 'right',
    hint: 'Mentions from this source inside the selected date range, and its share of all mentions in this tab. Change the range and this changes with it.' },
  { key: 'sentiment', label: 'Sentiment', sortable: true,  className: 'w-[18%]',
    hint: 'How this source’s coverage splits between positive, neutral and negative. “net” is positive minus negative as a percentage of its mentions, so a source with equal amounts of both reads 0.' },
  { key: 'atRisk',    label: 'At-risk',   sortable: true,  className: 'w-[9%]', align: 'right',
    hint: 'Negative mentions graded medium or high risk. Mildly negative coverage (low risk) is counted in the Sentiment column but not here.' },
  { key: 'diff',      label: 'Trend',     sortable: true,  className: 'w-[9%]', align: 'right',
    hint: 'Change in this source’s mention count against the window of equal length immediately before the selected one. “new” means it published nothing about us in that earlier window.' },
  { key: 'lastAt',    label: 'Last seen', sortable: true,  className: 'w-[11%]', align: 'right',
    hint: 'How long ago this source’s most recent mention in the range was published — not when we ingested it.' },
  // The affordance that replaced "click a row to open its mentions".
  { key: 'go',        label: '',          sortable: false, className: 'w-6' },
]

const PAGE = 20

const relativeDate = (iso) => {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/**
 * The full source leaderboard: every outlet or account that mentioned us,
 * sortable and searchable.
 *
 * Reads the same `getSourceLeaderboard` rows as the compact list on the
 * Overview, so the two can differ in density but never in fact.
 */
export default function SourceTable({ mentions, previousMentions = [], onSelect, showTrend = true }) {
  const [tab, setTab] = useState('outlet')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'total', dir: 'desc' })
  // 'all' means every tier — a filter nobody has touched should never be hiding
  // rows. Voices carry no tier, so the control only exists on the Outlets tab.
  const [tier, setTier] = useState('all')
  // With no comparison window there is nothing to move against, so the column
  // goes rather than filling with "new" on every row.
  const [atRiskOnly, setAtRiskOnly] = useState(false)
  const [shown, setShown] = useState(PAGE)

  const columns = useMemo(
    () => COLUMNS.filter(c => (showTrend || c.key !== 'diff') && (tab === 'outlet' || !c.outletOnly)),
    [showTrend, tab]
  )

  const all = useMemo(
    () => getSourceLeaderboard(mentions || [], previousMentions || []),
    [mentions, previousMentions]
  )

  const counts = useMemo(() => ({
    outlet: all.filter(r => r.kind === 'outlet').length,
    voice: all.filter(r => r.kind === 'voice').length,
  }), [all])

  const atRiskCount = useMemo(
    () => all.filter(r => r.kind === tab && r.atRisk > 0).length,
    [all, tab]
  )

  const totalMentionsInTab = useMemo(
    () => all.filter(r => r.kind === tab).reduce((s, r) => s + r.total, 0),
    [all, tab]
  )

  // Tier counts are of sources, not mentions — this control filters the list.
  const tierCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0 }
    all.forEach(r => { if (r.kind === 'outlet' && r.tier) counts[r.tier]++ })
    return counts
  }, [all])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = all.filter(r =>
      r.kind === tab &&
      (tab !== 'outlet' || tier === 'all' || r.tier === tier) &&
      (!atRiskOnly || r.atRisk > 0) &&
      (!q || r.label.toLowerCase().includes(q) || (r.handle || '').toLowerCase().includes(q) || (r.domain || '').includes(q))
    )
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      // Rows with no identifiable author sink below every real source under
      // every sort and both directions — a gap in the data is not a value to
      // rank. getSourceLeaderboard does the same for the list on the Overview;
      // re-sorting here dropped it until this line.
      const gap = (a.unattributed ? 1 : 0) - (b.unattributed ? 1 : 0)
      if (gap !== 0) return gap

      switch (sort.key) {
        case 'label':     return dir * a.label.localeCompare(b.label)
        case 'tier':      return dir * ((b.tier || 9) - (a.tier || 9))
        case 'sentiment': return dir * (a.netSentiment - b.netSentiment)
        case 'atRisk':    return dir * (a.atRisk - b.atRisk)
        // A first appearance has no previous value to difference against, so it
        // sorts as the biggest gain rather than as zero.
        case 'diff':      return dir * ((a.isNew ? a.total + 0.5 : a.diff) - (b.isNew ? b.total + 0.5 : b.diff))
        case 'lastAt':    return dir * (new Date(a.lastAt || 0) - new Date(b.lastAt || 0))
        default:          return dir * (a.total - b.total)
      }
    })
  }, [all, tab, tier, atRiskOnly, query, sort])

  const max = useMemo(() => Math.max(...rows.map(r => r.total), 0), [rows])
  const visible = rows.slice(0, shown)
  const activeTab = TABS.find(t => t.id === tab)

  const toggleSort = (key) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: key === 'label' ? 'asc' : 'desc' })
    setShown(PAGE)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 flex-shrink-0">
        <SegmentedControl
          value={tab}
          onChange={(id) => { setTab(id); setShown(PAGE); setTier('all'); setAtRiskOnly(false); setSort({ key: 'total', dir: 'desc' }) }}
          options={TABS.map(t => ({ value: t.id, label: t.label, count: counts[t.id] }))}
        />

        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          {/* One click for "which sources are giving us trouble" — the question
              the At-Risk Sources tile poses and nothing else could answer. */}
          <button
            onClick={() => { setAtRiskOnly(v => !v); setShown(PAGE) }}
            disabled={atRiskCount === 0 && !atRiskOnly}
            aria-pressed={atRiskOnly}
            title="Show only sources that published at-risk coverage"
            className={clsx(
              'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors border',
              atRiskCount === 0 && !atRiskOnly && 'opacity-40 cursor-not-allowed',
              atRiskOnly
                ? 'border-transparent bg-[#E97132]/12 text-[#E97132]'
                : 'border-hairline-strong text-muted hover:text-ink'
            )}
          >
            <span className={clsx(
              'w-3 h-3 rounded-[3px] border flex items-center justify-center flex-shrink-0',
              atRiskOnly ? 'bg-[#E97132] border-[#E97132]' : 'border-hairline-strong'
            )}>
              {atRiskOnly && <Check size={9} className="text-white" strokeWidth={3} />}
            </span>
            <AlertTriangle size={11} />
            At-risk
            <span className="tabular-nums font-normal opacity-70">({atRiskCount})</span>
          </button>

          {tab === 'outlet' && (
            <SegmentedControl
              value={tier}
              onChange={(v) => { setTier(v); setShown(PAGE) }}
              options={[
                { value: 'all', label: 'All' },
                ...[1, 2, 3].map(t => ({
                  value: t,
                  label: `T${t}`,
                  count: tierCounts[t],
                  disabled: tierCounts[t] === 0,
                  title: `Tier ${t} — ${TIER_HEADLINES[t]}`,
                })),
              ]}
            />
          )}
          <div className="relative w-full sm:w-44">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setShown(PAGE) }}
              placeholder={tab === 'outlet' ? 'Search outlets…' : 'Search accounts…'}
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md bg-surface-strong dark:bg-white/5 border border-transparent focus:border-hairline-strong focus:outline-none text-ink placeholder:text-muted"
            />
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted">
          {query ? `Nothing matches “${query}”` : activeTab.empty}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 bg-canvas z-10">
              <TableRow>
                {columns.map(col => (
                  <TableHead
                    key={col.key}
                    className={clsx(
                      'text-[11px] whitespace-nowrap',
                      col.key === 'rank' ? 'pl-1 pr-0' : 'px-4',
                      col.className,
                      col.align === 'right' && 'text-right'
                    )}
                  >
                    {col.sortable ? (
                      // A header with a hint gets the same hover explanation the
                      // badges carry, so nobody has to guess what a column counts.
                      col.hint ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => toggleSort(col.key)}
                              className={clsx(
                                'inline-flex items-center gap-1 hover:text-ink transition-colors underline decoration-dotted decoration-from-font underline-offset-2',
                                sort.key === col.key && 'text-ink font-semibold'
                              )}
                            >
                              {col.label}
                              {sort.key === col.key && (
                                sort.dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[15rem]">
                            <p>{col.hint}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <button
                          onClick={() => toggleSort(col.key)}
                          className={clsx(
                            'inline-flex items-center gap-1 hover:text-ink transition-colors',
                            sort.key === col.key && 'text-ink font-semibold'
                          )}
                        >
                          {col.label}
                          {sort.key === col.key && (
                            sort.dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />
                          )}
                        </button>
                      )
                    ) : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row, i) => (
                <TableRow
                  key={row.key}
                  onClick={() => onSelect?.(row)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSelect?.(row) }}
                  className="group cursor-pointer"
                >
                  <TableCell className="pl-1 pr-0 py-3">
                    <span className={clsx(
                      'inline-flex items-center justify-center min-w-[1.375rem] h-[1.375rem] px-1 rounded text-[11px] tabular-nums',
                      'bg-surface-strong dark:bg-white/8',
                      i < 3 ? 'text-ink font-semibold' : 'text-muted'
                    )}>
                      {i + 1}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <SourceLabel row={row} />
                      {row.sampleUrl && row.sampleUrl !== '#' && (
                        <a
                          href={row.sampleUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-[#2940BE] flex-shrink-0"
                          title="Open the most recent item"
                        >
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-muted truncate mt-1">
                      {row.platforms.join(' · ')}{row.domain ? ` · ${row.domain}` : ''}
                    </p>
                  </TableCell>

                  {tab === 'outlet' && (
                    <TableCell className="px-4 py-3">
                      <TierBadge tier={row.tier} size="md" />
                    </TableCell>
                  )}

                  <TableCell className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1 rounded-full bg-[#2940BE]/25 dark:bg-[#6B80FF]/30 flex-1 max-w-[4.5rem]"
                           style={{ transform: `scaleX(${max ? Math.max(row.total / max, 0.04) : 0})`, transformOrigin: 'right' }} />
                      <span className="text-[13px] font-semibold text-ink tabular-nums w-7 text-right">{row.total}</span>
                    </div>
                    <p className="text-[10px] text-muted text-right mt-1 tabular-nums">
                      {totalMentionsInTab ? ((row.total / totalMentionsInTab) * 100).toFixed(1) : '0.0'}% share
                    </p>
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <SentimentBar row={row} />
                    <p className="text-[10px] mt-1.5 tabular-nums"
                       style={{ color: row.netSentiment > 0 ? SENTIMENT_COLORS.positive : row.netSentiment < 0 ? SENTIMENT_COLORS.negative : '#787881' }}>
                      net {row.netSentiment > 0 ? '+' : ''}{row.netSentiment}%
                    </p>
                  </TableCell>

                  <TableCell className="px-4 py-3 text-right">
                    {row.atRisk > 0 ? (
                      // Its own drill-down: the row goes to everything this
                      // outlet published, the count goes to the at-risk rows it
                      // is actually counting.
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelect?.(row, { atRisk: true }) }}
                        onKeyDown={(e) => e.stopPropagation()}
                        title={`Show ${row.label}'s at-risk coverage`}
                        className="inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-[#E97132]/10 transition-colors"
                      >
                        <AtRiskMark count={row.atRisk} />
                        <span className="text-[13px] font-semibold tabular-nums" style={{ color: SENTIMENT_COLORS.negative }}>
                          {row.atRisk}
                        </span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted">—</span>
                    )}
                  </TableCell>

                  {showTrend && (
                    <TableCell className="px-4 py-3 text-right">
                      <TrendMark row={row} />
                    </TableCell>
                  )}

                  <TableCell className="px-4 py-3 text-right text-[11px] text-muted whitespace-nowrap">
                    {relativeDate(row.lastAt)}
                  </TableCell>

                  <TableCell className="pl-0 pr-1 py-3 text-right">
                    <ChevronRight size={13} className="text-muted group-hover:text-ink transition-colors inline-block" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {rows.length > visible.length && (
            <button
              onClick={() => setShown(s => s + PAGE)}
              className="w-full mt-3 py-2 text-xs font-medium hover:opacity-70 transition-opacity"
              style={{ color: 'var(--accent-brand)' }}
            >
              Show {Math.min(PAGE, rows.length - visible.length)} more · {visible.length} of {rows.length}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
