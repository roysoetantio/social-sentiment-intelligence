#!/usr/bin/env node
/**
 * One-off ingest for Google Alerts RSS feeds only.
 * Run: node scripts/ingest-google-alerts.js
 */

import { createClient } from '@supabase/supabase-js'
import Sentiment from 'sentiment'
import ws from 'ws'
import 'dotenv/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })
const sentiment = new Sentiment()

const GOOGLE_ALERT_FEEDS = [
  { name: 'Google Alerts – UEM Edgenta',   url: 'https://www.google.com/alerts/feeds/12316143374781661516/1101122181871461795', keywordId: 'uem-edgenta',    group: 'corporate',  lang: 'en' },
  { name: 'Google Alerts – Edgenta NXT',   url: 'https://www.google.com/alerts/feeds/12316143374781661516/3382957027404277608', keywordId: 'edgenta-nxt',    group: 'products',   lang: 'en' },
  { name: 'Google Alerts – Shaiful Subhan',url: 'https://www.google.com/alerts/feeds/12316143374781661516/5404247446319529934', keywordId: 'shaiful-subhan', group: 'executives', lang: 'en' },
  { name: 'Google Alerts – Chua Yong Howe',url: 'https://www.google.com/alerts/feeds/12316143374781661516/16525644864808479612',keywordId: 'chua-yong-howe', group: 'executives', lang: 'en' },
]

const analyzeSentiment = (text) => {
  const result = sentiment.analyze(text)
  const normalized = Math.max(-1, Math.min(1, result.score / 10))
  const label = normalized > 0.05 ? 'positive' : normalized < -0.05 ? 'negative' : 'neutral'
  return { label, score: parseFloat(normalized.toFixed(3)), confidence: 0.75 }
}

const guessMentionType = (text) => {
  const t = text.toLowerCase()
  if (t.match(/complaint|complain|issue|problem|broken|fail/)) return 'complaint'
  if (t.match(/award|win|achiev|congrat|excellent|best/)) return 'praise'
  if (t.match(/crisis|emergency|urgent|danger|risk/)) return 'crisis'
  return 'news'
}

const extractTopics = (text) => {
  const topics = []
  const t = text.toLowerCase()
  if (t.match(/hospital|health|medical/)) topics.push('Healthcare')
  if (t.match(/infra|facility|maintenance/)) topics.push('Infrastructure')
  if (t.match(/tech|digital|software/)) topics.push('Technology')
  if (t.match(/esg|sustainability|green/)) topics.push('ESG')
  if (t.match(/revenue|profit|quarterly|bursa/)) topics.push('Financial')
  return topics.length ? topics : ['General']
}

const parseRSSDate = (str) => {
  try { const d = new Date(str); return isNaN(d) ? new Date().toISOString() : d.toISOString() }
  catch { return new Date().toISOString() }
}

const run = async () => {
  const rows = []

  for (const feed of GOOGLE_ALERT_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'EdgentaSentimentBot/1.0', Accept: 'application/rss+xml, application/xml, text/xml' }
      })
      if (!res.ok) { console.warn(`[${feed.name}] HTTP ${res.status}`); continue }
      const xml = await res.text()

      const items = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1])

      for (const item of items) {
        const getTag = (tag) => {
          const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's'))
          return m?.[1]?.trim() || ''
        }
        const title   = getTag('title')
        const linkMatch = item.match(/<link[^>]+href=["']([^"']+)["']/)
        const link    = linkMatch?.[1] || getTag('link') || ''
        const desc    = getTag('content') || getTag('summary') || ''
        const pubDate = getTag('published') || getTag('updated')
        const text    = `${title} ${desc}`

        if (!title || !link) continue

        const sent = analyzeSentiment(text)
        rows.push({
          text: title,
          full_text: desc,
          platform: 'News',
          url: link.replace(/\s/g, ''),
          author_name: feed.name,
          author_handle: feed.name.toLowerCase().replace(/\s+/g, ''),
          author_followers: 0,
          author_verified: true,
          published_at: parseRSSDate(pubDate),
          keyword_matched: [feed.keywordId],
          keyword_group: feed.group,
          sentiment_label: sent.label,
          sentiment_score: sent.score,
          sentiment_confidence: sent.confidence,
          emotions: [],
          engagement_likes: 0, engagement_shares: 0, engagement_comments: 0, engagement_reach: 0,
          geography_country: 'Malaysia', geography_region: 'Malaysia',
          language: feed.lang,
          mention_type: guessMentionType(text),
          risk_flag: sent.label === 'negative' && sent.confidence > 0.7,
          risk_level: sent.label === 'negative' ? 'medium' : null,
          topics: extractTopics(text),
          is_competitor: false,
          source: 'rss_my',
          status: 'new',
        })
      }
      console.log(`[${feed.name}] ${items.length} items fetched`)
    } catch (e) {
      console.warn(`[${feed.name}] Failed:`, e.message)
    }
  }

  if (rows.length === 0) { console.log('No new items to save.'); return }

  const { data, error } = await supabase
    .from('mentions')
    .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
    .select('id')

  if (error) { console.error('[Supabase] Save error:', error.message); return }
  console.log(`\n✅ Saved ${data?.length ?? 0} new mentions (${rows.length - (data?.length ?? 0)} duplicates skipped)`)
}

run()
