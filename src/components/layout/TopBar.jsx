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
    <header className="h-14 bg-white border-b border-gray-100 flex items-center px-6 gap-4 flex-shrink-0">
      <div className="flex-1">
        <h1 className="text-base font-semibold text-darktext">{title}</h1>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search mentions..."
          className="w-full h-9 pl-8 pr-4 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary focus:bg-white transition-colors"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Date presets */}
      <div className="flex items-center gap-1 h-9 bg-gray-50 border border-gray-200 rounded-lg p-1">
        {presets.map(p => (
          <button
            key={p.value}
            onClick={() => setDatePreset(p.value)}
            className={clsx(
              'px-3 py-1 text-xs font-medium rounded-md transition-all border',
              activePreset === p.value
                ? 'bg-primary text-white border-primary'
                : 'text-gray-500 border-transparent hover:text-gray-700'
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
            'flex items-center justify-between gap-1.5 h-9 text-xs bg-gray-50 border rounded-lg px-3 w-56 transition-colors',
            pickerOpen ? 'border-primary text-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'
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
          className="flex items-center gap-1.5 h-9 text-xs text-orange font-medium bg-orange/10 border border-orange/20 rounded-lg px-3 hover:bg-orange/20 transition-colors"
        >
          <Filter size={13} />
          <span>{activeFilterCount} active</span>
          <X size={12} />
        </button>
      )}

      {/* Notifications */}
      <button className="relative p-2 rounded-lg hover:bg-gray-50 transition-colors">
        <Bell size={17} className="text-gray-500" />
        {riskCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {riskCount > 9 ? '9+' : riskCount}
          </span>
        )}
      </button>
    </header>
  )
}
