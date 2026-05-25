import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

const riskLevel = (score) => {
  if (score <= -0.80) return 'high'
  if (score <= -0.30) return 'medium'
  return 'low'
}

const apply = process.argv.includes('--apply')

const { data, error } = await supabase
  .from('mentions')
  .select('id, sentiment_score, sentiment_label, risk_level')
  .eq('sentiment_label', 'negative')

if (error) { console.error(error); process.exit(1) }

const updates = data.map(row => ({
  id: row.id,
  old: row.risk_level,
  new: riskLevel(row.sentiment_score),
})).filter(u => u.old !== u.new)

console.log(`${data.length} negative rows fetched, ${updates.length} need updating`)

const counts = { high: 0, medium: 0, low: 0, null: 0 }
updates.forEach(u => counts[u.new ?? 'null']++)
console.log('New distribution:', counts)

if (!apply) {
  console.log('\nDry run — pass --apply to write changes')
  process.exit(0)
}

let saved = 0
for (const u of updates) {
  const { error } = await supabase.from('mentions').update({ risk_level: u.new }).eq('id', u.id)
  if (error) console.error(`Failed ${u.id}:`, error.message)
  else saved++
}

console.log(`Done — ${saved}/${updates.length} rows updated`)
