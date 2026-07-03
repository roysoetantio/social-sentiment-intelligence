import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// ⚠️ DEV-ONLY auth bypass (temporary). Never set VITE_DEV_NO_AUTH in production.
const DEV_NO_AUTH = import.meta.env.VITE_DEV_NO_AUTH === 'true'

// The departments a user can belong to / a super admin can view.
export const DEPARTMENTS = ['CCD', 'Infra']

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

  // Super admin: which department's data is currently being viewed (always a real dept)
  const [viewDepartment, setViewDepartmentState] = useState(() => {
    const stored = localStorage.getItem('view_department')
    return DEPARTMENTS.includes(stored) ? stored : DEPARTMENTS[0]
  })
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
  // Entra often appends a " - <Company>" org suffix to the display name — strip it.
  const fullName = useMemo(() => {
    const m = user?.user_metadata || {}
    const raw =
      m.full_name ||
      m.name ||
      m.preferred_username ||
      (user?.email ? user.email.split('@')[0] : '')
    return raw.split(' - ')[0].trim()
  }, [user])

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
    // Super admin department switcher
    viewDepartment,
    setViewDepartment,
    departments: DEPARTMENTS,
    refreshGroupAccess,
    signOut,
  }), [status, session, user, fullName, profile, isSuperAdmin, allowedGroupIds, allowedKeywordIds, keywordGroupMap, viewDepartment, setViewDepartment, refreshGroupAccess, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
