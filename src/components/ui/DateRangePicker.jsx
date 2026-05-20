import React, { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  isWithinInterval, addMonths, subMonths, format, getDay, isBefore, isAfter, startOfDay
} from 'date-fns'
import clsx from 'clsx'

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const PRIMARY = '#2940BE'

function CalendarMonth({ month, startDate, endDate, hoverDate, onDayClick, onDayHover, onDayLeave, selectingEnd, mentionDates }) {
  const today = startOfDay(new Date())
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startPad = getDay(startOfMonth(month))
  const rangeEnd = hoverDate && selectingEnd ? hoverDate : endDate

  return (
    <div className="w-56">
      {/* Month header */}
      <p className="text-xs font-semibold text-gray-700 text-center mb-3">
        {format(month, 'MMMM yyyy')}
      </p>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-[10px] text-gray-400 text-center font-medium py-0.5">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
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
            <div key={day.toISOString()} className="relative h-7 flex items-center justify-center">
              {/* Range bar behind — half for start/end, full for in-between */}
              {hasRange && isStart && (
                <div className="absolute inset-y-0 right-0 w-1/2" style={{ backgroundColor: RANGE_BG }} />
              )}
              {hasRange && (isEnd || isHoverEnd) && (
                <div className="absolute inset-y-0 left-0 w-1/2" style={{ backgroundColor: RANGE_BG }} />
              )}
              {inRange && !isStart && !(isEnd || isHoverEnd) && (
                <div className="absolute inset-0" style={{ backgroundColor: RANGE_BG }} />
              )}
              {/* Day button */}
              <button
                onClick={() => !isFuture && onDayClick(day)}
                onMouseEnter={() => !isFuture && onDayHover(day)}
                onMouseLeave={onDayLeave}
                disabled={isFuture}
                className={clsx(
                  'relative z-10 w-7 h-7 text-[11px] font-medium transition-colors rounded-full flex items-center justify-center',
                  isFuture
                    ? 'text-gray-300 cursor-not-allowed'
                    : (isStart || isEnd || isHoverEnd)
                      ? 'text-white'
                      : inRange
                        ? 'text-gray-700'
                        : 'text-gray-600 hover:bg-gray-100'
                )}
                style={
                  !isFuture && (isStart || isEnd || isHoverEnd)
                    ? { backgroundColor: PRIMARY }
                    : {}
                }
              >
                {format(day, 'd')}
                {mentionDates?.has(format(day, 'yyyy-MM-dd')) && !isFuture && (
                  <span
                    className="absolute w-1 h-1 rounded-full"
                    style={{
                      bottom: 2,
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

export default function DateRangePicker({ startDate, endDate, onApply, onCancel, mentions = [] }) {
  const mentionDates = useMemo(() => {
    const s = new Set()
    mentions.forEach(m => { if (m.publishedAt) s.add(format(new Date(m.publishedAt), 'yyyy-MM-dd')) })
    return s
  }, [mentions])

  const [leftMonth, setLeftMonth] = useState(startOfMonth(startDate || new Date()))
  const [rightMonth, setRightMonth] = useState(startOfMonth(endDate || addMonths(new Date(), 1)))

  const [mode, setMode] = useState('range') // 'range' | 'single'
  const [pickedStart, setPickedStart] = useState(startDate || null)
  const [pickedEnd, setPickedEnd] = useState(endDate || null)
  const [hoverDate, setHoverDate] = useState(null)
  const [selectingEnd, setSelectingEnd] = useState(false)

  const switchMode = (m) => {
    setMode(m)
    setPickedStart(null)
    setPickedEnd(null)
    setSelectingEnd(false)
    setHoverDate(null)
  }

  const handleLeftDay = (day) => {
    if (mode === 'single') {
      setPickedStart(day)
      setPickedEnd(day)
      setSelectingEnd(false)
    } else {
      setPickedStart(day)
      setPickedEnd(null)
      setSelectingEnd(true)
    }
  }

  const handleRightDay = (day) => {
    if (mode === 'single') {
      setPickedStart(day)
      setPickedEnd(day)
      setSelectingEnd(false)
      return
    }
    if (!selectingEnd || !pickedStart) return
    let start = pickedStart
    let end = day
    if (isBefore(end, start)) { [start, end] = [end, start] }
    setPickedStart(start)
    setPickedEnd(end)
    setSelectingEnd(false)
    setHoverDate(null)
  }

  const canApply = pickedStart && pickedEnd && !selectingEnd

  return (
    <div className="absolute right-0 top-11 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-5 w-auto">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit mb-4 mx-auto">
        {[{ label: 'Date Range', value: 'range' }, { label: 'Single Day', value: 'single' }].map(opt => (
          <button
            key={opt.value}
            onClick={() => switchMode(opt.value)}
            className={clsx(
              'px-3 h-7 text-xs font-medium rounded-md transition-all',
              mode === opt.value ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {/* Calendars */}
      <div className={clsx('flex', mode === 'range' ? 'gap-6' : '')}>
        {/* Left */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setLeftMonth(m => subMonths(m, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <ChevronLeft size={14} />
            </button>
            <span />
            <button onClick={() => setLeftMonth(m => addMonths(m, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-500">
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

        {mode === 'range' && <div className="w-px bg-gray-100 self-stretch" />}

        {/* Right */}
        {mode === 'range' && <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setRightMonth(m => subMonths(m, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <ChevronLeft size={14} />
            </button>
            <span />
            <button onClick={() => setRightMonth(m => addMonths(m, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-500">
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
        </div>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400">
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
            className="px-3 h-8 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => canApply && onApply(pickedStart, pickedEnd)}
            disabled={!canApply}
            className={clsx(
              'px-4 h-8 text-xs font-medium rounded-lg transition-colors',
              canApply
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
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
