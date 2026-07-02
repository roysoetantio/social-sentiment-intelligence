import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  UserPlus, Trash2, ShieldCheck, Loader2, AlertCircle, Check, X, Search,
  Users, SlidersHorizontal, Building2, ScrollText, ArrowUp, ArrowDown, ChevronsUpDown, ChevronDown,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth, DEPARTMENTS } from '../context/AuthContext'

const relTime = (ts) => (ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : 'Never')

const ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
]

const roleBadge = {
  super_admin: 'bg-[#2940BE]/10 text-[#2940BE]',
  admin: 'bg-[#732BCC]/10 text-[#732BCC]',
  viewer: 'bg-surface-strong text-body dark:bg-white/8 dark:text-on-dark-soft',
}

// Top-level admin sections. Only User Management is live; the rest are placeholders.
const MAIN_TABS = [
  { id: 'users', label: 'User Management', icon: Users, enabled: true },
  { id: 'departments', label: 'Departments', icon: Building2, enabled: false },
  { id: 'audit', label: 'Audit Log', icon: ScrollText, enabled: false },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal, enabled: false },
]

const DEPT_FILTERS = ['All', ...DEPARTMENTS]

export default function Admin() {
  const { user: me, isSuperAdmin } = useAuth()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [deptFilter, setDeptFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'email', dir: 'asc' })
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setError('')
    // RPC joins in the real last-login time from auth.users (super-admin only).
    const { data, error } = await supabase.rpc('admin_list_app_users')
    if (error) setError(error.message)
    setUsers(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Department-scoped set drives both the stats and the table
  const deptScoped = useMemo(
    () => deptFilter === 'All' ? users : users.filter(u => u.department === deptFilter),
    [users, deptFilter]
  )

  const stats = useMemo(() => {
    const total = deptScoped.length
    const active = deptScoped.filter(u => u.is_active).length
    return { total, active, inactive: total - active }
  }, [deptScoped])

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = q ? deptScoped.filter(u => (u.email || '').toLowerCase().includes(q)) : deptScoped
    const dir = sort.dir === 'asc' ? 1 : -1
    const val = (u) => {
      switch (sort.key) {
        case 'role': return u.role
        case 'department': return u.department || 'zzz' // sort super admins last
        case 'status': return u.is_active ? 0 : 1
        case 'lastlogin': return u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0
        default: return (u.email || '').toLowerCase()
      }
    }
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [deptScoped, query, sort])

  const toggleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const toggleActive = async (u) => {
    setError('')
    const { error } = await supabase.from('app_users').update({ is_active: !u.is_active }).eq('email', u.email)
    if (error) setError(error.message); else load()
  }
  const removeUser = async (u) => {
    setError('')
    const { error } = await supabase.from('app_users').delete().eq('email', u.email)
    if (error) setError(error.message); else load()
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-center">
        <div>
          <AlertCircle size={26} className="mx-auto mb-3 text-[#E97132]" />
          <p className="text-sm font-semibold text-ink dark:text-on-dark">Restricted</p>
          <p className="text-sm text-muted dark:text-on-dark-soft">Only super admins can access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5">
      {/* Full-width main tab bar */}
      <div className="flex items-stretch gap-1 border-b border-hairline dark:border-white/8">
        {MAIN_TABS.map(t => {
          const Icon = t.icon
          const active = t.id === 'users'
          return (
            <button
              key={t.id}
              disabled={!t.enabled}
              title={t.enabled ? undefined : 'Coming soon'}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-[#2940BE] text-[#2940BE] dark:text-[#6B80FF] dark:border-[#6B80FF]'
                  : 'border-transparent text-muted dark:text-on-dark-soft cursor-not-allowed opacity-60'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Total users" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Inactive" value={stats.inactive} />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-[#E97132]">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Content container */}
      <div className="rounded-xl border border-hairline dark:border-white/8 bg-white dark:bg-white/4 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline dark:border-white/8">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search email…"
                className="h-8 w-44 sm:w-56 pl-8 pr-3 text-xs bg-canvas dark:bg-surface-dark border border-hairline-strong dark:border-white/8 rounded-md focus:outline-none focus:border-ink dark:focus:border-white/30 text-ink dark:text-on-dark placeholder-muted"
              />
            </div>
            <Select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="h-8 text-xs"
            >
              {DEPT_FILTERS.map(d => (
                <option key={d} value={d}>{d === 'All' ? 'All departments' : d}</option>
              ))}
            </Select>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="h-8 px-3 flex items-center gap-1.5 rounded-md bg-[#2940BE] text-white text-xs font-medium hover:bg-[#2338A6] transition-colors flex-shrink-0"
          >
            <UserPlus size={14} /> Add User
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 size={18} className="animate-spin text-muted" /></div>
        ) : visibleUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">No users{deptFilter !== 'All' ? ` in ${deptFilter}` : ''}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline dark:border-white/8 text-left">
                  <Th label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                  <Th label="Role" sortKey="role" sort={sort} onSort={toggleSort} />
                  <Th label="Department" sortKey="department" sort={sort} onSort={toggleSort} />
                  <Th label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  <Th label="Last login" sortKey="lastlogin" sort={sort} onSort={toggleSort} />
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map(u => {
                  const isMe = u.email === me?.email
                  return (
                    <tr key={u.email} className="border-b border-hairline dark:border-white/8 last:border-0 hover:bg-surface-strong/40 dark:hover:bg-white/4">
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink dark:text-on-dark">{u.email}</span>
                        {isMe && <span className="ml-1.5 text-[0.625rem] text-muted">(you)</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.625rem] font-medium capitalize ${roleBadge[u.role] || roleBadge.viewer}`}>
                          {u.role === 'super_admin' && <ShieldCheck size={10} />}
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-body dark:text-on-dark-soft">{u.department || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive(u)} disabled={isMe}
                          title={isMe ? "You can't deactivate yourself" : (u.is_active ? 'Deactivate' : 'Activate')}
                          className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            u.is_active ? 'bg-[#19C9A5]/10 text-[#0f9e80]' : 'bg-surface-strong text-muted dark:bg-white/8'
                          }`}
                        >
                          {u.is_active ? <><Check size={11} /> Active</> : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-body dark:text-on-dark-soft whitespace-nowrap" title={u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never signed in'}>
                        {relTime(u.last_sign_in_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeUser(u)} disabled={isMe}
                          title={isMe ? "You can't remove yourself" : 'Remove user'}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted hover:text-error hover:bg-error/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onError={setError}
          onAdded={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

function Th({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className="px-4 py-2.5 font-medium text-muted dark:text-on-dark-soft">
      <button onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-ink dark:hover:text-on-dark transition-colors">
        {label}
        <Icon size={12} className={active ? 'text-ink dark:text-on-dark' : 'opacity-50'} />
      </button>
    </th>
  )
}

function AddUserModal({ onClose, onError, onAdded }) {
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState(DEPARTMENTS[0])
  const [role, setRole] = useState('viewer')
  const [saving, setSaving] = useState(false)
  const [localErr, setLocalErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setLocalErr('')
    const clean = email.trim().toLowerCase()
    if (!clean) return
    const dept = role === 'super_admin' ? null : department
    setSaving(true)
    const { error } = await supabase.from('app_users').insert({ email: clean, department: dept, role })
    setSaving(false)
    if (error) { setLocalErr(error.message); onError?.(error.message); return }
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-hairline-strong dark:border-white/8 bg-canvas dark:bg-surface-dark shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline dark:border-white/8">
          <span className="text-sm font-semibold text-ink dark:text-on-dark">Add User</span>
          <button onClick={onClose} className="text-muted hover:text-ink dark:hover:text-on-dark"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-body dark:text-on-dark-soft mb-1.5">Work email</label>
            <input
              type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
              placeholder="name@edgenta.com"
              className="w-full h-9 px-3 text-sm bg-canvas dark:bg-surface-dark-elevated border border-hairline-strong dark:border-white/8 rounded-md focus:outline-none focus:border-ink dark:focus:border-white/30 text-ink dark:text-on-dark placeholder-muted"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-body dark:text-on-dark-soft mb-1.5">Role</label>
              <Select value={role} onChange={e => setRole(e.target.value)} wrapperClassName="block" className="h-9 text-sm">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-body dark:text-on-dark-soft mb-1.5">Department</label>
              <Select
                value={role === 'super_admin' ? '' : department}
                onChange={e => setDepartment(e.target.value)}
                disabled={role === 'super_admin'}
                wrapperClassName="block" className="h-9 text-sm"
              >
                {role === 'super_admin'
                  ? <option value="">— (all)</option>
                  : DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
            </div>
          </div>
          {localErr && (
            <div className="flex items-start gap-2 text-xs text-[#E97132]">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{localErr}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-md border border-hairline-strong dark:border-white/8 text-sm font-medium text-body dark:text-on-dark-soft hover:border-ink/30 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="h-9 px-4 flex items-center gap-2 rounded-md bg-[#2940BE] text-white text-sm font-medium hover:bg-[#2338A6] disabled:opacity-60 transition-colors">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              Add User
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Consistent dropdown: strips native OS styling so it matches our inputs
// (radius, border, focus ring) and uses a custom chevron.
function Select({ wrapperClassName = 'inline-block', className = '', children, ...props }) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select
        {...props}
        className={`appearance-none w-full pl-2.5 pr-7 bg-canvas dark:bg-surface-dark border border-hairline-strong dark:border-white/8 rounded-md focus:outline-none focus:border-ink dark:focus:border-white/30 text-ink dark:text-on-dark disabled:opacity-40 ${className}`}
      >
        {children}
      </select>
      <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-hairline dark:border-white/8 bg-white dark:bg-white/4 px-4 py-3 min-w-[120px]">
      <div className="text-xl font-semibold text-ink dark:text-on-dark leading-none">{value}</div>
      <div className="text-[0.6875rem] text-muted dark:text-on-dark-soft mt-1">{label}</div>
    </div>
  )
}
