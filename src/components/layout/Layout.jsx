import React from 'react'
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

  return (
    <div className="flex h-screen overflow-hidden bg-canvas-soft dark:bg-surface-dark">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-y-auto p-4 flex flex-col bg-canvas">
          <div className="w-full max-w-[2000px] mx-auto flex flex-col flex-1">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
