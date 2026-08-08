import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { readBody, readJson, requireString, badRequest, unauthorized, forbidden } from '../lib/http'
import { one, run } from '../lib/db'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { createSession, createUser, destroySession, requireOrganizer, sessionUser } from '../lib/auth'

const auth = new Hono<AppEnv>()

// First registered user becomes admin; after that, only an admin session may create users.
auth.post('/auth/register', async (c) => {
  const body = await readBody(c.req.raw, ['email', 'name', 'password', 'role'])
  const email = requireString(body, 'email', { max: 200 }).toLowerCase()
  const name = requireString(body, 'name', { max: 200 })
  const password = requireString(body, 'password', { max: 200 })
  if (password.length < 8) throw badRequest('Password must be at least 8 characters', 'weak_password')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Invalid email address', 'invalid_email')

  const existing = await one<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM users')
  const isFirst = (existing?.n ?? 0) === 0

  let role: 'admin' | 'reviewer' = 'admin'
  if (!isFirst) {
    const caller = await sessionUser(c)
    if (!caller) throw unauthorized('Registration is admin-only after the first user')
    if (caller.role !== 'admin') throw forbidden('Only admins can create users')
    role = body.role === 'admin' ? 'admin' : 'reviewer'
  }

  const dup = await one(c.env.DB, 'SELECT id FROM users WHERE email = ?', email)
  if (dup) throw badRequest('A user with this email already exists', 'email_taken')

  const user = await createUser(c, { email, name, passwordHash: await hashPassword(password), role })
  if (isFirst) await createSession(c, user.id)
  return c.json({ user }, 201)
})

auth.post('/auth/login', async (c) => {
  const body = await readBody(c.req.raw, ['email', 'password'])
  const email = requireString(body, 'email', { max: 200 }).toLowerCase()
  const password = requireString(body, 'password', { max: 200 })

  const row = await one<{ id: string; email: string; name: string; role: 'admin' | 'reviewer'; password_hash: string }>(
    c.env.DB,
    'SELECT id, email, name, role, password_hash FROM users WHERE email = ?',
    email
  )
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw unauthorized('Invalid email or password', 'invalid_credentials')
  }
  await createSession(c, row.id)
  return c.json({ user: { id: row.id, email: row.email, name: row.name, role: row.role } })
})

auth.post('/auth/logout', async (c) => {
  await destroySession(c)
  return c.json({ ok: true })
})

auth.get('/auth/me', requireOrganizer, (c) => {
  return c.json({ user: c.get('user') })
})

export default auth
