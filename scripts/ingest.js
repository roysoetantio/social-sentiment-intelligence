#!/usr/bin/env node
/**
 * Ingest script — fetch mentions from Google CSE + Reddit, save to Supabase.
 * Run manually: node scripts/ingest.js
 * Or schedule via cron: 0 0,6,12,18 * * * (every 6 hours)
 */

import { createClient } from '@supabase/supabase-js'
import Sentiment from 'sentiment'
import ws from 'ws'

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const RAPIDAPI_KEY        = process.env.VITE_RAPIDAPI_KEY
const TWITTER135_API_KEY  = process.env.VITE_TWITTER135_API_KEY || RAPIDAPI_KEY
const SERPER_KEY          = process.env.SERPER_API_KEY
const GOOGLE_NEWS_KEY     = process.env.VITE_RAPIDAPI_KEY
const WORLDNEWS_API_KEY   = process.env.WORLDNEWS_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: ws },
})
const sentiment = new Sentiment()

// ── Load keywords from Supabase ───────────────────────────────────────────────
// Accept --keywords=id1,id2 to filter which keywords to ingest
const CLI_KEYWORD_IDS = (() => {
  const arg = process.argv.find(a => a.startsWith('--keywords='))
  return arg ? arg.replace('--keywords=', '').split(',').filter(Boolean) : []
})()

const loadKeywordsFromDB = async () => {
  const { data: groups } = await supabase.from('keyword_groups').select('id, name')
  let query = supabase.from('keywords').select('*').eq('is_active', true)
  if (CLI_KEYWORD_IDS.length) query = query.in('id', CLI_KEYWORD_IDS)
  const { data: keywords } = await query

  if (!keywords || keywords.length === 0) {
    console.warn('[Ingest] No keywords found in DB — using defaults')
    return {
      searches: [
        { query: 'UEM Edgenta',   keywordId: 'uem-edgenta',    group: 'corporate',  isCompetitor: false },
        { query: 'Edgenta NXT',   keywordId: 'edgenta-nxt',    group: 'products',   isCompetitor: false },
        { query: 'Shaiful Subhan',keywordId: 'shaiful-subhan', group: 'executives', isCompetitor: false },
        { query: 'Chua Yong Howe',keywordId: 'chua-yong-howe', group: 'executives', isCompetitor: false },
      ],
    }
  }

  const competitorGroupId = groups?.find(g => g.name.toLowerCase().includes('compet'))?.id || 'competitors'

  const searches = keywords.flatMap(k => {
    const base = { keywordId: k.id, group: k.group_id, isCompetitor: k.group_id === competitorGroupId }
    const aliases = Array.isArray(k.aliases) ? k.aliases.filter(Boolean) : []
    return [
      { query: k.term, ...base },
      ...aliases.map(alias => ({ query: alias, ...base })),
    ]
  })

  console.log(`[Ingest] Loaded ${searches.length} search queries from Supabase (including aliases)`)
  return { searches }
}

// ── Query matching ────────────────────────────────────────────────────────────
// Words in ALL CAPS (e.g. "PLUS") are matched case-sensitively.
// Mixed/lowercase words are matched case-insensitively.
const queryMatchesText = (query, text) => {
  return query.split(' ').every(word => {
    const isAllCaps = word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)
    return isAllCaps
      ? new RegExp(`\\b${word}\\b`).test(text)
      : text.toLowerCase().includes(word.toLowerCase())
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isValidDate = (dateStr) => {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return !isNaN(d) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100
}

const analyzeSentiment = (text) => {
  const result = sentiment.analyze(text)
  const score = result.score
  const normalized = Math.max(-1, Math.min(1, score / 10))
  const label = normalized > 0.05 ? 'positive' : normalized < -0.05 ? 'negative' : 'neutral'
  return { label, score: parseFloat(normalized.toFixed(3)), confidence: 0.75 }
}

const guessPlatform = (url = '') => {
  const u = url.toLowerCase()
  if (u.includes('reddit.com')) return 'Reddit'
  if (u.includes('youtube.com')) return 'YouTube'
  if (u.includes('linkedin.com')) return 'LinkedIn'
  if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter'
  return 'News'
}

const detectLanguage = (text) => {
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh'
  const malay = /\b(dan|atau|yang|dengan|untuk|dalam|pada|dari|ini|itu|tidak|ada)\b/i
  if (malay.test(text)) return 'ms'
  return 'en'
}

const guessMentionType = (text) => {
  const t = text.toLowerCase()
  if (t.match(/complaint|complain|issue|problem|broken|fail/)) return 'complaint'
  if (t.match(/award|win|achiev|congrat|excellent|best/)) return 'praise'
  if (t.match(/\?|how|what|why|when|where/)) return 'question'
  return 'news'
}

const extractTopics = (text) => {
  const topics = []
  const t = text.toLowerCase()
  if (t.match(/hospital|health|medical|clinic/)) topics.push('Healthcare')
  if (t.match(/infra|facility|building|maintenance/)) topics.push('Infrastructure')
  if (t.match(/tech|digital|software|platform/)) topics.push('Technology')
  if (t.match(/esg|sustainability|environment|green/)) topics.push('ESG')
  if (t.match(/staff|employee|worker|hiring/)) topics.push('People')
  if (t.match(/revenue|profit|quarterly|result|bursa/)) topics.push('Financial')
  return topics.length ? topics : ['General']
}



// ── Twitter135 (RapidAPI) ─────────────────────────────────────────────────────
const fetchTwitter135 = async ({ query, keywordId, group, isCompetitor }) => {
  if (!TWITTER135_API_KEY) {
    console.warn(`[Twitter135] Skipping "${query}" — API key not configured`)
    return []
  }

  const results = []

  for (const type of ['Latest', 'Top']) {
    try {
      const url = `https://twitter135.p.rapidapi.com/Search/?q=${encodeURIComponent(query)}&count=20&type=${type}`
      const res = await fetch(url, {
        headers: {
          'x-rapidapi-key': TWITTER135_API_KEY,
          'x-rapidapi-host': 'twitter135.p.rapidapi.com',
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`)

      const instructions = data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || []
      for (const inst of instructions) {
        for (const entry of (inst.entries || [])) {
          try {
            const tweet = entry.content.itemContent.tweet_results.result
            const tweetLegacy = tweet.legacy
            const userLegacy  = tweet.core.user_results.result.legacy
            const tweetId     = tweetLegacy.id_str || tweet.rest_id
            const handle      = userLegacy.screen_name
            const tweetUrl    = `https://twitter.com/${handle}/status/${tweetId}`
            const text        = tweetLegacy.full_text || ''

            // Skip if keyword not in tweet text (ALL CAPS words matched case-sensitively)
            if (!queryMatchesText(query, text)) continue

            const sent = analyzeSentiment(text)
            results.push({
              text: text.slice(0, 280),
              full_text: text,
              platform: 'Twitter',
              url: tweetUrl,
              author_name: userLegacy.name,
              author_handle: handle,
              author_followers: userLegacy.followers_count || 0,
              author_verified: userLegacy.verified || tweet.core.user_results.result.is_blue_verified || false,
              published_at: new Date(tweetLegacy.created_at).toISOString(),
              _rawDate: tweetLegacy.created_at || null,
              keyword_matched: [keywordId],
              keyword_group: group,
              sentiment_label: sent.label,
              sentiment_score: sent.score,
              sentiment_confidence: sent.confidence,
              emotions: [],
              engagement_likes: tweetLegacy.favorite_count || 0,
              engagement_shares: tweetLegacy.retweet_count || 0,
              engagement_comments: tweetLegacy.reply_count || 0,
              engagement_reach: userLegacy.followers_count || 0,
              geography_country: 'Malaysia',
              geography_region: 'Malaysia',
              language: detectLanguage(text),
              mention_type: guessMentionType(text),
              risk_flag: sent.label === 'negative' && sent.confidence > 0.7,
              risk_level: sent.label === 'negative' ? 'medium' : null,
              topics: extractTopics(text),
              is_competitor: isCompetitor || false,
              source: 'twitter135',
              status: 'new',
            })
          } catch { /* skip malformed entries */ }
        }
      }
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      console.warn(`[Twitter135] Failed for "${query}" type=${type}:`, e.message)
    }
  }

  // Deduplicate by URL within this batch
  const seen = new Set()
  return results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true })
}

// ── Real-Time News Data (RockAPIs via RapidAPI) ───────────────────────────────
const fetchRealTimeNews = async ({ query, keywordId, group, isCompetitor }) => {
  if (!RAPIDAPI_KEY) {
    console.warn(`[RealTimeNews] Skipping "${query}" — RapidAPI key not configured`)
    return []
  }

  const url = `https://real-time-news-data.p.rapidapi.com/search?query=${encodeURIComponent(query)}&limit=10&country=MY&lang=en`
  try {
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'real-time-news-data.p.rapidapi.com',
      },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`)
    if (data.status !== 'OK') throw new Error(data.request_id || 'Non-OK status')

    return (data.data || []).filter(article => {
      const text = `${article.title} ${article.snippet || ''} ${article.link || ''}`
      return queryMatchesText(query, text)
    }).map(article => {
      const text = `${article.title} ${article.snippet || ''}`
      const sent = analyzeSentiment(text)
      return {
        text: article.title,
        full_text: article.snippet || '',
        platform: 'News',
        url: article.link,
        author_name: article.source_name || (article.authors?.[0]) || 'Unknown',
        author_handle: (article.source_name || 'news').toLowerCase().replace(/\s+/g, ''),
        author_followers: 0,
        author_verified: true,
        published_at: article.published_datetime_utc || new Date().toISOString(),
        _rawDate: article.published_datetime_utc || null,
        keyword_matched: [keywordId],
        keyword_group: group,
        sentiment_label: sent.label,
        sentiment_score: sent.score,
        sentiment_confidence: sent.confidence,
        emotions: [],
        engagement_likes: 0,
        engagement_shares: 0,
        engagement_comments: 0,
        engagement_reach: 0,
        geography_country: 'Malaysia',
        geography_region: 'Malaysia',
        language: detectLanguage(text),
        mention_type: guessMentionType(text),
        risk_flag: sent.label === 'negative' && sent.confidence > 0.7,
        risk_level: sent.label === 'negative' ? 'medium' : null,
        topics: extractTopics(text),
        is_competitor: isCompetitor || false,
        source: 'realtimesnews',
        status: 'new',
      }
    })
  } catch (e) {
    console.warn(`[RealTimeNews] Failed for "${query}":`, e.message)
    return []
  }
}

// ── Serper shared helpers ─────────────────────────────────────────────────────
// Own account handles — excluded from all ingest sources to avoid owned content in feed
const OWN_HANDLES = new Set([
  'uem-edgenta-berhad', 'uemedgentaberhad', 'uem_edgenta',
  'edgenta-nxt', 'edgentanxt',
  'edgenta-arabia-limited', 'edgentaarabia',
  'uem.com.my', 'uemedgenta',
  // Unrelated accounts that match keywords by name only
  'assetofinance',
])

const isOwnAccount = (handle = '', url = '') => {
  const h = handle.toLowerCase().replace(/[@\s]/g, '')
  if (OWN_HANDLES.has(h)) return true
  // Catch LinkedIn company page URLs
  if (/linkedin\.com\/posts\/(uem-edgenta|edgenta-nxt|edgenta-arabia)/i.test(url)) return true
  return false
}

// Own domains/accounts to exclude from all searches
const BLACKLIST = [
  'site:edgenta.com',
  'site:edgentanxt.com',
  'site:uem.com.my',
  'site:uemedgenta.com',
  'site:linkedin.com/in',
  'site:linkedin.com/company/uem-edgenta-berhad',
  'site:linkedin.com/company/edgenta-nxt',
  'site:linkedin.com/company/edgenta-arabia-limited',
  'site:linkedin.com/jobs',
  'site:linkedin.com/products',
  'site:linkedin.com/pub',
  'site:instagram.com/uemedgenta',
  'site:youtube.com/channel',
  'site:youtube.com/playlist',
  'site:youtube.com/c/uemedgentavideos',
  'site:facebook.com/UEMEdgentaBerhad',
  'site:facebook.com/EdgentaNXT',
  'site:facebook.com/yonghowe',
  'site:instagram.com',
  'site:insage.com.my',
  'site:wikipedia.org',
  'site:hiredly.com',
  'site:klsescreener.com',
  'site:tradingview.com',
  'site:oraclecloud.com',
  'site:bebee.com',
  'site:pikom.org.my',
  'site:marketscreener.com/insider',
  'site:prosple.com',
  'site:trabajo.org',
].map(s => `-${s}`).join(' ')

// Domains blocked across ALL sources (not just Serper query strings)
const BLACKLIST_DOMAINS = [
  'klsescreener.com', 'tradingview.com', 'bebee.com', 'prosple.com',
  'trabajo.org', 'hiredly.com', 'wikipedia.org', 'insage.com.my',
  'oraclecloud.com', 'marketscreener.com', 'reveliolabs.com',
]

const isBlacklisted = (url) => {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    return BLACKLIST_DOMAINS.some(d => host === d || host.endsWith('.' + d))
  } catch { return false }
}

// ── LinkedIn post scraper ─────────────────────────────────────────────────────
const scrapeLinkedInPost = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
    if (!res.ok) return null
    const html = await res.text()

    const get = (pattern) => { const m = html.match(pattern); return m?.[1] || null }

    const body     = get(/articleBody[":\s]+"([^"]{10,2000})"/)
    const author   = get(/author.*?name[":\s]+"([^"]{3,80})"/)
    const date     = get(/datePublished[":\s]+"([^"]+)"/)
    const likes    = parseInt(get(/(\d+)\s*(?:like|reaction)/i) || '0')
    const comments = parseInt(get(/(\d+)\s*comment/i) || '0')

    return { body, author, date, likes, comments }
  } catch {
    return null
  }
}

const extractAuthorFromUrl = (url = '') => {
  try {
    const u = new URL(url)
    // LinkedIn posts: /posts/username_slug-activity-id => extract username
    if (u.hostname.includes('linkedin.com')) {
      const match = u.pathname.match(/\/posts\/([^_]+)/)
      if (match) {
        const handle = match[1]
        const name = handle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        return { name, handle }
      }
    }
    // Twitter/X: /username/status/id => extract username
    if (u.hostname.includes('twitter.com') || u.hostname.includes('x.com')) {
      const match = u.pathname.match(/^\/([^/]+)\/status/)
      if (match) {
        return { name: `@${match[1]}`, handle: match[1] }
      }
    }
    // YouTube: /watch?v=id — use channel name from title if available
    if (u.hostname.includes('youtube.com')) {
      return { name: 'YouTube', handle: 'youtube' }
    }
  } catch {}
  return null
}

const serperItemToMention = (item, { query, keywordId, group, isCompetitor }, source) => {
  const text = `${item.title} ${item.snippet || ''} ${item.link || ''}`
  if (!queryMatchesText(query, text)) return null
  const sent = analyzeSentiment(`${item.title} ${item.snippet || ''}`)
  const extracted = extractAuthorFromUrl(item.link)
  return {
    text: item.title,
    full_text: item.snippet || '',
    platform: guessPlatform(item.link),
    url: item.link,
    author_name: extracted?.name || item.source || item.displayLink || 'Unknown',
    author_handle: extracted?.handle || (item.source || item.displayLink || 'unknown').toLowerCase().replace(/\s+/g, ''),
    author_followers: 0,
    author_verified: false,
    published_at: (() => { try { const d = new Date(item.date); return isNaN(d) ? new Date().toISOString() : d.toISOString() } catch { return new Date().toISOString() } })(),
    _rawDate: item.date || null,
    keyword_matched: [keywordId],
    keyword_group: group,
    sentiment_label: sent.label,
    sentiment_score: sent.score,
    sentiment_confidence: sent.confidence,
    emotions: [],
    engagement_likes: 0,
    engagement_shares: 0,
    engagement_comments: 0,
    engagement_reach: 0,
    geography_country: 'Malaysia',
    geography_region: 'Malaysia',
    language: detectLanguage(text),
    mention_type: guessMentionType(text),
    risk_flag: sent.label === 'negative' && sent.confidence > 0.7,
    risk_level: sent.label === 'negative' ? 'medium' : null,
    topics: extractTopics(text),
    is_competitor: isCompetitor || false,
    source,
    status: 'new',
  }
}

const serperPost = async (endpoint, body) => {
  if (!SERPER_KEY) return null
  const res = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`)
  return data
}

// ── Serper News fetch ─────────────────────────────────────────────────────────
const fetchSerperNews = async (search) => {
  if (!SERPER_KEY) { console.warn(`[SerperNews] No API key`); return [] }
  const results = []
  for (const hl of ['en', 'ms']) {
    for (const page of [1, 2]) {
      try {
        const data = await serperPost('news', {
          q: `${search.query} ${BLACKLIST}`,
          gl: 'my', hl, num: 10, page, tbs: 'qdr:m',
        })
        results.push(...(data.news || []).map(item => serperItemToMention(item, search, 'serper_news')).filter(Boolean))
        await new Promise(r => setTimeout(r, 300))
      } catch (e) {
        console.warn(`[SerperNews] Failed for "${search.query}" hl=${hl} page=${page}:`, e.message)
      }
    }
  }
  return results
}

// ── Serper Social fetch ───────────────────────────────────────────────────────
const fetchSerperSocial = async (search) => {
  if (!SERPER_KEY) { console.warn(`[SerperSocial] No API key`); return [] }
  const socialSites = [
    'site:twitter.com',
    'site:x.com',
    'site:linkedin.com/posts',
    'site:linkedin.com/pulse',
    'site:youtube.com/watch',
  ].join(' OR ')
  const results = []
  for (const hl of ['en', 'ms']) {
    for (const page of [1, 2]) {
      try {
        const data = await serperPost('search', {
          q: `${search.query} (${socialSites}) ${BLACKLIST}`,
          gl: 'my', hl, num: 10, page, tbs: 'qdr:m',
        })
        const items = [...(data.organic || []), ...(data.news || [])]
        results.push(...items.map(item => serperItemToMention(item, search, 'serper_social')).filter(Boolean))
        await new Promise(r => setTimeout(r, 300))
      } catch (e) {
        console.warn(`[SerperSocial] Failed for "${search.query}" hl=${hl} page=${page}:`, e.message)
      }
    }
  }
  return results
}

// ── Malaysian RSS feeds ───────────────────────────────────────────────────────
const MY_RSS_FEEDS = [
  { name: 'The Star Business',  url: 'https://www.thestar.com.my/rss/News/Business/Corporate/', lang: 'en' },
  { name: 'Free Malaysia Today',url: 'https://www.freemalaysiatoday.com/feed',                  lang: 'en' },
  { name: 'Business Today MY',  url: 'https://businesstoday.com.my/feed',                       lang: 'en' },
  { name: 'Digital News Asia',  url: 'https://www.digitalnewsasia.com/rss.xml',                 lang: 'en' },
  { name: 'BFM Business Hour',  url: 'https://www.bfm.my/podcast/the-business-hour/feed.rss',  lang: 'en' },
  // Google Alerts
  { name: 'Google Alerts – UEM Edgenta',  url: 'https://www.google.com/alerts/feeds/12316143374781661516/1101122181871461795', lang: 'en' },
  { name: 'Google Alerts – Edgenta NXT',  url: 'https://www.google.com/alerts/feeds/12316143374781661516/3382957027404277608', lang: 'en' },
  { name: 'Google Alerts – Shaiful Subhan', url: 'https://www.google.com/alerts/feeds/12316143374781661516/5404247446319529934', lang: 'en' },
  { name: 'Google Alerts – Chua Yong Howe', url: 'https://www.google.com/alerts/feeds/12316143374781661516/16525644864808479612', lang: 'en' },
]

const parseRSSDate = (str) => {
  try { const d = new Date(str); return isNaN(d) ? new Date().toISOString() : d.toISOString() }
  catch { return new Date().toISOString() }
}

// ── Reddit fetch ──────────────────────────────────────────────────────────────
const fetchReddit = async ({ query, keywordId, group, isCompetitor }) => {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=25&t=month`
    const res = await fetch(url, { headers: { 'User-Agent': 'BrandSentimentBot/1.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const posts = data?.data?.children || []

    return posts.filter(({ data: p }) => {
      const text = `${p.title} ${p.selftext || ''} https://www.reddit.com${p.permalink}`.trim()
      return queryMatchesText(query, text)
    }).map(({ data: p }) => {
      const text = `${p.title} ${p.selftext || ''}`.trim()
      const sent = analyzeSentiment(text)
      return {
        text: p.title,
        full_text: p.selftext || '',
        platform: 'Reddit',
        url: `https://www.reddit.com${p.permalink}`,
        author_name: p.author,
        author_handle: p.author,
        author_followers: 0,
        author_verified: false,
        published_at: p.created_utc ? new Date(Math.min(p.created_utc, 9999999999) * 1000).toISOString() : new Date().toISOString(),
        _rawDate: p.created_utc ? String(p.created_utc) : null,
        keyword_matched: [keywordId],
        keyword_group: group,
        sentiment_label: sent.label,
        sentiment_score: sent.score,
        sentiment_confidence: sent.confidence,
        emotions: [],
        engagement_likes: p.score || 0,
        engagement_shares: 0,
        engagement_comments: p.num_comments || 0,
        engagement_reach: p.score || 0,
        geography_country: 'Unknown',
        geography_region: p.subreddit ? `r/${p.subreddit}` : 'Unknown',
        language: detectLanguage(text),
        mention_type: guessMentionType(text),
        risk_flag: sent.label === 'negative' && sent.confidence > 0.7,
        risk_level: sent.label === 'negative' ? 'medium' : null,
        topics: extractTopics(text),
        is_competitor: isCompetitor,
        source: 'reddit',
        status: 'new',
      }
    })
  } catch (e) {
    console.warn(`[Reddit] Failed for "${query}":`, e.message)
    return []
  }
}

// ── Google News (RapidAPI) ─────────────────────────────────────────────────────
const fetchGoogleNews = async ({ query, keywordId, group, isCompetitor }) => {
  if (!GOOGLE_NEWS_KEY) {
    console.warn(`[GoogleNews] Skipping "${query}" — no API key`)
    return []
  }
  try {
    const url = `https://google-news13.p.rapidapi.com/search?keyword=${encodeURIComponent(query)}&lr=en-US`
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'google-news13.p.rapidapi.com',
        'x-rapidapi-key': GOOGLE_NEWS_KEY,
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : []

    return items.filter(item => !isBlacklisted(item.url || item.link || '')).map(item => {
      const text = `${item.title} ${item.snippet || ''}`.trim()
      const sent = analyzeSentiment(text)
      const pubDate = (() => {
      if (!item.timestamp) return new Date().toISOString()
      // timestamp may be seconds or milliseconds — clamp to valid range
      const ts = item.timestamp > 9999999999 ? item.timestamp : item.timestamp * 1000
      const d = new Date(ts)
      return isNaN(d) || d.getFullYear() > 2100 ? new Date().toISOString() : d.toISOString()
    })()
      return {
        text: item.title,
        full_text: item.snippet || '',
        platform: 'News',
        url: item.newsUrl || item.url || '',
        author_name: item.publisher?.name || item.publisher || 'Unknown',
        author_handle: (item.publisher?.name || item.publisher || 'unknown').toLowerCase().replace(/\s+/g, ''),
        author_followers: 0,
        author_verified: false,
        published_at: pubDate,
        _rawDate: item.timestamp ? String(item.timestamp) : null,
        keyword_matched: [keywordId],
        keyword_group: group,
        sentiment_label: sent.label,
        sentiment_score: sent.score,
        sentiment_confidence: sent.confidence,
        emotions: [],
        engagement_likes: 0,
        engagement_shares: 0,
        engagement_comments: 0,
        engagement_reach: 0,
        geography_country: 'Unknown',
        geography_region: 'Unknown',
        language: detectLanguage(text),
        mention_type: guessMentionType(text),
        risk_flag: sent.label === 'negative' && sent.confidence > 0.7,
        risk_level: sent.label === 'negative' ? 'medium' : null,
        topics: extractTopics(text),
        is_competitor: isCompetitor,
        source: 'google_news_rapidapi',
        status: 'new',
      }
    })
  } catch (e) {
    console.warn(`[GoogleNews] Failed for "${query}":`, e.message)
    return []
  }
}

// ── World News API ────────────────────────────────────────────────────────────
const fetchWorldNews = async ({ query, keywordId, group, isCompetitor }) => {
  if (!WORLDNEWS_API_KEY) {
    console.warn(`[WorldNews] Skipping "${query}" — WORLDNEWS_API_KEY not configured`)
    return []
  }
  try {
    const params = new URLSearchParams({
      text: query,
      language: 'en',
      number: '10',
      'api-key': WORLDNEWS_API_KEY,
    })
    const res = await fetch(`https://api.worldnewsapi.com/search-news?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const articles = data.news || []

    return articles.filter(article => {
      if (isBlacklisted(article.url || '')) return false
      const text = `${article.title} ${article.text || article.summary || ''} ${article.url || ''}`
      return queryMatchesText(query, text)
    }).map(article => {
      const text = `${article.title} ${article.text || article.summary || ''}`
      const sent = analyzeSentiment(text)
      return {
        text: article.title,
        full_text: article.text || article.summary || '',
        platform: 'News',
        url: article.url,
        author_name: article.author || article.source_country || 'Unknown',
        author_handle: (article.author || 'unknown').toLowerCase().replace(/\s+/g, ''),
        author_followers: 0,
        author_verified: true,
        published_at: article.publish_date ? new Date(article.publish_date).toISOString() : new Date().toISOString(),
        _rawDate: article.publish_date || null,
        keyword_matched: [keywordId],
        keyword_group: group,
        sentiment_label: sent.label,
        sentiment_score: sent.score,
        sentiment_confidence: sent.confidence,
        emotions: [],
        engagement_likes: 0,
        engagement_shares: 0,
        engagement_comments: 0,
        engagement_reach: 0,
        geography_country: article.source_country || 'Unknown',
        geography_region: article.source_country || 'Unknown',
        language: article.language || detectLanguage(text),
        mention_type: guessMentionType(text),
        risk_flag: sent.label === 'negative' && sent.confidence > 0.7,
        risk_level: sent.label === 'negative' ? 'medium' : null,
        topics: extractTopics(text),
        is_competitor: isCompetitor || false,
        source: 'worldnews',
        status: 'new',
      }
    })
  } catch (e) {
    console.warn(`[WorldNews] Failed for "${query}":`, e.message)
    return []
  }
}

const fetchRSS = async (searches) => {
  const results = []
  const keywords = searches.map(s => ({ query: s.query, search: s }))

  for (const feed of MY_RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'EdgentaSentimentBot/1.0', 'Accept': 'application/rss+xml, application/xml, text/xml' }
      })
      if (!res.ok) { console.warn(`[RSS] ${feed.name}: HTTP ${res.status}`); continue }
      const xml = await res.text()

      // Parse items with regex (no xml parser needed)
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1])

      for (const item of items) {
        const getTag = (tag) => {
          const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's'))
          return m?.[1]?.trim() || ''
        }
        const title   = getTag('title')
        const link    = getTag('link') || item.match(/<link>(.*?)<\/link>/s)?.[1]?.trim() || ''
        const desc    = getTag('description')
        const pubDate = getTag('pubDate') || getTag('dc:date')
        const text    = `${title} ${desc}`

        if (!title || !link) continue

        // Check if any keyword matches
        const matched = keywords.find(k => queryMatchesText(k.query, text))
        if (!matched) continue

        // Skip own domains + global blacklist
        if (BLACKLIST.split(' ').some(b => b.startsWith('-site:') && link.includes(b.replace('-site:', '')))) continue
        if (isBlacklisted(link)) continue

        const sent = analyzeSentiment(text)
        results.push({
          text: title,
          full_text: desc,
          platform: 'News',
          url: link.replace(/\s/g, ''),
          author_name: feed.name,
          author_handle: feed.name.toLowerCase().replace(/\s+/g, ''),
          author_followers: 0,
          author_verified: true,
          published_at: parseRSSDate(pubDate),
          _rawDate: pubDate || null,
          keyword_matched: [matched.search.keywordId],
          keyword_group: matched.search.group,
          sentiment_label: sent.label,
          sentiment_score: sent.score,
          sentiment_confidence: sent.confidence,
          emotions: [],
          engagement_likes: 0,
          engagement_shares: 0,
          engagement_comments: 0,
          engagement_reach: 0,
          geography_country: 'Malaysia',
          geography_region: 'Malaysia',
          language: feed.lang,
          mention_type: guessMentionType(text),
          risk_flag: sent.label === 'negative' && sent.confidence > 0.7,
          risk_level: sent.label === 'negative' ? 'medium' : null,
          topics: extractTopics(text),
          is_competitor: matched.search.isCompetitor || false,
          source: 'rss_my',
          status: 'new',
        })
      }
      console.log(`[RSS] ${feed.name}: ${items.length} items checked`)
      await new Promise(r => setTimeout(r, 300))
    } catch (e) {
      console.warn(`[RSS] ${feed.name} failed:`, e.message)
    }
  }
  return results
}

// ── Save to Supabase ──────────────────────────────────────────────────────────
const saveToSupabase = async (mentions) => {
  if (mentions.length === 0) return { saved: 0, skipped: 0 }

  // upsert on url — skips duplicates automatically
  const { data, error } = await supabase
    .from('mentions')
    .upsert(mentions, { onConflict: 'url', ignoreDuplicates: true })
    .select('id')

  if (error) {
    console.error('[Supabase] Save error:', error.message)
    return { saved: 0, skipped: mentions.length }
  }

  return { saved: data?.length || 0, skipped: mentions.length - (data?.length || 0) }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const run = async () => {
  console.log(`\n[Ingest] Starting at ${new Date().toISOString()}`)

  const { searches } = await loadKeywordsFromDB()
  const allMentions = []

  // Fetch from Twitter135
  const twitterSearches = searches.filter(s => !s.query.startsWith('#'))
  for (const search of twitterSearches) {
    console.log(`[Twitter135] Fetching: "${search.query}"`)
    const results = await fetchTwitter135(search)
    console.log(`[Twitter135] Got ${results.length} results`)
    allMentions.push(...results)
    await new Promise(r => setTimeout(r, 1000))
  }

  // Fetch from Real-Time News Data (RockAPIs), skip hashtag keywords
  const rtnSearches = searches.filter(s => !s.query.startsWith('#'))
  for (const search of rtnSearches) {
    console.log(`[RealTimeNews] Fetching: "${search.query}"`)
    const results = await fetchRealTimeNews(search)
    console.log(`[RealTimeNews] Got ${results.length} results`)
    allMentions.push(...results)
    await new Promise(r => setTimeout(r, 1000))
  }

  // Fetch from Serper News
  for (const search of searches) {
    console.log(`[SerperNews] Fetching: "${search.query}"`)
    const results = await fetchSerperNews(search)
    console.log(`[SerperNews] Got ${results.length} results`)
    allMentions.push(...results)
    await new Promise(r => setTimeout(r, 300))
  }

  // Fetch from Serper Social (Twitter, LinkedIn, YouTube)
  for (const search of searches) {
    console.log(`[SerperSocial] Fetching: "${search.query}"`)
    const results = await fetchSerperSocial(search)
    console.log(`[SerperSocial] Got ${results.length} results`)
    allMentions.push(...results)
    await new Promise(r => setTimeout(r, 300))
  }

  // Fetch from Google News (RapidAPI)
  for (const search of searches) {
    console.log(`[GoogleNews] Fetching: "${search.query}"`)
    const results = await fetchGoogleNews(search)
    console.log(`[GoogleNews] Got ${results.length} results`)
    allMentions.push(...results)
    await new Promise(r => setTimeout(r, 500))
  }

  // Fetch from World News API
  for (const search of searches) {
    console.log(`[WorldNews] Fetching: "${search.query}"`)
    const results = await fetchWorldNews(search)
    console.log(`[WorldNews] Got ${results.length} results`)
    allMentions.push(...results)
    await new Promise(r => setTimeout(r, 500))
  }

  // Fetch from Reddit
  for (const search of searches) {
    console.log(`[Reddit] Fetching: "${search.query}"`)
    const results = await fetchReddit(search)
    console.log(`[Reddit] Got ${results.length} results`)
    allMentions.push(...results)
    await new Promise(r => setTimeout(r, 2000)) // Reddit rate limit
  }

  // Fetch from Malaysian RSS feeds
  console.log(`\n[RSS] Scanning ${MY_RSS_FEEDS.length} Malaysian news feeds...`)
  const rssResults = await fetchRSS(searches)
  console.log(`[RSS] Got ${rssResults.length} matching mentions`)
  allMentions.push(...rssResults)

  // Enrich LinkedIn mentions with real post content + engagement
  const linkedInMentions = allMentions.filter(m => m.url.includes('linkedin.com/posts/'))
  console.log(`\n[LinkedIn] Enriching ${linkedInMentions.length} LinkedIn posts...`)
  for (const m of linkedInMentions) {
    const scraped = await scrapeLinkedInPost(m.url)
    if (scraped) {
      if (scraped.body)    m.full_text = scraped.body
      if (scraped.author)  { m.author_name = scraped.author; m.author_handle = scraped.author.toLowerCase().replace(/\s+/g, '') }
      if (scraped.date)    m.published_at = new Date(scraped.date).toISOString()
      if (scraped.likes)   m.engagement_likes = scraped.likes
      if (scraped.comments) m.engagement_comments = scraped.comments
      // Re-run sentiment on real text
      const sent = analyzeSentiment(`${m.text} ${m.full_text}`)
      m.sentiment_label = sent.label
      m.sentiment_score = sent.score
    }
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`[Ingest] Total fetched: ${allMentions.length}`)

  // Validate — drop own accounts and mentions that don't contain the keyword
  const validated = allMentions.filter(m => {
    if (isOwnAccount(m.author_handle, m.url)) return false
    const keyword = searches.find(s => s.keywordId === m.keyword_matched?.[0])?.query || ''
    if (!keyword) return false
    const haystack = `${m.text} ${m.full_text} ${m.url}`
    return queryMatchesText(keyword, haystack)
  })
  const dropped = allMentions.length - validated.length
  if (dropped > 0) console.log(`[Ingest] Dropped ${dropped} false positives (keyword not found in content or own account)`)

  // ── Ingest report ─────────────────────────────────────────────────────────
  const badDateCount = validated.filter(m => !isValidDate(m._rawDate)).length
  console.log(`\n${'─'.repeat(80)}`)
  console.log(`INGEST REPORT — ${validated.length} posts to save (${badDateCount} with missing/bad date)`)
  console.log('─'.repeat(80))
  validated.forEach((m, i) => {
    const dateOk = isValidDate(m._rawDate)
    const dateFlag = dateOk ? '' : '  ⚠️  NO PROPER DATE'
    console.log(`\n[${i + 1}] [${m.source}] ${m.text.slice(0, 80)}${m.text.length > 80 ? '…' : ''}`)
    console.log(`     Keyword  : ${m.keyword_matched?.[0] || '—'}`)
    console.log(`     URL      : ${m.url}`)
    console.log(`     Raw date : ${m._rawDate || '(none)'}${dateFlag}`)
    console.log(`     Saved as : ${m.published_at}`)
    console.log(`     Sentiment: ${m.sentiment_label} (${m.sentiment_score})`)
  })
  console.log(`\n${'─'.repeat(80)}\n`)

  // Strip internal flags before saving
  const toSave = validated.map(({ _rawDate, ...rest }) => rest)

  const { saved, skipped } = await saveToSupabase(toSave)
  console.log(`[Ingest] Saved: ${saved} new | Skipped (duplicates): ${skipped}`)
  console.log(`[Ingest] Done at ${new Date().toISOString()}\n`)
}

run().catch(console.error)
