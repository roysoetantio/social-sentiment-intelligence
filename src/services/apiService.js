import { supabase } from '../lib/supabase'

const rowToMention = (row) => ({
  id: row.id,
  text: row.text,
  fullText: row.full_text || '',
  summary: row.summary || '',
  platform: row.platform,
  url: row.url || '#',
  author: {
    name: row.author_name || 'Unknown',
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

export const fetchAIDigest = async () => {
  const { data, error } = await supabase
    .from('ai_digest')
    .select('content, generated_at')
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

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
