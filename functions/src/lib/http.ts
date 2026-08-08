// Error envelope: every error response is { error: { code, message } }.

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badRequest = (message: string, code = 'bad_request') =>
  new ApiError(400, code, message)
export const unauthorized = (message = 'Authentication required', code = 'unauthorized') =>
  new ApiError(401, code, message)
export const forbidden = (message = 'Not allowed', code = 'forbidden') =>
  new ApiError(403, code, message)
export const notFound = (message = 'Not found', code = 'not_found') =>
  new ApiError(404, code, message)
export const notConfigured = (message: string, code = 'not_configured') =>
  new ApiError(501, code, message)

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw badRequest('Request body must be valid JSON', 'invalid_json')
  }
}

/**
 * Pinned decision #5: request bodies are strict. The body must be a JSON object and
 * every top-level key must be in `allowed` — unknown keys are 400 {"code":"invalid_body"},
 * never silently ignored (a typo'd key must not quietly drop a caller's intent).
 */
export async function readBody(req: Request, allowed: readonly string[]): Promise<Record<string, unknown>> {
  const body = await readJson<unknown>(req)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object', 'invalid_body')
  }
  const record = body as Record<string, unknown>
  const unknown = Object.keys(record).filter((k) => !allowed.includes(k))
  if (unknown.length) {
    throw badRequest(`Unknown body keys: ${unknown.join(', ')} (allowed: ${allowed.join(', ')})`, 'invalid_body')
  }
  return record
}

export function requireString(
  body: Record<string, unknown>,
  key: string,
  { max = 5000 }: { max?: number } = {}
): string {
  const v = body[key]
  if (typeof v !== 'string' || v.trim() === '') {
    throw badRequest(`Missing required field: ${key}`, 'missing_field')
  }
  if (v.length > max) throw badRequest(`Field too long: ${key}`, 'field_too_long')
  return v.trim()
}

/**
 * SQLite-flag fields (is_public, is_open, …) arrive as true/false or 1/0 depending on
 * the client. Accept both shapes, return 0|1, and 400 on anything else — a valid-looking
 * value must never silently flip meaning.
 */
export function optionalFlag(body: Record<string, unknown>, key: string): 0 | 1 | undefined {
  const v = body[key]
  if (v === undefined || v === null) return undefined
  if (v === true || v === 1) return 1
  if (v === false || v === 0) return 0
  throw badRequest(`Field ${key} must be a boolean or 0/1`, 'invalid_flag')
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw badRequest(`Field must be a string: ${key}`, 'invalid_field')
  return v
}
