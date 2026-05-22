import React, { useMemo } from 'react'
import { Check } from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import clsx from 'clsx'

export default function KeywordFilterPanel() {
  const { selectedKeywords, toggleKeyword, keywordGroups, filteredMentions } = useDashboard()

  const allKeywords = keywordGroups.flatMap(g => g.keywords)

  const keywordCounts = useMemo(() => {
    const counts = {}
    ;(filteredMentions || []).forEach(m => {
      (m.keywordMatched || []).forEach(id => {
        counts[id] = (counts[id] || 0) + 1
      })
    })
    return counts
  }, [filteredMentions])

  return (
    <div className="space-y-0.5">
      {allKeywords.map(kw => {
        const isSelected = selectedKeywords.includes(kw.id)
        const count = keywordCounts[kw.id] || 0
        const isEmpty = count === 0 && !isSelected
        return (
          <button
            key={kw.id}
            onClick={() => !isEmpty && toggleKeyword(kw.id)}
            disabled={isEmpty}
            className={clsx(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all text-left',
              isEmpty ? 'opacity-35 cursor-not-allowed' :
              isSelected ? 'font-medium text-[#2940BE] bg-[#2940BE]/10' : 'text-body dark:text-on-dark-soft hover:bg-surface-strong dark:hover:bg-white/8'
            )}
          >
            <div className={clsx(
              'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
              isSelected ? 'bg-[#2940BE] border-[#2940BE]' : 'border-hairline-strong dark:border-white/20'
            )}>
              {isSelected && <Check size={10} className="text-white" />}
            </div>
            <span className="truncate flex-1">{kw.term}</span>
            <span className={clsx(
              'text-[0.625rem] font-semibold rounded-full px-1.5 py-0.5 border flex-shrink-0',
              isSelected ? 'bg-white/20 text-[#2940BE] border-transparent bg-[#2940BE]/20' : 'bg-canvas dark:bg-white/8 border-hairline-strong dark:border-white/8 text-muted dark:text-on-dark-soft'
            )}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
