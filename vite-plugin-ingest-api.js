import { spawn } from 'child_process'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config() // load .env

const getAdminClient = () => createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default function ingestApiPlugin() {
  return {
    name: 'ingest-api',
    configureServer(server) {

      // DELETE mentions by keyword ID using service role key
      server.middlewares.use('/api/delete-mentions', async (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', async () => {
          const { kwId, action } = JSON.parse(body || '{}')
          const admin = getAdminClient()
          let error = null

          if (action === 'delete') {
            ;({ error } = await admin.from('mentions').delete().contains('keyword_matched', [kwId]))
          } else if (action === 'hide') {
            const { data: mentions } = await admin.from('mentions').select('id').contains('keyword_matched', [kwId])
            if (mentions?.length) {
              ;({ error } = await admin.from('mentions').update({ analyst_excluded: true }).in('id', mentions.map(m => m.id)))
            }
          }

          // Also delete the keyword itself
          if (!error) {
            ;({ error } = await admin.from('keywords').delete().eq('id', kwId))
          }

          res.writeHead(error ? 500 : 200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: !error, error: error?.message }))
        })
      })

      server.middlewares.use('/api/ingest', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405); res.end(); return
        }

        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          const { keywordIds = [] } = JSON.parse(body || '{}')

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          })

          const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

          const args = ['--env-file=.env', 'scripts/ingest.js']
          if (keywordIds.length) args.push(`--keywords=${keywordIds.join(',')}`)

          const child = spawn('node', args, { cwd: resolve(process.cwd()) })

          child.stdout.on('data', (chunk) => {
            chunk.toString().split('\n').filter(Boolean).forEach(line => send({ log: line }))
          })
          child.stderr.on('data', (chunk) => {
            chunk.toString().split('\n').filter(Boolean).forEach(line => send({ log: line, error: true }))
          })
          child.on('close', (code) => {
            send({ done: true, code })
            res.end()
          })
        })
      })
    },
  }
}
