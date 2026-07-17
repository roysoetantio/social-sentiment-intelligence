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
} from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import { useAuth } from '../../context/AuthContext'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/mentions', label: 'Mentions Explorer', icon: MessageSquare },
  { path: '/analytics', label: 'Sentiment Analytics', icon: BarChart3 },
  { path: '/keywords', label: 'Keyword Manager', icon: Tags },
]

const Logo = ({ onClose }) => (
  <div className="flex items-center justify-between px-4 border-b border-hairline flex-shrink-0" style={{ height: '64px' }}>
    <div className="flex items-center gap-3 min-w-0">
      <img
        src="/assets/uemedgenta-logo.png"
        alt="UEM Edgenta"
        className="h-7 w-auto object-contain object-left flex-shrink-0 dark:hidden"
      />
      <img
        src="/assets/uemedgenta-logo-white.png"
        alt="UEM Edgenta"
        className="h-7 w-auto object-contain object-left flex-shrink-0 hidden dark:block"
      />
      <div className="text-xs font-semibold text-body leading-tight">Social Sentiment<br />Intelligence</div>
    </div>
    {onClose && (
      <button onClick={onClose} className="lg:hidden ml-2 p-1 rounded-md hover:bg-surface-strong text-muted">
        <X size={16} />
      </button>
    )}
  </div>
)

const StatPill = ({ label, value, color }) => (
  <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-surface-strong">
    <span className="text-xs text-body">{label}</span>
    <span className="text-sm font-semibold" style={{ color }}>{value}</span>
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
        'w-[300px] lg:w-[220px] h-full bg-canvas-soft border-r border-hairline flex flex-col flex-shrink-0 overflow-y-auto',
        // On mobile/tablet: fixed drawer overlay
        'fixed inset-y-0 left-0 z-30 transition-transform duration-250 ease-in-out lg:relative lg:translate-x-0 lg:z-auto',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <Logo onClose={onClose} />

      <nav className="flex-1 flex flex-col px-3 pt-4">
        {/* Super admin: department view switcher — pinned above the nav */}
        {isSuperAdmin && (
          <div className="mb-3">
            <Select value={viewDepartment} onValueChange={setViewDepartment}>
              <SelectTrigger className="h-8 text-xs bg-canvas border-hairline-strong">
                <span className="truncate">
                  <span className="text-muted">Viewing: </span>
                  <span className="font-medium text-ink">{viewDepartment}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {departments.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-0.5" onClick={onClose}>
          {navItems
            .filter(({ path }) => path !== '/keywords' || role !== 'viewer')
            .map(({ path, label, icon: Icon }) => (
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
        </div>

        {isSuperAdmin && (
          <div className="mt-auto pb-4" onClick={onClose}>
            <NavLink
              to="/admin"
              className={({ isActive }) => (isActive ? 'nav-item-active' : 'nav-item')}
            >
              <Users size={16} style={{ color: '#787881' }} />
              <span>Admin</span>
            </NavLink>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-hairline">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-surface-strong flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-ink">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-ink truncate" title={email}>{email}</div>
            <div className="text-[0.625rem] text-muted">
              {subLabel}
            </div>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            className="flex-shrink-0 p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface-strong transition-colors"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
