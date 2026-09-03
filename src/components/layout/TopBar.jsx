import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Bell, Calendar, X, Menu, ChevronDown, ArrowLeft, Circle, CheckCircle, CheckCheck, Sun, Moon } from 'lucide-react'
import { formatDateTime } from '../../utils/format'
import { format } from 'date-fns'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useDashboard } from '../../context/DashboardContext'
import { useSocialFilter } from '../../context/SocialFilterContext'
import { useTheme } from '../../context/ThemeContext'
import DateRangePicker from '../ui/DateRangePicker'
import clsx from 'clsx'

const presets = [
  { label: 'Today', value: 'today' },
  { label: '7D', value: '7d' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '1Y', value: '1y' },
]

// Social Feed holds our full publishing history, so it gets a ceiling the
// mentions pages don't — those are windowed by design.
const socialPresets = [...presets, { label: 'All', value: 'all' }]

export default function TopBar({ title, shortTitle, onMenuClick }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const showBack = location.pathname === '/keywords'
  const inGroupDetail = showBack && searchParams.has('g')
  const handleBack = () => inGroupDetail ? navigate('/keywords') : navigate('/more')
  // Pages with nothing to filter show the controls visually disabled rather
  // than live-but-inert. Facebook used to sit here too; it now has its own
  // social_posts rows and drives the same date/search store as Instagram.
  const filtersDisabled = location.pathname === '/keywords'
  const FILTERS_NA_MSG = "Search & date filters don't apply to Keyword Manager"

  const dashboard = useDashboard()
  const social = useSocialFilter()
  // Social Feed reuses these exact controls, just pointed at its own store, so
  // the page needs no second set of range tabs of its own.
  const onSocial = location.pathname.startsWith('/social')
  const filters = onSocial ? social : dashboard

  const {
    searchQuery, setSearchQuery,
    dateRange, setDateRange,
    setDatePreset,
    activePreset, setActivePreset,
  } = filters
  const { allMentions, setRiskOnly, readIds, markRead, markAllRead } = dashboard

  // The picker dots days that actually carry data — posts on social, mentions elsewhere.
  const pickerItems = onSocial ? social.posts : allMentions
  const searchPlaceholder = onSocial ? 'Search posts...' : 'Search mentions...'
  const activePresets = onSocial ? socialPresets : presets
  const { isDark, toggleTheme } = useTheme()

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
        if (filtersDisabled) return
        desktopSearchRef.current?.focus()
        desktopSearchRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [filtersDisabled])

  // Auto-focus search input when expanded
  useEffect(() => {
    if (mobileSearchOpen && mobileSearchRef.current) {
      mobileSearchRef.current.focus()
    }
  }, [mobileSearchOpen])

  const openCalendar = () => {
    setPickerOpen(v => !v)
  }

  const highRiskMentions = allMentions.filter(m => m.riskLevel === 'high')

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTab, setNotifTab] = useState('all')
  const notifRef = useRef(null)
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unreadCount = highRiskMentions.filter(m => !readIds.has(m.id)).length
  const riskCount = unreadCount

  return (
    <header className="bg-canvas flex-shrink-0 sticky top-0 z-40" style={{ touchAction: 'pan-x' }}>
      {/* Main row */}
      <div className="h-14 md:h-16 flex items-center px-4 gap-2 md:gap-4 border-b border-hairline">
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
          <h1 className="text-base md:text-lg font-semibold text-ink tracking-tight truncate">
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
          disabled={filtersDisabled}
          title={filtersDisabled ? FILTERS_NA_MSG : undefined}
          className={clsx(
            'md:hidden flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-md border transition-colors',
            filtersDisabled && 'opacity-40 cursor-not-allowed',
            mobileSearchOpen || searchQuery
              ? 'border-ink text-ink bg-canvas'
              : 'border-hairline-strong text-muted hover:border-ink/30 dark:border-white/8'
          )}
        >
          {mobileSearchOpen ? <X size={15} /> : <Search size={15} />}
        </button>

        {/* Date preset dropdown — mobile */}
        <div className="relative md:hidden flex-shrink-0" ref={presetDropdownRef}>
          <button
            onClick={() => setPresetDropdownOpen(v => !v)}
            disabled={filtersDisabled}
            title={filtersDisabled ? FILTERS_NA_MSG : undefined}
            className={clsx(
              'flex items-center gap-1 h-9 px-2.5 text-xs font-medium border rounded-md transition-colors',
              filtersDisabled && 'opacity-40 cursor-not-allowed',
              presetDropdownOpen
                ? 'border-ink text-ink bg-canvas'
                : 'border-hairline-strong text-body bg-canvas hover:border-ink/30 dark:border-white/8'
            )}
          >
            <span>{activePresets.find(p => p.value === activePreset)?.label ?? 'Custom'}</span>
            <ChevronDown size={11} className={clsx('transition-transform', presetDropdownOpen && 'rotate-180')} />
          </button>
          {presetDropdownOpen && (
            <div className="absolute right-0 top-10 z-50 bg-canvas border border-hairline-strong rounded-md shadow-md overflow-hidden">
              {activePresets.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setDatePreset(p.value); setPresetDropdownOpen(false) }}
                  className={clsx(
                    'w-full text-left px-4 py-2.5 text-xs font-medium transition-colors',
                    activePreset === p.value
                      ? 'bg-ink text-on-dark dark:bg-on-dark dark:text-[#171717]'
                      : 'text-body hover:bg-surface-strong'
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
            disabled={filtersDisabled}
            title={filtersDisabled ? FILTERS_NA_MSG : undefined}
            className={clsx(
              'flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-md border transition-colors',
              filtersDisabled && 'opacity-40 cursor-not-allowed',
              pickerOpen
                ? 'border-ink text-ink bg-canvas'
                : 'border-hairline-strong text-muted hover:border-ink/30 dark:border-white/8'
            )}
          >
            <Calendar size={15} />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-10 z-50">
              <DateRangePicker
                startDate={dateRange.start}
                endDate={dateRange.end}
                mentions={pickerItems}
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
        <div
          className={clsx('relative w-64 hidden md:block', filtersDisabled && 'opacity-40 cursor-not-allowed')}
          title={filtersDisabled ? FILTERS_NA_MSG : undefined}
        >
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={desktopSearchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            disabled={filtersDisabled}
            className={clsx(
              'w-full h-9 pl-8 pr-14 text-sm bg-canvas border border-hairline-strong rounded-md focus:outline-none focus:border-ink dark:focus:border-white/30 transition-colors text-ink placeholder-muted',
              filtersDisabled && 'pointer-events-none'
            )}
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
              <X size={12} />
            </button>
          ) : (
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1 py-0 rounded border border-hairline-strong bg-surface-strong text-xs text-muted pointer-events-none">
              <span className="text-sm">⌘</span><span className="text-[0.65rem]">K</span>
            </kbd>
          )}
        </div>

        {/* Date presets — desktop */}
        <div
          className={clsx(
            'hidden md:flex items-center gap-1 h-9 bg-canvas border border-hairline-strong rounded-md p-1',
            filtersDisabled && 'opacity-40 cursor-not-allowed'
          )}
          title={filtersDisabled ? FILTERS_NA_MSG : undefined}
        >
          {activePresets.map(p => (
            <button
              key={p.value}
              onClick={() => setDatePreset(p.value)}
              disabled={filtersDisabled}
              className={clsx(
                'px-3 py-1 text-xs font-medium rounded transition-all',
                filtersDisabled && 'pointer-events-none',
                activePreset === p.value
                  ? 'bg-ink text-on-dark dark:bg-on-dark dark:text-[#171717]'
                  : 'text-body hover:text-ink'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date range picker — desktop */}
        <div
          className={clsx('relative flex-shrink-0 hidden md:block', filtersDisabled && 'opacity-40 cursor-not-allowed')}
          title={filtersDisabled ? FILTERS_NA_MSG : undefined}
          ref={pickerRef}
        >
          <button
            onClick={() => setPickerOpen(v => !v)}
            disabled={filtersDisabled}
            className={clsx(
              'flex items-center justify-between gap-1.5 h-9 text-xs border rounded-md px-3 w-56 transition-colors',
              filtersDisabled && 'pointer-events-none',
              pickerOpen
                ? 'border-ink text-ink bg-canvas'
                : 'border-hairline-strong text-body bg-canvas hover:border-ink/30'
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
              mentions={pickerItems}
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

        {/* Theme toggle — both */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-hairline-strong text-body hover:border-ink/30 dark:hover:border-white/20 hover:bg-surface-strong dark:hover:bg-surface-dark-elevated transition-colors"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notifications — both */}
        <div className="relative flex-shrink-0" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(v => !v)}
            className="relative h-9 w-9 flex items-center justify-center rounded-md border border-hairline-strong hover:border-ink/30 dark:hover:border-white/20 hover:bg-surface-strong dark:hover:bg-surface-dark-elevated transition-colors"
          >
            <Bell size={17} className="text-body" />
            {riskCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[0.5625rem] font-bold flex items-center justify-center">
                {riskCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className={clsx(
              'flex flex-col bg-canvas z-[60] overflow-hidden',
              // mobile: floating overlay with margins on all sides above bottom nav
              'fixed inset-x-3 top-[calc(3.5rem+0.75rem)] bottom-20 rounded-2xl border border-hairline-strong shadow-2xl',
              // desktop: dropdown that hugs content up to max viewport height with bottom margin
              'md:static md:absolute md:right-0 md:top-full md:mt-2 md:w-96 md:bottom-auto md:inset-x-auto md:rounded-xl md:border md:shadow-xl md:max-h-[calc(100vh-6rem)]'
            )}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-hairline flex-shrink-0">
                <span className="text-sm font-semibold text-ink">High Risk Alerts</span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={() => markAllRead(highRiskMentions.map(m => m.id))} className="flex items-center gap-1 text-xs text-[#2940BE] dark:text-[#6B80FF] hover:opacity-70 transition-opacity">
                      <CheckCheck size={13} />
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setNotifOpen(false)} className="text-muted hover:text-ink transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="px-4 pt-4 pb-4 flex-shrink-0">
                <div className="flex items-center gap-1 bg-surface-strong rounded-lg p-0.5 w-fit">
                  {[{ id: 'all', label: 'All' }, { id: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` }].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setNotifTab(t.id)}
                      className={clsx(
                        'px-3 h-8 text-xs font-medium rounded-md transition-all',
                        notifTab === t.id ? 'bg-surface-card text-ink shadow-sm' : 'text-body hover:text-ink'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-1.5 scrollbar-hide">
                {(() => {
                  const displayed = notifTab === 'unread' ? highRiskMentions.filter(m => !readIds.has(m.id)) : highRiskMentions
                  if (displayed.length === 0) return (
                    <div className="py-8 text-center text-sm text-muted">
                      {notifTab === 'unread' ? 'All caught up!' : 'No high risk mentions'}
                    </div>
                  )
                  return displayed.map(m => {
                    const isRead = readIds.has(m.id)
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          markRead(m.id)
                          setNotifOpen(false)
                          setRiskOnly(true)
                          navigate('/mentions', { state: { mentionId: m.id, sentimentFilter: 'negative' } })
                        }}
                        className={clsx(
                          'w-full text-left rounded-lg p-3 border transition-colors hover:bg-gray-50 dark:hover:bg-white/12',
                          isRead
                            ? 'bg-surface-card border-hairline opacity-60'
                            : 'bg-surface-card border-hairline-strong dark:border-white/12'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-sm font-semibold text-ink line-clamp-2 flex-1">{m.text}</span>
                          {isRead
                            ? <CheckCircle size={13} className="text-muted flex-shrink-0 mt-0.5" />
                            : <Circle size={8} className="text-red-600 flex-shrink-0 mt-1 fill-red-600" />
                          }
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>{formatDateTime(m.publishedAt)}</span>
                          <span>{m.author?.name || m.author?.handle}</span>
                        </div>
                      </button>
                    )
                  })
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile search — inline row below topbar */}
      {mobileSearchOpen && (
        <div className="md:hidden flex items-center gap-2 px-4 h-11 border-b border-hairline bg-canvas">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            ref={mobileSearchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 h-full text-sm bg-transparent focus:outline-none text-ink placeholder-muted"
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
