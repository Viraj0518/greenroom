/**
 * Thin HTTP client over the CONTRACTS.md API. Tests talk to routes exactly as
 * specified — never to implementation internals.
 */
import { BASE_URL } from './stack';

export { BASE_URL };

export interface ApiResponse<T = any> {
  status: number;
  headers: Headers;
  body: T;
  text: string;
}

export class Client {
  cookie: string | undefined;

  constructor(public base: string = BASE_URL) {}

  async req<T = any>(
    method: string,
    path: string,
    opts: { json?: unknown; token?: string; form?: FormData; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...opts.headers };
    if (this.cookie) headers['cookie'] = this.cookie;
    if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = opts.form;
    }
    const res = await fetch(this.base + path, { method, headers, body, redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const session = setCookie.split(',').map((c) => c.trim()).find((c) => c.startsWith('gr_session='));
      if (session) this.cookie = session.split(';')[0];
    }
    const text = await res.text();
    let parsed: any = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* non-JSON body */ }
    return { status: res.status, headers: res.headers, body: parsed, text };
  }

  get<T = any>(path: string, opts?: Parameters<Client['req']>[2]) { return this.req<T>('GET', path, opts); }
  post<T = any>(path: string, opts?: Parameters<Client['req']>[2]) { return this.req<T>('POST', path, opts); }
  patch<T = any>(path: string, opts?: Parameters<Client['req']>[2]) { return this.req<T>('PATCH', path, opts); }
  put<T = any>(path: string, opts?: Parameters<Client['req']>[2]) { return this.req<T>('PUT', path, opts); }
  delete<T = any>(path: string, opts?: Parameters<Client['req']>[2]) { return this.req<T>('DELETE', path, opts); }
}

let adminSingleton: Client | undefined;
export const ADMIN_EMAIL = 'qa-admin@greenroom.test';
export const ADMIN_PASSWORD = 'qa-admin-password-1';

/** Organizer client: registers the QA admin on first call (first user = admin), logs in after. */
export async function organizer(): Promise<Client> {
  if (adminSingleton) return adminSingleton;
  const c = new Client();
  const reg = await c.post('/api/auth/register', {
    json: { email: ADMIN_EMAIL, name: 'QA Admin', password: ADMIN_PASSWORD },
  });
  if (!c.cookie || reg.status >= 400) {
    const login = await c.post('/api/auth/login', { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    if (login.status >= 400) throw new Error(`Could not register or log in QA admin: register=${reg.status} login=${login.status}`);
  }
  adminSingleton = c;
  return c;
}

let counter = 0;
export function uniq(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${++counter}`;
}

/** Create a fresh event owned by the QA admin; returns {id, slug} plus the organizer client. */
export async function makeEvent(overrides: Record<string, unknown> = {}) {
  const org = await organizer();
  const slug = uniq('qa-event');
  const res = await org.post('/api/events', {
    json: {
      name: `QA Event ${slug}`, slug, timezone: 'UTC',
      starts_on: '2026-09-01', ends_on: '2026-09-03', ...overrides,
    },
  });
  if (res.status >= 400) throw new Error(`makeEvent failed: ${res.status} ${res.text}`);
  const id = res.body?.id ?? res.body?.event?.id;
  if (!id) throw new Error(`makeEvent: no id in response: ${res.text}`);
  return { org, eventId: id as string, slug };
}

/**
 * Standard CFP form spec used across suites.
 * NOTE (contract assumption, flagged to coordinator): the category is taken from the
 * answer to the field with id "category". Routing maps whenCategory -> assignTrack.
 */
export const CFP_SPEC = {
  fields: [
    { id: 'category', type: 'select', label: 'Category', required: true, options: ['Talk', 'Workshop'] },
    { id: 'abstract', type: 'textarea', label: 'Abstract', required: true },
    // Conditional: only required when category === 'Workshop'
    { id: 'equipment', type: 'text', label: 'Equipment needs', required: true,
      showIf: { fieldId: 'category', op: 'eq', value: 'Workshop' } },
  ],
  routing: [
    { whenCategory: 'Workshop', assignTrack: 'Hands-on' },
    { whenCategory: 'Talk', assignTrack: 'Main Stage' },
  ],
};

export async function makeForm(eventId: string, spec: unknown = CFP_SPEC) {
  const org = await organizer();
  const res = await org.post(`/api/events/${eventId}/forms`, {
    json: { name: 'CFP', is_open: 1, spec_json: JSON.stringify(spec) },
  });
  if (res.status >= 400) throw new Error(`makeForm failed: ${res.status} ${res.text}`);
  const id = res.body?.id ?? res.body?.form?.id;
  if (!id) throw new Error(`makeForm: no id in response: ${res.text}`);
  return id as string;
}

/** Submit a CFP entry as a new speaker; returns the response plus the speaker email used. */
export async function submitCfp(formId: string, opts: {
  email?: string; name?: string; title?: string; answers?: Record<string, unknown>;
} = {}) {
  const email = opts.email ?? `${uniq('speaker')}@example.test`;
  const c = new Client();
  const res = await c.post(`/api/public/forms/${formId}/submit`, {
    json: {
      speaker: { email, name: opts.name ?? 'Test Speaker' },
      title: opts.title ?? uniq('Talk title'),
      answers: opts.answers ?? { category: 'Talk', abstract: 'An abstract.' },
    },
  });
  return { res, email };
}
