import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv, Speaker, User } from '../types'
import { one, run, now, uuid } from './db'
import { randomToken } from './crypto'
import { forbidden, unauthorized } from './http'

export const SESSION_COOKIE = 'gr_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken(32)
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await run(
    c.env.DB,
    'INSERT INTO sessions_auth (token, user_id, expires_at) VALUES (?, ?, ?)',
    token,
    userId,
    expires
  )
  setCookie(c, SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: c.req.url.startsWith('https://'),
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    await run(c.env.DB, 'DELETE FROM sessions_auth WHERE token = ?', token)
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** Resolve the organizer user for the current request, or null. */
export async function sessionUser(c: Context<AppEnv>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  const row = await one<User & { expires_at: string }>(
    c.env.DB,
    `SELECT u.id, u.email, u.name, u.role, s.expires_at
     FROM sessions_auth s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    token
  )
  if (!row) return null
  if (row.expires_at <= now()) {
    await run(c.env.DB, 'DELETE FROM sessions_auth WHERE token = ?', token)
    return null
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role }
}

/** Organizer routes: require a valid gr_session cookie. */
export const requireOrganizer: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await sessionUser(c)
  if (!user) throw unauthorized('Organizer session required')
  c.set('user', user)
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user') ?? (await sessionUser(c))
  if (!user) throw unauthorized('Organizer session required')
  if (user.role !== 'admin') throw forbidden('Admin role required')
  c.set('user', user)
  await next()
}

export function speakerToken(c: Context<AppEnv>): string | null {
  const q = c.req.query('token')
  if (q) return q
  const header = c.req.header('Authorization')
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim()
  return null
}

/** Speaker routes: require ?token= or Authorization: Bearer <magic_token>. */
export const requireSpeaker: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = speakerToken(c)
  if (!token) throw unauthorized('Speaker token required', 'speaker_token_required')
  const speaker = await one<Speaker>(
    c.env.DB,
    'SELECT * FROM speakers WHERE magic_token = ?',
    token
  )
  if (!speaker) throw unauthorized('Invalid speaker token', 'invalid_speaker_token')
  c.set('speaker', speaker)
  await next()
}

export async function createUser(
  c: Context<AppEnv>,
  fields: { email: string; name: string; passwordHash: string; role: 'admin' | 'reviewer' }
): Promise<User> {
  const id = uuid()
  await run(
    c.env.DB,
    'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    fields.email.toLowerCase(),
    fields.name,
    fields.passwordHash,
    fields.role,
    now()
  )
  return { id, email: fields.email.toLowerCase(), name: fields.name, role: fields.role }
}
