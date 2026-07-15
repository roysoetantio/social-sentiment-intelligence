import React from 'react'
import { TrendingUp, AlertTriangle, Hash, Sun, LogOut, Tags, ChevronRight, BellOff, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard } from '../context/DashboardContext'
import { useAuth } from '../context/AuthContext'


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
  const { fullName, user, department, role, signOut, isSuperAdmin } = useAuth()
  const riskCount = filteredMentions.filter(m => m.riskFlag).length
  const positiveCount = filteredMentions.filter(m => m.sentiment.label === 'positive').length
  const total = filteredMentions.length
  const positivePct = total > 0 ? Math.round(positiveCount / total * 100) : 0
  const initials = (fullName || user?.email || '?').split(/[\s@.]+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="space-y-5 py-1">
      {/* Profile */}
      <div className="rounded-xl border border-hairline dark:border-white/8 bg-white dark:bg-white/4 px-4 py-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-surface-strong dark:bg-white/8 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-ink dark:text-on-dark">{initials}</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink dark:text-on-dark truncate">{fullName}</div>
          <div className="text-xs text-muted dark:text-on-dark-soft truncate">
            {user?.email}{department ? ` · ${department}${role ? ` (${role})` : ''}` : ''}
          </div>
        </div>
      </div>

      {/* Menu — viewers don't manage keywords */}
      {(role !== 'viewer' || isSuperAdmin) && (
        <div className="rounded-xl border border-hairline dark:border-white/8 bg-white dark:bg-white/4 overflow-hidden">
          {role !== 'viewer' && (
            <button
              onClick={() => navigate('/keywords')}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
            >
              <Tags size={17} className="text-body dark:text-on-dark-soft flex-shrink-0" />
              <span className="flex-1 text-sm text-left text-ink dark:text-on-dark">Keyword Manager</span>
              <ChevronRight size={15} className="text-muted" />
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center gap-3 px-4 py-4 border-t border-hairline dark:border-white/8 hover:bg-surface-strong dark:hover:bg-white/8 transition-colors first:border-t-0"
            >
              <Users size={17} className="text-body dark:text-on-dark-soft flex-shrink-0" />
              <span className="flex-1 text-sm text-left text-ink dark:text-on-dark">User Management</span>
              <ChevronRight size={15} className="text-muted" />
            </button>
          )}
        </div>
      )}

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
            onClick={() => { localStorage.removeItem('notif_read_ids'); window.location.reload() }}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-hairline dark:border-white/8 hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
          >
            <BellOff size={17} className="text-body dark:text-on-dark-soft flex-shrink-0" />
            <span className="flex-1 text-sm text-left text-ink dark:text-on-dark">Reset Notifications</span>
          </button>

          <button
            onClick={signOut}
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
