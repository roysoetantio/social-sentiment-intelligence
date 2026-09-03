// One-shot: exchange a short-lived user token for a non-expiring Page token,
// then report comment volume so we can judge whether an ingest source is worth building.
// Usage: node scripts/fb-setup.js
import 'dotenv/config'
import { appendFile } from 'node:fs/promises'

const V = 'v26.0'
const API = `https://graph.facebook.com/${V}`

const { FB_APP_ID, FB_APP_SECRET, FB_USER_TOKEN, FB_PAGE_ID } = process.env
const missing = Object.entries({ FB_APP_ID, FB_APP_SECRET, FB_USER_TOKEN, FB_PAGE_ID })
  .filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`)
  process.exit(1)
}

const get = async (path, params) => {
  const url = new URL(`${API}/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url)
  const json = await res.json()
  if (json.error) throw new Error(`${path}: ${json.error.message}`)
  return json
}

// 1. short-lived user token -> long-lived (60d)
const longLived = await get('oauth/access_token', {
  grant_type: 'fb_exchange_token',
  client_id: FB_APP_ID,
  client_secret: FB_APP_SECRET,
  fb_exchange_token: FB_USER_TOKEN,
})
console.log(`✓ long-lived user token (expires_in: ${longLived.expires_in ?? 'never'})`)

// 2. derive the Page token — this one does not expire
const accounts = await get('me/accounts', { access_token: longLived.access_token })
const page = accounts.data.find(p => p.id === FB_PAGE_ID)
if (!page) throw new Error(`Page ${FB_PAGE_ID} not in me/accounts`)
console.log(`✓ page token for "${page.name}"  tasks=${page.tasks.join(',')}`)

// 3. confirm it really is non-expiring
const dbg = await get('debug_token', {
  input_token: page.access_token,
  access_token: `${FB_APP_ID}|${FB_APP_SECRET}`,
})
console.log(`✓ expires_at=${dbg.data.expires_at === 0 ? 'never' : new Date(dbg.data.expires_at * 1000).toISOString()}`)

await appendFile('.env', `\n# Facebook Pages API — UEM Edgenta Berhad (own page posts + comments)\n# Page token does not expire. App: 2170440680186289\nFB_PAGE_TOKEN=${page.access_token}\n`)
console.log('✓ FB_PAGE_TOKEN appended to .env')

// 4. volume check — is there enough third-party comment signal to bother?
const posts = await get(`${FB_PAGE_ID}/posts`, {
  fields: 'created_time,message,comments.summary(true).limit(0),shares,reactions.summary(true)',
  limit: 100,
  access_token: page.access_token,
})
const rows = posts.data ?? []
const total = rows.reduce((n, p) => n + (p.comments?.summary?.total_count ?? 0), 0)
const withComments = rows.filter(p => (p.comments?.summary?.total_count ?? 0) > 0)
console.log(`\n--- volume ---`)
console.log(`posts fetched : ${rows.length}`)
console.log(`date range    : ${rows.at(-1)?.created_time?.slice(0,10)} → ${rows[0]?.created_time?.slice(0,10)}`)
console.log(`total comments: ${total}`)
console.log(`posts w/ >0   : ${withComments.length}`)
console.log(`top posts     :`)
withComments.sort((a,b)=>b.comments.summary.total_count-a.comments.summary.total_count).slice(0,5)
  .forEach(p => console.log(`  ${p.comments.summary.total_count.toString().padStart(4)}  ${p.created_time.slice(0,10)}  ${(p.message??'').replace(/\s+/g,' ').slice(0,70)}`))

// 5. the real test — do comment BODIES come back, or the IG empty-array-with-cursors pattern?
if (withComments.length) {
  const sample = withComments[0]
  const c = await get(`${sample.id}/comments`, {
    fields: 'message,created_time,from', limit: 5, access_token: page.access_token,
  })
  console.log(`\n--- comment body test on ${sample.id} (expects ${sample.comments.summary.total_count}) ---`)
  console.log(`returned: ${c.data.length} rows, paging cursors present: ${!!c.paging?.cursors}`)
  c.data.forEach(x => console.log(`  [${x.from?.name ?? 'anon'}] ${(x.message??'').replace(/\s+/g,' ').slice(0,90)}`))
  if (!c.data.length && c.paging?.cursors) console.log('  ⚠️  empty array + cursors = same dev-mode filtering as Instagram')
}
