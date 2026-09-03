#!/usr/bin/env node
/**
 * Facebook OWNED-page ingest — our own Page posts + engagement.
 *
 * Same contract as ingest-instagram-owned.js: rows land in `social_posts`,
 * never in `mentions`, so owned content can't inflate mention counts.
 *
 * Run: node scripts/ingest-facebook-owned.js [--months 12] [--all] [--dry]
 *
 * Notes for whoever touches this next:
 *  - FB_PAGE_TOKEN does NOT expire (it is derived from a long-lived user
 *    token), so unlike Instagram there is no refresh step here. Regenerate it
 *    with scripts/fb-setup.js if the Page or its permissions change.
 *  - Comment BODIES *are* readable on Facebook — unlike Instagram, a Page owns
 *    the comments on its own posts, so Development mode does not filter them.
 *    They are deliberately NOT pulled here: this table is post performance
 *    only. Comment text belongs in `mentions`, same split as Instagram.
 *  - `reach` / `impressions` / `video_views` need the `read_insights`
 *    permission, which the app does not currently hold. Without it the
 *    insights edge answers 200 with an EMPTY data array and no error — the
 *    same "silence means denied" pattern as Instagram's comments. Rows are
 *    written with reach 0 and the feed hides reach-based stats when every post
 *    reports zero. Add read_insights and set FB_INSIGHTS=1 to switch it on.
 *  - `likes` stores the TOTAL REACTION count, not the bare like count. That is
 *    the number Facebook itself shows under a post, so it is what a reader
 *    comparing the dashboard to the page will expect. The exact breakdown
 *    survives in `raw`.
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
const PAGE_ID  = process.env.FB_PAGE_ID
const PAGE_TOK = process.env.FB_PAGE_TOKEN
const WANT_INSIGHTS = process.env.FB_INSIGHTS === '1'

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
if (!PAGE_ID || !PAGE_TOK) {
  console.error('Missing FB_PAGE_ID / FB_PAGE_TOKEN — run: node scripts/fb-setup.js')
  process.exit(1)
}

const API = 'https://graph.facebook.com/v26.0'
const PLATFORM = 'facebook'

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const ALL = args.includes('--all')
const MONTHS = (() => {
  const i = args.indexOf('--months')
  return i >= 0 ? Number(args[i + 1]) || 12 : 12
})()

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
const getJson = (url) => fetch(url).then(r => r.json())

const q = (path, params) => {
  const u = new URL(`${API}/${path}`)
  Object.entries({ ...params, access_token: PAGE_TOK }).forEach(([k, v]) => u.searchParams.set(k, v))
  return u.toString()
}

const POST_FIELDS = [
  'id', 'created_time', 'message', 'story', 'permalink_url', 'full_picture',
  'status_type',
  'attachments{media_type,type,title,url}',
  'shares',
  'comments.summary(true).limit(0)',
  'reactions.summary(true).limit(0)',
  'likes.summary(true).limit(0)',
  // Only valid once read_insights is granted; an ungranted metric here returns
  // an empty edge rather than failing the request, but keep it opt-in so a
  // future metric rename can't take the whole walk down with it.
  ...(WANT_INSIGHTS ? ['insights.metric(post_clicks,post_video_views)'] : []),
].join(',')

/** Facebook's shape vocabulary → the post_type values the feed already knows. */
const postType = (p) => {
  const a = p.attachments?.data?.[0]
  const media = a?.media_type || a?.type || ''
  if (/album/i.test(media) || /added_photos/i.test(p.status_type || '')) {
    return a?.subattachments || /album/i.test(media) ? 'CAROUSEL_ALBUM' : 'IMAGE'
  }
  if (/video/i.test(media)) return 'VIDEO'
  if (/photo|image/i.test(media)) return 'IMAGE'
  if (/link|share/i.test(media)) return 'LINK'
  return 'STATUS'
}

const insightValue = (p, name) => {
  const row = (p.insights?.data || []).find(i => i.name === name)
  const v = row?.values?.[0]?.value
  return typeof v === 'number' ? v : 0
}

const toRow = (p, handle) => ({
  id: `${PLATFORM}:${p.id}`,
  platform: PLATFORM,
  account_handle: handle,
  native_id: p.id,
  post_type: postType(p),
  // A shared/auto-generated post has no `message` but does have a `story`
  // ("X shared a link"). Falling back keeps the card from reading as blank.
  caption: p.message || p.story || null,
  permalink: p.permalink_url || null,
  media_url: p.full_picture || null,
  thumbnail_url: p.full_picture || null,
  published_at: p.created_time,
  likes: p.reactions?.summary?.total_count ?? p.likes?.summary?.total_count ?? 0,
  comments_count: p.comments?.summary?.total_count ?? 0,
  shares: p.shares?.count ?? 0,
  saves: 0,               // Facebook has no public saves metric
  reach: 0,               // needs read_insights — see header note
  impressions: 0,
  video_views: WANT_INSIGHTS ? insightValue(p, 'post_video_views') : 0,
  raw: p,
  ingested_at: new Date().toISOString(),
})

/** Walk /{page}/posts newest-first, stopping at the cutoff. */
const fetchPosts = async (cutoff) => {
  const rows = []
  let url = q(`${PAGE_ID}/posts`, { fields: POST_FIELDS, limit: 100 })
  let pages = 0

  while (url && pages < 100) {
    const d = await getJson(url)
    if (d.error) {
      console.error(`\n[fetch] ${d.error.message}`)
      break
    }
    const batch = d.data || []
    if (!batch.length) break

    let stop = false
    for (const p of batch) {
      if (cutoff && new Date(p.created_time) < cutoff) { stop = true; break }
      rows.push(p)
    }
    process.stdout.write(`\r  fetched ${rows.length} posts…`)
    if (stop) break

    url = d.paging?.next || null
    pages++
  }
  process.stdout.write('\n')
  return rows
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
  console.log(`\nFacebook owned-page ingest — ${scope}${DRY ? ' (dry run)' : ''}\n`)

  const page = await getJson(q(PAGE_ID, { fields: 'name,username,fan_count' }))
  if (page.error) { console.error(`[page] ${page.error.message}`); process.exit(1) }
  // Fall back to the numeric id: a Page without a vanity handle still needs a
  // stable value here, and the feed builds its profile link from it.
  const handle = page.username || PAGE_ID
  console.log(`  page   : ${page.name} (@${handle}) · ${page.fan_count ?? '?'} followers`)
  if (!WANT_INSIGHTS) console.log('  note   : reach/views skipped — needs read_insights (see header)')

  const cutoff = ALL ? null : new Date(Date.now() - MONTHS * 30 * 24 * 3600 * 1000)
  const raw = await fetchPosts(cutoff)
  const rows = raw.map(p => toRow(p, handle))

  if (!rows.length) { console.log('\n  nothing to save\n'); return }

  const totals = rows.reduce((t, r) => ({
    likes: t.likes + r.likes, comments: t.comments + r.comments_count, shares: t.shares + r.shares,
  }), { likes: 0, comments: 0, shares: 0 })

  console.log(`\n  posts  : ${rows.length}`)
  console.log(`  range  : ${rows.at(-1).published_at.slice(0, 10)} → ${rows[0].published_at.slice(0, 10)}`)
  console.log(`  totals : ${totals.likes} reactions · ${totals.comments} comments · ${totals.shares} shares`)

  if (DRY) {
    console.log('\n  (dry run — nothing written)\n')
    console.table(rows.slice(0, 10).map(r => ({
      date: r.published_at.slice(0, 10), type: r.post_type,
      likes: r.likes, comments: r.comments_count, shares: r.shares,
      caption: (r.caption || '').replace(/\s+/g, ' ').slice(0, 40),
    })))
    return
  }

  const saved = await save(rows)
  console.log(`\n[done] ${saved}/${rows.length} posts upserted into social_posts\n`)
}

run().catch(e => { console.error(e); process.exit(1) })
