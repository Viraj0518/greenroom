import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError, usingMocks } from '../../api'
import { Button, Card, Field, Input, useToast } from '../../components/ui'

export function LoginPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'register') await api.register({ email, name, password })
      else await api.login({ email, password })
      toast('Welcome back 👋')
      nav('/org', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: '0 auto', padding: '12vh 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-block' }} aria-label="GreenRoom home">
          <span className="brand-dot" style={{ width: 16, height: 16 }} />
        </Link>
        <h1 style={{ marginTop: 6 }}>{mode === 'login' ? 'Organizer sign in' : 'Create organizer account'}</h1>
      </div>
      <Card>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </Field>
          )}
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              autoComplete="email" placeholder="you@conference.org" />
          </Field>
          <Field label="Password" required error={error ?? undefined}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          <Button variant="primary" busy={busy} style={{ width: '100%' }}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      </Card>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 14 }}>
        {mode === 'login'
          ? <>First deploy? <button className="btn btn-ghost btn-sm" onClick={() => setMode('register')}>Create the admin account</button></>
          : <>Have an account? <button className="btn btn-ghost btn-sm" onClick={() => setMode('login')}>Sign in</button></>}
      </p>
      {usingMocks() && (
        <p className="small muted" style={{ textAlign: 'center', marginTop: 10 }}>
          Demo mode (no backend detected) — any email &amp; password signs in with seeded data.
        </p>
      )}
    </main>
  )
}
