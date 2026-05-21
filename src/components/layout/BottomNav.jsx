import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Tags,
  MoreHorizontal,
  X,
  TrendingUp,
  AlertTriangle,
  Hash,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import { ANALYST_NAME } from '../../constants/sentiment'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/mentions', label: 'Mentions', icon: MessageSquare },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/keywords', label: 'Keywords', icon: Tags },
]

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggle = () => {
    setDark(prev => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('expo-dark-mode', '1')
      } else {
        document.documentElement.classList.remove('dark')
        localStorage.removeItem('expo-dark-mode')
      }
      return next
    })
  }

  return [dark, toggle]
}

function StatRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 py-4 px-1 border-b border-hairline dark:border-white/8 last:border-0">
      <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
        <Icon size={15} style={{ color }} />
      </div>
      <span className="flex-1 text-sm text-body dark:text-on-dark-soft">{label}</span>
      <span className="text-sm font-semibold text-ink dark:text-on-dark" style={{ color }}>{value}</span>
    </div>
  )
}

export default function BottomNav() {
  const { filteredMentions } = useDashboard()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dark, toggleDark] = useDarkMode()

  const riskCount = filteredMentions.filter(m => m.riskFlag).length
  const positiveCount = filteredMentions.filter(m => m.sentiment.label === 'positive').length
  const total = filteredMentions.length
  const positivePct = total > 0 ? Math.round(positiveCount / total * 100) : 0

  const initials = ANALYST_NAME.split(' ').map(w => w[0]).slice(0, 2).join('')

  // Close sheet on back gesture / escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSheetOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-canvas dark:bg-surface-dark border-t border-hairline dark:border-white/8 flex items-stretch h-16 safe-bottom">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              clsx(
                'flex-1 flex flex-col items-center justify-center gap-1 text-[0.625rem] font-medium transition-colors',
                isActive
                  ? 'text-[#2940BE] dark:text-[#6B80FF]'
                  : 'text-muted dark:text-on-dark-soft'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* More button */}
        <button
          onClick={() => setSheetOpen(true)}
          className={clsx(
            'flex-1 flex flex-col items-center justify-center gap-1 text-[0.625rem] font-medium transition-colors',
            sheetOpen ? 'text-[#2940BE] dark:text-[#6B80FF]' : 'text-muted dark:text-on-dark-soft'
          )}
        >
          <MoreHorizontal size={20} strokeWidth={sheetOpen ? 2.2 : 1.8} />
          <span>More</span>
        </button>
      </nav>

      {/* Sheet backdrop */}
      {sheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Slide-up sheet */}
      <div
        className={clsx(
          'lg:hidden fixed inset-x-0 bottom-0 z-50 bg-canvas dark:bg-surface-dark rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out',
          sheetOpen ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-hairline-strong dark:bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline dark:border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-surface-strong dark:bg-white/8 flex items-center justify-center">
              <span className="text-sm font-semibold text-ink dark:text-on-dark">{initials}</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-ink dark:text-on-dark">{ANALYST_NAME}</div>
              <div className="text-xs text-muted dark:text-on-dark-soft">Analyst</div>
            </div>
          </div>
          <button
            onClick={() => setSheetOpen(false)}
            className="p-2 rounded-md hover:bg-surface-strong dark:hover:bg-white/8 text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto max-h-[60vh]">
          {/* Quick Insights */}
          <p className="text-xs font-semibold text-muted dark:text-on-dark-soft uppercase tracking-wider mt-4 mb-1">Quick Insights</p>
          <div className="rounded-xl border border-hairline dark:border-white/8 bg-canvas-soft dark:bg-white/4 px-1">
            <StatRow icon={Hash} label="Total Mentions" value={total.toLocaleString()} color="#2940BE" />
            <StatRow icon={TrendingUp} label="Positive Rate" value={`${positivePct}%`} color="#19C9A5" />
            <StatRow icon={AlertTriangle} label="At Risk" value={riskCount} color={riskCount > 5 ? '#E97132' : '#999999'} />
          </div>

          {/* Settings */}
          <p className="text-xs font-semibold text-muted dark:text-on-dark-soft uppercase tracking-wider mt-5 mb-1">Settings</p>
          <div className="rounded-xl border border-hairline dark:border-white/8 overflow-hidden">
            <button
              onClick={toggleDark}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-strong dark:hover:bg-white/8 transition-colors border-b border-hairline dark:border-white/8"
            >
              {dark ? <Moon size={17} className="text-body dark:text-on-dark-soft" /> : <Sun size={17} className="text-body dark:text-on-dark-soft" />}
              <span className="flex-1 text-sm text-left text-ink dark:text-on-dark">{dark ? 'Dark Mode' : 'Light Mode'}</span>
              <div className={clsx(
                'w-10 h-5 rounded-full transition-colors relative',
                dark ? 'bg-[#2940BE]' : 'bg-hairline-strong dark:bg-white/20'
              )}>
                <div className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                  dark ? 'translate-x-5' : 'translate-x-0.5'
                )} />
              </div>
            </button>

            <button
              onClick={() => {}}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-strong dark:hover:bg-white/8 transition-colors text-error"
            >
              <LogOut size={17} />
              <span className="text-sm text-left">Log Out</span>
            </button>
          </div>
        </div>

        {/* Safe area spacer */}
        <div className="h-4" />
      </div>
    </>
  )
}
