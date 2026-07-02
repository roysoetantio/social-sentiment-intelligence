#!/usr/bin/env node
/**
 * Standalone Apify Instagram ingest — runs hashtag search for all active keywords.
 * Run: node scripts/ingest-instagram.js
 */

import { createClient } from '@supabase/supabase-js'
import Sentiment from 'sentiment'
import ws from 'ws'

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const APIFY_TOKEN   = process.env.APIFY_TOKEN

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
if (!APIFY_TOKEN) { console.error('Missing APIFY_TOKEN'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })
const sentiment = new Sentiment()

const analyzeSentiment = (text) => {
  const result = sentiment.analyze(text)
  const score = Math.max(-1, Math.min(1, result.score / 10))
  return {
    score,
    label: score > 0.05 ? 'positive' : score < -0.05 ? 'negative' : 'neutral',
  }
}

// Load active keywords from Supabase
const loadKeywords = async () => {
  const { data: keywords } = await supabase.from('keywords').select('*').eq('is_active', true)
  if (!keywords?.length) return [
    { id: 'uem-edgenta', term: 'UEM Edgenta', group_id: 'corporate' },
    { id: 'edgenta-nxt', term: 'Edgenta NXT', group_id: 'products' },
  ]
  return keywords
}

const runApifyActor = async (hashtag) => {
  console.log(`[ApifyIG] Starting run for #${hashtag}...`)
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hashtags: [hashtag],
        resultsType: 'posts',
        resultsLimit: 20,
      }),
    }
  )
  const { data: run } = await startRes.json()
  if (!run?.id) throw new Error('No run ID returned from Apify')

  // Poll until finished (max 90s)
  let status = run.status
  let attempts = 0
  while (!['SUCCEEDED', 'FAILED', 'ABORTED'].includes(status) && attempts < 18) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${APIFY_TOKEN}`)
    const { data } = await pollRes.json()
    status = data?.status
    attempts++
    process.stdout.write(`.`)
  }
  console.log(` ${status}`)

  if (status !== 'SUCCEEDED') return []

  const dsRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${run.id}/dataset/items?token=${APIFY_TOKEN}&limit=20`
  )
  return await dsRes.json()
}

const run = async () => {
  console.log('\n[ApifyIG] Starting Instagram hashtag ingest...\n')
  const keywords = [{ id: 'test', term: 'malaysia', group_id: 'test' }, { id: 'test2', term: 'infrastructure', group_id: 'test' }]
  let totalSaved = 0

  for (const kw of keywords) {
    const hashtag = kw.term.replace(/\s+/g, '').toLowerCase()
    try {
      const items = await runApifyActor(hashtag)
      if (!Array.isArray(items) || items.length === 0) {
        console.log(`[ApifyIG] No results for #${hashtag}`)
        await new Promise(r => setTimeout(r, 2000))
        continue
      }

      console.log(`[ApifyIG] #${hashtag} — ${items.length} posts found`)
      console.log(`[ApifyIG] Raw sample:`, JSON.stringify(items[0], null, 2))

      const rows = items
        .filter(item => item.caption)
        .map(item => {
          const text = item.caption || ''
          const sent = analyzeSentiment(text)
          return {
            source: 'apify_instagram',
            platform: 'Instagram',
            url: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
            text: text.slice(0, 300),
            full_text: text,
            author_name: item.ownerUsername || null,
            author_handle: item.ownerUsername || null,
            published_at: item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString(),
            sentiment_label: sent.label,
            sentiment_score: sent.score,
            sentiment_confidence: 0.75,
            keyword_matched: [kw.id],
            keyword_group: kw.group_id,
            is_competitor: false,
            reach_score: item.likesCount || 0,
            engagement_score: (item.likesCount || 0) + (item.commentsCount || 0),
            date_fixed: false,
            status: 'new',
          }
        })

      if (rows.length) {
        console.log(`\n--- Results for #${hashtag} ---`)
        rows.forEach((r, i) => {
          console.log(`\n[${i + 1}] @${r.author_handle}`)
          console.log(`    URL      : ${r.url}`)
          console.log(`    Date     : ${r.published_at}`)
          console.log(`    Sentiment: ${r.sentiment_label} (${r.sentiment_score.toFixed(2)})`)
          console.log(`    Caption  : ${r.text.slice(0, 150)}...`)
        })
        totalSaved += rows.length
      }
    } catch (e) {
      console.error(`[ApifyIG] Error for #${hashtag}:`, e.message)
    }

    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`\n[ApifyIG] Done — ${totalSaved} total new mentions saved.\n`)
}

run()
