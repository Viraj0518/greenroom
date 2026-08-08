// Cloudflare Pages Functions catch-all for /embed/* — server-rendered embed pages (pin #6)
// are handled by the same Hono app as the API.

import { handle } from 'hono/cloudflare-pages'
import app from '../src'

export const onRequest = handle(app)
