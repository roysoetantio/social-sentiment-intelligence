import { spawn } from 'child_process'
import { resolve } from 'path'
import { config } from 'dotenv'

config() // load .env

export default function ingestApiPlugin() {
  return {
    name: 'ingest-api',
    configureServer(server) {

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
