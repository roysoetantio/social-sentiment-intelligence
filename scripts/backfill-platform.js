#!/usr/bin/env node
/**
 * Backfill `mentions.platform` from the URL domain.
 *
 * WHY
 * `platform` was written inconsistently by different ingest sources, so the
 * same outlet landed under different channels depending on which script saved
 * it — thestar.com.my is 23 "Web" and 17 "News"; nst.com.my is 20 "Web" and
 * 13 "News". Any channel-based filter built on this is wrong for roughly a
 * third of the table. This makes one domain mean one channel, always.
 *
 * SAFETY
 * Touches exactly ONE column (`platform`) on rows where the derived value
 * differs from the stored one. No inserts, no deletes, no schema changes, and
 * `url` (the upsert key) is never modified. Dry run is the default.
 *
 *   node scripts/backfill-platform.js            # dry run — prints the plan
 *   node scripts/backfill-platform.js --domains  # per-domain classification
 *   node scripts/backfill-platform.js --apply    # write it
 *
 * Keep DOMAIN CLASSIFICATION in sync with guessPlatform() in ingest.js,
 * otherwise new rows drift straight back out of alignment.
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classify } from './lib/platform.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.join(__dirname, '..', '.env')

if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const SHOW_DOMAINS = process.argv.includes('--domains')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })

/* Classification lives in lib/platform.js — shared with ingest.js. */

/* ------------------------------------------------------------------ */

const fetchAll = async () => {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('mentions')
      .select('id, url, platform, source')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

const run = async () => {
  console.log(`\nPlatform backfill — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`)

  const rows = await fetchAll()
  console.log(`Loaded ${rows.length} mentions\n`)

  const changes = []
  const before = {}
  const after = {}
  const byDomain = {}

  for (const r of rows) {
    const { platform, reason, host } = classify(r.url)
    const cur = r.platform || '(null)'
    before[cur] = (before[cur] || 0) + 1
    after[platform] = (after[platform] || 0) + 1

    const d = (byDomain[host || '(bad url)'] ||= { total: 0, to: platform, reason, changed: 0, from: {} })
    d.total++
    d.from[cur] = (d.from[cur] || 0) + 1
    if (cur !== platform) { d.changed++; changes.push({ id: r.id, from: cur, to: platform }) }
  }

  if (SHOW_DOMAINS) {
    console.log('PER-DOMAIN CLASSIFICATION')
    Object.entries(byDomain).sort((a, b) => b[1].total - a[1].total).forEach(([host, d]) => {
      const flag = d.changed ? '*' : ' '
      console.log(`${flag} ${String(d.total).padStart(4)}  ${host.padEnd(32)} → ${d.to.padEnd(10)} (${d.reason})  was ${JSON.stringify(d.from)}`)
    })
    console.log('\n* = at least one row changes\n')
  }

  const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ')
  console.log('BEFORE:', fmt(before))
  console.log('AFTER :', fmt(after))
  console.log(`\n${changes.length} rows would change platform`)

  const moves = {}
  changes.forEach(c => { const k = `${c.from} → ${c.to}`; moves[k] = (moves[k] || 0) + 1 })
  Object.entries(moves).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   ${String(v).padStart(4)}  ${k}`))

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to write.')
    console.log('Add --domains to review the per-domain mapping first.\n')
    return
  }

  // One UPDATE per target platform, ids batched — only the platform column.
  const byTarget = {}
  changes.forEach(c => { (byTarget[c.to] ||= []).push(c.id) })
  let updated = 0
  for (const [platform, ids] of Object.entries(byTarget)) {
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200)
      const { error } = await supabase.from('mentions').update({ platform }).in('id', batch)
      if (error) { console.error(`  ${platform} batch failed:`, error.message); continue }
      updated += batch.length
    }
    console.log(`  → ${platform}: ${ids.length}`)
  }
  console.log(`\n[done] ${updated}/${changes.length} rows updated\n`)
}

run().catch(e => { console.error('\nFailed:', e.message); process.exit(1) })
