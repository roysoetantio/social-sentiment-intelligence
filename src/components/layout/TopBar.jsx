import React, { useState, useRef, useEffect } from 'react'
import { Search, Bell, Calendar, Filter, X, Menu, ChevronDown } from 'lucide-react'
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

export default function TopBar({ title, onMenuClick }) {
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
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const pickerRef = useRef(null)
  const mobilePickerRef = useRef(null)
  const presetDropdownRef = useRef(null)
  const [, ] = useDarkMode() // dark mode disabled for now; defaulting to light

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false)
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target)) setPresetDropdownOpen(false)
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
    <header className="bg-canvas dark:bg-surface-dark border-b border-hairline dark:border-white/8 flex-shrink-0 md:h-16">
      {/* Main row */}
      <div className="h-16 flex items-center px-4 gap-4">
        {/* Burger menu — mobile only */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-1 rounded-md hover:bg-surface-strong text-body"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="flex-1">
          <h1 className="text-lg font-semibold text-ink dark:text-on-dark tracking-tight">{title}</h1>
        </div>

        {/* Search — desktop only */}
        <div className="relative w-64 hidden md:block">
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

        {/* Date presets — desktop only */}
        <div className="hidden md:flex items-center gap-1 h-9 bg-canvas dark:bg-surface-dark-elevated border border-hairline-strong dark:border-white/8 rounded-md p-1">
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

        {/* Date range display + picker — desktop only */}
        <div className="relative flex-shrink-0 hidden md:block" ref={pickerRef}>
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
            <span className="hidden sm:inline">{activeFilterCount} active</span>
            <X size={12} />
          </button>
        )}

        {/* Notifications */}
        <button className="relative p-2 rounded-md hover:bg-surface-strong dark:hover:bg-surface-dark-elevated transition-colors">
          <Bell size={17} className="text-body dark:text-on-dark-soft" />
          {riskCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-error text-white text-[0.5625rem] font-bold flex items-center justify-center">
              {riskCount > 9 ? '9+' : riskCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile second row — search + date presets */}
      <div className="md:hidden px-4 pb-3 flex items-center gap-2" ref={mobilePickerRef}>
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search mentions..."
            className="w-full h-9 pl-8 pr-4 text-sm bg-canvas border border-hairline-strong rounded-md focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Date preset dropdown */}
        <div className="relative flex-shrink-0" ref={presetDropdownRef}>
          <button
            onClick={() => setPresetDropdownOpen(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 h-9 px-3 text-xs font-medium border rounded-md transition-colors',
              presetDropdownOpen
                ? 'border-ink text-ink bg-canvas'
                : 'border-hairline-strong text-body bg-canvas hover:border-ink/30'
            )}
          >
            <span>{presets.find(p => p.value === activePreset)?.label ?? 'Custom'}</span>
            <ChevronDown size={12} className={clsx('transition-transform', presetDropdownOpen && 'rotate-180')} />
          </button>
          {presetDropdownOpen && (
            <div className="absolute right-0 top-10 z-50 bg-canvas border border-hairline-strong rounded-md shadow-md overflow-hidden">
              {presets.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setDatePreset(p.value); setPresetDropdownOpen(false) }}
                  className={clsx(
                    'w-full text-left px-4 py-2.5 text-xs font-medium transition-colors',
                    activePreset === p.value
                      ? 'bg-ink text-on-dark'
                      : 'text-body hover:bg-surface-strong'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Calendar icon for custom range */}
        <button
          onClick={() => {
            setCustomStart(format(dateRange.start, 'yyyy-MM-dd'))
            setCustomEnd(format(dateRange.end, 'yyyy-MM-dd'))
            setPickerOpen(v => !v)
          }}
          className={clsx(
            'flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-md border transition-colors',
            pickerOpen
              ? 'border-ink text-ink bg-canvas'
              : 'border-hairline-strong text-muted hover:border-ink/30'
          )}
        >
          <Calendar size={15} />
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
    </header>
  )
}
