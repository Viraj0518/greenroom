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

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw badRequest(`Field must be a string: ${key}`, 'invalid_field')
  return v
}
