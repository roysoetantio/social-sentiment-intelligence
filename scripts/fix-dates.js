#!/usr/bin/env node
/**
 * fix-dates.js — Crawl mention URLs and update published_at with the real article date.
 *
 * Usage:
 *   node scripts/fix-dates.js            # dry run (no DB writes)
 *   node scripts/fix-dates.js --apply    # actually update Supabase
 *   node scripts/fix-dates.js --limit 50 # only process first N rows
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const DRY_RUN = !process.argv.includes('--apply')
const LIMIT   = (() => { const i = process.argv.indexOf('--limit'); return i !== -1 ? parseInt(process.argv[i + 1]) : 500 })()
const DELAY_MS = 800   // polite crawl delay between requests
const TIMEOUT_MS = 10000

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })

// ── Date extraction patterns ──────────────────────────────────────────────────

const META_PATTERNS = [
  // Open Graph / article tags
  /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
  /<meta[^>]+property=["']og:published_time["'][^>]+content=["']([^"']+)["']/i,
  // Twitter card
  /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']date["']/i,
  // JSON-LD datePublished
  /"datePublished"\s*:\s*"([^"]+)"/i,
  /"publishDate"\s*:\s*"([^"]+)"/i,
  /"dateCreated"\s*:\s*"([^"]+)"/i,
  // itemprop
  /itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
  /itemprop=["']dateCreated["'][^>]+content=["']([^"']+)["']/i,
  // Common CMS patterns
  /<time[^>]+datetime=["']([^"']+)["']/i,
  /<pubDate>([^<]+)<\/pubDate>/i,
]

// The Edge Malaysia embeds dates as Unix timestamps: "created":1508205792000
const EDGE_MY_TIMESTAMP = /"created"\s*:\s*(\d{10,13})/

// Bernama BM uses DD/MM/YYYY HH:MM AM/PM
function parseDDMMYYYY(str) {
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}`)
  return isNaN(d) ? null : d
}

// Extract date from URL path: /YYYY/MM/DD/ or /YYYY-MM-DD
function extractDateFromUrl(url) {
  const m = url.match(/\/(\d{4})[\/\-](\d{2})[\/\-](\d{2})[\/\-]/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}`)
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d <= new Date()) return d.toISOString()
  return null
}

function extractDateFromHtml(html) {
  // The Edge Malaysia: first "created" timestamp is the article date
  const edgeMatch = html.match(EDGE_MY_TIMESTAMP)
  if (edgeMatch) {
    const ts = parseInt(edgeMatch[1])
    const ms = ts < 1e12 ? ts * 1000 : ts
    const d = new Date(ms)
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d <= new Date()) {
      return d.toISOString()
    }
  }

  for (const pattern of META_PATTERNS) {
    const match = html.match(pattern)
    if (match) {
      const raw = match[1].trim()
      // Try standard parse first, then DD/MM/YYYY fallback (Bernama BM)
      let d = new Date(raw)
      if (isNaN(d.getTime())) d = parseDDMMYYYY(raw)
      if (d && !isNaN(d.getTime()) && d.getFullYear() > 2000 && d <= new Date()) {
        return d.toISOString()
      }
    }
  }
  return null
}

async function fetchWithTimeout(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DateBot/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    // Some sites embed dates deep in the page — raise limit accordingly
    const maxBytes = (url.includes('theedgemalaysia.com') || url.includes('marketing-interactive.com'))
      ? 150_000 : 50_000
    const reader = res.body.getReader()
    let html = ''
    let bytes = 0
    while (bytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      bytes += value.length
    }
    reader.cancel()
    return html
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 fix-dates.js — ${DRY_RUN ? 'DRY RUN (pass --apply to write)' : '⚠️  LIVE — will update Supabase'}`)
  console.log(`Processing up to ${LIMIT} rows\n`)

  // Only process rows not yet fixed — date_fixed = false means either new ingest
  // or a previous crawl failed. Already-fixed rows are never touched again.
  const { data: mentions, error } = await supabase
    .from('mentions')
    .select('id, url, published_at, source')
    .neq('date_fixed', true)
    .order('published_at', { ascending: false })
    .limit(LIMIT)

  if (error) { console.error('Supabase fetch error:', error.message); process.exit(1) }
  console.log(`Fetched ${mentions.length} mentions\n`)

  let updated = 0, skipped = 0, failed = 0, unchanged = 0
  const needsManualDate = []

  for (let i = 0; i < mentions.length; i++) {
    const m = mentions[i]
    const prefix = `[${i + 1}/${mentions.length}]`

    if (!m.url || m.url.startsWith('https://twitter.com') || m.url.startsWith('https://x.com')) {
      // Twitter dates from API are reliable — skip
      skipped++
      continue
    }

    process.stdout.write(`${prefix} ${m.source?.padEnd(16)} ${m.url.slice(0, 60)}... `)

    // Try URL-based date first (e.g. businesstoday.com.my/2025/11/28/)
    let newDate = extractDateFromUrl(m.url)
    if (newDate) {
      // confirm with a quick note
    } else {
      const html = await fetchWithTimeout(m.url)
      if (!html) {
        console.log('❌ fetch failed')
        needsManualDate.push(m.url)
        failed++
        await sleep(DELAY_MS)
        continue
      }
      newDate = extractDateFromHtml(html)
    }
    if (!newDate) {
      console.log('⚠️  no date found')
      needsManualDate.push(m.url)
      unchanged++
      await sleep(DELAY_MS)
      continue
    }

    const oldDate = m.published_at
    if (newDate === oldDate) {
      console.log('✓ same')
      if (!DRY_RUN) {
        await supabase.from('mentions').update({ date_fixed: true }).eq('id', m.id)
      }
      unchanged++
      await sleep(DELAY_MS)
      continue
    }

    console.log(`✅ ${oldDate?.slice(0, 10)} → ${newDate.slice(0, 10)}`)

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from('mentions')
        .update({ published_at: newDate, date_fixed: true })
        .eq('id', m.id)
      if (updateError) console.error('   Update error:', updateError.message)
    }

    updated++
    await sleep(DELAY_MS)
  }

  console.log(`\n── Summary ─────────────────────────────────`)
  console.log(`  Updated  : ${updated}`)
  console.log(`  Unchanged: ${unchanged}`)
  console.log(`  No date  : ${failed + unchanged - unchanged}`)
  console.log(`  Skipped  : ${skipped}`)
  console.log(`  Failed   : ${failed}`)
  if (DRY_RUN) console.log(`\n  (Dry run — re-run with --apply to write changes)`)

  if (needsManualDate.length > 0) {
    console.log(`\n── Needs manual date (please provide) ──────`)
    needsManualDate.forEach(url => console.log(`  ${url}`))
    console.log()
  }
}

main()
