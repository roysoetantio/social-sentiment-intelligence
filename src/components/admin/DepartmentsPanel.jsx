import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, Loader2, AlertCircle, Search, X, Pencil,
  ArrowUp, ArrowDown, ChevronsUpDown, Building2,
} from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

/**
 * Admin → Departments.
 *
 * A "department" is a tenant: the unit that owns keyword tags (keyword_tenants),
 * folder mappings (department_group_access), users (app_users.department) and its
 * own AI digest. This panel manages the tenant list only — keywords and folders
 * are managed per-tenant in Keyword Manager (switch the sidebar department
 * switcher to the tenant first).
 *
 * All writes go through SECURITY DEFINER RPCs (create/rename/set_active/delete_tenant)
 * which enforce super-admin-only and the delete guards. See db/migrations/003_tenants.sql.
 */
export default function DepartmentsPanel() {
  const { tenants, refreshTenants, viewDepartment } = useAuth()

  const [counts, setCounts] = useState(null)   // { [name]: { users, folders, keywords } }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)       // tenant name currently mutating

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [showAdd, setShowAdd] = useState(false)
  const [renaming, setRenaming] = useState(null)
  const [deleting, setDeleting] = useState(null)

  // Per-tenant usage counts. Super admins can read all three tables under RLS,
  // so this is a plain client-side tally rather than another RPC.
  const loadCounts = useCallback(async () => {
    setError('')
    const [usersRes, foldersRes, kwRes] = await Promise.all([
      supabase.from('app_users').select('department'),
      supabase.from('department_group_access').select('department'),
      supabase.from('keyword_tenants').select('department'),
    ])
    const firstErr = usersRes.error || foldersRes.error || kwRes.error
    if (firstErr) setError(firstErr.message)
    const tally = {}
    const bump = (rows, key) => {
      for (const r of rows || []) {
        if (!r.department) continue
        ;(tally[r.department] ||= { users: 0, folders: 0, keywords: 0 })[key]++
      }
    }
    bump(usersRes.data, 'users')
    bump(foldersRes.data, 'folders')
    bump(kwRes.data, 'keywords')
    setCounts(tally)
    setLoading(false)
  }, [])

  useEffect(() => { loadCounts() }, [loadCounts])

  const rows = tenants || []

  const stats = useMemo(() => {
    const total = rows.length
    const active = rows.filter(t => t.is_active).length
    return { total, active, inactive: total - active }
  }, [rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? rows.filter(t => t.name.toLowerCase().includes(q)) : rows
    const dir = sort.dir === 'asc' ? 1 : -1
    const c = (name) => counts?.[name] || { users: 0, folders: 0, keywords: 0 }
    const val = (t) => {
      switch (sort.key) {
        case 'users': return c(t.name).users
        case 'folders': return c(t.name).folders
        case 'keywords': return c(t.name).keywords
        case 'status': return t.is_active ? 0 : 1
        case 'created': return t.created_at ? new Date(t.created_at).getTime() : 0
        default: return t.name.toLowerCase()
      }
    }
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [rows, query, sort, counts])

  const toggleSort = (key) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

  // Every mutation refreshes both the registry (context) and the counts.
  const run = async (name, fn) => {
    setError(''); setBusy(name)
    const { error } = await fn()
    setBusy(null)
    if (error) { setError(error.message); return false }
    await refreshTenants()
    await loadCounts()
    return true
  }

  const toggleActive = (t) =>
    run(t.name, () => supabase.rpc('set_tenant_active', { p_name: t.name, p_active: !t.is_active }))

  const confirmDelete = async () => {
    const ok = await run(deleting.name, () => supabase.rpc('delete_tenant', { p_name: deleting.name }))
    if (ok) setDeleting(null)
  }

  const confirmRename = async (newName) => {
    const ok = await run(renaming.name, () =>
      supabase.rpc('rename_tenant', { p_old: renaming.name, p_new: newName }))
    if (ok) setRenaming(null)
    return ok
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <StatCard label="Total departments" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Inactive" value={stats.inactive} />
      </div>

      {!tenants && !loading && (
        <div className="flex items-start gap-2 text-xs text-[#E97132]">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Couldn't read the <code>tenants</code> table — the app is running on the built-in
            fallback list. Apply <code>db/migrations/003_tenants.sql</code>.
          </span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-xs text-[#E97132]">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-xl border border-hairline bg-surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search department…"
              className="h-8 w-44 sm:w-56 pl-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={!tenants} className="flex-shrink-0">
            <Plus size={14} /> Add Department
          </Button>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 size={18} className="animate-spin text-muted" /></div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">No departments found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th label="Department" sortKey="name" sort={sort} onSort={toggleSort} />
                <Th label="Users" sortKey="users" sort={sort} onSort={toggleSort} />
                <Th label="Folders" sortKey="folders" sort={sort} onSort={toggleSort} />
                <Th label="Keywords" sortKey="keywords" sort={sort} onSort={toggleSort} />
                <Th label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                <Th label="Created" sortKey="created" sort={sort} onSort={toggleSort} />
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(t => {
                const c = counts?.[t.name] || { users: 0, folders: 0, keywords: 0 }
                const isBusy = busy === t.name
                // A tenant with users assigned can't be deleted (FK RESTRICT +
                // the guard in delete_tenant) — surface that in the UI too.
                const deleteBlocked = c.users > 0
                return (
                  <TableRow key={t.name}>
                    <TableCell>
                      <span className="font-medium text-ink">{t.name}</span>
                      {t.name === viewDepartment && (
                        <span className="ml-1.5 text-[0.625rem] text-muted">(viewing)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-body">{c.users}</TableCell>
                    <TableCell className="text-body">{c.folders}</TableCell>
                    <TableCell className="text-body">{c.keywords}</TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={() => toggleActive(t)}
                          disabled={isBusy}
                          aria-label={t.is_active ? 'Deactivate department' : 'Activate department'}
                          title={t.is_active ? 'Deactivate — hides it from the switcher' : 'Activate'}
                        />
                        <span className={`inline-block w-14 text-xs font-medium ${t.is_active ? 'text-[#0f9e80]' : 'text-muted'}`}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-body whitespace-nowrap">
                      {t.created_at ? format(new Date(t.created_at), 'd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setRenaming(t)} disabled={isBusy} title="Rename"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted hover:text-ink hover:bg-surface-strong transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleting({ ...t, ...c })}
                        disabled={isBusy || deleteBlocked}
                        title={deleteBlocked ? `${c.users} user(s) still assigned — reassign them first` : 'Delete department'}
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

      <p className="flex items-start gap-2 text-xs text-muted">
        <Building2 size={14} className="flex-shrink-0 mt-0.5" />
        <span>
          Keywords and folders are managed per department in <strong className="text-body">Keyword Manager</strong> —
          point the sidebar department switcher at a department, then add its folders and keywords there.
        </span>
      </p>

      {showAdd && (
        <NameModal
          title="Add Department"
          submitLabel="Create"
          onClose={() => setShowAdd(false)}
          onSubmit={async (name) => {
            const { error } = await supabase.rpc('create_tenant', { p_name: name })
            if (error) return error.message
            await refreshTenants(); await loadCounts()
            setShowAdd(false)
            return null
          }}
          hint="A new department starts empty. Switch to it in the sidebar, then create its folders and keywords in Keyword Manager."
        />
      )}

      {renaming && (
        <NameModal
          title={`Rename “${renaming.name}”`}
          submitLabel="Rename"
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            const ok = await confirmRename(name)
            return ok ? null : 'Rename failed'
          }}
          hint="Users, keyword tags, folder mappings and digests follow the new name automatically."
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          tenant={deleting}
          busy={busy === deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
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

// Shared create/rename modal. onSubmit returns an error string, or null on success.
function NameModal({ title, submitLabel, initial = '', hint, onClose, onSubmit }) {
  const [name, setName] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    setErr(''); setSaving(true)
    const msg = await onSubmit(clean)
    setSaving(false)
    if (msg) setErr(msg)
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label>Department name</Label>
          <Input
            required autoFocus maxLength={40} value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. UEM Group"
          />
        </div>
        {hint && <p className="text-xs text-muted leading-relaxed">{hint}</p>}
        {err && (
          <div className="flex items-start gap-2 text-xs text-[#E97132]">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving && <Loader2 size={15} className="animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function ConfirmDeleteModal({ tenant, busy, onClose, onConfirm }) {
  return (
    <ModalShell title={`Delete “${tenant.name}”?`} onClose={onClose}>
      <div className="p-4 space-y-3">
        <p className="text-sm text-body leading-relaxed">
          This removes the department and everything scoped to it:
        </p>
        <ul className="text-sm text-body space-y-1 list-disc pl-5">
          <li><strong className="text-ink">{tenant.folders}</strong> folder mapping(s)</li>
          <li><strong className="text-ink">{tenant.keywords}</strong> keyword tag(s)</li>
          <li>its saved AI digests</li>
        </ul>
        <p className="text-xs text-muted leading-relaxed">
          Mentions are never deleted — they're shared across departments. A keyword no other
          department still tracks is deactivated rather than destroyed, so re-adding it later
          brings its history back.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={onConfirm} disabled={busy}
            className="bg-error text-white hover:bg-error/90">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Delete
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

// Matches the AddUserModal shell in UserManagement.jsx.
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-hairline-strong bg-canvas shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <span className="text-sm font-semibold text-ink">{title}</span>
          <button onClick={onClose} className="text-muted hover:text-ink"><X size={16} /></button>
        </div>
        {children}
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
