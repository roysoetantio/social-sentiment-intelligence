import { supabase } from '../lib/supabase'

/**
 * Notification state, read from and written to Supabase rather than the browser.
 *
 * The bell's read marks used to live in `localStorage`, which is per-BROWSER —
 * a colleague's first login re-showed everything, the same person on a phone saw
 * it twice, and a private cache can never answer "has anyone dealt with this?".
 *
 * Three facts, deliberately separate (see migration 008):
 *   viewed  — per person, permanent; what the avatar cluster draws.
 *   read    — per tenant; drives the badge. Set by whoever looks first.
 *   handled — per tenant, explicit, high-risk only.
 *
 * Every write goes through a SECURITY DEFINER function that checks the caller
 * may act on that department, so a tenant cannot mark another tenant's alerts.
 */

// How far back the avatar trail is loaded. Comfortably wider than the bell's
// 30-day alert window so a long-open review item still shows who looked at it.
const VIEW_TRAIL_DAYS = 120

/** Tenant read/handled state plus the per-person view trail, for one department. */
export const fetchAlertState = async (department) => {
  const empty = { readIds: new Set(), handledIds: new Set(), states: new Map(), viewers: new Map() }
  if (!department) return empty

  const [stateRes, viewsRes] = await Promise.all([
    supabase.from('mention_alert_state')
      .select('mention_id, read_at, read_by, handled_at, handled_by')
      .eq('department', department),
    // Bounded deliberately: only rows the bell can actually render need faces,
    // and this table grows with every click forever.
    supabase.from('mention_views')
      .select('mention_id, user_email, first_viewed_at')
      .gte('first_viewed_at', new Date(Date.now() - VIEW_TRAIL_DAYS * 86400000).toISOString())
      // Newest first under the cap: if it is ever hit, the rows worth losing are
      // the old ones, not the views on the alerts currently on screen. The
      // per-mention ordering is redone in JS below.
      .order('first_viewed_at', { ascending: false })
      .limit(5000),
  ])

  if (stateRes.error && viewsRes.error) return empty

  // `states` carries who and when, not just whether — the row footer says
  // "Handled by <name> · <date>", and a Set cannot answer that.
  const readIds = new Set()
  const handledIds = new Set()
  const states = new Map()
  for (const row of stateRes.data || []) {
    states.set(row.mention_id, row)
    if (row.read_at) readIds.add(row.mention_id)
    if (row.handled_at) handledIds.add(row.mention_id)
  }

  // mention_id → [{ email, at }], oldest first: the cluster shows who got there
  // before you, and "first viewed" is the fact the trail records.
  const viewers = new Map()
  const rows = [...(viewsRes.data || [])].sort(
    (a, b) => new Date(a.first_viewed_at) - new Date(b.first_viewed_at)
  )
  for (const row of rows) {
    const list = viewers.get(row.mention_id) || []
    list.push({ email: row.user_email, at: row.first_viewed_at })
    viewers.set(row.mention_id, list)
  }

  return { readIds, handledIds, states, viewers }
}

/**
 * Every write reports failure rather than swallowing it. The UI updates
 * optimistically, so a silently dropped write would leave someone believing an
 * alert was acknowledged when the database never heard about it — the one
 * failure mode a notification system must not have.
 */
const write = async (fn, args, label) => {
  const { error } = await supabase.rpc(fn, args)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[notifications] ${label} failed:`, error.message)
    return false
  }
  return true
}

/**
 * Opening an alert: stamps your face on every article in the cluster and marks
 * the event read for the whole tenant.
 */
export const markViewed = (ids, department) =>
  write('mark_mentions_viewed', { p_ids: ids, p_department: department }, 'mark viewed')

export const setHandled = (id, department, handled) =>
  write('set_alert_handled', { p_id: id, p_department: department, p_handled: handled }, 'set handled')

/** Everyone this user is allowed to see a face for, keyed by email. */
export const fetchDirectory = async () => {
  const { data, error } = await supabase.rpc('list_directory_avatars')
  if (error) return new Map()
  return new Map((data || []).map(u => [u.email, u]))
}

/**
 * Review items for one tenant, newest first, with their mention joined.
 *
 * Resolved rows come back too — the bell's "Show completed" needs them, and the
 * volume is trivially small (a handful per tenant, ever). Filtering happens in
 * the UI so ticking the box does not need a round trip.
 */
export const fetchReviewQueue = async (department) => {
  if (!department) return []
  const { data, error } = await supabase
    .from('review_queue')
    .select('id, mention_id, reason, needed, raised_at, resolved_at, resolved_by, mentions(text, url, published_at, risk_level, source)')
    .eq('department', department)
    .order('raised_at', { ascending: false })
  if (error) return []
  return (data || []).map(r => ({ ...r, mention: r.mentions || null }))
}

export const resolveReviewItem = (id, resolution) =>
  write('resolve_review_item', { p_id: id, p_resolution: resolution }, 'resolve review item')

/**
 * Reopen one review item.
 *
 * Only the queue row: the decision itself is recorded on the mention by the
 * analyst panel, and a `mentions` trigger closes matching rows when it lands —
 * so nothing here needs to write, or unwrite, that.
 */
export const undoReviewItem = (id) =>
  write('unresolve_review_item', { p_id: id }, 'reopen review item')
