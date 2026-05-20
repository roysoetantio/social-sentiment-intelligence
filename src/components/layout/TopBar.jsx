import React, { useState, useRef, useEffect } from 'react'
import { Search, Bell, Calendar, Filter, X } from 'lucide-react'
import { format } from 'date-fns'
import { useDashboard } from '../../context/DashboardContext'
import DateRangePicker from '../ui/DateRangePicker'
import clsx from 'clsx'

const presets = [
  { label: 'Today', value: 'today' },
  { label: '7D', value: '7d' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '1Y', value: '1y' },
]

function useDarkMode() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    document.documentElement.classList.remove('dark')
    localStorage.removeItem('expo-dark-mode')
  }, [])

  return [dark, setDark]
}

export default function TopBar({ title }) {
  const {
    searchQuery, setSearchQuery,
    dateRange, setDateRange,
    setDatePreset,
    activePreset, setActivePreset,
    activeFilterCount,
    resetFilters,
    allMentions,
  } = useDashboard()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const pickerRef = useRef(null)
  const [, ] = useDarkMode() // dark mode disabled for now; defaulting to light

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const applyCustomRange = () => {
    if (!customStart || !customEnd) return
    const start = new Date(customStart)
    const end = new Date(customEnd)
    if (isNaN(start) || isNaN(end) || start > end) return
    end.setHours(23, 59, 59, 999)
    setDateRange({ start, end })
    setActivePreset(null)
    setPickerOpen(false)
  }

  const riskCount = allMentions.filter(m => m.riskFlag && m.riskLevel === 'high').length

  return (
    <header className="h-16 bg-canvas dark:bg-surface-dark border-b border-hairline dark:border-white/8 flex items-center px-4 gap-4 flex-shrink-0">
      <div className="flex-1">
        <h1 className="text-[18px] font-semibold text-ink dark:text-on-dark tracking-tight">{title}</h1>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search mentions..."
          className="w-full h-9 pl-8 pr-4 text-sm bg-canvas dark:bg-surface-dark-elevated border border-hairline-strong dark:border-white/8 rounded-md focus:outline-none focus:border-ink dark:focus:border-white/30 transition-colors text-ink dark:text-on-dark placeholder-muted"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Date presets */}
      <div className="flex items-center gap-1 h-9 bg-canvas dark:bg-surface-dark-elevated border border-hairline-strong dark:border-white/8 rounded-md p-1">
        {presets.map(p => (
          <button
            key={p.value}
            onClick={() => setDatePreset(p.value)}
            className={clsx(
              'px-3 py-1 text-xs font-medium rounded transition-all',
              activePreset === p.value
                ? 'bg-ink text-on-dark dark:bg-on-dark dark:text-ink'
                : 'text-body dark:text-on-dark-soft hover:text-ink dark:hover:text-on-dark'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date range display + picker */}
      <div className="relative flex-shrink-0" ref={pickerRef}>
        <button
          onClick={() => {
            setCustomStart(format(dateRange.start, 'yyyy-MM-dd'))
            setCustomEnd(format(dateRange.end, 'yyyy-MM-dd'))
            setPickerOpen(v => !v)
          }}
          className={clsx(
            'flex items-center justify-between gap-1.5 h-9 text-xs border rounded-md px-3 w-56 transition-colors',
            pickerOpen
              ? 'border-ink dark:border-on-dark text-ink dark:text-on-dark bg-canvas dark:bg-surface-dark-elevated'
              : 'border-hairline-strong dark:border-white/8 text-body dark:text-on-dark-soft bg-canvas dark:bg-surface-dark-elevated hover:border-ink/30'
          )}
        >
          <span>
            {dateRange.start.getFullYear() !== dateRange.end.getFullYear()
              ? `${format(dateRange.start, 'd MMM yyyy')} – ${format(dateRange.end, 'd MMM yyyy')}`
              : `${format(dateRange.start, 'd MMM')} – ${format(dateRange.end, 'd MMM yyyy')}`}
          </span>
          <Calendar size={13} />
        </button>

        {pickerOpen && (
          <DateRangePicker
            startDate={dateRange.start}
            endDate={dateRange.end}
            mentions={allMentions}
            onApply={(start, end) => {
              end.setHours(23, 59, 59, 999)
              setDateRange({ start, end })
              setActivePreset(null)
              setPickerOpen(false)
            }}
            onCancel={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* Filter count */}
      {activeFilterCount > 0 && (
        <button
          onClick={resetFilters}
          className="flex items-center gap-1.5 h-9 text-xs text-orange font-medium bg-orange/10 border border-orange/20 rounded-md px-3 hover:bg-orange/20 transition-colors"
        >
          <Filter size={13} />
          <span>{activeFilterCount} active</span>
          <X size={12} />
        </button>
      )}

      {/* Notifications */}
      <button className="relative p-2 rounded-md hover:bg-surface-strong dark:hover:bg-surface-dark-elevated transition-colors">
        <Bell size={17} className="text-body dark:text-on-dark-soft" />
        {riskCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-error text-white text-[9px] font-bold flex items-center justify-center">
            {riskCount > 9 ? '9+' : riskCount}
          </span>
        )}
      </button>
    </header>
  )
}
