import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Tags,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/mentions', label: 'Mentions Explorer', icon: MessageSquare },
  { path: '/analytics', label: 'Sentiment Analytics', icon: BarChart3 },
  { path: '/keywords', label: 'Keyword Manager', icon: Tags },
]

const Logo = () => (
  <div className="flex items-center justify-between px-4 border-b border-gray-100" style={{ height: '56px', gap: '16px' }}>
    <img
      src="https://raw.githubusercontent.com/roysoetantio/assets/refs/heads/main/edgenta-slide/asset/uemedgenta.png"
      alt="UEM Edgenta"
      className="h-7 w-auto object-contain object-left"
    />
    <div className="text-[12px] font-semibold text-gray-700 text-left" style={{ lineHeight: '1.2', width: '100%' }}>Social Sentiment<br />Intelligence</div>
  </div>
)

const StatPill = ({ label, value, color }) => (
  <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-gray-50">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-sm font-bold" style={{ color }}>{value}</span>
  </div>
)

export default function Sidebar() {
  const { filteredMentions } = useDashboard()
  const [insightsOpen, setInsightsOpen] = useState(true)
  const location = useLocation()

  const riskCount = filteredMentions.filter(m => m.riskFlag).length
  const positiveCount = filteredMentions.filter(m => m.sentiment.label === 'positive').length
  const total = filteredMentions.length
  const positivePct = total > 0 ? Math.round(positiveCount / total * 100) : 0

  return (
    <aside className="w-60 h-full bg-white border-r border-gray-100 flex flex-col flex-shrink-0 overflow-y-auto">
      <Logo />

      <nav className="flex-1 p-3 space-y-0.5">
        <div className="px-3 pt-2 pb-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Navigation</span>
        </div>
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              isActive ? 'nav-item-active' : 'nav-item pl-3'
            }
          >
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}

      </nav>

      <div className="px-3 pb-2">
        <button
          className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
          onClick={() => setInsightsOpen(!insightsOpen)}
        >
          <span>Quick Insights</span>
          {insightsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {insightsOpen && (
          <div className="px-1 space-y-1.5 mt-1">
            <StatPill label="Total Mentions" value={total.toLocaleString()} color="#2940BE" />
            <StatPill label="Positive Rate" value={`${positivePct}%`} color="#19C9A5" />
            <StatPill label="At Risk" value={riskCount} color={riskCount > 5 ? '#E97132' : '#6b7280'} />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">RS</span>
          </div>
          <div>
            <div className="text-xs font-medium text-darktext">Roy Soetantio</div>
            <div className="text-[10px] text-gray-400">Analyst</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
