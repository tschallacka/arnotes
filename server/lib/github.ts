// The one place this server talks to GitHub. It calls the REST API and nothing
// else: callers pass a path built from already-validated owner, repo and number
// values, never a URL, and the host is fixed. The token is read here and goes only
// into the Authorization header of that call, never into a result or an error.

const DEFAULT_API = 'https://api.github.com'
const TIMEOUT_MS = 10_000
// A path such as /repos/o/r/issues/1?per_page=10. No host, no dot segments, no `//`.
const PATH = /^\/(?!\/)[A-Za-z0-9._~\-/?=&%+,]*$/

export interface GithubRateLimit {
  remaining: number | null
  resetAt: Date | null
}

export type GithubFailureCode = 'not_found' | 'rate_limited' | 'refused' | 'unavailable'

export interface GithubFailure {
  ok: false
  code: GithubFailureCode
  /** Plain words the UI can show as they are. */
  message: string
  /** Set for rate_limited: when the limit lifts. */
  retryAt?: Date
  rateLimit: GithubRateLimit
}

export interface GithubSuccess<T> {
  ok: true
  notModified: false
  data: T
  etag: string | null
  rateLimit: GithubRateLimit
}

/** 304: the copy the caller already holds is still current. */
export interface GithubNotModified {
  ok: true
  notModified: true
  etag: string | null
  rateLimit: GithubRateLimit
}

export type GithubResult<T> = GithubSuccess<T> | GithubNotModified | GithubFailure

const NO_LIMIT: GithubRateLimit = { remaining: null, resetAt: null }

function failure(code: GithubFailureCode, message: string, rateLimit: GithubRateLimit = NO_LIMIT, retryAt?: Date): GithubFailure {
  return retryAt ? { ok: false, code, message, retryAt, rateLimit } : { ok: false, code, message, rateLimit }
}

// The override exists so tests can point at a stub. In production it is ignored,
// and only the origin is kept so nothing in the variable can change the path.
function apiOrigin(): string {
  const override = process.env.GITHUB_API_URL?.trim()
  if (override && process.env.NODE_ENV !== 'production') {
    try {
      const url = new URL(override)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin
    } catch {
      // A malformed override falls back to the real API rather than to nothing.
    }
  }
  return new URL(DEFAULT_API).origin
}

function readRateLimit(headers: Headers): GithubRateLimit {
  const rawRemaining = headers.get('x-ratelimit-remaining')
  const rawReset = headers.get('x-ratelimit-reset')
  const remaining = rawRemaining === null ? NaN : Number(rawRemaining)
  const reset = rawReset === null ? NaN : Number(rawReset)
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null
  }
}

/** The plain-words line the panel shows for a rate limit. */
export function rateLimitMessage(retryAt: Date): string {
  return `GitHub is rate limiting us, retry at ${retryAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

// A secondary limit says how long to wait in retry-after; a primary one says when
// the hour's quota resets. With neither, a minute is a fair guess.
function retryTime(headers: Headers, rateLimit: GithubRateLimit): Date {
  const retryAfter = Number(headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return new Date(Date.now() + retryAfter * 1000)
  return rateLimit.resetAt ?? new Date(Date.now() + 60_000)
}

/**
 * GET one GitHub REST path. Pass the etag of a copy you hold to get a 304 back
 * when nothing changed. The data is returned as the JSON GitHub sent; the caller
 * decides what shape it trusts.
 */
export async function githubGet<T = unknown>(path: string, options: { etag?: string | null } = {}): Promise<GithubResult<T>> {
  // Callers build paths from validated parts. A path that is not one is a bug in
  // the caller, not something a person typed, so it throws instead of returning.
  if (!PATH.test(path) || path.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('githubGet takes an API path such as /repos/owner/repo, not a URL')

  const headers: Record<string, string> = {
    'accept': 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'taskmanager'
  }
  const token = process.env.GITHUB_TOKEN?.trim()
  if (token) headers.authorization = `Bearer ${token}`
  if (options.etag) headers['if-none-match'] = options.etag

  let res: Response
  try {
    res = await fetch(`${apiOrigin()}${path}`, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return failure('unavailable', 'GitHub did not answer in time, try again in a moment')
    return failure('unavailable', 'GitHub could not be reached, try again in a moment')
  }

  const rateLimit = readRateLimit(res.headers)
  if (res.status === 304) return { ok: true, notModified: true, etag: res.headers.get('etag'), rateLimit }

  if (res.status === 429 || (res.status === 403 && (rateLimit.remaining === 0 || res.headers.has('retry-after')))) {
    const retryAt = retryTime(res.headers, rateLimit)
    return failure('rate_limited', rateLimitMessage(retryAt), rateLimit, retryAt)
  }
  if (res.status === 404) return failure('not_found', 'GitHub has no such issue, pull request or repository, or it is private', rateLimit)
  if (res.status === 401 || res.status === 403) return failure('refused', 'GitHub refused the request, check the GITHUB_TOKEN on the server', rateLimit)
  if (res.status < 200 || res.status >= 300) return failure('unavailable', `GitHub answered with an error (status ${res.status})`, rateLimit)

  let data: T
  try {
    data = await res.json() as T
  } catch {
    return failure('unavailable', 'GitHub sent an answer that could not be read', rateLimit)
  }
  return { ok: true, notModified: false, data, etag: res.headers.get('etag'), rateLimit }
}
