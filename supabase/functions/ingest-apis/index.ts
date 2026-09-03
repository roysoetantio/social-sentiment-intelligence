// API-sourced ingest — server-side replacement for `npm run ingest`.
//
// WHY THIS EXISTS
// The daily Claude Routine is the only thing that runs, and it has no shell, so
// scripts/ingest.js never executes. Every source below therefore went from
// May/June 2026 to September without saving a single row — none of them were
// broken, nothing was running them. pg_cron calls this instead.
//
// SOURCES AND WHY EACH IS HERE
//   serper_social  THE ONLY source of LinkedIn, Facebook and YouTube — 105/105
//                  LinkedIn rows came from it. Metered, see credits note.
//   serper_news    A cheap cross-check only. Serper supplied 14 of 337 news
//                  rows; claude_search already covers that ground. Kept because
//                  it does catch the occasional Malay piece Claude misses.
//   google_news_rapidapi / realtimesnews / worldnews   Unmetered-ish news APIs.
//   twitter135     The only Twitter source.
//
// SERPER CREDITS: a finite prepaid pool (2,500), then it costs money. Serper is
// therefore capped to page 1, English only, and PRIMARY KEYWORD TERMS ONLY —
// no aliases. That is ~2 credits per keyword per run versus ~120 for a full
// pass under the original config. Every run records credits_used in
// ingest_runs so the spend is visible.
//
// SCOPE: keywords and blacklist are read from the database every run. Nothing
// here hardcodes a brand name or keyword id.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { classify } from './platform.ts'

const BASELINE_CONFIDENCE = 0.3
const RECENT_DAYS = 30

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const SERPER_KEY = Deno.env.get('SERPER_API_KEY')
const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY')
const WORLDNEWS_KEY = Deno.env.get('WORLDNEWS_API_KEY')

let creditsUsed = 0

/* ------------------------------------------------------------------ scope */
async function loadScope() {
  const { data: kws } = await supabase.from('keywords')
    .select('id, term, aliases, group_id').eq('is_active', true)
  if (!kws?.length) throw new Error('No active keywords — nothing is in scope')

  // Every term + alias, flagged so Serper can be restricted to primary terms.
  const searches: any[] = []
  for (const k of kws) {
    searches.push({ query: k.term, keywordId: k.id, group: k.group_id, isAlias: false })
    for (const a of k.aliases || []) {
      if (a) searches.push({ query: a, keywordId: k.id, group: k.group_id, isAlias: true })
    }
  }

  const keywords = kws.map((k: any) => ({
    ...k,
    terms: [k.term, ...(k.aliases || [])].filter(Boolean)
      .map((t: string) => t.toLowerCase())
      .sort((a: string, b: string) => b.length - a.length),
  }))

  const { data: bl } = await supabase.from('blacklist').select('domain')
  const blacklist = (bl || []).map((b: any) => (b.domain || '').toLowerCase()).filter(Boolean)

  return { searches, keywords, blacklist }
}

const isBlacklisted = (url: string, blacklist: string[]) => {
  let host: string
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return true }
  return blacklist.some((b) => {
    const d = b.includes('/') ? b.split('/')[0] : b
    return host === d || host.endsWith('.' + d)
  })
}

const matchKeywords = (text: string, keywords: any[]): string[] => {
  const t = (text || '').toLowerCase()
  if (!t) return []
  return keywords.filter((k) => k.terms.some((term: string) => t.includes(term))).map((k) => k.id)
}

/* -------------------------------------------------------------- sentiment */
// Crude on purpose: everything lands at BASELINE_CONFIDENCE so Step 2B of the
// daily routine re-judges it with context. See ingest-instagram for the
// reasoning — plain word-matching cannot read Malay, emoji, or sarcasm.
const POS = /\b(win|wins|won|award|awarded|record|growth|profit|success|successful|strong|expand|expansion|partnership|launch|milestone|praise|excellent|best|top|improve|improved|boost|secure|secured|appointed|honou?r)\w*\b/gi
const NEG = /\b(loss|losses|decline|fall|fell|drop|cut|delay|delayed|fail|failure|problem|issue|concern|risk|lawsuit|fraud|scandal|probe|investigation|breach|ransomware|hack|accident|crash|death|died|fatal|injur|complaint|protest|halt|suspend)\w*\b/gi

const HIGH_RISK = /\b(killed|kill|fatal|fatalit|died|death|dead|murder|suicide|tragedy|tragic|disaster|collapse|explosion|fire|bankrupt|lawsuit|fraud|scandal|corruption|arrest|charged|convict|criminal|ransomware|breach)\w*/i

function score(text: string) {
  const t = text || ''
  const pos = (t.match(POS) || []).length
  const neg = (t.match(NEG) || []).length
  const raw = Math.max(-1, Math.min(1, (pos - neg) / 5))
  return {
    score: raw,
    label: raw > 0.05 ? 'positive' : raw < -0.05 ? 'negative' : 'neutral',
  }
}

// risk_flag MUST agree with risk_level. They previously disagreed on 78 rows
// because one was written from a confidence rule and the other from severity.
function risk(label: string, s: number, text: string) {
  if (label !== 'negative') return { risk_level: null, risk_flag: false }
  const lvl = HIGH_RISK.test(text || '') || s <= -0.8 ? 'high' : s <= -0.3 ? 'medium' : 'low'
  return { risk_level: lvl, risk_flag: lvl === 'high' || lvl === 'medium' }
}

const detectLanguage = (t = '') =>
  /\b(yang|dan|untuk|tidak|tak|sangat|kami|kita|dengan|boleh|akan|sudah|kepada|dalam|pada)\b/i.test(t) ? 'ms' : 'en'

const mentionType = (t = '') => {
  const s = t.toLowerCase()
  if (/complaint|complain|issue|problem|broken|fail/.test(s)) return 'complaint'
  if (/award|win|achiev|congrat|tahniah|excellent|best|proud/.test(s)) return 'praise'
  if (/\?|how|what|why|when|where/.test(s)) return 'question'
  return 'news'
}

/**
 * Postgres rejects NUL bytes and lone surrogates outright — "invalid input
 * syntax for type json" — and tweets carry both: \u0000 from odd encodings and
 * unpaired surrogates from emoji truncated mid-pair. One bad character killed
 * an entire 16-row batch, so scrub every string before it reaches the insert.
 */
const clean = (v: string | null | undefined): string | null => {
  if (v == null) return null
  const out = v
    .replace(/\u0000/g, '')
    // Lone high/low surrogates — a valid pair is left untouched.
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .trim()
  return out.length ? out : null
}

/**
 * Tracking parameters make the SAME article two rows — `onConflict: 'url'`
 * cannot see that `?utm_medium=Social` is the same Star piece it already has.
 * Only known tracking keys are dropped; real query strings (`?id=`, `?p=`)
 * are load-bearing on plenty of news sites and must survive.
 */
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|igshid|mc_[a-z]+|ref|ref_src|s_cid|cmpid)$/i
const normalizeUrl = (raw: string): string => {
  try {
    const u = new URL(raw)
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
    u.hash = ''
    return u.toString().replace(/\?$/, '')
  } catch {
    return raw
  }
}

function toRow(o: {
  url: string; title: string; body?: string; published?: string;
  source: string; author?: string; keywords: any[]; keywordId?: string;
  fullText?: boolean;
}) {
  const text = clean(o.title) || ''
  const full = clean(o.body) || ''
  const s = score(`${text} ${full}`)
  const r = risk(s.label, s.score, `${text} ${full}`)
  // PRECISION RULE (platform-aware). Search engines match the whole PAGE, so a
  // news article can surface purely because the brand sits in its
  // related-articles sidebar — that is how an NST piece about angklung music
  // got tagged UEM Edgenta. For News/Web we therefore require the term to
  // appear in the title or snippet. Social rows are handled by the attribution
  // rule below instead.
  const url = normalizeUrl(o.url)
  const platform = classify(url).platform
  const needsTextProof = platform === 'News' || platform === 'Web'
  const textualMatches = matchKeywords(`${text} ${full}`, o.keywords)
  if (needsTextProof && !textualMatches.length) {
    return null // caller filters these out and counts them as rejected
  }

  // ATTRIBUTION RULE. Adding the searched keyword unconditionally tagged 222 of
  // 915 keyword links (24%) with a keyword that appears nowhere in the row —
  // WAFCON football under UEM Group, Delhi-Mumbai Expressway under PLUS. The
  // query is only trustworthy evidence when we are looking at a TRUNCATED
  // SNIPPET: a Serper LinkedIn result legitimately omits the searched phrase
  // (requiring it discarded 64 of 64), so those keep search attribution.
  // When we hold the full text and the keyword is absent from it, the query
  // matched something else — believe the text, not the query.
  const snippetOnly = !o.fullText && !needsTextProof
  const matched = [...new Set([
    ...(snippetOnly && o.keywordId ? [o.keywordId] : []),
    ...textualMatches,
  ])]
  if (!matched.length) {
    return null // full text, keyword absent — the query matched something else
  }
  return {
    url,
    // clean() BEFORE the slice was pointless: cutting at 500 splits an emoji
    // surrogate pair and Postgres rejects the half as "invalid input syntax
    // for type json" — one tweet failed four consecutive runs that way.
    text: clean(text.slice(0, 500)) || '(no title)',
    full_text: full || null,
    // author handles come from third-party payloads too

    platform,
    published_at: o.published || new Date().toISOString(),
    date_fixed: !!o.published,
    keyword_matched: matched,
    topics: [] as string[],
    sentiment_label: s.label,
    sentiment_score: s.score,
    sentiment_confidence: BASELINE_CONFIDENCE,
    ...r,
    author_name: clean(o.author),
    author_handle: clean(o.author),
    language: detectLanguage(`${text} ${full}`),
    mention_type: mentionType(`${text} ${full}`),
    geography_country: 'Malaysia',
    source: o.source,
    is_competitor: false,
    analyst_excluded: false,
    status: 'new',
  }
}

/**
 * Serper returns dates as free text — either relative ("13 mins ago",
 * "1 month ago") or absolute ("26 May 2026"). Discarding it means every row
 * falls back to now(), which is how 48 rows ended up claiming they were
 * published minutes ago. Returns undefined when it genuinely cannot tell, so
 * the caller records date_fixed = false rather than inventing a date.
 */
const parseSerperDate = (raw?: string): string | undefined => {
  if (!raw) return undefined
  const t = raw.trim().toLowerCase()

  const rel = t.match(/^(\d+)\s*(min|minute|hour|hr|day|week|month|year)s?\s+ago$/)
  if (rel) {
    const n = Number(rel[1])
    const unit = rel[2]
    const ms: Record<string, number> = {
      min: 6e4, minute: 6e4, hour: 36e5, hr: 36e5,
      day: 864e5, week: 6048e5, month: 2629800000, year: 31557600000,
    }
    return new Date(Date.now() - n * ms[unit]).toISOString()
  }
  if (t === 'yesterday') return new Date(Date.now() - 864e5).toISOString()
  if (t === 'today') return new Date().toISOString()

  // "26 May 2026" / "May 26, 2026" both parse natively, but a date-only string
  // parses as LOCAL midnight and then shifts back a day in UTC — "26 May 2026"
  // became 2026-05-25. Anchor at midday UTC so the calendar date survives.
  const abs = new Date(raw)
  if (!isNaN(abs.getTime()) && abs.getFullYear() > 2000) {
    return new Date(Date.UTC(
      abs.getFullYear(), abs.getMonth(), abs.getDate(), 12, 0, 0,
    )).toISOString()
  }

  return undefined
}

/* ---------------------------------------------------------------- sources */
const serperPost = async (endpoint: string, body: unknown) => {
  const r = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  creditsUsed++
  if (!r.ok) throw new Error(`serper ${endpoint}: HTTP ${r.status}`)
  return r.json()
}

/**
 * Swallowing a non-OK response here made "the API is returning 500" look
 * identical to "no results found" — the precise failure mode that let five
 * sources die unnoticed for four months. Throw instead, so gather() records it
 * in ingest_runs.errors and the daily health check surfaces it.
 */
const rapid = async (host: string, url: string) => {
  const r = await fetch(url, {
    headers: { 'x-rapidapi-key': RAPIDAPI_KEY!, 'x-rapidapi-host': host },
  })
  if (!r.ok) throw new Error(`${host}: HTTP ${r.status}`)
  const body = await r.text()
  if (!body.trim()) throw new Error(`${host}: empty response body`)
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`${host}: non-JSON response (${body.slice(0, 60)})`)
  }
}

async function fetchSerperSocial(s: any, keywords: any[]) {
  if (!SERPER_KEY) return []
  const sites = ['site:twitter.com', 'site:x.com', 'site:linkedin.com/posts',
    'site:linkedin.com/pulse', 'site:youtube.com/watch'].join(' OR ')
  const d = await serperPost('search', {
    q: `${s.query} (${sites})`, gl: 'my', hl: 'en', num: 10, page: 1, tbs: 'qdr:m',
  })
  return [...(d.organic || []), ...(d.news || [])].map((i: any) =>
    toRow({
      url: i.link, title: i.title, body: i.snippet,
      published: parseSerperDate(i.date),
      source: 'serper_social', keywords, keywordId: s.keywordId,
    }))
}

async function fetchSerperNews(s: any, keywords: any[]) {
  if (!SERPER_KEY) return []
  const d = await serperPost('news', { q: s.query, gl: 'my', hl: 'en', num: 10, page: 1, tbs: 'qdr:m' })
  return (d.news || []).map((i: any) =>
    toRow({
      url: i.link, title: i.title, body: i.snippet,
      published: parseSerperDate(i.date),
      source: 'serper_news', keywords, keywordId: s.keywordId,
    }))
}

async function fetchGoogleNews(s: any, keywords: any[]) {
  if (!RAPIDAPI_KEY) return []
  const d = await rapid('google-news13.p.rapidapi.com',
    `https://google-news13.p.rapidapi.com/search?keyword=${encodeURIComponent(s.query)}&lr=en-US`)
  // On quota exhaustion RapidAPI returns {message: "..."} rather than items —
  // report it rather than throwing a TypeError halfway through the source.
  if (d?.message) throw new Error(d.message.slice(0, 120))
  if (!Array.isArray(d?.items)) return []
  return d.items.slice(0, 20).map((i: any) =>
    toRow({
      url: i.newsUrl || i.url, title: i.title, body: i.snippet,
      published: i.timestamp ? new Date(Number(i.timestamp)).toISOString() : undefined,
      author: i.publisher, source: 'google_news_rapidapi', keywords, keywordId: s.keywordId,
    })).filter((r: any) => r?.url)
}

async function fetchRealTimeNews(s: any, keywords: any[]) {
  if (!RAPIDAPI_KEY) return []
  const d = await rapid('real-time-news-data.p.rapidapi.com',
    `https://real-time-news-data.p.rapidapi.com/search?query=${encodeURIComponent(s.query)}&limit=10&country=MY&lang=en`)
  return (d?.data || []).map((i: any) =>
    toRow({
      url: i.link, title: i.title, body: i.snippet,
      published: i.published_datetime_utc, author: i.source_name,
      source: 'realtimesnews', keywords, keywordId: s.keywordId,
    })).filter((r: any) => r?.url)
}

async function fetchWorldNews(s: any, keywords: any[]) {
  if (!WORLDNEWS_KEY) return []
  const p = new URLSearchParams({
    'api-key': WORLDNEWS_KEY, text: s.query, language: 'en', number: '10',
  })
  const d = await fetch(`https://api.worldnewsapi.com/search-news?${p}`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return (d?.news || []).map((i: any) =>
    toRow({
      url: i.url, title: i.title, body: i.text, published: i.publish_date,
      author: i.author, source: 'worldnews', keywords, keywordId: s.keywordId,
      fullText: true,
    })).filter((r: any) => r?.url)
}

async function fetchTwitter(s: any, keywords: any[]) {
  if (!RAPIDAPI_KEY) return []
  const d = await rapid('twitter135.p.rapidapi.com',
    `https://twitter135.p.rapidapi.com/Search/?q=${encodeURIComponent(s.query)}&count=20&type=Latest`)

  // Twitter135 returns X's GraphQL shape, not the old globalObjects format:
  // data.search_by_raw_query.search_timeline.timeline.instructions[]
  //   .entries[].content.itemContent.tweet_results.result
  const instructions = d?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || []
  const entries = instructions.flatMap((i: any) => i.entries || [])
  const out: any[] = []

  for (const e of entries) {
    const t = e?.content?.itemContent?.tweet_results?.result
    if (!t?.rest_id) continue
    const u = t.core?.user_results?.result
    const handle = u?.legacy?.screen_name || u?.core?.screen_name
    if (!handle) continue
    const text = t.note_tweet?.note_tweet_results?.result?.text || t.legacy?.full_text || ''
    if (!text) continue
    out.push(toRow({
      url: `https://twitter.com/${handle}/status/${t.rest_id}`,
      title: text,
      published: t.legacy?.created_at ? new Date(t.legacy.created_at).toISOString() : undefined,
      author: handle,
      source: 'twitter135',
      fullText: true,
      keywords,
      keywordId: s.keywordId,
    }))
  }
  return out
}

/* -------------------------------------------------------------------- run */
async function ingest(group: string) {
  const started = new Date().toISOString()
  const { searches, keywords, blacklist } = await loadScope()
  const primary = searches.filter((s) => !s.isAlias)

  const collected: any[] = []
  const perSource: Record<string, number> = {}
  const rejected: Record<string, number> = {}
  const errors: string[] = []

  const gather = async (name: string, list: any[], fn: (s: any, k: any[]) => Promise<any[]>) => {
    for (const s of list) {
      try {
        const raw = await fn(s, keywords)
        // toRow returns null for News/Web results that failed the precision
        // rule — count them so the report shows what was rejected and why,
        // rather than silently reporting a smaller number.
        const rows = raw.filter(Boolean)
        rejected[name] = (rejected[name] || 0) + (raw.length - rows.length)
        perSource[name] = (perSource[name] || 0) + rows.length
        collected.push(...rows)
      } catch (e) {
        errors.push(`${name}/${s.query}: ${String(e).slice(0, 120)}`)
      }
      await new Promise((r) => setTimeout(r, 250)) // be polite to the APIs
    }
  }

  // Primary terms only for EVERY source. Running all 15 terms (incl. aliases)
  // across 6 sources was ~90 sequential calls, which blows the Edge Function
  // wall-clock limit. Aliases return largely the same results anyway.
  //
  // `group` splits the work so each invocation stays short — cron calls each
  // group separately rather than one long job.
  if (group === 'all' || group === 'social') {
    await gather('serper_social', primary, fetchSerperSocial)
  }
  if (group === 'all' || group === 'news') {
    await gather('serper_news', primary, fetchSerperNews)
    await gather('google_news_rapidapi', primary, fetchGoogleNews)
    await gather('realtimesnews', primary, fetchRealTimeNews)
    await gather('worldnews', primary, fetchWorldNews)
  }
  if (group === 'all' || group === 'twitter') {
    await gather('twitter135', primary, fetchTwitter)
  }

  // Filter: blacklist, keyword scope, recency, and in-batch duplicates.
  const cutoff = Date.now() - RECENT_DAYS * 864e5
  const seen = new Set<string>()
  const candidates = collected.filter((r) => {
    if (!r.url || seen.has(r.url)) return false
    if (isBlacklisted(r.url, blacklist)) return false
    if (!r.keyword_matched.length) return false // out of scope — see SCOPE note
    if (new Date(r.published_at).getTime() < cutoff) return false
    seen.add(r.url)
    return true
  })

  // Drop anything already stored. Insert-only: never overwrite an existing row,
  // because the routine may already have judged its sentiment.
  const fresh: any[] = []
  const urls = candidates.map((r) => r.url)
  const known = new Set<string>()
  for (let i = 0; i < urls.length; i += 200) {
    const { data } = await supabase.from('mentions').select('url').in('url', urls.slice(i, i + 200))
    for (const row of data || []) known.add(row.url)
  }
  for (const r of candidates) if (!known.has(r.url)) fresh.push(r)

  let saved = 0
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100)
    const { error } = await supabase.from('mentions')
      .upsert(chunk, { onConflict: 'url', ignoreDuplicates: true })
    if (!error) { saved += chunk.length; continue }

    // Fall back to row-by-row so one malformed row cannot discard the batch —
    // a single bad tweet previously cost all 16 rows in its chunk.
    errors.push(`save batch: ${error.message}`)
    for (const row of chunk) {
      const { error: e2 } = await supabase.from('mentions')
        .upsert([row], { onConflict: 'url', ignoreDuplicates: true })
      if (!e2) saved++
      else if (errors.length < 12) errors.push(`save row ${row.url}: ${e2.message}`)
    }
  }

  const summary = {
    group,
    searches: searches.length,
    serper_terms: primary.length,
    credits_used: creditsUsed,
    found_per_source: perSource,
    rejected_no_keyword_in_text: rejected,
    candidates: candidates.length,
    already_known: candidates.length - fresh.length,
    saved,
    errors: errors.slice(0, 10),
  }

  await supabase.from('ingest_runs').insert({
    source: `apis:${group}`,
    started_at: started,
    finished_at: new Date().toISOString(),
    ok: errors.length === 0,
    rows_found: candidates.length,
    rows_saved: saved,
    credits_used: creditsUsed,
    message: JSON.stringify(summary),
  })

  return summary
}

const GROUPS = ['social', 'news', 'twitter', 'all']

// The gateway closes the connection at ~60s but this work takes minutes, so
// acknowledge immediately and continue in the background. Results are written
// to ingest_runs — that table, not the HTTP response, is the source of truth.
Deno.serve((req: Request) => {
  // Defaulting to 'all' meant a bare call silently repeated the work the three
  // grouped cron jobs had already done — 28 of the 56 Serper credits spent on
  // 2 Sept went that way. Serper is a finite prepaid pool, so an accidental
  // invocation must fail loudly rather than spend 14 credits.
  const group = new URL(req.url).searchParams.get('group')
  if (!group || !GROUPS.includes(group)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `group is required — one of ${GROUPS.join(', ')}`,
        note: 'Pass ?group=all deliberately; it costs ~14 Serper credits.',
      }, null, 2),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const work = (async () => {
    try {
      await ingest(group)
    } catch (e) {
      await supabase.from('ingest_runs').insert({
        source: `apis:${group}`, finished_at: new Date().toISOString(),
        ok: false, credits_used: creditsUsed, message: String(e),
      })
    }
  })()

  // @ts-ignore EdgeRuntime is provided by the Supabase runtime
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)

  return new Response(
    JSON.stringify({
      ok: true,
      accepted: true,
      group,
      note: 'Running in the background. Check the ingest_runs table for the result.',
    }, null, 2),
    { status: 202, headers: { 'Content-Type': 'application/json' } },
  )
})
