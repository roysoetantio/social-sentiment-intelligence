import React, { useState, useRef, useEffect } from 'react'
import { Search, Bell, Calendar, X, Menu, ChevronDown, ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
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

export default function TopBar({ title, shortTitle, onMenuClick }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const showBack = location.pathname === '/keywords'
  const inGroupDetail = showBack && searchParams.has('g')
  const handleBack = () => inGroupDetail ? navigate('/keywords') : navigate('/more')
  const {
    searchQuery, setSearchQuery,
    dateRange, setDateRange,
    setDatePreset,
    activePreset, setActivePreset,
    allMentions,
  } = useDashboard()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const pickerRef = useRef(null)
  const mobilePickerRef = useRef(null)
  const presetDropdownRef = useRef(null)
  const mobileSearchRef = useRef(null)
  const desktopSearchRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      const insidePicker =
        (pickerRef.current && pickerRef.current.contains(e.target)) ||
        (mobilePickerRef.current && mobilePickerRef.current.contains(e.target))
      if (!insidePicker) setPickerOpen(false)
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target)) setPresetDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        desktopSearchRef.current?.focus()
        desktopSearchRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Auto-focus search input when expanded
  useEffect(() => {
    if (mobileSearchOpen && mobileSearchRef.current) {
      mobileSearchRef.current.focus()
    }
  }, [mobileSearchOpen])

  const openCalendar = () => {
    setPickerOpen(v => !v)
  }

  const riskCount = allMentions.filter(m => m.riskFlag && m.riskLevel === 'high').length

  return (
    <header className="bg-canvas dark:bg-surface-dark flex-shrink-0 sticky top-0 z-30" style={{ touchAction: 'pan-x' }}>
      {/* Main row */}
      <div className="h-14 md:h-16 flex items-center px-4 gap-2 md:gap-4 border-b border-hairline dark:border-white/8">
        {/* Back button — mobile only, keywords page */}
        {showBack && (
          <button
            onClick={handleBack}
            className="md:hidden flex items-center justify-center p-1 -ml-1 mr-1 text-[#2940BE] dark:text-[#6B80FF]"
          >
            <ArrowLeft size={20} />
          </button>
        )}

        {/* Burger — tablet only */}
        <button
          onClick={onMenuClick}
          className="hidden md:flex lg:hidden p-2 -ml-1 rounded-md hover:bg-surface-strong text-body"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-base md:text-lg font-semibold text-ink dark:text-on-dark tracking-tight truncate">
            {inGroupDetail
              ? searchParams.get('name') || 'Keywords'
              : <><span className="md:hidden">{shortTitle}</span><span className="hidden md:inline">{title}</span></>
            }
          </h1>
        </div>

        {/* ── Mobile controls (hidden on md+) ── */}

        {/* Search icon — mobile */}
        <button
          onClick={() => {
            setMobileSearchOpen(v => !v)
            if (mobileSearchOpen) setSearchQuery('')
          }}
          className={clsx(
            'md:hidden flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-md border transition-colors',
            mobileSearchOpen || searchQuery
              ? 'border-ink text-ink bg-canvas dark:border-on-dark dark:text-on-dark'
              : 'border-hairline-strong text-muted hover:border-ink/30 dark:border-white/8 dark:text-on-dark-soft'
          )}
        >
          {mobileSearchOpen ? <X size={15} /> : <Search size={15} />}
        </button>

        {/* Date preset dropdown — mobile */}
        <div className="relative md:hidden flex-shrink-0" ref={presetDropdownRef}>
          <button
            onClick={() => setPresetDropdownOpen(v => !v)}
            className={clsx(
              'flex items-center gap-1 h-9 px-2.5 text-xs font-medium border rounded-md transition-colors',
              presetDropdownOpen
                ? 'border-ink text-ink bg-canvas dark:border-on-dark dark:text-on-dark'
                : 'border-hairline-strong text-body bg-canvas hover:border-ink/30 dark:border-white/8 dark:text-on-dark-soft'
            )}
          >
            <span>{presets.find(p => p.value === activePreset)?.label ?? 'Custom'}</span>
            <ChevronDown size={11} className={clsx('transition-transform', presetDropdownOpen && 'rotate-180')} />
          </button>
          {presetDropdownOpen && (
            <div className="absolute right-0 top-10 z-50 bg-canvas dark:bg-surface-dark border border-hairline-strong dark:border-white/8 rounded-md shadow-md overflow-hidden">
              {presets.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setDatePreset(p.value); setPresetDropdownOpen(false) }}
                  className={clsx(
                    'w-full text-left px-4 py-2.5 text-xs font-medium transition-colors',
                    activePreset === p.value
                      ? 'bg-ink text-on-dark'
                      : 'text-body dark:text-on-dark-soft hover:bg-surface-strong dark:hover:bg-white/8'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Calendar icon — mobile */}
        <div className="relative md:hidden flex-shrink-0" ref={mobilePickerRef}>
          <button
            onClick={openCalendar}
            className={clsx(
              'flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-md border transition-colors',
              pickerOpen
                ? 'border-ink text-ink bg-canvas dark:border-on-dark dark:text-on-dark'
                : 'border-hairline-strong text-muted hover:border-ink/30 dark:border-white/8 dark:text-on-dark-soft'
            )}
          >
            <Calendar size={15} />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-10 z-50">
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
            </div>
          )}
        </div>

        {/* ── Desktop controls (hidden on mobile) ── */}

        {/* Search — desktop */}
        <div className="relative w-64 hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={desktopSearchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search mentions..."
            className="w-full h-9 pl-8 pr-14 text-sm bg-canvas dark:bg-surface-dark-elevated border border-hairline-strong dark:border-white/8 rounded-md focus:outline-none focus:border-ink dark:focus:border-white/30 transition-colors text-ink dark:text-on-dark placeholder-muted"
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
              <X size={12} />
            </button>
          ) : (
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1 py-0 rounded border border-hairline-strong dark:border-white/8 bg-surface-strong dark:bg-white/8 text-xs text-muted dark:text-on-dark-soft pointer-events-none">
              <span className="text-sm">⌘</span><span className="text-[0.65rem]">K</span>
            </kbd>
          )}
        </div>

        {/* Date presets — desktop */}
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

        {/* Date range picker — desktop */}
        <div className="relative flex-shrink-0 hidden md:block" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(v => !v)}
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

        {/* Notifications — both */}
        <button className="relative h-9 w-9 flex items-center justify-center rounded-md border border-hairline-strong dark:border-white/8 hover:border-ink/30 dark:hover:border-white/20 hover:bg-surface-strong dark:hover:bg-surface-dark-elevated transition-colors flex-shrink-0">
          <Bell size={17} className="text-body dark:text-on-dark-soft" />
          {riskCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-error text-white text-[0.5625rem] font-bold flex items-center justify-center">
              {riskCount > 9 ? '9+' : riskCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile search — inline row below topbar */}
      {mobileSearchOpen && (
        <div className="md:hidden flex items-center gap-2 px-4 h-11 border-b border-hairline dark:border-white/8 bg-canvas dark:bg-surface-dark">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            ref={mobileSearchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search mentions..."
            className="flex-1 h-full text-sm bg-transparent focus:outline-none text-ink dark:text-on-dark placeholder-muted"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-muted">
              <X size={13} />
            </button>
          )}
        </div>
      )}
    </header>
  )
}
