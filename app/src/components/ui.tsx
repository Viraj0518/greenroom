// Small shared component kit — everything styles via classes in base.css.
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type TextareaHTMLAttributes, type SelectHTMLAttributes,
} from 'react'
import { cx, initials } from '../lib'

// ---------- buttons ----------

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
  busy?: boolean
}

export function Button({ variant = 'default', size = 'md', busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      className={cx('btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || busy}
      {...rest}
    >
      {busy && <span className="spinner" style={{ width: 13, height: 13 }} />}
      {children}
    </button>
  )
}

// ---------- form controls ----------

export function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}{required && <span className="req">*</span>}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error" role="alert">{error}</span>}
    </div>
  )
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cx('input', className)} aria-invalid={invalid || undefined} {...rest} />
}

export function Textarea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={cx('textarea', className)} aria-invalid={invalid || undefined} {...rest} />
}

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={cx('select', className)} aria-invalid={invalid || undefined} {...rest}>{children}</select>
}

// ---------- surfaces ----------

export function Card({ title, actions, pad = true, className, children }: {
  title?: ReactNode; actions?: ReactNode; pad?: boolean; className?: string; children: ReactNode
}) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="card-head">
          <h2>{title}</h2>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'card-pad' : undefined}>{children}</div>
    </section>
  )
}

export function Badge({ tone = '', children }: { tone?: string; children: ReactNode }) {
  return <span className={cx('badge', tone)}>{children}</span>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row muted" style={{ justifyContent: 'center', padding: 28 }} role="status">
      <span className="spinner" />{label ?? 'Loading…'}
    </div>
  )
}

export function EmptyState({ glyph = '◦', title, children }: { glyph?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph" aria-hidden>{glyph}</div>
      <strong>{title}</strong>
      {children && <span className="small">{children}</span>}
    </div>
  )
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} title={name}>
      {src && !broken
        ? <img src={src} alt={name} onError={() => setBroken(true)} />
        : initials(name)}
    </span>
  )
}

// ---------- modal ----------

export function Modal({ open, onClose, title, wide, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; wide?: boolean; children: ReactNode; footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} className={cx('modal', wide && 'modal-wide')} role="dialog" aria-modal="true">
        <header className="card-head">
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
        </header>
        <div className="card-pad">{children}</div>
        {footer && <footer className="card-head" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>{footer}</footer>}
      </div>
    </div>
  )
}

// ---------- toasts ----------

interface Toast { id: number; text: string; error?: boolean }
const ToastCtx = createContext<(text: string, opts?: { error?: boolean }) => void>(() => {})

export function useToast() { return useContext(ToastCtx) }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, opts?: { error?: boolean }) => {
    const t = { id: Date.now() + Math.random(), text, error: opts?.error }
    setToasts((ts) => [...ts, t])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('toast', t.error && 'toast-error')}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------- tabs ----------

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: Array<{ key: T; label: ReactNode }>; value: T; onChange: (k: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" className="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
