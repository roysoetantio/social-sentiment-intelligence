#!/usr/bin/env node
/**
 * generate-digest.js — Generate a per-tenant AI Digest for the Overview page.
 *
 * Each tenant (department) gets its OWN digest, built only from mentions whose
 * matched keywords are tagged to that tenant (keyword_tenants). Tenants are
 * discovered dynamically from keyword_tenants, so new tenants are picked up
 * automatically. One row per department is written to ai_digest; the frontend
 * reads the latest row for the current tenant.
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

const PERIOD_DAYS = 30
const since = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

// ── Discover tenants + their tagged keyword ids ───────────────────────────────
const { data: tags, error: tagErr } = await supabase
  .from('keyword_tenants')
  .select('department, keyword_id')

if (tagErr) { console.error('Failed to fetch keyword_tenants:', tagErr.message); process.exit(1) }

const keywordsByDept = {}
for (const t of tags || []) {
  ;(keywordsByDept[t.department] ||= []).push(t.keyword_id)
}
const departments = Object.keys(keywordsByDept)
if (!departments.length) { console.error('No tenants found in keyword_tenants.'); process.exit(1) }

console.log(`Found ${departments.length} tenant(s): ${departments.join(', ')}`)

// ── Generate + save one digest per tenant ─────────────────────────────────────
for (const dept of departments) {
  const keywordIds = keywordsByDept[dept]

  // Only mentions matched to THIS tenant's keywords (array overlap).
  const { data: mentions, error } = await supabase
    .from('mentions')
    .select('sentiment_label, analyst_sentiment, risk_level, text, keyword_group')
    .gte('published_at', since)
    .eq('analyst_excluded', false)
    .overlaps('keyword_matched', keywordIds)

  if (error) { console.error(`[${dept}] Failed to fetch mentions:`, error.message); continue }

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

  const riskSummary = [...highRisk, ...mediumRisk]
    .map(m => `- [${m.risk_level.toUpperCase()} RISK] ${m.text.slice(0, 120)}`)
    .join('\n') || 'None'

  const dataSummary = `
Period: Last ${PERIOD_DAYS} days
Total mentions: ${total}
Positive: ${pos} | Neutral: ${neu} | Negative: ${neg}
Top keyword group: ${topGroup || 'n/a'}
Risk items:
${riskSummary}
`.trim()

  console.log(`\n[${dept}] Generating digest from ${total} mention(s)...`)

  let digest
  if (total === 0) {
    digest = `No significant media coverage in the past ${PERIOD_DAYS} days for this portfolio. Monitoring continues across all tracked keywords.`
  } else {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are writing an AI Digest for a brand sentiment dashboard used by a communications analyst at UEM Edgenta, a Malaysian infrastructure and facility management company. PLUS Expressway is a subsidiary of UEM Edgenta. This digest covers only the "${dept}" team's tracked keywords.

Here is the data summary for the past ${PERIOD_DAYS} days:
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
    digest = message.content[0].text.trim()
  }

  console.log(`[${dept}] ${digest}`)

  const { error: saveError } = await supabase.from('ai_digest').insert({
    content: digest,
    generated_at: new Date().toISOString(),
    period_days: PERIOD_DAYS,
    department: dept,
  })

  if (saveError) { console.error(`[${dept}] Failed to save digest:`, saveError.message); continue }
  console.log(`[${dept}] Saved.`)
}

console.log('\nAll tenant digests generated.')
