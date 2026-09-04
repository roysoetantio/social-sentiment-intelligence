import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Newspaper, Award, Sparkles, AlertTriangle } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { getSourceLeaderboard, getCoverageQuality, getDelta } from '../data/analytics'
import KPICard from '../components/common/KPICard'
import SourceTable from '../components/charts/SourceTable'
import CoverageQualityChart from '../components/charts/CoverageQualityChart'
import SourceLegend from '../components/common/SourceLegend'
import { BRAND_COLORS, SENTIMENT_COLORS } from '../constants/colors'

/**
 * Sources & Coverage — who is publishing about us, and how much of it is
 * national press.
 *
 * The Overview carries a compact version of the same data; this page is where
 * it is read properly: every source, sortable, with the tiering and the marks
 * explained on the page rather than assumed.
 */
export default function SourcesCoverage() {
  const {
    globalFilteredMentions: filteredMentions,
    previousPeriodMentions,
    previousRange,
    hasComparisonPeriod,
    setOutletFilter,
    setAtRiskOnly,
  } = useDashboard()
  const navigate = useNavigate()

  const rows = useMemo(
    () => getSourceLeaderboard(filteredMentions, previousPeriodMentions),
    [filteredMentions, previousPeriodMentions]
  )
  const prevRows = useMemo(
    () => getSourceLeaderboard(previousPeriodMentions),
    [previousPeriodMentions]
  )
  const coverage = useMemo(() => getCoverageQuality(filteredMentions), [filteredMentions])
  const prevCoverage = useMemo(() => getCoverageQuality(previousPeriodMentions), [previousPeriodMentions])

  const stats = useMemo(() => {
    const outlets = rows.filter(r => r.kind === 'outlet')
    const voices = rows.filter(r => r.kind === 'voice')
    const newSources = rows.filter(r => r.isNew)
    const atRiskSources = rows.filter(r => r.atRisk > 0)
    return {
      outlets: outlets.length,
      voices: voices.length,
      total: rows.length,
      newSources: newSources.length,
      atRiskSources: atRiskSources.length,
      atRiskMentions: atRiskSources.reduce((s, r) => s + r.atRisk, 0),
      busiest: rows[0] || null,
    }
  }, [rows])

  const comparisonLabel = useMemo(() => {
    const start = new Date(previousRange.start)
    const end = new Date(previousRange.end)
    const thisYear = new Date().getFullYear()
    const needsYear = start.getFullYear() !== end.getFullYear() || start.getFullYear() !== thisYear
    const opts = needsYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' }
    return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`
  }, [previousRange])

  const handleSelect = (row, opts = {}) => {
    setOutletFilter({ key: row.key, label: row.kind === 'voice' && row.handle ? `@${row.handle}` : row.label })
    // Arriving from an at-risk count must land on those rows. It uses the same
    // isAtRisk() definition the count does — not the sidebar's "high risk only",
    // which is high-only and would have shown nothing for an outlet whose
    // at-risk coverage is all `medium`.
    setAtRiskOnly(Boolean(opts.atRisk))
    navigate('/mentions')
  }

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <p className="text-sm text-body">
        Every outlet and account that mentioned us in the selected period — ranked,
        tiered{hasComparisonPeriod ? ', and compared with the period before it' : ''}.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KPICard
          title="Sources"
          value={stats.total}
          icon={Newspaper}
          subtitle={`${stats.outlets} outlets · ${stats.voices} voices`}
          delta={hasComparisonPeriod ? getDelta(stats.total, prevRows.length) : undefined}
          deltaGoodWhen="none"
          comparisonLabel={hasComparisonPeriod ? comparisonLabel : undefined}
          tooltip="Distinct publications and social accounts that mentioned us. Published coverage counts by publication, social by account."
        />
        <KPICard
          title="Tier 1 Share"
          value={coverage.tier1Percent}
          unit="%"
          icon={Award}
          valueColor={BRAND_COLORS.primary}
          subtitle={`${coverage.tier1Count} of ${coverage.total} published items`}
          delta={hasComparisonPeriod ? getDelta(coverage.tier1Percent, prevCoverage.tier1Percent, 'points') : undefined}
          deltaGoodWhen="up"
          comparisonLabel={hasComparisonPeriod ? comparisonLabel : undefined}
          tooltip="Share of published coverage that ran in national dailies, the national wire or major business press. Social posts are excluded — an account is not a publication."
        />
        {hasComparisonPeriod ? (
          <KPICard
            title="New Sources"
            value={stats.newSources}
            icon={Sparkles}
            iconColor={BRAND_COLORS.purple}
            subtitle="First appearance this period"
            tooltip="Sources with nothing at all in the previous period of the same length."
          />
        ) : (
          <KPICard
            title="Busiest Source"
            value={stats.busiest?.label || '—'}
            icon={Sparkles}
            iconColor={BRAND_COLORS.purple}
            compact
            subtitle={stats.busiest ? `${stats.busiest.total} mentions` : 'No data'}
            tooltip="Over all time every source is a first appearance, so this tile shows the most prolific one instead."
          />
        )}
        <KPICard
          title="At-Risk Sources"
          value={stats.atRiskSources}
          icon={AlertTriangle}
          valueColor={stats.atRiskSources > 0 ? SENTIMENT_COLORS.negative : undefined}
          subtitle={`${stats.atRiskMentions} at-risk mention${stats.atRiskMentions === 1 ? '' : 's'}`}
          tooltip="Sources that published at least one mention flagged medium or high risk and not positive."
        />
      </div>

      {/* Leaderboard + coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 items-start">
        <div className="card lg:col-span-2 flex flex-col h-[34rem] lg:h-[44rem]">
          <h2 className="text-base font-semibold text-ink tracking-tight mb-3 flex-shrink-0">Source Leaderboard</h2>
          <div className="flex-1 min-h-0">
            <SourceTable
              mentions={filteredMentions}
              previousMentions={previousPeriodMentions}
              onSelect={handleSelect}
              showTrend={hasComparisonPeriod}
            />
          </div>
        </div>

        {/* Same height as the leaderboard on lg, so the two columns end level:
            the legend takes what it needs and coverage absorbs the rest. */}
        <div className="flex flex-col gap-3 lg:gap-4 lg:h-[44rem]">
          <div className="card flex flex-col h-[26rem] lg:h-auto lg:flex-1 lg:min-h-0">
            <h2 className="text-base font-semibold text-ink tracking-tight mb-3 flex-shrink-0">Coverage Quality</h2>
            <div className="flex-1 min-h-0">
              <CoverageQualityChart mentions={filteredMentions} />
            </div>
          </div>
          <div className="card flex-shrink-0">
            <h2 className="text-base font-semibold text-ink tracking-tight mb-3">Legend</h2>
            <SourceLegend showTrend={hasComparisonPeriod} />
          </div>
        </div>
      </div>
    </div>
  )
}
