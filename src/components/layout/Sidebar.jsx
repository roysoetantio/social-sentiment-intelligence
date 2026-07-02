import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Tags,
  X,
  LogOut,
  Users,
  Building2,
  ChevronDown,
} from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/mentions', label: 'Mentions Explorer', icon: MessageSquare },
  { path: '/analytics', label: 'Sentiment Analytics', icon: BarChart3 },
  { path: '/keywords', label: 'Keyword Manager', icon: Tags },
]

const Logo = ({ onClose }) => (
  <div className="flex items-center justify-between px-4 border-b border-hairline dark:border-white/8 flex-shrink-0" style={{ height: '64px' }}>
    <div className="flex items-center gap-3 min-w-0">
      <img
        src="/assets/uemedgenta-logo.png"
        alt="UEM Edgenta"
        className="h-7 w-auto object-contain object-left flex-shrink-0"
      />
      <div className="text-xs font-semibold text-body dark:text-on-dark-soft leading-tight">Social Sentiment<br />Intelligence</div>
    </div>
    {onClose && (
      <button onClick={onClose} className="lg:hidden ml-2 p-1 rounded-md hover:bg-surface-strong text-muted">
        <X size={16} />
      </button>
    )}
  </div>
)

const StatPill = ({ label, value, color }) => (
  <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-surface-strong dark:bg-white/8">
    <span className="text-xs text-body dark:text-on-dark-soft">{label}</span>
    <span className="text-sm font-semibold dark:text-on-dark" style={{ color }}>{value}</span>
  </div>
)

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Viewer',
}

export default function Sidebar({ isOpen, onClose }) {
  const { globalFilteredMentions: filteredMentions } = useDashboard()
  const {
    user, department, role, signOut,
    isSuperAdmin, viewDepartment, setViewDepartment, departments,
  } = useAuth()

  const email = user?.email || ''
  const initials = email.slice(0, 2).toUpperCase()
  const roleLabel = ROLE_LABELS[role] || role
  // Non-super users show their department; super admins show just the role.
  const subLabel = isSuperAdmin ? roleLabel : [department, roleLabel].filter(Boolean).join(' · ')

  const riskCount = filteredMentions.filter(m => m.riskFlag).length
  const positiveCount = filteredMentions.filter(m => m.sentiment.label === 'positive').length
  const total = filteredMentions.length
  const positivePct = total > 0 ? Math.round(positiveCount / total * 100) : 0

  return (
    <aside
      className={clsx(
        'w-[300px] lg:w-[220px] h-full bg-canvas-soft dark:bg-surface-dark border-r border-hairline dark:border-white/8 flex flex-col flex-shrink-0 overflow-y-auto',
        // On mobile/tablet: fixed drawer overlay
        'fixed inset-y-0 left-0 z-30 transition-transform duration-250 ease-in-out lg:relative lg:translate-x-0 lg:z-auto',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <Logo onClose={onClose} />

      <nav className="flex-1 p-3 space-y-0.5 pt-4" onClick={onClose}>
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

        {isSuperAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => (isActive ? 'nav-item-active' : 'nav-item')}
          >
            <Users size={16} style={{ color: '#787881' }} />
            <span>Admin</span>
          </NavLink>
        )}
      </nav>

{/* Super admin: department view switcher */}
      {isSuperAdmin && (
        <div className="px-3 pb-2">
          <label className="flex items-center gap-1.5 text-[0.625rem] font-medium uppercase tracking-wider text-muted dark:text-on-dark-soft mb-1.5 px-1">
            <Building2 size={11} /> Viewing
          </label>
          <div className="relative">
            <select
              value={viewDepartment}
              onChange={e => setViewDepartment(e.target.value)}
              className="appearance-none w-full h-8 pl-2 pr-7 text-xs bg-canvas dark:bg-surface-dark border border-hairline-strong dark:border-white/8 rounded-md focus:outline-none focus:border-ink dark:focus:border-white/30 text-ink dark:text-on-dark"
            >
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>
      )}

      <div className="p-4 border-t border-hairline dark:border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-surface-strong dark:bg-white/8 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-ink dark:text-on-dark">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-ink dark:text-on-dark truncate" title={email}>{email}</div>
            <div className="text-[0.625rem] text-muted dark:text-on-dark-soft">
              {subLabel}
            </div>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            className="flex-shrink-0 p-1.5 rounded-md text-muted hover:text-ink dark:hover:text-on-dark hover:bg-surface-strong dark:hover:bg-white/8 transition-colors"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
