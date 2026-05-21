import React from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, BarChart3, Tags, MoreHorizontal } from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/mentions', label: 'Mentions', icon: MessageSquare },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/keywords', label: 'Keywords', icon: Tags },
  { path: '/more', label: 'More', icon: MoreHorizontal },
]

export default function BottomNav() {
  return (
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
    </nav>
  )
}
