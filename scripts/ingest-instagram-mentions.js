#!/usr/bin/env node
/**
 * Instagram → `mentions`: comments on our posts, and posts that @-tag us.
 *
 * Two sources, both third-party content ABOUT us (unlike
 * `ingest-instagram-owned.js`, which stores our own posts in `social_posts`):
 *
 *   instagram_comments — comments people leave on @uemedgenta posts
 *   instagram_tags     — posts by other accounts that @-tagged @uemedgenta
 *
 * Run: node scripts/ingest-instagram-mentions.js [--months 12] [--dry]
 *
 * SCOPE RULE: the `keywords` and `blacklist` tables define what this script may
 * save. Nothing here hardcodes a brand name, keyword id or owned handle — add
 * those in Keyword Manager and the blacklist table instead. An @-tag is matched
 * because the account handle is an ALIAS on a keyword, so widening coverage is
 * a config change, never a code change.
 *
 * REQUIRES THE META APP TO BE IN **LIVE** MODE. In Development mode both
 * endpoints answer 200 with `data: []` plus paging cursors — cursors on an
 * empty array mean "filtered", not "none". If this script suddenly returns
 * nothing, check the app mode before debugging permissions.
 *
 * SENTIMENT: AFINN is written here only as a provisional baseline. It is an
 * English-word lexicon and these comments are emoji-heavy and roughly half
 * Malay, so it mislabels most of them — "😍😍😍" and "Sangat membantu" both
 * score neutral. Rows are therefore written with `sentiment_confidence: 0.3`
 * and picked up by the Claude re-scoring pass (Step 2B of the monitoring
 * routine), which reads Malay and emoji and writes the real label plus an
 * English gloss into `full_text`.
 */

import { createClient } from '@supabase/supabase-js'
import Sentiment from 'sentiment'
import ws from 'ws'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreText, detectLanguage, isEmojiOnly } from './lib/sentiment-extras.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.join(__dirname, '..', '.env')

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

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const MONTHS = (() => {
  const i = args.indexOf('--months')
  return i >= 0 ? Number(args[i + 1]) || 12 : 12
})()

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })
const sentiment = new Sentiment()
const j = (u) => fetch(u).then(r => r.json())

/* ------------------------------------------------------------------ *
 * Scope: keywords + blacklist, loaded from the database
 * ------------------------------------------------------------------ */

const loadKeywords = async () => {
  const { data, error } = await supabase
    .from('keywords')
    .select('id, term, aliases, group_id')
    .eq('is_active', true)
  if (error) throw new Error(`keywords: ${error.message}`)
  if (!data?.length) throw new Error('No active keywords — nothing is in scope. Add them in Keyword Manager.')
  return data.map(k => ({
    ...k,
    // Longest first so "UEM Edgenta Berhad" wins over "Edgenta" when labelling.
    terms: [k.term, ...(k.aliases || [])]
      .filter(Boolean)
      .map(t => t.toLowerCase())
      .sort((a, b) => b.length - a.length),
  }))
}

/**
 * The blacklist stores domains. Instagram gives us handles, so derive the
 * handle forms from the `owned` rows: "uemedgenta.com" → "uemedgenta",
 * "instagram.com/uemgroup" → "uemgroup". Add new ones to the blacklist table,
 * never to this file.
 */
const loadBlockedHandles = async () => {
  const { data, error } = await supabase.from('blacklist').select('domain, reason')
  if (error) throw new Error(`blacklist: ${error.message}`)
  const handles = new Set()
  for (const row of data || []) {
    const d = (row.domain || '').toLowerCase().trim()
    if (!d) continue
    if (d.includes('/')) {
      handles.add(d.split('/').pop())            // instagram.com/uemgroup → uemgroup
    } else if (row.reason === 'owned') {
      handles.add(d.split('.')[0])               // uemedgenta.com → uemedgenta
      handles.add(d.replace(/\./g, ''))          // uem.com.my → uemcommy
    }
  }
  handles.delete('')
  return handles
}

/** Keyword IDs whose term or any alias appears in the text. */
const matchKeywords = (text, keywords) => {
  const t = (text || '').toLowerCase()
  if (!t) return []
  return keywords.filter(k => k.terms.some(term => t.includes(term))).map(k => k.id)
}

/* ------------------------------------------------------------------ */

// AFINN plus the emoji + Malay lexicons in lib/sentiment-extras.js. Measured
// against Claude-verified labels on this account's comments, plain AFINN agreed
// 74% of the time and this agrees 86%. Still provisional — see the SENTIMENT
// note in the file header; the remaining misses need context, not vocabulary.
const baselineSentiment = (text) => scoreText(sentiment, text)

// Same vocabulary as guessMentionType() in ingest.js so the type filter keeps working.
const guessMentionType = (text) => {
  const t = (text || '').toLowerCase()
  if (t.match(/complaint|complain|issue|problem|broken|fail/)) return 'complaint'
  if (t.match(/award|win|achiev|congrat|tahniah|excellent|best|proud/)) return 'praise'
  if (t.match(/\?|how|what|why|when|where/)) return 'question'
  return 'news'
}

// Written on every new row; also the sentinel meaning "AFINN only, not yet
// judged by Claude". Step 2B selects on it, and preserveRescored() treats any
// other value as a decision worth keeping.
const BASELINE_CONFIDENCE = 0.3

const HIGH_RISK = /killed|kill|fatal|fatalit|died|death|dead|murder|suicide|tragedy|tragic|disaster|collapse|explosion|fire|bankrupt|lawsuit|fraud|scandal|corruption|arrest|charged|convict|criminal/i

const riskLevel = (label, score, text) => {
  if (label !== 'negative') return null
  if (HIGH_RISK.test(text || '') || score <= -0.8) return 'high'
  if (score <= -0.3) return 'medium'
  return 'low'
}

/* ------------------------------------------------------------------ */

const fetchOwnPosts = async () => {
  const cutoff = new Date(Date.now() - MONTHS * 30.44 * 864e5)
  let url = `${API}/me/media?fields=id,caption,permalink,timestamp,comments_count&limit=50&access_token=${IG_TOKEN}`
  const posts = []
  while (url) {
    const r = await j(url)
    if (r.error) throw new Error(`media: ${r.error.message}`)
    let done = false
    for (const p of r.data || []) {
      if (new Date(p.timestamp) < cutoff) { done = true; break }
      posts.push(p)
    }
    if (done) break
    url = r.paging?.next || null
  }
  return posts
}

/**
 * The keyword(s) that claim our own Instagram handle as a term or alias.
 * Appearing on /me/tags means the post tagged this account, and a comment sits
 * on this account's post — in both cases the account itself is the match, and
 * which keyword owns it is config, not code.
 */
const keywordsForOwnHandle = (handle, keywords) => matchKeywords(handle, keywords)

const fetchComments = async (posts, keywords, ownHandleIds) => {
  const rows = []
  const withComments = posts.filter(p => p.comments_count > 0)
  let i = 0
  for (const post of withComments) {
    i++
    process.stdout.write(`\r[comments] post ${i}/${withComments.length} · ${rows.length} comments`)

    // A comment never contains the brand name — nobody writes "UEM Edgenta"
    // when replying to UEM Edgenta's own post. So the comment inherits the
    // keywords matched in its parent post's caption, which is what decides
    // which tenant sees it. A caption that names no keyword still sits on our
    // account, so fall back to whichever keyword claims the handle.
    const captionIds = matchKeywords(post.caption, keywords)
    const inherited = captionIds.length ? captionIds : ownHandleIds

    let url = `${API}/${post.id}/comments`
      + `?fields=id,text,timestamp,like_count,from{id,username},replies{id,text,timestamp,like_count,from{id,username}}`
      + `&limit=50&access_token=${IG_TOKEN}`
    while (url) {
      const r = await j(url)
      if (r.error) { console.warn(`\n  skip ${post.id}: ${r.error.message}`); break }
      for (const c of r.data || []) {
        rows.push(commentToMention(c, post, inherited))
        // Replies are separate opinions and deserve their own row.
        for (const rep of c.replies?.data || []) rows.push(commentToMention(rep, post, inherited, c.id))
      }
      url = r.paging?.next || null
    }
  }
  process.stdout.write('\n')
  return rows
}

const commentToMention = (c, post, keywordIds, parentId = null) => {
  const text = (c.text || '').trim()
  const handle = c.from?.username || null
  const s = baselineSentiment(text)
  return {
    // Comment ids are globally unique; the url must be too (upsert key).
    url: `${post.permalink}#comment-${c.id}`,
    text: text.slice(0, 500) || '(no text)',
    full_text: null,          // Claude pass writes the English gloss here
    platform: 'Instagram',
    author_name: handle,
    author_handle: handle,
    published_at: c.timestamp,
    keyword_matched: keywordIds,
    topics: ['Social'],
    sentiment_label: s.label,
    sentiment_score: s.score,
    // Low on purpose — flags the row for the Claude re-scoring pass.
    sentiment_confidence: BASELINE_CONFIDENCE,
    risk_level: riskLevel(s.label, s.score, text),
    risk_flag: false,
    engagement_likes: c.like_count ?? 0,
    language: s.language,
    mention_type: guessMentionType(text),
    source: 'instagram_comments',
    is_competitor: false,
    analyst_excluded: false,
    date_fixed: true,         // timestamps come straight from the API
    status: 'new',
  }
}

const fetchTaggedPosts = async (keywords, blocked, ownHandleIds) => {
  const cutoff = new Date(Date.now() - MONTHS * 30.44 * 864e5)
  let url = `${API}/me/tags`
    + `?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count,username`
    + `&limit=50&access_token=${IG_TOKEN}`
  const rows = []
  let skippedOwn = 0
  const unmatched = []

  while (url) {
    const r = await j(url)
    if (r.error) throw new Error(`tags: ${r.error.message}`)
    let done = false
    for (const p of r.data || []) {
      if (new Date(p.timestamp) < cutoff) { done = true; break }

      const handle = (p.username || '').toLowerCase()
      if (blocked.has(handle)) { skippedOwn++; continue }

      const caption = (p.caption || '').trim()
      // Being on /me/tags means this post @-tagged our account. The tag lives
      // in post metadata, not the caption text, so caption matching alone
      // misses it — union the caption's keywords with the handle's.
      const matched = [...new Set([...matchKeywords(caption, keywords), ...ownHandleIds])]
      if (!matched.length) {
        // No keyword claims our handle and the caption names none either, so
        // this is genuinely out of scope. Report it rather than guessing.
        unmatched.push({ handle, permalink: p.permalink, caption: caption.slice(0, 80) })
        continue
      }

      const s = baselineSentiment(caption)
      rows.push({
        url: p.permalink,
        text: caption.slice(0, 500) || '(no caption)',
        full_text: caption || null,
        platform: 'Instagram',
        author_name: p.username || null,
        author_handle: p.username || null,
        published_at: p.timestamp,
        keyword_matched: matched,
        topics: ['Social'],
        sentiment_label: s.label,
        sentiment_score: s.score,
        sentiment_confidence: BASELINE_CONFIDENCE,
        risk_level: riskLevel(s.label, s.score, caption),
        risk_flag: false,
        engagement_likes: p.like_count ?? 0,
        engagement_comments: p.comments_count ?? 0,
        language: s.language,
        mention_type: guessMentionType(caption),
        source: 'instagram_tags',
        is_competitor: false,
        analyst_excluded: false,
        date_fixed: true,
        status: 'new',
      })
    }
    if (done) break
    url = r.paging?.next || null
  }
  return { rows, skippedOwn, unmatched }
}

/* ------------------------------------------------------------------ */

/**
 * Upsert overwrites, so a re-run would clobber sentiment that the Claude pass
 * has already corrected — silently reverting good scores to the AFINN baseline
 * every time ingest runs. BASELINE_CONFIDENCE is the marker for "never
 * re-scored": any other value means a judgement was made and must survive,
 * including a deliberately LOW one (Claude flagging a row as too ambiguous to
 * call is a decision, not an absence of one). Engagement counts are always
 * refreshed, since those do change.
 */
const preserveRescored = async (rows) => {
  const urls = rows.map(r => r.url)
  const existing = new Map()
  for (let i = 0; i < urls.length; i += 200) {
    const { data, error } = await supabase
      .from('mentions')
      .select('url, sentiment_label, sentiment_score, sentiment_confidence, full_text, summary')
      .in('url', urls.slice(i, i + 200))
      .neq('sentiment_confidence', BASELINE_CONFIDENCE)
    if (error) { console.warn('[save] could not read existing rows:', error.message); return { rows, kept: 0 } }
    for (const row of data || []) existing.set(row.url, row)
  }
  let kept = 0
  const merged = rows.map(r => {
    const prev = existing.get(r.url)
    if (!prev) return r
    kept++
    return {
      ...r,
      sentiment_label: prev.sentiment_label,
      sentiment_score: prev.sentiment_score,
      sentiment_confidence: prev.sentiment_confidence,
      full_text: prev.full_text ?? r.full_text,
      summary: prev.summary ?? undefined,
    }
  })
  return { rows: merged, kept }
}

const save = async (rows) => {
  const { rows: toSave, kept } = await preserveRescored(rows)
  if (kept) console.log(`[save] preserved Claude sentiment on ${kept} already-scored rows`)
  let saved = 0
  for (let i = 0; i < toSave.length; i += 100) {
    const chunk = toSave.slice(i, i + 100)
    const { error } = await supabase.from('mentions').upsert(chunk, { onConflict: 'url' })
    if (error) { console.error('[save] chunk failed:', error.message); continue }
    saved += chunk.length
  }
  return saved
}

const summarise = (rows, label) => {
  const by = rows.reduce((m, r) => ({ ...m, [r.sentiment_label]: (m[r.sentiment_label] || 0) + 1 }), {})
  const langs = rows.reduce((m, r) => ({ ...m, [r.language]: (m[r.language] || 0) + 1 }), {})
  console.log(`  ${label}: ${rows.length}`)
  console.log(`    baseline sentiment: ${JSON.stringify(by)}`)
  console.log(`    language: ${JSON.stringify(langs)}`)
}

const run = async () => {
  console.log(`\nInstagram → mentions — last ${MONTHS} months${DRY ? ' (dry run)' : ''}\n`)

  const me = await j(`${API}/me?fields=username&access_token=${IG_TOKEN}`)
  if (me.error) { console.error('Token rejected:', me.error.message); process.exit(1) }
  console.log(`[account] @${me.username}`)

  const keywords = await loadKeywords()
  const blocked = await loadBlockedHandles()
  console.log(`[scope] ${keywords.length} active keywords · ${blocked.size} blocked handles`)
  console.log(`        ${keywords.map(k => k.term).join(', ')}\n`)

  const ownHandleIds = keywordsForOwnHandle(me.username, keywords)
  if (!ownHandleIds.length) {
    console.warn(`[scope] ⚠ no active keyword claims "@${me.username}". Add it as an alias in`)
    console.warn('        Keyword Manager, or @-tags and comments cannot be attributed.')
  }

  const posts = await fetchOwnPosts()
  console.log(`[posts] ${posts.length} own posts in window`)

  const comments = await fetchComments(posts, keywords, ownHandleIds)
  const { rows: tagged, skippedOwn, unmatched } = await fetchTaggedPosts(keywords, blocked, ownHandleIds)

  const orphaned = comments.filter(c => !c.keyword_matched.length).length

  console.log('\n[summary]')
  summarise(comments, 'comments + replies')
  summarise(tagged, '@-tagged posts')
  if (skippedOwn) console.log(`  skipped ${skippedOwn} tagged posts from blacklisted/owned handles`)
  if (orphaned) console.log(`  ⚠ ${orphaned} comments on posts whose caption matched no active keyword`)

  if (unmatched.length) {
    console.log(`\n  ⚠ ${unmatched.length} tagged posts matched no active keyword — NOT saved.`)
    console.log('    Add the handle as an alias in Keyword Manager if these should be tracked:')
    unmatched.forEach(u => console.log(`      @${u.handle} — ${u.permalink}`))
  }

  const all = [...comments, ...tagged].filter(r => r.keyword_matched.length > 0)
  if (!all.length) {
    console.log('\nNothing in scope to save. If unexpected, check the Meta app is in LIVE mode.')
    return
  }

  console.log(`\n  ${all.length} rows need Claude re-scoring (written at confidence 0.3)`)

  if (DRY) {
    console.log('\n[dry] nothing written. Sample:')
    console.log(JSON.stringify(all[0], null, 2))
    return
  }

  const saved = await save(all)
  console.log(`\n[done] ${saved}/${all.length} rows upserted into mentions`)
  console.log('Next: run Step 2B (Claude sentiment re-scoring) to fix Malay/emoji scoring.\n')
}

run().catch(e => { console.error('\nFailed:', e.message); process.exit(1) })
