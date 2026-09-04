import React from 'react'
import TopSourcesChart from './TopSourcesChart'
import CoverageQualityChart from './CoverageQualityChart'

/**
 * Who published about us, and how good those outlets were — one widget,
 * because the two answers are read together: a ranked list of sources means
 * little without knowing what share of it is national press.
 *
 * The two panels sit side by side at every size above `sm`, on the card and on
 * the full page alike; only the density changes, so the layout you learn in the
 * card is the layout you get when you open it.
 */
export default function MediaCoverage({
  mentions, previousMentions, onSelect, expanded = false, showTrend = true, tab, onTabChange,
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 lg:gap-5 h-full min-h-0">
      <div className={expanded
        ? 'sm:flex-[2] min-h-0 flex flex-col'
        : 'h-[20rem] sm:h-auto sm:flex-[3] min-h-0 flex flex-col'}>
        <TopSourcesChart
          mentions={mentions}
          previousMentions={previousMentions}
          onSelect={onSelect}
          limit={expanded ? 30 : 5}
          showTrend={showTrend}
          tab={tab}
          onTabChange={onTabChange}
          showMore={expanded}
        />
      </div>
      <div className={`min-h-0 flex flex-col sm:border-l sm:border-hairline sm:pl-4 lg:pl-5 ${expanded ? 'sm:flex-1' : 'sm:flex-[2]'}`}>
        <CoverageQualityChart mentions={mentions} compact={!expanded} />
      </div>
    </div>
  )
}
