import React, { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Tags,
  X,
  LogOut,
  Users,
  Instagram,
  Facebook,
  Share2,
  ChevronDown,
} from 'lucide-react'
import { useDashboard } from '../../context/DashboardContext'
import { useAuth } from '../../context/AuthContext'
import { isAtRisk } from '../../constants/sentiment'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/mentions', label: 'Mentions Explorer', icon: MessageSquare },
  { path: '/analytics', label: 'Sentiment Analytics', icon: BarChart3 },
  { path: '/keywords', label: 'Keyword Manager', icon: Tags },
  // Everything above is mentions of us; everything below is our own channels.
  { divider: true, key: 'after-keywords' },
  // Owned social content. Only Corporate Comms runs the social accounts, so the
  // group is scoped to that tenant rather than shown to every department.
  {
    key: 'social',
    label: 'Social Feed',
    icon: Share2,
    departments: ['CCD'],
    children: [
      { path: '/social/instagram', label: 'Instagram', icon: Instagram },
      { path: '/social/facebook', label: 'Facebook', icon: Facebook },
    ],
  },
]

// A divider only earns its place between two visible items — drop the ones
// left stranded at either end (or doubled up) once role/tenant gating has run.
function pruneDividers(items) {
  return items.filter((item, i) => {
    if (!item.divider) return true
    if (i === 0 || i === items.length - 1) return false
    return !items[i - 1].divider
  })
}

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
  const location = useLocation()
  const { globalFilteredMentions: filteredMentions } = useDashboard()
  const {
    user, department, role, signOut,
    isSuperAdmin, viewDepartment, setViewDepartment, departments,
    currentDepartment,
  } = useAuth()

  const email = user?.email || ''
  const initials = email.slice(0, 2).toUpperCase()
  const roleLabel = ROLE_LABELS[role] || role
  // Non-super users show their department; super admins show just the role.
  const subLabel = isSuperAdmin ? roleLabel : [department, roleLabel].filter(Boolean).join(' · ')

  // isAtRisk is the shared predicate (risk_level based). Using m.riskFlag here
  // showed a different number from Overview: risk_flag was written as
  // "negative && confidence > 0.7" while risk_level is a severity rule.
  const riskCount = filteredMentions.filter(isAtRisk).length
  const positiveCount = filteredMentions.filter(m => m.sentiment.label === 'positive').length
  const total = filteredMentions.length
  const positivePct = total > 0 ? Math.round(positiveCount / total * 100) : 0

  const visibleNavItems = pruneDividers(
    navItems
      .filter(({ path }) => path !== '/keywords' || role !== 'viewer')
      .filter(({ departments: only }) => !only || only.includes(currentDepartment))
  )

  // Groups start collapsed unless the current route lives inside one, so a
  // deep link or refresh never lands on a hidden active item.
  const [openGroups, setOpenGroups] = useState({})
  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))

  useEffect(() => {
    const inGroup = navItems.find(
      i => i.children && i.children.some(c => location.pathname.startsWith(c.path))
    )
    if (inGroup) setOpenGroups(prev => (prev[inGroup.key] ? prev : { ...prev, [inGroup.key]: true }))
  }, [location.pathname])

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

        <div className="space-y-0.5">
          {visibleNavItems.map((item) => {
            if (item.divider) {
              // Spacing has to be padding on a wrapper, not margin on the rule:
              // the list's space-y-* sets margin-y on every child through a
              // higher-specificity selector, which silently wins over my-*.
              return (
                <div key={item.key} className="py-3">
                  <div className="border-t border-hairline" />
                </div>
              )
            }

            if (item.children) {
              const { key, label, icon: Icon, children } = item
              const open = !!openGroups[key]
              const groupActive = children.some(c => location.pathname.startsWith(c.path))
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    aria-expanded={open}
                    className={clsx(
                      'w-full',
                      groupActive && !open ? 'nav-item-active' : 'nav-item'
                    )}
                  >
                    <Icon size={16} style={{ color: '#787881' }} />
                    <span className="flex-1 text-left">{label}</span>
                    <ChevronDown
                      size={14}
                      style={{ color: '#787881' }}
                      className={clsx('transition-transform duration-200', open && 'rotate-180')}
                    />
                  </button>

                  {/* grid-rows trick: animates to the children's natural height
                      without hardcoding a max-height that would clip a third item */}
                  <div
                    className={clsx(
                      'grid transition-[grid-template-rows] duration-200 ease-in-out',
                      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="mt-0.5 ml-[15px] pl-3 border-l border-hairline space-y-0.5">
                        {children.map(({ path, label: childLabel, icon: ChildIcon }) => (
                          <NavLink
                            key={path}
                            to={path}
                            onClick={onClose}
                            className={({ isActive }) => (isActive ? 'nav-item-active' : 'nav-item')}
                          >
                            <ChildIcon size={15} style={{ color: '#787881' }} />
                            <span>{childLabel}</span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

            const { path, label, icon: Icon } = item
            return (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                onClick={onClose}
                className={({ isActive }) => (isActive ? 'nav-item-active' : 'nav-item')}
              >
                <Icon size={16} style={{ color: '#787881' }} />
                <span>{label}</span>
              </NavLink>
            )
          })}
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
