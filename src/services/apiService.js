import { supabase } from '../lib/supabase'

const DOMAIN_NAMES = {
  'thestar.com.my': 'The Star',
  'nst.com.my': 'New Straits Times',
  'malaymail.com': 'Malay Mail',
  'freemalaysiatoday.com': 'Free Malaysia Today',
  'malaysiakini.com': 'Malaysiakini',
  'theedgemalaysia.com': 'The Edge Malaysia',
  'theedgemarkets.com': 'The Edge Markets',
  'bernama.com': 'Bernama',
  'sinchew.com.my': 'Sin Chew Daily',
  'chinapress.com.my': 'China Press',
  'orientaldaily.com.my': 'Oriental Daily',
  'kwongwah.com.my': 'Kwong Wah',
  'hmetro.com.my': 'Harian Metro',
  'utusan.com.my': 'Utusan Malaysia',
  'bharian.com.my': 'Berita Harian',
  'astroawani.com': 'Astro Awani',
  'businesstimes.com.sg': 'Business Times',
  'straitstimes.com': 'The Straits Times',
  'reuters.com': 'Reuters',
  'bloomberg.com': 'Bloomberg',
  'cnbc.com': 'CNBC',
  'ft.com': 'Financial Times',
  'wsj.com': 'Wall Street Journal',
  'twitter.com': 'Twitter',
  'x.com': 'X (Twitter)',
  'linkedin.com': 'LinkedIn',
  'youtube.com': 'YouTube',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'reddit.com': 'Reddit',
  'klsescreener.com': 'KLSE Screener',
  'i3investor.com': 'i3investor',
  'investalks.com': 'InvestAlks',
  'bursamalaysia.com': 'Bursa Malaysia',
  'stocknews.com': 'StockNews',
}

const SOCIAL_DOMAINS = new Set(['twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'reddit.com', 'youtube.com'])

export const isSocialUrl = (url) => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return SOCIAL_DOMAINS.has(hostname)
  } catch {
    return false
  }
}

const getSourceName = (url) => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    if (DOMAIN_NAMES[hostname]) return DOMAIN_NAMES[hostname]
    const base = hostname.split('.')[0]
    return base.charAt(0).toUpperCase() + base.slice(1)
  } catch {
    return 'Unknown'
  }
}

const rowToMention = (row) => ({
  id: row.id,
  text: row.text,
  fullText: row.full_text || '',
  summary: row.summary || '',
  platform: row.platform,
  url: row.url || '#',
  author: {
    name: row.author_name || getSourceName(row.url),
    handle: row.author_handle || 'unknown',
    followers: row.author_followers || 0,
    verified: row.author_verified || false,
  },
  publishedAt: row.published_at,
  keywordMatched: row.keyword_matched || [],
  keywordGroup: row.keyword_group || 'corporate',
  sentiment: {
    label: row.analyst_sentiment || row.sentiment_label || 'neutral',
    originalLabel: row.analyst_sentiment ? (row.sentiment_label || 'neutral') : null,
    score: row.sentiment_score || 0,
    confidence: row.sentiment_confidence || 0,
  },
  emotions: row.emotions || [],
  engagement: {
    likes: row.engagement_likes || 0,
    shares: row.engagement_shares || 0,
    comments: row.engagement_comments || 0,
    reach: row.engagement_reach || 0,
  },
  geography: {
    country: row.geography_country || 'Malaysia',
    region: row.geography_region || 'Malaysia',
  },
  language: row.language || 'en',
  mentionType: row.mention_type || 'news',
  riskFlag: row.risk_flag || false,
  riskLevel: row.risk_level || null,
  topics: row.topics || [],
  isCompetitor: row.is_competitor || false,
  excluded: row.analyst_excluded || false,
  analystReview: {
    reviewed: row.analyst_reviewed || false,
    overriddenSentiment: row.analyst_sentiment || null,
    reason: row.analyst_reason || '',
    flaggedBy: row.analyst_flagged_by || null,
    flaggedAt: row.analyst_flagged_at || null,
    assignedTo: row.assigned_to || null,
  },
  status: row.status || 'new',
  source: row.source,
})

export const fetchAIDigest = async (department) => {
  let q = supabase
    .from('ai_digest')
    .select('content, generated_at, department')
    .order('generated_at', { ascending: false })
    .limit(1)
  // Scope to the current tenant's digest. RLS also enforces this, but filtering
  // here ensures a super admin (who can read all) gets the right department's row.
  if (department) q = q.eq('department', department)

  const { data, error } = await q.maybeSingle()

  if (error || !data) return null
  return data
}

export const fetchAllMentions = async () => {
  const { data, error } = await supabase
    .from('mentions')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(1000)

  if (error) {
    console.warn('[Dashboard] Supabase fetch failed', error.message)
    return { mentions: [], source: 'error', liveCount: 0 }
  }

  if (!data || data.length === 0) {
    console.info('[Dashboard] No data in Supabase yet — run npm run ingest to populate')
    return { mentions: [], source: 'empty', liveCount: 0 }
  }

  const mentions = data.map(rowToMention)
  console.info(`[Dashboard] Loaded ${mentions.length} mentions from Supabase`)
  return { mentions, source: 'supabase', liveCount: mentions.length }
}

// ---------------------------------------------------------------------------
// Social Feed — our OWN published posts (social_posts table), not mentions.
// Deliberately a separate fetch from fetchAllMentions: owned content must never
// reach the mentions pipeline or its counts.
// ---------------------------------------------------------------------------
// PostgREST caps a single response, so a flat .limit() would silently truncate
// the feed once the account's history outgrows it — and the page's "All" range
// would then quietly mean "all of the first page". Walk the rows in blocks.
const SOCIAL_PAGE = 1000

export const fetchSocialPosts = async ({ platform = 'instagram', limit = Infinity } = {}) => {
  const rows = []

  for (let from = 0; rows.length < limit; from += SOCIAL_PAGE) {
    const take = Math.min(SOCIAL_PAGE, limit - rows.length)
    let q = supabase
      .from('social_posts')
      .select('*')
      .order('published_at', { ascending: false })
      .range(from, from + take - 1)

    if (platform && platform !== 'all') q = q.eq('platform', platform)

    const { data, error } = await q

    if (error) {
      console.warn('[SocialFeed] Supabase fetch failed', error.message)
      // Keep whatever we already have rather than throwing the page to an
      // error state over a failure on page three.
      if (rows.length === 0) return { posts: [], status: 'error', message: error.message }
      break
    }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < take) break
  }

  if (rows.length === 0) return { posts: [], status: 'empty' }

  return { posts: rows.map(rowToSocialPost), status: 'ok' }
}

const rowToSocialPost = (row) => {
  // total_interactions isn't stored as its own column — derive the engagement
  // figure from the parts we do keep so the card and the sort agree.
  const engagements = (row.likes || 0) + (row.comments_count || 0)
    + (row.shares || 0) + (row.saves || 0)
  const reach = row.reach || 0
  return {
    id: row.id,
    platform: row.platform,
    handle: row.account_handle,
    type: row.post_type || 'POST',
    caption: row.caption || '',
    permalink: row.permalink,
    thumbnail: row.thumbnail_url,
    publishedAt: row.published_at,
    likes: row.likes || 0,
    comments: row.comments_count || 0,
    shares: row.shares || 0,
    saves: row.saves || 0,
    reach,
    views: row.video_views || 0,
    engagements,
    // Reach-based rather than follower-based: reach is what the post actually
    // achieved, and it's the number Meta itself reports against.
    engagementRate: reach > 0 ? (engagements / reach) * 100 : null,
  }
}
