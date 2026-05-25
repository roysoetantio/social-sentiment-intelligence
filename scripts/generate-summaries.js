#!/usr/bin/env node
/**
 * generate-summaries.js — Generate AI summaries for mentions that don't have one.
 *
 * Uses Claude (via claude CLI subprocess) to summarise full_text + title.
 * Skips: twitter135 source, rows with full_text < 150 chars, rows that already have a summary.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-summaries.js            # dry run
 *   node --env-file=.env scripts/generate-summaries.js --apply    # write to Supabase
 *   node --env-file=.env scripts/generate-summaries.js --limit 50 # cap at N rows
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import Anthropic from '@anthropic-ai/sdk'

const DRY_RUN  = !process.argv.includes('--apply')
const LIMIT    = (() => { const i = process.argv.indexOf('--limit'); return i !== -1 ? parseInt(process.argv[i + 1]) : 500 })()
const MIN_LEN  = 150   // minimum full_text length to bother summarising
const SKIP_SOURCES = ['twitter135']

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY — add it to your .env file')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// ── Fetch mentions without summaries ─────────────────────────────────────────
const fetchTargets = async () => {
  const { data, error } = await supabase
    .from('mentions')
    .select('id, text, full_text, source')
    .is('summary', null)
    .order('published_at', { ascending: false })
    .limit(LIMIT)

  if (error) { console.error('Supabase fetch error:', error.message); process.exit(1) }
  return data || []
}

// ── Generate summary using Claude ─────────────────────────────────────────────
const generateSummary = async (title, fullText) => {
  const input = `${title}\n\n${fullText}`.slice(0, 3000) // cap input to keep costs low
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 120,
    messages: [{
      role: 'user',
      content: `Summarise this article about UEM Edgenta or a related brand in 2-3 plain factual sentences. Maximum 400 characters. No fluff, no "This article..." opener — just the facts.\n\n${input}`,
    }],
  })
  return msg.content[0]?.text?.trim().slice(0, 400) || ''
}

// ── Main ──────────────────────────────────────────────────────────────────────
const run = async () => {
  console.log(`\n[Summaries] Starting${DRY_RUN ? ' (DRY RUN)' : ''} at ${new Date().toISOString()}`)
  console.log(`[Summaries] Fetching up to ${LIMIT} mentions without summaries...`)

  const rows = await fetchTargets()
  console.log(`[Summaries] Fetched ${rows.length} rows`)

  const targets = rows.filter(m =>
    !SKIP_SOURCES.includes(m.source) &&
    (m.full_text || '').length >= MIN_LEN
  )
  const skipped = rows.length - targets.length

  console.log(`[Summaries] Qualifying: ${targets.length} | Skipped: ${skipped} (twitter/short)`)
  if (DRY_RUN) console.log('[Summaries] DRY RUN — no changes will be written\n')

  let saved = 0
  let errors = 0

  for (let i = 0; i < targets.length; i++) {
    const m = targets[i]
    process.stdout.write(`[${i + 1}/${targets.length}] ${m.source.padEnd(20)} ${m.text?.slice(0, 60)}...`)

    try {
      const summary = await generateSummary(m.text, m.full_text)

      if (!summary) {
        console.log(' ⚠️  empty summary, skipping')
        continue
      }

      if (DRY_RUN) {
        console.log(`\n  → ${summary}\n`)
      } else {
        const { error } = await supabase
          .from('mentions')
          .update({ summary })
          .eq('id', m.id)

        if (error) {
          console.log(` ❌ ${error.message}`)
          errors++
        } else {
          console.log(' ✅')
          saved++
        }
      }
    } catch (e) {
      console.log(` ❌ ${e.message}`)
      errors++
    }

    // Small delay to avoid rate limits
    if (i < targets.length - 1) await new Promise(r => setTimeout(r, 200))
  }

  console.log(`
──────────────────────────────────────────
SUMMARY GENERATION ${DRY_RUN ? '(DRY RUN)' : 'COMPLETE'}
──────────────────────────────────────────
  Fetched   : ${rows.length}
  Skipped   : ${skipped} (twitter / short content)
  Saved     : ${saved}
  Errors    : ${errors}
${DRY_RUN ? '\n  Re-run with --apply to write changes' : ''}`)
}

run().catch(e => { console.error(e); process.exit(1) })
