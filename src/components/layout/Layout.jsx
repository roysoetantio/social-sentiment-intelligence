import React, { useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const pageTitles = {
  '/': 'Overview',
  '/mentions': 'Mentions Explorer',
  '/analytics': 'Sentiment Analytics',
  '/keywords': 'Keyword Manager',
}

export default function Layout({ children }) {
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'Dashboard'
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const openSidebar = useCallback(() => setSidebarOpen(true), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  return (
    <div className="flex h-screen overflow-hidden bg-canvas-soft dark:bg-surface-dark">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar title={title} onMenuClick={openSidebar} />
        <main className="flex-1 overflow-y-auto p-3 pb-16 md:p-4 flex flex-col bg-canvas">
          <div className="w-full max-w-[2000px] mx-auto flex flex-col flex-1">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
