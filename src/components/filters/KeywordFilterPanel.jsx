import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import clsx from 'clsx'

export default function KeywordFilterPanel() {
  const { selectedKeywords, toggleKeyword, selectedGroups, toggleGroup, keywordGroups } = useDashboard()
  const [openGroups, setOpenGroups] = useState(new Set())

  useEffect(() => {
    if (keywordGroups.length > 0) setOpenGroups(new Set(keywordGroups.map(g => g.id)))
  }, [keywordGroups])

  const toggleOpen = (id) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-1">
      {keywordGroups.map(g => {
        const isOpen = openGroups.has(g.id)
        const groupSelected = selectedGroups.includes(g.id)

        return (
          <div key={g.id} className="rounded-lg overflow-hidden">
            <div
              className="flex items-center gap-2 p-2 cursor-pointer hover:bg-surface-strong dark:hover:bg-white/8 rounded-lg transition-colors"
              onClick={() => toggleOpen(g.id)}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
              <span className="flex-1 text-xs font-semibold text-ink dark:text-on-dark">{g.name}</span>
              <button
                onClick={e => { e.stopPropagation(); toggleGroup(g.id) }}
                className={clsx(
                  'text-[0.625rem] px-2 py-0.5 rounded border font-medium transition-all',
                  groupSelected ? 'text-white border-transparent' : 'text-muted dark:text-on-dark-soft border-hairline-strong dark:border-white/8 hover:border-hairline-strong dark:hover:border-white/20'
                )}
                style={groupSelected ? { backgroundColor: g.color } : {}}
              >
                All
              </button>
              {isOpen ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
            </div>

            {isOpen && (
              <div className="ml-4 space-y-0.5 pb-1">
                {g.keywords.map(kw => {
                  const isSelected = selectedKeywords.includes(kw.id)
                  return (
                    <button
                      key={kw.id}
                      onClick={() => toggleKeyword(kw.id)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all text-left',
                        isSelected ? 'font-medium' : 'text-body dark:text-on-dark-soft hover:bg-surface-strong dark:hover:bg-white/8'
                      )}
                      style={isSelected ? { color: g.color, backgroundColor: `${g.color}10` } : {}}
                    >
                      <div className={clsx(
                        'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                        isSelected ? 'border-transparent' : 'border-hairline-strong dark:border-white/20'
                      )}
                        style={isSelected ? { backgroundColor: g.color } : {}}
                      >
                        {isSelected && <Check size={10} className="text-white" />}
                      </div>
                      <span className="truncate">{kw.term}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
