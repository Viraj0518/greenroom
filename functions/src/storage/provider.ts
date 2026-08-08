// Pin #7: all object I/O goes through StorageProvider so we can swap Supabase Storage
// (current, R2 billing-blocked) for R2 later without touching routes. Selection:
// R2 binding present → r2; else SUPABASE_URL+SUPABASE_SERVICE_KEY → supabase (plain
// fetch against the Storage REST API, no supabase-js per pin #6); else null and the
// caller 501s "storage not configured". Object keys are provider-agnostic
// (assets.r2_key stores them unchanged).

import type { Env, R2Bucket } from '../types'
import { ApiError } from '../lib/http'

export interface StorageObject {
  body: ReadableStream | ArrayBuffer
  contentType?: string
}

export interface StorageProvider {
  name: string
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>
  get(key: string): Promise<StorageObject | null>
  delete(key: string): Promise<void>
}

function storageError(op: string, detail: string): ApiError {
  return new ApiError(502, 'storage_error', `Storage ${op} failed: ${detail}`)
}

export function r2Adapter(bucket: R2Bucket): StorageProvider {
  return {
    name: 'r2',
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } })
    },
    async get(key) {
      const obj = await bucket.get(key)
      if (!obj) return null
      return { body: obj.body, contentType: obj.httpMetadata?.contentType }
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}

export function supabaseAdapter(url: string, serviceKey: string, bucket: string): StorageProvider {
  const base = url.replace(/\/$/, '')
  const objectUrl = (key: string) =>
    `${base}/storage/v1/object/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  const headers = { Authorization: `Bearer ${serviceKey}` }

  return {
    name: 'supabase',
    async put(key, body, contentType) {
      const res = await fetch(objectUrl(key), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' },
        body,
      })
      if (!res.ok) throw storageError('upload', `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    },
    async get(key) {
      const res = await fetch(objectUrl(key), { headers })
      if (res.status === 404 || res.status === 400) return null
      if (!res.ok || !res.body) throw storageError('download', `HTTP ${res.status}`)
      return { body: res.body, contentType: res.headers.get('Content-Type') ?? undefined }
    },
    async delete(key) {
      const res = await fetch(objectUrl(key), { method: 'DELETE', headers })
      // Deleting an already-gone object is fine; anything else non-ok is a real failure.
      if (!res.ok && res.status !== 404 && res.status !== 400) {
        throw storageError('delete', `HTTP ${res.status}`)
      }
    },
  }
}

export function getStorage(env: Env): StorageProvider | null {
  if (env.FILES) return r2Adapter(env.FILES)
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return supabaseAdapter(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, env.SUPABASE_BUCKET ?? 'greenroom-files')
  }
  return null
}
