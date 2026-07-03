import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Info } from 'lucide-react'
import { format } from 'date-fns'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import { useDashboard } from '../../context/DashboardContext'
import { useAuth } from '../../context/AuthContext'
import isPWA from '../../utils/isPWA'

const DISCLAIMER_KEY = 'data_disclaimer_dismissed'

const pageTitles = {
  '/': { full: 'Overview', short: 'Overview' },
  '/mentions': { full: 'Mentions Explorer', short: 'Mentions' },
  '/analytics': { full: 'Sentiment Analytics', short: 'Analytics' },
  '/keywords': { full: 'Keyword Manager', short: 'Keywords' },
  '/more': { full: 'More', short: 'More' },
  '/admin': { full: 'Admin', short: 'Admin' },
}

export default function Layout({ children }) {
  const location = useLocation()
  const pageTitle = pageTitles[location.pathname] || { full: 'Dashboard', short: 'Dashboard' }
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(
    () => localStorage.getItem(DISCLAIMER_KEY) === 'true'
  )

  const { allMentions } = useDashboard()
  const { allowedGroupIds, department } = useAuth()
  // Admin (user management) and Keyword Manager (where you create the first group)
  // must render even when the current tenant has no groups yet.
  const noGroups = allowedGroupIds.length === 0
    && location.pathname !== '/admin'
    && location.pathname !== '/keywords'

  const earliestDate = useMemo(() => {
    if (!allMentions.length) return null
    const min = allMentions.reduce((earliest, m) => {
      const d = new Date(m.publishedAt)
      return d < earliest ? d : earliest
    }, new Date(allMentions[0].publishedAt))
    return format(min, 'd MMM yyyy')
  }, [allMentions])

  const dismissDisclaimer = () => {
    localStorage.setItem(DISCLAIMER_KEY, 'true')
    setDisclaimerDismissed(true)
  }

  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [location.pathname])

  const openSidebar = useCallback(() => setSidebarOpen(true), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  return (
    <div className="flex h-screen overflow-hidden bg-canvas-soft dark:bg-surface-dark">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar title={pageTitle.full} shortTitle={pageTitle.short} onMenuClick={openSidebar} />

        {/* Data availability disclaimer — one-time */}
        {!disclaimerDismissed && (
          <div className="flex items-start gap-2.5 px-4 py-3 bg-[#EEF1FB] dark:bg-[#2940BE]/20 border-b border-[#2940BE]/20 text-[#2940BE] dark:text-[#6B80FF]">
            <Info size={15} className="flex-shrink-0 mt-0.5" />
            <p className="flex-1 text-xs leading-relaxed">
              <span className="font-semibold">Data Availability Notice — </span>
              Historical coverage may be incomplete. Not all mentions from monitored sources were necessarily captured.
            </p>
            <button onClick={dismissDisclaimer} className="flex-shrink-0 p-0.5 hover:opacity-70 transition-opacity">
              <X size={14} />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col bg-canvas">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-4 md:px-4 md:pt-4 md:pb-4 flex flex-col w-full max-w-[2000px] mx-auto"
          >
            {noGroups ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <div className="max-w-sm text-center">
                  <Info size={28} className="mx-auto mb-3 text-muted" />
                  <p className="text-sm font-semibold text-ink dark:text-on-dark mb-1">
                    No keyword groups assigned yet
                  </p>
                  <p className="text-sm text-muted dark:text-on-dark-soft">
                    Your department{department ? ` (${department})` : ''} doesn't have any keyword groups
                    assigned. Contact your administrator to get set up.
                  </p>
                </div>
              </div>
            ) : (
              children
            )}
            <div
              className="flex-shrink-0 lg:hidden"
              style={{ height: isPWA ? 'calc(160px + env(safe-area-inset-bottom, 0px))' : 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
            />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
