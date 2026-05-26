import React, { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  isWithinInterval, addMonths, subMonths, format, getDay, isBefore, isAfter, startOfDay
} from 'date-fns'
import clsx from 'clsx'

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const PRIMARY = '#171717'

function CalendarMonth({ month, startDate, endDate, hoverDate, onDayClick, onDayHover, onDayLeave, selectingEnd, mentionDates, large }) {
  const today = startOfDay(new Date())
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startPad = getDay(startOfMonth(month))
  const rangeEnd = hoverDate && selectingEnd ? hoverDate : endDate

  const cellSize = large ? 'h-10 w-10 text-sm' : 'h-7 w-7 text-[0.6875rem]'

  return (
    <div className={large ? 'w-full' : 'w-56'}>
      <p className="text-xs font-semibold text-ink text-center mb-3">
        {format(month, 'MMMM yyyy')}
      </p>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-[0.625rem] text-muted text-center font-medium py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 content-start" style={large ? { height: 240 } : undefined}>
        {Array(startPad).fill(null).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const isStart = startDate && isSameDay(day, startDate)
          const isEnd = endDate && isSameDay(day, endDate)
          const isHoverEnd = hoverDate && selectingEnd && isSameDay(day, hoverDate)
          const inRange = startDate && rangeEnd && !isSameDay(startDate, rangeEnd) &&
            isWithinInterval(day, {
              start: isBefore(startDate, rangeEnd) ? startDate : rangeEnd,
              end: isBefore(startDate, rangeEnd) ? rangeEnd : startDate,
            })

          const RANGE_BG = '#dde3f8'
          const hasRange = startDate && rangeEnd && !isSameDay(startDate, rangeEnd)
          const isFuture = isAfter(day, today)

          return (
            <div key={day.toISOString()} className="relative flex items-center justify-center" style={{ height: large ? 40 : 28 }}>
              {hasRange && isStart && (
                <div className="absolute inset-y-0 right-0 w-1/2" style={{ backgroundColor: RANGE_BG }} />
              )}
              {hasRange && (isEnd || isHoverEnd) && (
                <div className="absolute inset-y-0 left-0 w-1/2" style={{ backgroundColor: RANGE_BG }} />
              )}
              {inRange && !isStart && !(isEnd || isHoverEnd) && (
                <div className="absolute inset-0" style={{ backgroundColor: RANGE_BG }} />
              )}
              <button
                onClick={() => !isFuture && onDayClick(day)}
                onMouseEnter={() => !isFuture && onDayHover(day)}
                onMouseLeave={onDayLeave}
                disabled={isFuture}
                className={clsx(
                  'relative z-10 font-medium transition-colors rounded-full flex items-center justify-center',
                  cellSize,
                  isFuture
                    ? 'text-muted-soft cursor-not-allowed'
                    : (isStart || isEnd || isHoverEnd)
                      ? 'text-white'
                      : inRange
                        ? 'text-ink'
                        : 'text-body hover:bg-surface-strong'
                )}
                style={!isFuture && (isStart || isEnd || isHoverEnd) ? { backgroundColor: PRIMARY } : {}}
              >
                {format(day, 'd')}
                {mentionDates?.has(format(day, 'yyyy-MM-dd')) && !isFuture && (
                  <span
                    className="absolute w-1 h-1 rounded-full"
                    style={{
                      bottom: large ? 4 : 2,
                      backgroundColor: (isStart || isEnd || isHoverEnd) ? 'rgba(255,255,255,0.8)' : PRIMARY,
                    }}
                  />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

export default function DateRangePicker({ startDate, endDate, onApply, onCancel, mentions = [] }) {
  const isMobile = useIsMobile()

  const mentionDates = useMemo(() => {
    const s = new Set()
    mentions.forEach(m => { if (m.publishedAt) s.add(format(new Date(m.publishedAt), 'yyyy-MM-dd')) })
    return s
  }, [mentions])

  const [leftMonth, setLeftMonth] = useState(startOfMonth(startDate || new Date()))
  const [rightMonth, setRightMonth] = useState(startOfMonth(endDate || addMonths(new Date(), 1)))
  const [mode, setMode] = useState('range')
  const [pickedStart, setPickedStart] = useState(startDate || null)
  const [pickedEnd, setPickedEnd] = useState(endDate || null)
  const [hoverDate, setHoverDate] = useState(null)
  const [selectingEnd, setSelectingEnd] = useState(false)
  // mobile range: 'start' | 'end'
  const [mobileStep, setMobileStep] = useState('start')

  const switchMode = (m) => {
    setMode(m)
    setPickedStart(null)
    setPickedEnd(null)
    setSelectingEnd(false)
    setHoverDate(null)
    setMobileStep('start')
  }

  // Desktop handlers (two-calendar)
  const handleLeftDay = (day) => {
    if (mode === 'single') { setPickedStart(day); setPickedEnd(day); setSelectingEnd(false) }
    else { setPickedStart(day); setPickedEnd(null); setSelectingEnd(true) }
  }
  const handleRightDay = (day) => {
    if (mode === 'single') { setPickedStart(day); setPickedEnd(day); setSelectingEnd(false); return }
    if (!selectingEnd || !pickedStart) return
    let start = pickedStart, end = day
    if (isBefore(end, start)) { [start, end] = [end, start] }
    setPickedStart(start); setPickedEnd(end); setSelectingEnd(false); setHoverDate(null)
  }

  // Mobile handler (single calendar, two steps)
  const handleMobileDay = (day) => {
    if (mode === 'single') { setPickedStart(day); setPickedEnd(day); return }
    if (mobileStep === 'start') {
      setPickedStart(day); setPickedEnd(null); setMobileStep('end')
    } else {
      let start = pickedStart, end = day
      if (isBefore(end, start)) { [start, end] = [end, start] }
      setPickedStart(start); setPickedEnd(end)
    }
  }

  const canApply = isMobile
    ? pickedStart && (mode === 'single' || (pickedEnd && mobileStep === 'end'))
    : pickedStart && pickedEnd && !selectingEnd

  // Mobile bottom sheet
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_200ms_ease-out]" onClick={onCancel} />

        {/* Bottom sheet */}
        <div className="fixed left-0 right-0 bottom-0 z-50 bg-canvas rounded-t-2xl shadow-xl animate-[slideUp_280ms_cubic-bezier(0.32,0.72,0,1)] flex flex-col max-h-[80vh]">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-hairline-strong" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
            <h3 className="text-sm font-semibold text-ink">Select Date Range</h3>
            <button onClick={onCancel} className="p-1.5 rounded-md hover:bg-surface-strong text-muted">
              <X size={16} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-5">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-surface-strong rounded-lg p-0.5 w-fit mb-3">
              {[{ label: 'Date Range', value: 'range' }, { label: 'Single Day', value: 'single' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => switchMode(opt.value)}
                  className={clsx(
                    'px-3 h-8 text-xs font-medium rounded-md transition-all',
                    mode === opt.value ? 'bg-white text-ink shadow-sm' : 'text-body hover:text-ink'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Step indicator for range mode */}
            {mode === 'range' && (
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { setMobileStep('start'); setPickedEnd(null) }}
                  className={clsx(
                    'flex-1 py-2 rounded-lg text-xs font-medium border transition-colors',
                    mobileStep === 'start'
                      ? 'border-ink bg-ink text-white'
                      : pickedStart
                        ? 'border-hairline-strong bg-surface-strong text-ink'
                        : 'border-hairline text-muted'
                  )}
                >
                  {pickedStart ? format(pickedStart, 'MMM d, yyyy') : 'Start date'}
                </button>
                <button
                  onClick={() => pickedStart && setMobileStep('end')}
                  className={clsx(
                    'flex-1 py-2 rounded-lg text-xs font-medium border transition-colors',
                    mobileStep === 'end'
                      ? 'border-ink bg-ink text-white'
                      : pickedEnd
                        ? 'border-hairline-strong bg-surface-strong text-ink'
                        : 'border-hairline text-muted'
                  )}
                >
                  {pickedEnd ? format(pickedEnd, 'MMM d, yyyy') : 'End date'}
                </button>
              </div>
            )}

            {/* Calendar */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setLeftMonth(m => subMonths(m, 1))} className="p-2 rounded-lg hover:bg-surface-strong text-body">
                  <ChevronLeft size={18} />
                </button>
                <span />
                <button onClick={() => setLeftMonth(m => addMonths(m, 1))} className="p-2 rounded-lg hover:bg-surface-strong text-body">
                  <ChevronRight size={18} />
                </button>
              </div>
              <CalendarMonth
                month={leftMonth}
                startDate={pickedStart}
                endDate={pickedEnd}
                hoverDate={null}
                onDayClick={handleMobileDay}
                onDayHover={() => {}}
                onDayLeave={() => {}}
                selectingEnd={mobileStep === 'end'}
                mentionDates={mentionDates}
                large
              />
            </div>
          </div>

          {/* Footer — always visible */}
          <div className="flex gap-3 px-5 pt-3 pb-[52px] flex-shrink-0 border-t border-hairline">
            <button
              onClick={onCancel}
              className="flex-1 h-11 text-sm text-body border border-hairline-strong rounded-xl hover:bg-surface-strong transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => canApply && onApply(pickedStart, pickedEnd)}
              disabled={!canApply}
              className={clsx(
                'flex-1 h-11 text-sm font-medium rounded-xl transition-colors',
                canApply ? 'text-white' : 'bg-surface-strong text-muted cursor-not-allowed'
              )}
              style={canApply ? { backgroundColor: PRIMARY } : {}}
            >
              Apply
            </button>
          </div>
        </div>
      </>
    )
  }

  // Desktop — original two-calendar layout
  return (
    <div className="absolute right-0 top-11 z-50 bg-canvas border border-hairline-strong rounded-lg shadow-card p-5 w-auto">
      <div className={clsx('flex items-center gap-1 bg-surface-strong rounded-lg p-0.5 mb-4', mode === 'single' ? 'w-full' : 'w-fit')}>
        {[{ label: 'Date Range', value: 'range' }, { label: 'Single Day', value: 'single' }].map(opt => (
          <button
            key={opt.value}
            onClick={() => switchMode(opt.value)}
            className={clsx(
              `${mode === 'single' ? 'flex-1' : ''} px-3 h-7 text-xs font-medium rounded-md transition-all`,
              mode === opt.value ? 'bg-white text-ink shadow-sm' : 'text-body hover:text-ink'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className={clsx('flex', mode === 'range' ? 'gap-6' : '')}>
        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setLeftMonth(m => subMonths(m, 1))} className="p-1 rounded hover:bg-surface-strong text-body">
              <ChevronLeft size={14} />
            </button>
            <span />
            <button onClick={() => setLeftMonth(m => addMonths(m, 1))} className="p-1 rounded hover:bg-surface-strong text-body">
              <ChevronRight size={14} />
            </button>
          </div>
          <CalendarMonth
            month={leftMonth}
            startDate={pickedStart}
            endDate={pickedEnd}
            hoverDate={null}
            onDayClick={handleLeftDay}
            onDayHover={() => {}}
            onDayLeave={() => {}}
            selectingEnd={false}
            mentionDates={mentionDates}
          />
        </div>

        {mode === 'range' && <div className="w-px bg-surface-strong self-stretch" />}

        {mode === 'range' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setRightMonth(m => subMonths(m, 1))} className="p-1 rounded hover:bg-surface-strong text-body">
                <ChevronLeft size={14} />
              </button>
              <span />
              <button onClick={() => setRightMonth(m => addMonths(m, 1))} className="p-1 rounded hover:bg-surface-strong text-body">
                <ChevronRight size={14} />
              </button>
            </div>
            <CalendarMonth
              month={rightMonth}
              startDate={pickedStart}
              endDate={pickedEnd}
              hoverDate={hoverDate}
              onDayClick={handleRightDay}
              onDayHover={(day) => selectingEnd && setHoverDate(day)}
              onDayLeave={() => setHoverDate(null)}
              selectingEnd={selectingEnd}
              mentionDates={mentionDates}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-hairline">
        <p className="text-xs text-muted">
          {pickedStart && pickedEnd
            ? mode === 'single'
              ? format(pickedStart, 'MMM d, yyyy')
              : `${format(pickedStart, 'MMM d, yyyy')} – ${format(pickedEnd, 'MMM d, yyyy')}`
            : pickedStart
              ? 'Now pick an end date on the right →'
              : mode === 'single' ? 'Pick a day' : 'Pick a start date on the left'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 h-8 text-xs text-body border border-hairline-strong rounded-md hover:bg-surface-strong transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => canApply && onApply(pickedStart, pickedEnd)}
            disabled={!canApply}
            className={clsx(
              'px-4 h-8 text-xs font-medium rounded-lg transition-colors',
              canApply ? 'text-white' : 'bg-surface-strong text-muted cursor-not-allowed'
            )}
            style={canApply ? { backgroundColor: PRIMARY } : {}}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
