import React from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const pageTitles = {
  '/': 'Overview Dashboard',
  '/mentions': 'Mentions Explorer',
  '/analytics': 'Sentiment Analytics',
  '/keywords': 'Keyword Manager',
}

export default function Layout({ children }) {
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'Dashboard'

  return (
    <div className="flex h-screen overflow-hidden bg-[#f2f2f2]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-y-auto p-4 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}
