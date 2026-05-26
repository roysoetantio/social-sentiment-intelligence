#!/usr/bin/env node
/**
 * Backfill sentiment_confidence for all rows using abs(sentiment_score).
 * Run: node scripts/backfill-confidence.js           (dry run)
 *      node scripts/backfill-confidence.js --apply   (write to DB)
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import 'dotenv/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const APPLY = process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })

const { data, error } = await supabase
  .from('mentions')
  .select('id, sentiment_score, sentiment_confidence')
  .not('sentiment_score', 'is', null)

if (error) { console.error('Fetch error:', error.message); process.exit(1) }

const updates = data.map(row => ({
  id: row.id,
  oldConfidence: row.sentiment_confidence,
  newConfidence: parseFloat(Math.max(0.3, Math.abs(row.sentiment_score)).toFixed(3)),
}))

const changed = updates.filter(u => u.oldConfidence !== u.newConfidence)

console.log(`Total rows: ${data.length}`)
console.log(`Rows to update: ${changed.length}`)
if (!APPLY) {
  console.log('\nSample (first 10):')
  changed.slice(0, 10).forEach(u =>
    console.log(`  id=${u.id}  ${u.oldConfidence} → ${u.newConfidence}`)
  )
  console.log('\nDry run — pass --apply to write changes.')
  process.exit(0)
}

let updated = 0
const BATCH = 500
for (let i = 0; i < changed.length; i += BATCH) {
  const batch = changed.slice(i, i + BATCH)
  for (const u of batch) {
    const { error: updateError } = await supabase
      .from('mentions')
      .update({ sentiment_confidence: u.newConfidence })
      .eq('id', u.id)
    if (updateError) console.warn(`  Failed id=${u.id}:`, updateError.message)
    else updated++
  }
  console.log(`  Updated ${Math.min(i + BATCH, changed.length)} / ${changed.length}`)
}

console.log(`\nDone. ${updated} rows updated.`)
