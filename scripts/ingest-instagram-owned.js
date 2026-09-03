#!/usr/bin/env node
/**
 * Instagram OWNED-account ingest — our own uemedgenta posts + engagement.
 *
 * This is NOT a mentions source. Rows land in `social_posts`, never in
 * `mentions`, so owned content can't inflate mention counts.
 *
 * Run: node scripts/ingest-instagram-owned.js [--months 12] [--all] [--dry]
 *
 * Notes for whoever touches this next:
 *  - Insights are requested INLINE on the media edge
 *    (`insights.metric(...)`), not per-post. That turns a 12-month pull from
 *    ~300 requests into ~8, which matters against Instagram's hourly cap.
 *  - `impressions` no longer exists; the live metrics are
 *    reach / saved / shares / total_interactions / views.
 *  - Posts published before the account became a business account cannot carry
 *    insights at all. Because insights are inline, such a post fails its whole
 *    page — the walk drops to metadata-only rather than aborting the run.
 *  - Comment BODIES are not fetched. The API returns `comments_count` but
 *    withholds the comments themselves while the Meta app has Standard
 *    Access only. `/{media}/comments` answers 200 with an empty array AND
 *    paging cursors — cursors on an empty array mean "filtered", not "none".
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.join(__dirname, '..', '.env')

// Minimal .env loader so this runs standalone like the other ingest scripts.
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const IG_TOKEN     = process.env.IG_ACCESS_TOKEN

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
if (!IG_TOKEN) { console.error('Missing IG_ACCESS_TOKEN — see .env'); process.exit(1) }

const API = 'https://graph.instagram.com/v26.0'
const PLATFORM = 'instagram'

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const ALL = args.includes('--all')
const MONTHS = (() => {
  const i = args.indexOf('--months')
  return i >= 0 ? Number(args[i + 1]) || 12 : 12
})()

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })

const BASE_FIELDS = [
  'id', 'caption', 'media_type', 'media_product_type', 'media_url',
  'thumbnail_url', 'permalink', 'timestamp', 'like_count', 'comments_count',
]
const INSIGHTS_FIELD = 'insights.metric(reach,saved,shares,total_interactions,views)'

const fieldList = (withInsights) =>
  (withInsights ? [...BASE_FIELDS, INSIGHTS_FIELD] : BASE_FIELDS).join(',')

// ---------------------------------------------------------------------------
// Token upkeep. Long-lived tokens last 60 days and can be refreshed once they
// are at least 24h old — so refresh on every run and the token never expires
// as long as ingest keeps running.
// ---------------------------------------------------------------------------
const refreshToken = async () => {
  const url = `${API.replace('/v26.0', '')}/refresh_access_token`
    + `?grant_type=ig_refresh_token&access_token=${IG_TOKEN}`
  try {
    const r = await fetch(url)
    const d = await r.json()
    if (d.error || !d.access_token) {
      console.warn('[token] refresh skipped:', d.error?.message || 'no token returned')
      return null
    }
    const expires = new Date(Date.now() + d.expires_in * 1000).toISOString()
    if (!DRY) writeEnv({ IG_ACCESS_TOKEN: d.access_token, IG_TOKEN_EXPIRES: expires })
    console.log(`[token] refreshed — valid until ${expires.slice(0, 10)}`
      + (DRY ? ' (dry run — not written to .env)' : ''))
    return d.access_token
  } catch (e) {
    console.warn('[token] refresh failed:', e.message)
    return null
  }
}

// Rewrites only the given keys in .env, leaving everything else byte-identical.
const writeEnv = (updates) => {
  if (!fs.existsSync(ENV_PATH)) return
  let src = fs.readFileSync(ENV_PATH, 'utf8')
  for (const [k, v] of Object.entries(updates)) {
    src = new RegExp(`^${k}=.*$`, 'm').test(src)
      ? src.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`)
      : `${src.replace(/\n*$/, '\n')}${k}=${v}\n`
  }
  fs.writeFileSync(ENV_PATH, src)
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
const insightValue = (post, name) => {
  const row = (post.insights?.data || []).find(i => i.name === name)
  return row?.values?.[0]?.value ?? 0
}

const toRow = (p) => ({
  id: `${PLATFORM}:${p.id}`,
  platform: PLATFORM,
  account_handle: 'uemedgenta',
  native_id: p.id,
  // REELS come back as media_type VIDEO; the product type is the useful label.
  post_type: p.media_product_type === 'REELS' ? 'REEL' : p.media_type,
  caption: p.caption || null,
  permalink: p.permalink || null,
  // Instagram CDN URLs are signed and expire after a few weeks. They are
  // stored so the feed has something to render immediately, but the feed must
  // tolerate a dead image — re-running ingest refreshes them.
  media_url: p.media_url || null,
  thumbnail_url: p.thumbnail_url || p.media_url || null,
  published_at: p.timestamp,
  likes: p.like_count ?? 0,
  comments_count: p.comments_count ?? 0,
  shares: insightValue(p, 'shares'),
  saves: insightValue(p, 'saved'),
  reach: insightValue(p, 'reach'),
  impressions: 0, // retired by Meta — kept nullable for older/other platforms
  video_views: insightValue(p, 'views'),
  raw: p,
  ingested_at: new Date().toISOString(),
})

const getJson = (url) => fetch(url).then(r => r.json())

/**
 * Walk /me/media newest-first.
 *
 * Two things this has to survive on a full-history pull:
 *
 *  1. Insights are requested INLINE, so a single post that cannot carry them
 *     fails the WHOLE page. Media published before the account was converted
 *     from personal to business is exactly that case (error code 100), and it
 *     is where a `--all` run lands after ~1,100 posts. When a page fails we
 *     retry it without the insights field; if that works, insights were the
 *     problem and everything older is pre-conversion too, so we stay in
 *     metadata-only mode for the rest of the walk.
 *  2. A genuine failure must not throw away the pages we already hold. We
 *     return what we have plus the error, and the caller saves and reports it.
 *
 * Paging is driven by the `after` cursor rather than `paging.next`, because the
 * next URL bakes in the old field list and we need to be able to change it.
 */
const fetchPosts = async (token) => {
  const cutoff = ALL ? null : new Date(Date.now() - MONTHS * 30.44 * 864e5)
  const rows = []
  let cursor = null
  let withInsights = true
  let insightsLostAt = null
  let page = 0
  let failure = null

  const pageUrl = (after) =>
    `${API}/me/media?fields=${fieldList(withInsights)}&limit=50&access_token=${token}`
    + (after ? `&after=${encodeURIComponent(after)}` : '')

  while (true) {
    let d = await getJson(pageUrl(cursor))

    if (d.error && withInsights) {
      const retry = await getJson(pageUrl(cursor).replace(fieldList(true), fieldList(false)))
      if (!retry.error) {
        withInsights = false
        insightsLostAt = rows.length
        process.stdout.write(
          `\n[insights] unavailable from post ${rows.length + 1} on `
          + `(${d.error.message}) — continuing without engagement metrics\n`
        )
        d = retry
      }
    }

    if (d.error) {
      failure = `${d.error.message} (code ${d.error.code})`
      break
    }

    page++
    let reachedCutoff = false
    for (const p of d.data || []) {
      if (cutoff && new Date(p.timestamp) < cutoff) { reachedCutoff = true; break }
      rows.push(toRow(p))
    }
    process.stdout.write(`\r[fetch] page ${page} · ${rows.length} posts`)
    if (reachedCutoff) break

    cursor = d.paging?.cursors?.after || null
    if (!cursor || !d.paging?.next) break
  }
  process.stdout.write('\n')
  return { rows, failure, insightsLostAt }
}

// ---------------------------------------------------------------------------
const save = async (rows) => {
  let saved = 0
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await supabase.from('social_posts').upsert(chunk, { onConflict: 'id' })
    if (error) { console.error('[save] chunk failed:', error.message); continue }
    saved += chunk.length
  }
  return saved
}

const run = async () => {
  const scope = ALL ? 'all history' : `last ${MONTHS} months`
  console.log(`\nInstagram owned-account ingest — ${scope}${DRY ? ' (dry run)' : ''}\n`)

  const token = (await refreshToken()) || IG_TOKEN

  const me = await fetch(`${API}/me?fields=username,media_count&access_token=${token}`).then(r => r.json())
  if (me.error) { console.error('Token rejected:', me.error.message); process.exit(1) }
  console.log(`[account] @${me.username} · ${me.media_count} posts total\n`)

  const { rows, failure, insightsLostAt } = await fetchPosts(token)
  if (!rows.length) {
    console.log(failure ? `No posts fetched — ${failure}` : 'No posts in range.')
    process.exit(failure ? 1 : 0)
  }
  if (failure) {
    console.warn(`\n[warn] paging stopped early — ${failure}`)
    console.warn('       saving the posts fetched before that point.')
  }
  if (insightsLostAt !== null) {
    console.log(`[insights] ${rows.length - insightsLostAt} of ${rows.length} posts `
      + 'predate the business-account conversion and carry no engagement metrics.')
  }

  const totalLikes = rows.reduce((s, r) => s + r.likes, 0)
  const totalComments = rows.reduce((s, r) => s + r.comments_count, 0)
  const totalReach = rows.reduce((s, r) => s + r.reach, 0)

  console.log(`\n[summary] ${rows.length} posts`)
  console.log(`          ${rows[rows.length - 1].published_at.slice(0, 10)} → ${rows[0].published_at.slice(0, 10)}`)
  console.log(`          ${totalLikes.toLocaleString()} likes · ${totalComments.toLocaleString()} comments · ${totalReach.toLocaleString()} reach`)

  if (DRY) {
    console.log('\n[dry] nothing written. Sample row:')
    console.log(JSON.stringify({ ...rows[0], raw: '…' }, null, 2))
    return
  }

  const saved = await save(rows)
  console.log(`\n[done] ${saved}/${rows.length} posts upserted into social_posts\n`)
  if (failure) process.exit(1)
}

run().catch(e => { console.error('\nFailed:', e.message); process.exit(1) })
