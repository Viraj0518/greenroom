// Cloudflare Pages Functions catch-all: every /api/* request is handled by the Hono app in functions/src/.

import { handle } from 'hono/cloudflare-pages'
import app from '../src'

export const onRequest = handle(app)
