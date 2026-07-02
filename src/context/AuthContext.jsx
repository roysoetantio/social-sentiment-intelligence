import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

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

  // Group access data
  const [ownGroupIds, setOwnGroupIds] = useState([])    // non-super users: their dept's groups
  const [deptGroupsMap, setDeptGroupsMap] = useState({}) // super admin: dept → [group_ids]

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

      setProfileResolved(true)
    }

    resolve()
    return () => { cancelled = true }
  }, [session])

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

  // The keyword groups the current view is scoped to.
  // Super admin: the selected department's groups. Others: their own department's.
  const allowedGroupIds = useMemo(() => {
    if (!profile) return []
    if (isSuperAdmin) return deptGroupsMap[viewDepartment] || []
    return ownGroupIds
  }, [profile, isSuperAdmin, viewDepartment, deptGroupsMap, ownGroupIds])

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
    // Super admin department switcher
    viewDepartment,
    setViewDepartment,
    departments: DEPARTMENTS,
    signOut,
  }), [status, session, user, fullName, profile, isSuperAdmin, allowedGroupIds, viewDepartment, setViewDepartment, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
