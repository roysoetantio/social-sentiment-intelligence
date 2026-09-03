import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  UserPlus, Trash2, Loader2, AlertCircle, X, Search,
  ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import DepartmentsPanel from '../components/admin/DepartmentsPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

const relTime = (ts) => (ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : 'Never')

const ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
]

// The master owner is a normal super admin on paper, but is protected: only they
// can create/deactivate/remove other super admins, and they can never be touched.
const MASTER_OWNER = 'roy.soetantio@edgenta.com'

const roleBadge = {
  super_admin: 'bg-[#2940BE]/10 text-[#2940BE]',
  admin: 'bg-[#732BCC]/10 text-[#732BCC]',
  viewer: 'bg-surface-strong text-body dark:bg-white/8',
}

// Top-level admin sections. Audit Log and Settings are still placeholders.
const MAIN_TABS = [
  { id: 'users', label: 'User Management', enabled: true },
  { id: 'departments', label: 'Departments', enabled: true },
  { id: 'audit', label: 'Audit Log', enabled: false },
  { id: 'settings', label: 'Settings', enabled: false },
]

export default function Admin() {
  const { user: me, isSuperAdmin, departments } = useAuth()
  const iAmMaster = me?.email === MASTER_OWNER
  const [tab, setTab] = useState('users')
  // Department filter options track the live tenant list.
  const deptFilters = useMemo(() => ['All', ...departments], [departments])

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
          <p className="text-sm font-semibold text-ink">Restricted</p>
          <p className="text-sm text-muted">Only super admins can access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5">
      {/* Main tab bar (shadcn Tabs) */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          {MAIN_TABS.map(t => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              disabled={!t.enabled}
              title={t.enabled ? undefined : 'Coming soon'}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'departments' && <DepartmentsPanel />}

      {tab === 'users' && (<>

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
      <div className="rounded-xl border border-hairline bg-surface-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search email…"
                className="h-8 w-44 sm:w-56 pl-8 text-xs"
              />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {deptFilters.map(d => (
                  <SelectItem key={d} value={d}>{d === 'All' ? 'All departments' : d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} className="flex-shrink-0">
            <UserPlus size={14} /> Add User
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 size={18} className="animate-spin text-muted" /></div>
        ) : visibleUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">No users{deptFilter !== 'All' ? ` in ${deptFilter}` : ''}.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                <Th label="Role" sortKey="role" sort={sort} onSort={toggleSort} />
                <Th label="Department" sortKey="department" sort={sort} onSort={toggleSort} />
                <Th label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                <Th label="Last login" sortKey="lastlogin" sort={sort} onSort={toggleSort} />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUsers.map(u => {
                const isMe = u.email === me?.email
                const isMaster = u.email === MASTER_OWNER
                const isSuper = u.role === 'super_admin'
                // Master owner is untouchable by everyone (incl. themselves).
                // Other super admins can only be managed by the master owner.
                const locked = isMaster || (isSuper ? !iAmMaster : isMe)
                const lockReason = isMaster
                  ? 'The master owner is protected'
                  : isSuper
                    ? 'Only the master owner can manage super admins'
                    : isMe
                      ? "You can't do this to yourself"
                      : null
                return (
                  <TableRow key={u.email}>
                    <TableCell>
                      <span className="font-medium text-ink">{u.email}</span>
                      {isMe && <span className="ml-1.5 text-[0.625rem] text-muted">(you)</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`capitalize whitespace-nowrap ${roleBadge[u.role] || roleBadge.viewer}`}>
                        {u.role.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-body">{u.department || '—'}</TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          checked={u.is_active}
                          onCheckedChange={() => toggleActive(u)}
                          disabled={locked}
                          aria-label={u.is_active ? 'Deactivate user' : 'Activate user'}
                          title={lockReason || (u.is_active ? 'Deactivate' : 'Activate')}
                        />
                        <span className={`inline-block w-14 text-xs font-medium ${u.is_active ? 'text-[#0f9e80]' : 'text-muted'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-body whitespace-nowrap" title={u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never signed in'}>
                      {relTime(u.last_sign_in_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => removeUser(u)} disabled={locked}
                        title={lockReason || 'Remove user'}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted hover:text-error hover:bg-error/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <Trash2 size={14} />
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      </>)}

      {tab === 'users' && showAdd && (
        <AddUserModal
          canAddSuperAdmin={iAmMaster}
          departments={departments}
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
    <TableHead>
      <button onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-ink transition-colors">
        {label}
        <Icon size={12} className={active ? 'text-ink' : 'opacity-50'} />
      </button>
    </TableHead>
  )
}

function AddUserModal({ canAddSuperAdmin, departments, onClose, onError, onAdded }) {
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState(departments[0] ?? '')
  const [role, setRole] = useState('viewer')
  const [saving, setSaving] = useState(false)
  const [localErr, setLocalErr] = useState('')

  // Only the master owner may create super admins.
  const roleOptions = canAddSuperAdmin ? ROLES : ROLES.filter(r => r.value !== 'super_admin')

  const submit = async (e) => {
    e.preventDefault()
    setLocalErr('')
    const clean = email.trim().toLowerCase()
    if (!clean) return
    if (role === 'super_admin' && !canAddSuperAdmin) {
      setLocalErr('Only the master owner can add super admins.')
      return
    }
    const dept = role === 'super_admin' ? null : department
    setSaving(true)
    const { error } = await supabase.from('app_users').insert({ email: clean, department: dept, role })
    setSaving(false)
    if (error) { setLocalErr(error.message); onError?.(error.message); return }
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-hairline-strong bg-canvas shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <span className="text-sm font-semibold text-ink">Add User</span>
          <button onClick={onClose} className="text-muted hover:text-ink"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Work email</Label>
            <Input
              type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
              placeholder="name@edgenta.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={role === 'super_admin' ? undefined : department}
                onValueChange={setDepartment}
                disabled={role === 'super_admin'}
              >
                <SelectTrigger><SelectValue placeholder="— (all)" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
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
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              Add User
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <Card className="min-w-[120px]">
      <CardContent className="px-4 py-3">
        <div className="text-xl font-semibold text-ink leading-none">{value}</div>
        <div className="text-[0.6875rem] text-muted mt-1">{label}</div>
      </CardContent>
    </Card>
  )
}
