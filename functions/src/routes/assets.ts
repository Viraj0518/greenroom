import { Hono } from 'hono'
import type { AppEnv, Speaker } from '../types'
import { notFound, forbidden, notConfigured } from '../lib/http'
import { one } from '../lib/db'
import { sessionUser, speakerToken } from '../lib/auth'

interface AssetRow {
  id: string
  event_id: string
  speaker_id: string | null
  kind: 'headshot' | 'slides' | 'document'
  r2_key: string
  filename: string
  content_type: string
  size: number
}

const assets = new Hono<AppEnv>()

// Streams from R2. Headshots are public (embeds need them); slides/documents
// require an organizer session or the owning speaker's magic token.
assets.get('/assets/:assetId', async (c) => {
  const asset = await one<AssetRow>(
    c.env.DB,
    'SELECT * FROM assets WHERE id = ?',
    c.req.param('assetId')
  )
  if (!asset) throw notFound('Asset not found')

  if (asset.kind !== 'headshot') {
    const user = await sessionUser(c)
    if (!user) {
      const token = speakerToken(c)
      const speaker = token
        ? await one<Speaker>(c.env.DB, 'SELECT id FROM speakers WHERE magic_token = ?', token)
        : null
      if (!speaker || speaker.id !== asset.speaker_id) {
        throw forbidden('This asset is not public', 'asset_private')
      }
    }
  }

  if (!c.env.FILES) throw notConfigured('File storage is not configured (R2 binding missing)', 'storage_not_configured')
  const obj = await c.env.FILES.get(asset.r2_key)
  if (!obj) throw notFound('Asset file missing from storage', 'asset_file_missing')

  return new Response(obj.body, {
    headers: {
      'Content-Type': asset.content_type || obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${asset.filename.replace(/"/g, '')}"`,
      'Cache-Control': asset.kind === 'headshot' ? 'public, max-age=300' : 'private, no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
})

export default assets
