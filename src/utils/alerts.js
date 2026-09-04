/**
 * Alert clustering for the notification bell.
 *
 * The bell used to render every `riskLevel === 'high'` mention ever ingested,
 * one row per article. Infra opened to 41 unread alerts spanning nine months,
 * of which 3 were from the last 30 days — and the 23 June Kulai pile-up
 * accounted for nine of them on its own, because dedup is on `url` and eight
 * outlets syndicated the same crash. A ransomware story naming the company sat
 * at position 28, formatted identically to a lorry collision.
 *
 * So two bounds: a time window, and one alert per *event* rather than per
 * article.
 */

// How far back the bell looks. Deliberately fixed rather than following the
// page date filter — a notification count that moves when you change a chart
// filter is not a notification count.
export const ALERT_WINDOW_DAYS = 30

// Syndicated coverage of one incident lands within a couple of days. Beyond
// that, similar headlines are usually a genuinely recurring event (another
// crash at the same interchange) and deserve their own alert.
const CLUSTER_WINDOW_DAYS = 3

// Overlap coefficient, not Jaccard: headlines for the same story vary wildly in
// length ("Man killed in six-vehicle crash on PLUS near Kulai" vs "One killed in
// six-vehicle pile-up on NSE near Kulai" scores 0.45 on Jaccard but 0.63 here).
// Set high enough that distinct incidents stay apart — under-merging is a
// cosmetic loss, over-merging hides an event entirely.
const SIMILARITY_THRESHOLD = 0.5

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'after', 'over', 'into',
  'their', 'they', 'has', 'have', 'was', 'were', 'are', 'its', 'his', 'her',
  'but', 'not', 'all', 'out', 'who', 'how', 'why', 'new', 'says', 'said',
  'watch', 'video', 'update', 'breaking', 'report', 'reports',
])

const DAY_MS = 24 * 60 * 60 * 1000

/** Significant words in a headline, deduped. Short tokens carry no signal. */
const tokenize = (text) => {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
    // Crude singularisation. One outlet writes "6-vehicle crash", the next
    // "multiple vehicles catch fire" — without this they share two tokens
    // instead of three and the same pile-up splits into two alerts.
    .map(w => (w.length > 3 ? w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1') : w))
  return new Set(words)
}

/** |A ∩ B| / min(|A|,|B|) — tolerant of one headline being much longer. */
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / Math.min(a.size, b.size)
}

/**
 * Group high-risk mentions from the last `windowDays` into one entry per event.
 *
 * Returns clusters newest first, each `{ id, lead, members, ids, outletCount }`
 * where `lead` is the most recent article and `ids` covers every article in the
 * cluster — read state applies to the event, so acknowledging one outlet's
 * version acknowledges all of them.
 */
export const buildAlertClusters = (mentions, { windowDays = ALERT_WINDOW_DAYS, now = Date.now() } = {}) => {
  const cutoff = now - windowDays * DAY_MS

  const recent = (mentions || [])
    .filter(m => m.riskLevel === 'high' && !m.excluded)
    .map(m => ({ mention: m, at: new Date(m.publishedAt).getTime() }))
    .filter(({ at }) => Number.isFinite(at) && at >= cutoff)
    .sort((a, b) => b.at - a.at)

  const clusters = []

  for (const { mention, at } of recent) {
    const tokens = tokenize(mention.text)
    const home = clusters.find(c =>
      Math.abs(c.at - at) <= CLUSTER_WINDOW_DAYS * DAY_MS &&
      overlap(c.tokens, tokens) >= SIMILARITY_THRESHOLD
    )

    if (home) {
      home.members.push(mention)
    } else {
      clusters.push({ at, tokens, lead: mention, members: [mention] })
    }
  }

  return clusters.map(({ lead, members }) => ({
    id: lead.id,
    lead,
    members,
    ids: members.map(m => m.id),
    outletCount: members.length,
  }))
}

/**
 * High-risk mentions the window is hiding.
 *
 * The 30-day bound is what took Infra from 41 unread to 3, but a filter with no
 * visible trace of what it removed is indistinguishable from data loss — and
 * "Show completed" cannot answer it, because these are not completed, they are
 * out of window. The bell shows this count and links to the full list.
 */
export const countOlderAlerts = (mentions, { windowDays = ALERT_WINDOW_DAYS, now = Date.now() } = {}) => {
  const cutoff = now - windowDays * DAY_MS
  return (mentions || []).filter(m => {
    if (m.riskLevel !== 'high' || m.excluded) return false
    const at = new Date(m.publishedAt).getTime()
    return Number.isFinite(at) && at < cutoff
  }).length
}
