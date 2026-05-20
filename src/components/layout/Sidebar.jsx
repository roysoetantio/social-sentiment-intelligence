import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Tags,
} from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import { ANALYST_NAME } from '../../constants/sentiment'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/mentions', label: 'Mentions Explorer', icon: MessageSquare },
  { path: '/analytics', label: 'Sentiment Analytics', icon: BarChart3 },
  { path: '/keywords', label: 'Keyword Manager', icon: Tags },
]

const Logo = () => (
  <div className="flex items-center gap-3 px-4 border-b border-hairline dark:border-white/8" style={{ height: '64px' }}>
    <img
      src="/assets/uemedgenta-logo.png"
      alt="UEM Edgenta"
      className="h-7 w-auto object-contain object-left flex-shrink-0"
    />
    <div className="text-[12px] font-semibold text-body dark:text-on-dark-soft leading-tight">Social Sentiment<br />Intelligence</div>
  </div>
)

const StatPill = ({ label, value, color }) => (
  <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-surface-strong dark:bg-white/8">
    <span className="text-xs text-body dark:text-on-dark-soft">{label}</span>
    <span className="text-sm font-semibold dark:text-on-dark" style={{ color }}>{value}</span>
  </div>
)

export default function Sidebar() {
  const { filteredMentions } = useDashboard()

  const riskCount = filteredMentions.filter(m => m.riskFlag).length
  const positiveCount = filteredMentions.filter(m => m.sentiment.label === 'positive').length
  const total = filteredMentions.length
  const positivePct = total > 0 ? Math.round(positiveCount / total * 100) : 0

  return (
    <aside className="w-[220px] h-full bg-canvas-soft dark:bg-surface-dark border-r border-hairline dark:border-white/8 flex flex-col flex-shrink-0 overflow-y-auto">
      <Logo />

      <nav className="flex-1 p-3 space-y-0.5 pt-4">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              isActive ? 'nav-item-active' : 'nav-item'
            }
          >
            <Icon size={16} style={{ color: '#787881' }} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <div className="rounded-lg border border-hairline bg-canvas p-3 space-y-1.5">
          <p className="nav-section-label mb-2 text-ink">Quick Insights</p>
          <StatPill label="Total Mentions" value={total.toLocaleString()} color="#171717" />
          <StatPill label="Positive Rate" value={`${positivePct}%`} color="#19C9A5" />
          <StatPill label="At Risk" value={riskCount} color={riskCount > 5 ? '#E97132' : '#999999'} />
        </div>
      </div>

      <div className="p-4 border-t border-hairline dark:border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-surface-strong dark:bg-white/8 flex items-center justify-center">
            <span className="text-xs font-semibold text-ink dark:text-on-dark">{ANALYST_NAME.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
          </div>
          <div>
            <div className="text-xs font-medium text-ink dark:text-on-dark">{ANALYST_NAME}</div>
            <div className="text-[10px] text-muted dark:text-on-dark-soft">Analyst</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
