#!/usr/bin/env node
/**
 * generate-digest.js — Generate AI Digest for the Overview page.
 *
 * Fetches the last 30 days of mentions from Supabase, builds a data summary,
 * calls Claude to write a 2-3 sentence narrative digest, then saves it to
 * the ai_digest table. The frontend reads the latest row on load.
 *
 * Run after every ingest:
 *   node scripts/generate-digest.js
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import ws from 'ws'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY
})

const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

// ── Fetch mentions ────────────────────────────────────────────────────────────
const { data: mentions, error } = await supabase
  .from('mentions')
  .select('sentiment_label, analyst_sentiment, risk_level, text, keyword_group')
  .gte('published_at', since)
  .eq('analyst_excluded', false)

if (error) { console.error('Failed to fetch mentions:', error.message); process.exit(1) }

const total = mentions.length
const effectiveLabel = m => m.analyst_sentiment || m.sentiment_label
const pos = mentions.filter(m => effectiveLabel(m) === 'positive').length
const neg = mentions.filter(m => effectiveLabel(m) === 'negative').length
const neu = mentions.filter(m => effectiveLabel(m) === 'neutral').length

const highRisk = mentions.filter(m => m.risk_level === 'high')
const mediumRisk = mentions.filter(m => m.risk_level === 'medium')

const groups = {}
mentions.forEach(m => { if (m.keyword_group) groups[m.keyword_group] = (groups[m.keyword_group] || 0) + 1 })
const topGroup = Object.entries(groups).sort((a, b) => b[1] - a[1])[0]?.[0]

// ── Build data summary for Claude ────────────────────────────────────────────
const riskSummary = [...highRisk, ...mediumRisk]
  .map(m => `- [${m.risk_level.toUpperCase()} RISK] ${m.text.slice(0, 120)}`)
  .join('\n') || 'None'

const dataSummary = `
Period: Last 30 days
Total mentions: ${total}
Positive: ${pos} | Neutral: ${neu} | Negative: ${neg}
Top keyword group: ${topGroup || 'n/a'}
Risk items:
${riskSummary}
`.trim()

// ── Call Claude ───────────────────────────────────────────────────────────────
console.log('Generating digest...')

const message = await anthropic.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 200,
  messages: [{
    role: 'user',
    content: `You are writing an AI Digest for a brand sentiment dashboard used by a communications analyst at UEM Edgenta, a Malaysian infrastructure and facility management company. PLUS Expressway is a subsidiary of UEM Edgenta.

Here is the data summary for the past 30 days:
${dataSummary}

Write a 2-3 sentence narrative digest. Rules:
- Do NOT mention raw numbers or percentages — the analyst can read those from the KPI cards
- Do NOT mention which keyword or brand dominates coverage
- DO describe the overall sentiment tone naturally
- DO briefly mention any risk items with context (what happened, why it matters)
- DO flag any emerging themes worth watching if present
- Keep it concise, professional, and human — like a morning briefing from a colleague
- Plain text only, no markdown, no bullet points`
  }]
})

const digest = message.content[0].text.trim()
console.log('\nGenerated digest:\n', digest)

// ── Save to Supabase ──────────────────────────────────────────────────────────
const { error: saveError } = await supabase.from('ai_digest').insert({
  content: digest,
  generated_at: new Date().toISOString(),
  period_days: 30,
})

if (saveError) { console.error('Failed to save digest:', saveError.message); process.exit(1) }

console.log('\nDigest saved to Supabase.')
