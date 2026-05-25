import React from 'react'
import { TrendingUp, AlertTriangle, Hash, Sun, LogOut, Tags, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard } from '../context/DashboardContext'
import { ANALYST_NAME } from '../constants/sentiment'


function StatRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 py-4 px-4 border-b border-hairline dark:border-white/8 last:border-0">
      <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <span className="flex-1 text-sm text-body dark:text-on-dark-soft">{label}</span>
      <span className="text-sm font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}

export default function More() {
  const navigate = useNavigate()
  const { globalFilteredMentions: filteredMentions } = useDashboard()
  const riskCount = filteredMentions.filter(m => m.riskFlag).length
  const positiveCount = filteredMentions.filter(m => m.sentiment.label === 'positive').length
  const total = filteredMentions.length
  const positivePct = total > 0 ? Math.round(positiveCount / total * 100) : 0
  const initials = ANALYST_NAME.split(' ').map(w => w[0]).slice(0, 2).join('')

  return (
    <div className="space-y-5 py-1">
      {/* Profile */}
      <div className="rounded-xl border border-hairline dark:border-white/8 bg-white dark:bg-white/4 px-4 py-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-surface-strong dark:bg-white/8 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-ink dark:text-on-dark">{initials}</span>
        </div>
        <div>
          <div className="text-sm font-semibold text-ink dark:text-on-dark">{ANALYST_NAME}</div>
          <div className="text-xs text-muted dark:text-on-dark-soft">Analyst</div>
        </div>
      </div>

      {/* Menu */}
      <div className="rounded-xl border border-hairline dark:border-white/8 bg-white dark:bg-white/4 overflow-hidden">
        <button
          onClick={() => navigate('/keywords')}
          className="w-full flex items-center gap-3 px-4 py-4 hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
        >
          <Tags size={17} className="text-body dark:text-on-dark-soft flex-shrink-0" />
          <span className="flex-1 text-sm text-left text-ink dark:text-on-dark">Keyword Manager</span>
          <ChevronRight size={15} className="text-muted" />
        </button>
      </div>

      {/* Quick Insights */}
      <div>
        <p className="text-xs font-semibold text-muted dark:text-on-dark-soft uppercase tracking-wider mb-2">Quick Insights</p>
        <div className="rounded-xl border border-hairline dark:border-white/8 bg-white dark:bg-white/4 overflow-hidden">
          <StatRow icon={Hash} label="Total Mentions" value={total.toLocaleString()} color="#2940BE" />
          <StatRow icon={TrendingUp} label="Positive Rate" value={`${positivePct}%`} color="#19C9A5" />
          <StatRow icon={AlertTriangle} label="At Risk" value={riskCount} color={riskCount > 5 ? '#E97132' : '#999999'} />
        </div>
      </div>

      {/* Settings */}
      <div>
        <p className="text-xs font-semibold text-muted dark:text-on-dark-soft uppercase tracking-wider mb-2">Settings</p>
        <div className="rounded-xl border border-hairline dark:border-white/8 bg-white dark:bg-white/4 overflow-hidden">
          <div className="w-full flex items-center gap-3 px-4 py-4 border-b border-hairline dark:border-white/8 opacity-40 cursor-not-allowed">
            <Sun size={17} className="text-body dark:text-on-dark-soft flex-shrink-0" />
            <span className="flex-1 text-sm text-left text-ink dark:text-on-dark">Light Mode</span>
            <div className="w-10 h-5 rounded-full relative flex-shrink-0 bg-hairline-strong dark:bg-white/20">
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow translate-x-0.5" />
            </div>
          </div>

          <button
            onClick={() => {}}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
          >
            <LogOut size={17} className="text-error flex-shrink-0" />
            <span className="text-sm text-error">Log Out</span>
          </button>
        </div>
      </div>

      {/* Logo */}
      <div className="flex justify-center pt-4 pb-2">
        <img src="/assets/uemedgenta-logo.png" alt="UEM Edgenta" className="h-8 w-auto" />
      </div>
    </div>
  )
}
