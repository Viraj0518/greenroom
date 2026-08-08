import { Hono } from 'hono'
import type { AppEnv } from './types'
import { ApiError } from './lib/http'
import auth from './routes/auth'
import events from './routes/events'
import forms from './routes/forms'
import portal from './routes/portal'
import assets from './routes/assets'
import reviews from './routes/reviews'
import schedule from './routes/schedule'
import comms from './routes/comms'
import dashboard from './routes/dashboard'
import resources from './routes/resources'
import pub from './routes/public'
import integrations from './routes/integrations'
import embeds from './embed'

const app = new Hono<AppEnv>()

// CORS-open, read-only public surface.
app.use('/api/public/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }
  await next()
  c.res.headers.set('Access-Control-Allow-Origin', '*')
})

app.get('/api/health', (c) => c.json({ ok: true, service: 'greenroom-api' }))

for (const routes of [auth, events, forms, portal, assets, reviews, schedule, comms, dashboard, resources, pub, integrations]) {
  app.route('/api', routes)
}

// Server-rendered embed pages live outside /api (served via functions/embed/[[route]].ts).
app.route('/', embeds)

// Error envelope: { "error": "<human message>", "code": "<machine code>" }
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400)
  }
  console.error('[api] unhandled error:', err)
  return c.json({ error: 'Internal server error', code: 'internal' }, 500)
})

app.notFound((c) => c.json({ error: `No such route: ${c.req.method} ${new URL(c.req.url).pathname}`, code: 'not_found' }, 404))

export default app
