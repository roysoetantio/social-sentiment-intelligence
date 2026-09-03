// Instagram ingest — server-side replacement for scripts/ingest-instagram-*.js
//
// WHY THIS EXISTS AS AN EDGE FUNCTION
// The daily Claude Routine is the only thing that runs, and it has no shell —
// so the Node scripts never execute. Anything that must run unattended has to
// live inside Supabase. pg_cron calls this on a schedule.
//
// Writes three things:
//   social_posts                  our own posts + insights (NEVER into mentions —
//                                 owned content would inflate mention counts,
//                                 the same reason the blacklist exists)
//   mentions/instagram_comments   comments + replies on our posts
//   mentions/instagram_tags       posts by other accounts that @-tagged us
//
// REQUIRES THE META APP IN **LIVE** MODE. In Development mode both the comments
// and tags edges return HTTP 200 with `data: []` *and paging cursors present* —
// cursors on an empty array mean "filtered", not "none". If this suddenly
// returns nothing, check the app mode before suspecting the token.
//
// SCOPE: keywords and blacklist are read from the database every run. Nothing
// here hardcodes a brand name, keyword id or owned handle.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const API = 'https://graph.instagram.com/v26.0'
const BASELINE_CONFIDENCE = 0.3
const WINDOW_DAYS = 365

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const j = (u: string) => fetch(u).then((r) => r.json())

/* ------------------------------------------------------------------ token */
// Edge Functions cannot rewrite their own secrets, and the long-lived token
// expires after 60 days — so it is persisted in ingest_state. The
// IG_ACCESS_TOKEN secret is only the seed for the very first run.
async function getToken(): Promise<string> {
  const { data } = await supabase.from('ingest_state')
    .select('value').eq('key', 'ig_access_token').maybeSingle()

  let token = data?.value || Deno.env.get('IG_ACCESS_TOKEN')
  if (!token) throw new Error('No token in ingest_state and no IG_ACCESS_TOKEN secret')

  // Refresh on every run: tokens may be refreshed once they are >24h old, so
  // a daily run means the token can never lapse. Best-effort — a failed
  // refresh must not stop the ingest.
  try {
    const r = await j(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`,
    )
    if (r.access_token) {
      token = r.access_token
      await supabase.from('ingest_state').upsert({
        key: 'ig_access_token',
        value: token,
        expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  } catch (_) { /* keep existing token */ }

  return token!
}

/* ------------------------------------------------------------------ scope */
async function loadScope() {
  const { data: kws } = await supabase.from('keywords')
    .select('id, term, aliases, group_id').eq('is_active', true)
  if (!kws?.length) throw new Error('No active keywords — nothing is in scope')

  const keywords = kws.map((k: any) => ({
    ...k,
    // Longest first so "UEM Edgenta Berhad" wins over "Edgenta".
    terms: [k.term, ...(k.aliases || [])].filter(Boolean)
      .map((t: string) => t.toLowerCase())
      .sort((a: string, b: string) => b.length - a.length),
  }))

  // The blacklist stores domains; Instagram gives handles. Derive handle forms
  // so new exclusions are a database change, never a code change.
  //   uemedgenta.com          -> uemedgenta
  //   instagram.com/uemgroup  -> uemgroup
  const { data: bl } = await supabase.from('blacklist').select('domain, reason')
  const blocked = new Set<string>()
  for (const row of bl || []) {
    const d = (row.domain || '').toLowerCase().trim()
    if (!d) continue
    if (d.includes('/')) blocked.add(d.split('/').pop()!)
    else if (row.reason === 'owned') {
      blocked.add(d.split('.')[0])
      blocked.add(d.replace(/\./g, ''))
    }
  }
  blocked.delete('')

  return { keywords, blocked }
}

const matchKeywords = (text: string, keywords: any[]): string[] => {
  const t = (text || '').toLowerCase()
  if (!t) return []
  return keywords.filter((k) => k.terms.some((term: string) => t.includes(term))).map((k) => k.id)
}

/* -------------------------------------------------------- sentiment baseline */
// Deliberately crude: emoji + Malay only. Plain AFINN scores "😍😍😍" and
// "Tahniah" as neutral, which is worse than useless. Everything written here
// carries BASELINE_CONFIDENCE so Step 2B of the routine re-judges it with
// context — this only has to be good enough to be readable in the meantime.
const EMOJI: Record<string, number> = {
  '😍': 3, '🥰': 3, '🤩': 3, '❤️': 3, '❤': 3, '💖': 3, '🩷': 3, '🔥': 3,
  '🎉': 3, '💯': 3, '👏': 2, '👍': 2, '🙌': 2, '💪': 2, '✨': 2, '😊': 2,
  '😂': 2, '🥳': 3, '😎': 2, '👌': 2, '🙏': 1,
  '😡': -3, '🤬': -4, '👎': -3, '💔': -3, '😢': -2, '😭': -2, '🙄': -2, '❌': -2,
}
const MALAY: Record<string, number> = {
  tahniah: 3, syabas: 3, terbaik: 4, terbaikko: 4, hebat: 3, bagus: 3,
  mantap: 3, padu: 3, gempak: 3, membantu: 2, bangga: 3, berjaya: 3,
  cemerlang: 4, seronok: 2, menarik: 2,
  teruk: -3, buruk: -3, rosak: -3, gagal: -3, kecewa: -3, bodoh: -4,
  menipu: -4, lambat: -2, susah: -2,
}
// Checked before single words so "tak bagus" cannot score as "bagus".
const NEGATED: Record<string, number> = {
  'tak bagus': -3, 'tidak bagus': -3, 'tak guna': -4,
  'tak puas hati': -3, 'sangat teruk': -4,
}

function baseline(text: string) {
  const raw = (text || '').trim()
  let lower = raw.toLowerCase()
  let score = 0

  for (const [phrase, v] of Object.entries(NEGATED)) {
    if (lower.includes(phrase)) { score += v; lower = lower.split(phrase).join(' ') }
  }
  for (const [e, v] of Object.entries(EMOJI)) {
    const n = raw.split(e).length - 1
    // Repetition intensifies with diminishing returns: 🔥🔥🔥 is emphatic,
    // not three times the sentiment.
    if (n > 0) score += v * Math.min(n, 3) * (n > 1 ? 0.6 : 1)
  }
  for (const [w, v] of Object.entries(MALAY)) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(lower)) score += v
  }

  const norm = Math.max(-1, Math.min(1, score / 10))
  const isEmojiOnly = raw.length > 0 && !/[a-zA-Z0-9]/.test(raw)
  const isMalay = /\b(yang|dan|untuk|tidak|tak|sangat|kami|kita|dengan|boleh|terima kasih|tahniah|semoga)\b/i.test(raw)

  return {
    score: norm,
    label: norm > 0.05 ? 'positive' : norm < -0.05 ? 'negative' : 'neutral',
    language: isEmojiOnly ? 'emoji' : isMalay ? 'ms' : 'en',
  }
}

// Same vocabulary as guessMentionType() in scripts/ingest.js.
const mentionType = (t = '') => {
  const s = t.toLowerCase()
  if (/complaint|complain|issue|problem|broken|fail/.test(s)) return 'complaint'
  if (/award|win|achiev|congrat|tahniah|excellent|best|proud/.test(s)) return 'praise'
  if (/\?|how|what|why|when|where/.test(s)) return 'question'
  return 'news'
}

/* -------------------------------------------------------------------- run */
async function ingest() {
  const started = new Date().toISOString()
  const token = await getToken()
  const { keywords, blocked } = await loadScope()

  const me = await j(`${API}/me?fields=username&access_token=${token}`)
  if (me.error) throw new Error(`token rejected: ${me.error.message}`)

  // Whichever keyword claims our own handle as a term/alias. A comment sits on
  // our post and a /me/tags result tagged our account — in both cases the
  // account itself is the match, and which keyword owns it is config.
  const ownHandleIds = matchKeywords(me.username, keywords)

  const cutoff = Date.now() - WINDOW_DAYS * 864e5

  /* ---- own posts → social_posts ---- */
  // Insights are requested INLINE on the media edge; per-post calls would turn
  // a 12-month pull from ~8 requests into ~300 against an hourly cap.
  const FIELDS = [
    'id', 'caption', 'media_type', 'media_product_type', 'media_url',
    'thumbnail_url', 'permalink', 'timestamp', 'like_count', 'comments_count',
    'insights.metric(reach,saved,shares,total_interactions,views)',
  ].join(',')

  let url: string | null = `${API}/me/media?fields=${FIELDS}&limit=50&access_token=${token}`
  const posts: any[] = []
  while (url) {
    const r: any = await j(url)
    if (r.error) throw new Error(`media: ${r.error.message}`)
    let stop = false
    for (const p of r.data || []) {
      if (new Date(p.timestamp).getTime() < cutoff) { stop = true; break }
      posts.push(p)
    }
    if (stop) break
    url = r.paging?.next || null
  }

  const iv = (p: any, n: string) =>
    (p.insights?.data || []).find((i: any) => i.name === n)?.values?.[0]?.value ?? 0

  const postRows = posts.map((p) => ({
    id: `instagram:${p.id}`,
    platform: 'instagram',
    account_handle: me.username,
    native_id: p.id,
    post_type: p.media_product_type === 'REELS' ? 'REEL' : p.media_type,
    caption: p.caption || null,
    permalink: p.permalink || null,
    // Instagram CDN URLs are signed and expire; re-running refreshes them.
    media_url: p.media_url || null,
    thumbnail_url: p.thumbnail_url || p.media_url || null,
    published_at: p.timestamp,
    likes: p.like_count ?? 0,
    comments_count: p.comments_count ?? 0,
    shares: iv(p, 'shares'),
    saves: iv(p, 'saved'),
    reach: iv(p, 'reach'),
    impressions: 0, // retired by Meta
    video_views: iv(p, 'views'),
    raw: p,
    ingested_at: new Date().toISOString(),
  }))

  for (let i = 0; i < postRows.length; i += 100) {
    await supabase.from('social_posts').upsert(postRows.slice(i, i + 100), { onConflict: 'id' })
  }

  /* ---- comments → mentions ---- */
  const mentionRows: any[] = []

  const toComment = (c: any, post: any, keywordIds: string[]) => {
    const text = (c.text || '').trim()
    const s = baseline(text)
    return {
      url: `${post.permalink}#comment-${c.id}`,
      text: text.slice(0, 500) || '(no text)',
      platform: 'Instagram',
      author_name: c.from?.username ?? null,
      author_handle: c.from?.username ?? null,
      published_at: c.timestamp,
      keyword_matched: keywordIds,
      topics: ['Social'],
      sentiment_label: s.label,
      sentiment_score: s.score,
      sentiment_confidence: BASELINE_CONFIDENCE,
      risk_level: null,
      risk_flag: false,
      engagement_likes: c.like_count ?? 0,
      language: s.language,
      mention_type: mentionType(text),
      source: 'instagram_comments',
      is_competitor: false,
      analyst_excluded: false,
      date_fixed: true, // timestamps come straight from the API
      status: 'new',
    }
  }

  for (const post of posts.filter((p) => p.comments_count > 0)) {
    // A comment never contains the brand name — nobody writes "UEM Edgenta"
    // replying to UEM Edgenta's own post. It inherits the keywords matched in
    // the parent caption, falling back to the keyword claiming our handle.
    const captionIds = matchKeywords(post.caption, keywords)
    const inherited = captionIds.length ? captionIds : ownHandleIds

    let cu: string | null = `${API}/${post.id}/comments`
      + `?fields=id,text,timestamp,like_count,from{id,username},replies{id,text,timestamp,like_count,from{id,username}}`
      + `&limit=50&access_token=${token}`
    while (cu) {
      const r: any = await j(cu)
      if (r.error) break
      for (const c of r.data || []) {
        mentionRows.push(toComment(c, post, inherited))
        // Replies are separate opinions and deserve their own row.
        for (const rep of c.replies?.data || []) mentionRows.push(toComment(rep, post, inherited))
      }
      cu = r.paging?.next || null
    }
  }

  /* ---- @-tagged posts → mentions ---- */
  let tu: string | null = `${API}/me/tags`
    + `?fields=id,caption,permalink,timestamp,like_count,comments_count,username`
    + `&limit=50&access_token=${token}`
  let skipped = 0
  const unmatched: string[] = []

  while (tu) {
    const r: any = await j(tu)
    if (r.error) break
    let stop = false
    for (const p of r.data || []) {
      if (new Date(p.timestamp).getTime() < cutoff) { stop = true; break }

      const handle = (p.username || '').toLowerCase()
      if (blocked.has(handle)) { skipped++; continue }

      const caption = (p.caption || '').trim()
      // The @-tag lives in post metadata, not caption text, so caption matching
      // alone misses it. Being on /me/tags IS the match.
      const matched = [...new Set([...matchKeywords(caption, keywords), ...ownHandleIds])]
      if (!matched.length) { unmatched.push(`@${handle} ${p.permalink}`); continue }

      const s = baseline(caption)
      mentionRows.push({
        url: p.permalink,
        text: caption.slice(0, 500) || '(no caption)',
        full_text: caption || null,
        platform: 'Instagram',
        author_name: p.username ?? null,
        author_handle: p.username ?? null,
        published_at: p.timestamp,
        keyword_matched: matched,
        topics: ['Social'],
        sentiment_label: s.label,
        sentiment_score: s.score,
        sentiment_confidence: BASELINE_CONFIDENCE,
        risk_level: null,
        risk_flag: false,
        engagement_likes: p.like_count ?? 0,
        engagement_comments: p.comments_count ?? 0,
        language: s.language,
        mention_type: mentionType(caption),
        source: 'instagram_tags',
        is_competitor: false,
        analyst_excluded: false,
        date_fixed: true,
        status: 'new',
      })
    }
    if (stop) break
    tu = r.paging?.next || null
  }

  /* ---- save, without clobbering judged sentiment ---- */
  // Upsert overwrites. A confidence of exactly BASELINE_CONFIDENCE means
  // "never judged"; any other value is a decision and must survive — including
  // a deliberately LOW one, since flagging a row as too ambiguous to call is
  // itself a judgement.
  const urls = mentionRows.map((m) => m.url)
  const keep = new Map<string, any>()
  for (let i = 0; i < urls.length; i += 200) {
    const { data } = await supabase.from('mentions')
      .select('url, sentiment_label, sentiment_score, sentiment_confidence, full_text')
      .in('url', urls.slice(i, i + 200))
      .neq('sentiment_confidence', BASELINE_CONFIDENCE)
    for (const row of data || []) keep.set(row.url, row)
  }

  const merged = mentionRows.map((m) => {
    const prev = keep.get(m.url)
    if (!prev) return m
    return {
      ...m,
      sentiment_label: prev.sentiment_label,
      sentiment_score: prev.sentiment_score,
      sentiment_confidence: prev.sentiment_confidence,
      full_text: prev.full_text ?? (m as any).full_text ?? null,
    }
  })

  let saved = 0
  for (let i = 0; i < merged.length; i += 100) {
    const chunk = merged.slice(i, i + 100)
    const { error } = await supabase.from('mentions').upsert(chunk, { onConflict: 'url' })
    if (!error) saved += chunk.length
  }

  const summary = {
    account: me.username,
    posts_saved: postRows.length,
    mentions_found: mentionRows.length,
    mentions_saved: saved,
    sentiment_preserved: keep.size,
    tagged_skipped_blacklisted: skipped,
    tagged_unmatched: unmatched,
  }

  await supabase.from('ingest_runs').insert({
    source: 'instagram',
    started_at: started,
    finished_at: new Date().toISOString(),
    ok: true,
    rows_found: mentionRows.length,
    rows_saved: saved,
    message: JSON.stringify(summary),
  })

  return summary
}

Deno.serve(async () => {
  try {
    const result = await ingest()
    return new Response(JSON.stringify({ ok: true, ...result }, null, 2),
      { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    // Record the failure too — a run that errors must be visible to the daily
    // freshness check, not silently absent.
    await supabase.from('ingest_runs').insert({
      source: 'instagram',
      finished_at: new Date().toISOString(),
      ok: false,
      message: String(e),
    })
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
