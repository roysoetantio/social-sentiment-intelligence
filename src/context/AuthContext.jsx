import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// ⚠️ DEV-ONLY auth bypass (temporary). Never set VITE_DEV_NO_AUTH in production.
const DEV_NO_AUTH = import.meta.env.VITE_DEV_NO_AUTH === 'true'

// Tenants (departments) live in the `tenants` table and are managed from
// Admin → Departments. This list is only a last-resort fallback for when that
// table can't be read (missing migration / offline), so the app still renders.
export const FALLBACK_DEPARTMENTS = ['CCD', 'Infra']

// Microsoft Graph is the only source of a colleague's face this app can reach,
// and the window to call it is narrow: Supabase exposes `provider_token` on the
// session right after the OAuth redirect, and Azure returns no provider refresh
// token, so it is gone after the first session refresh. So each person deposits
// their own name and photo into `app_users` at login and every other screen
// reads the stored copy — no directory-wide permission, no Graph call at render.
const GRAPH_PHOTO_URL = 'https://graph.microsoft.com/v1.0/me/photos/96x96/$value'
const MAX_PHOTO_BYTES = 200 * 1024

// Entra often appends a " - <Company>" org suffix to the display name.
const cleanFullName = (user) => {
  const m = user?.user_metadata || {}
  const raw = m.full_name || m.name || m.preferred_username || (user?.email ? user.email.split('@')[0] : '')
  return String(raw).split(' - ')[0].trim()
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = reject
  reader.readAsDataURL(blob)
})

/**
 * Auth + authorization layer.
 *
 * Two independent concerns:
 *  - Authentication: who is signed in (Supabase session, Microsoft SSO).
 *  - Authorization: whether that email is allowlisted in `app_users`, their role,
 *    and which keyword groups they may see (`department_group_access`).
 *
 * Roles:
 *  - super_admin → not tied to a department; sees all groups and can switch which
 *    department's data they view (viewDepartment). Can manage users.
 *  - admin / viewer → scoped to their department's keyword groups.
 *
 * `status` drives the top-level gate:
 *   'loading' → resolving session/profile
 *   'login'   → no session, show Login
 *   'denied'  → signed in but not an active allowlisted user
 *   'ready'   → allowlisted, app renders
 */
export function AuthProvider({ children }) {
  // undefined = initial getSession pending, null = no session, object = signed in
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)          // app_users row
  const [profileResolved, setProfileResolved] = useState(false)

  // Group access data (folders per tenant — from department_group_access)
  const [ownGroupIds, setOwnGroupIds] = useState([])    // non-super users: their dept's groups
  const [deptGroupsMap, setDeptGroupsMap] = useState({}) // super admin: dept → [group_ids]

  // Keyword-level tenant tags (new model — from keyword_tenants).
  // null = table not present / not loaded yet → callers fall back to the legacy group model.
  const [keywordTenantTags, setKeywordTenantTags] = useState(null)

  // The tenant registry (from the `tenants` table). null = not loaded / unreadable
  // → `departments` falls back to FALLBACK_DEPARTMENTS.
  const [tenants, setTenants] = useState(null)

  // Super admin: which department's data is currently being viewed. Validated
  // against the loaded tenant list below (the list isn't known on first render).
  const [viewDepartment, setViewDepartmentState] = useState(
    () => localStorage.getItem('view_department') || FALLBACK_DEPARTMENTS[0]
  )
  const setViewDepartment = useCallback((d) => {
    localStorage.setItem('view_department', d)
    setViewDepartmentState(d)
  }, [])

  // Track the auth session
  useEffect(() => {
    // DEV-ONLY bypass: fake a signed-in session so we can preview without SSO.
    if (DEV_NO_AUTH) {
      setSession({ user: { email: 'dev@local', user_metadata: { full_name: 'Dev (No-Auth)' } } })
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Deposit this user's own name and photo for everyone else to render.
  // Runs once per signed-in email: a 404 from Graph means they simply have no
  // photo set, which is common and not a failure — initials cover it.
  const harvestedFor = useRef(null)
  useEffect(() => {
    if (DEV_NO_AUTH) return
    const email = session?.user?.email
    if (!email || !profile) return
    if (harvestedFor.current === email) return
    harvestedFor.current = email

    ;(async () => {
      let photo = null
      const token = session.provider_token
      if (token) {
        try {
          const res = await fetch(GRAPH_PHOTO_URL, { headers: { Authorization: `Bearer ${token}` } })
          if (res.ok) {
            const blob = await res.blob()
            if (blob.size > 0 && blob.size <= MAX_PHOTO_BYTES) photo = await blobToDataUrl(blob)
          }
        } catch {
          // Graph unreachable or the token already expired. Not worth surfacing:
          // the user still has a name and initials.
        }
      }
      const name = cleanFullName(session.user)
      if (!name && !photo) return
      const { error } = await supabase.rpc('sync_my_profile', { p_full_name: name, p_avatar_url: photo })
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[auth] profile sync failed:', error.message)
        return
      }
      // The profile row was read before this wrote, so reflect it now rather
      // than making the user reload to see their own face.
      setProfile(prev => (prev ? {
        ...prev,
        full_name: name || prev.full_name,
        avatar_url: photo || prev.avatar_url,
      } : prev))
    })()
  }, [session, profile])

  // Resolve the allowlist profile + group access whenever the session changes
  useEffect(() => {
    if (session === undefined) return
    let cancelled = false

    const resolve = async () => {
      setProfileResolved(false)

      // DEV-ONLY bypass: act as a super admin, skip the app_users allowlist check.
      if (DEV_NO_AUTH) {
        setProfile({ email: 'dev@local', role: 'super_admin', department: null, is_active: true })
        const { data: access } = await supabase.from('department_group_access').select('department, group_id')
        if (cancelled) return
        const map = {}
        for (const row of access || []) { ;(map[row.department] ||= []).push(row.group_id) }
        setDeptGroupsMap(map)
        const { data: tags, error: tErr } = await supabase.from('keyword_tenants').select('keyword_id, department, group_id')
        if (cancelled) return
        setKeywordTenantTags(tErr ? null : (tags || []))
        setProfileResolved(true)
        return
      }

      const email = session?.user?.email
      if (!email) {
        if (!cancelled) { setProfile(null); setProfileResolved(true) }
        return
      }

      const { data: user } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .maybeSingle()
      if (cancelled) return

      if (!user || !user.is_active) {
        setProfile(null)
        setOwnGroupIds([])
        setProfileResolved(true)
        return
      }

      setProfile(user)

      if (user.role === 'super_admin') {
        // The full department → groups mapping (drives the department switcher)
        const { data: access } = await supabase
          .from('department_group_access')
          .select('department, group_id')
        if (cancelled) return
        const map = {}
        for (const row of access || []) {
          ;(map[row.department] ||= []).push(row.group_id)
        }
        setDeptGroupsMap(map)
      } else {
        const { data: access } = await supabase
          .from('department_group_access')
          .select('group_id')
          .eq('department', user.department)
        if (cancelled) return
        setOwnGroupIds((access || []).map(a => a.group_id))
      }

      // Keyword-level tenant tags (new model). Missing table => null => legacy fallback.
      {
        let tq = supabase.from('keyword_tenants').select('keyword_id, department, group_id')
        if (user.role !== 'super_admin') tq = tq.eq('department', user.department)
        const { data: tags, error: tErr } = await tq
        if (cancelled) return
        setKeywordTenantTags(tErr ? null : (tags || []))
      }

      setProfileResolved(true)
    }

    resolve()
    return () => { cancelled = true }
  }, [session])

  // ── Tenant registry ────────────────────────────────────────────────────────
  // Read once a session exists (RLS on `tenants` requires an active user).
  // An empty/errored result is treated as "unreadable" (null) rather than
  // "no tenants", so the switcher never ends up with an empty list.
  const refreshTenants = useCallback(async () => {
    const { data, error } = await supabase
      .from('tenants')
      .select('name, is_active, created_at')
      .order('name')
    const rows = error ? null : (data || [])
    setTenants(rows && rows.length ? rows : null)
    return rows
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (!session && !DEV_NO_AUTH) { setTenants(null); return }
    refreshTenants()
  }, [session, refreshTenants])

  // Re-fetch the department → group access mapping without re-resolving the whole session.
  // Called after keyword groups are created/deleted so scoping stays fresh app-wide.
  const refreshGroupAccess = useCallback(async () => {
    if (!profile) return
    if (profile.role === 'super_admin') {
      const { data: access } = await supabase
        .from('department_group_access')
        .select('department, group_id')
      const map = {}
      for (const row of access || []) {
        ;(map[row.department] ||= []).push(row.group_id)
      }
      setDeptGroupsMap(map)
    } else {
      const { data: access } = await supabase
        .from('department_group_access')
        .select('group_id')
        .eq('department', profile.department)
      setOwnGroupIds((access || []).map(a => a.group_id))
    }
    // Refresh keyword-level tenant tags too.
    let tq = supabase.from('keyword_tenants').select('keyword_id, department, group_id')
    if (profile.role !== 'super_admin') tq = tq.eq('department', profile.department)
    const { data: tags, error: tErr } = await tq
    setKeywordTenantTags(tErr ? null : (tags || []))
  }, [profile])

  // Active tenant names — what the department switcher and Add User form offer.
  const departments = useMemo(
    () => (tenants ? tenants.filter(t => t.is_active).map(t => t.name) : FALLBACK_DEPARTMENTS),
    [tenants]
  )

  // The stored/selected department may have been renamed, deactivated or deleted
  // in another session — snap back to the first available tenant when that happens.
  // Only once the real list has loaded: correcting against the fallback list would
  // wrongly reset a valid selection that simply isn't in the fallback.
  useEffect(() => {
    if (!tenants || !departments.length) return
    if (!departments.includes(viewDepartment)) setViewDepartment(departments[0])
  }, [tenants, departments, viewDepartment, setViewDepartment])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const status = useMemo(() => {
    if (session === undefined) return 'loading'
    if (!session) return 'login'
    if (!profileResolved) return 'loading'
    if (!profile) return 'denied'
    return 'ready'
  }, [session, profileResolved, profile])

  const user = session?.user ?? null
  const isSuperAdmin = profile?.role === 'super_admin'

  // Full name from the SSO profile (Azure populates user_metadata.full_name / name).
  const fullName = useMemo(() => cleanFullName(user), [user])

  // The keyword groups (folders) the current view is scoped to.
  // Super admin: the selected department's groups. Others: their own department's.
  const allowedGroupIds = useMemo(() => {
    if (!profile) return []
    if (isSuperAdmin) return deptGroupsMap[viewDepartment] || []
    return ownGroupIds
  }, [profile, isSuperAdmin, viewDepartment, deptGroupsMap, ownGroupIds])

  // Keyword-level visibility for the current tenant (new model).
  // `allowedKeywordIds`/`keywordGroupMap` are null when tags aren't available,
  // signalling consumers to fall back to the legacy group-based scoping.
  const currentTenantDept = isSuperAdmin ? viewDepartment : (profile?.department ?? null)
  const tenantTags = useMemo(() => {
    if (keywordTenantTags == null) return null
    return keywordTenantTags.filter(t => t.department === currentTenantDept)
  }, [keywordTenantTags, currentTenantDept])

  const allowedKeywordIds = useMemo(
    () => (tenantTags ? tenantTags.map(t => t.keyword_id) : null),
    [tenantTags]
  )
  const keywordGroupMap = useMemo(() => {
    if (!tenantTags) return null
    const m = {}
    for (const t of tenantTags) m[t.keyword_id] = t.group_id
    return m
  }, [tenantTags])

  const value = useMemo(() => ({
    status,
    session,
    user,
    fullName,
    profile,
    department: profile?.department ?? null,
    role: profile?.role ?? null,
    isSuperAdmin,
    allowedGroupIds,
    allowedKeywordIds,
    keywordGroupMap,
    // The tenant whose data is currently on screen — a super admin's selected
    // department, or the user's own. Use this for tenant-scoped UI gating.
    currentDepartment: currentTenantDept,
    // Super admin department switcher
    viewDepartment,
    setViewDepartment,
    departments,          // active tenant names
    tenants,              // full rows (incl. inactive) — Admin → Departments
    refreshTenants,
    refreshGroupAccess,
    signOut,
  }), [status, session, user, fullName, profile, isSuperAdmin, currentTenantDept, allowedGroupIds, allowedKeywordIds, keywordGroupMap, viewDepartment, setViewDepartment, departments, tenants, refreshTenants, refreshGroupAccess, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
