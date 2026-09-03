import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { startOfDay, subDays } from 'date-fns'

/**
 * Search + date state for the Social Feed pages.
 *
 * The TopBar is shared by every page, so rather than give Social Feed its own
 * in-page range tabs (a second, differently-styled control doing the same job)
 * the TopBar swaps which store it drives when the route is under /social.
 * Shape deliberately mirrors the slice of DashboardContext the TopBar reads.
 */
const SocialFilterContext = createContext(null)

const defaultRange = () => ({ start: subDays(new Date(), 90), end: new Date() })

export function SocialFilterProvider({ children }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState(defaultRange)
  const [activePreset, setActivePreset] = useState('3m')
  // The page registers what it loaded so the date picker can dot the days that
  // actually have posts — the same thing allMentions does for the mentions side.
  const [posts, setPosts] = useState([])

  // 'all' is social-only: the ingest keeps every post we've ever published, so
  // the ceiling is the oldest row rather than a fixed number of days. Derived
  // from what's loaded so the date token still reads as a real span.
  const setDatePreset = useCallback((preset) => {
    const end = new Date()
    switch (preset) {
      case 'today': setDateRange({ start: startOfDay(end), end }); break
      case '7d': setDateRange({ start: subDays(end, 7), end }); break
      case '1m': setDateRange({ start: subDays(end, 30), end }); break
      case '3m': setDateRange({ start: subDays(end, 90), end }); break
      case '1y': setDateRange({ start: subDays(end, 365), end }); break
      case 'all': {
        const oldest = posts.reduce(
          (min, p) => {
            const t = new Date(p.publishedAt).getTime()
            return Number.isFinite(t) && t < min ? t : min
          },
          Infinity
        )
        setDateRange({ start: Number.isFinite(oldest) ? new Date(oldest) : subDays(end, 3650), end })
        break
      }
      default: break
    }
    setActivePreset(preset)
  }, [posts])

  const value = useMemo(() => ({
    searchQuery, setSearchQuery,
    dateRange, setDateRange,
    activePreset, setActivePreset,
    setDatePreset,
    posts, setPosts,
  }), [searchQuery, dateRange, activePreset, setDatePreset, posts])

  return <SocialFilterContext.Provider value={value}>{children}</SocialFilterContext.Provider>
}

export const useSocialFilter = () => {
  const ctx = useContext(SocialFilterContext)
  if (!ctx) throw new Error('useSocialFilter must be used within SocialFilterProvider')
  return ctx
}
