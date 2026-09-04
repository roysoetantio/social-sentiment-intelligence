import React from 'react'
import { TrendingUp, AlertTriangle, Hash, Sun, Moon, LogOut, Tags, ChevronRight, BellOff, Users, Instagram, Facebook, Newspaper } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard } from '../context/DashboardContext'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Switch } from '@/components/ui/switch'


function StatRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 py-4 px-4 border-b border-hairline last:border-0">
      <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <span className="flex-1 text-sm text-body">{label}</span>
      <span className="text-sm font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}

export default function More() {
  const navigate = useNavigate()
  const { globalFilteredMentions: filteredMentions } = useDashboard()
  const { fullName, user, department, role, signOut, isSuperAdmin, currentDepartment } = useAuth()
  // Social accounts are Corporate Comms' remit — mirrors the sidebar gate.
  const showSocialFeed = currentDepartment === 'CCD'
  const { isDark, toggleTheme } = useTheme()
  const riskCount = filteredMentions.filter(m => m.riskFlag).length
  const positiveCount = filteredMentions.filter(m => m.sentiment.label === 'positive').length
  const total = filteredMentions.length
  const positivePct = total > 0 ? Math.round(positiveCount / total * 100) : 0
  const initials = (fullName || user?.email || '?').split(/[\s@.]+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="space-y-5 py-1">
      {/* Profile */}
      <div className="rounded-xl border border-hairline bg-surface-card px-4 py-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-surface-strong flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-ink">{initials}</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate">{fullName}</div>
          <div className="text-xs text-muted truncate">
            {user?.email}{department ? ` · ${department}${role ? ` (${role})` : ''}` : ''}
          </div>
        </div>
      </div>

      {/* Menu — viewers don't manage keywords */}
      <div className="rounded-xl border border-hairline bg-surface-card overflow-hidden">
          <button
            onClick={() => navigate('/sources')}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-surface-strong transition-colors"
          >
            <Newspaper size={17} className="text-body flex-shrink-0" />
            <span className="flex-1 text-sm text-left text-ink">Sources &amp; Coverage</span>
            <ChevronRight size={15} className="text-muted" />
          </button>
          {role !== 'viewer' && (
            <button
              onClick={() => navigate('/keywords')}
              className="w-full flex items-center gap-3 px-4 py-4 border-t border-hairline hover:bg-surface-strong transition-colors"
            >
              <Tags size={17} className="text-body flex-shrink-0" />
              <span className="flex-1 text-sm text-left text-ink">Keyword Manager</span>
              <ChevronRight size={15} className="text-muted" />
            </button>
          )}
          {/* Mobile has no collapsible tree — the Social Feed platforms are
              listed flat, mirroring the sidebar's expanded state. */}
          {showSocialFeed && (
            <>
              <button
                onClick={() => navigate('/social/instagram')}
                className="w-full flex items-center gap-3 px-4 py-4 border-t border-hairline hover:bg-surface-strong transition-colors first:border-t-0"
              >
                <Instagram size={17} className="text-body flex-shrink-0" />
                <span className="flex-1 text-sm text-left text-ink">Social Feed · Instagram</span>
                <ChevronRight size={15} className="text-muted" />
              </button>
              <button
                onClick={() => navigate('/social/facebook')}
                className="w-full flex items-center gap-3 px-4 py-4 border-t border-hairline hover:bg-surface-strong transition-colors first:border-t-0"
              >
                <Facebook size={17} className="text-body flex-shrink-0" />
                <span className="flex-1 text-sm text-left text-ink">Social Feed · Facebook</span>
                <ChevronRight size={15} className="text-muted" />
              </button>
            </>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center gap-3 px-4 py-4 border-t border-hairline hover:bg-surface-strong transition-colors first:border-t-0"
            >
              <Users size={17} className="text-body flex-shrink-0" />
              <span className="flex-1 text-sm text-left text-ink">User Management</span>
              <ChevronRight size={15} className="text-muted" />
            </button>
          )}
      </div>

{/* Settings */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Settings</p>
        <div className="rounded-xl border border-hairline bg-surface-card overflow-hidden">
          <div className="w-full flex items-center gap-3 px-4 py-4 border-b border-hairline">
            {isDark ? <Moon size={17} className="text-body flex-shrink-0" /> : <Sun size={17} className="text-body flex-shrink-0" />}
            <span className="flex-1 text-sm text-left text-ink">Dark Mode</span>
            <Switch checked={isDark} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
          </div>

          <button
            onClick={() => { localStorage.removeItem('notif_read_ids'); window.location.reload() }}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-hairline hover:bg-surface-strong transition-colors"
          >
            <BellOff size={17} className="text-body flex-shrink-0" />
            <span className="flex-1 text-sm text-left text-ink">Reset Notifications</span>
          </button>

          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-surface-strong transition-colors"
          >
            <LogOut size={17} className="text-error flex-shrink-0" />
            <span className="text-sm text-error">Log Out</span>
          </button>
        </div>
      </div>

      {/* Logo */}
      <div className="flex justify-center pt-4 pb-2">
        <img src="/assets/uemedgenta-logo.png" alt="UEM Edgenta" className="h-8 w-auto dark:hidden" />
        <img src="/assets/uemedgenta-logo-white.png" alt="UEM Edgenta" className="h-8 w-auto hidden dark:block" />
      </div>
    </div>
  )
}
