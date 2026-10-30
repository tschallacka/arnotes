import { createHmac, timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, getHeader, readRawBody, setResponseStatus } from 'h3'
import { refreshForEvent } from '../../utils/githubSync'

// The events that can change what a link shows. Others are accepted and ignored.
const HANDLED_EVENTS = new Set(['issues', 'pull_request', 'check_run', 'workflow_run'])

// GitHub posts here when something changes. The body is signed with the webhook
// secret, so the signature is checked before a single field of it is read.
export default defineEventHandler(async (event) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim()
  if (!secret) throw createError({ statusCode: 503, message: 'GitHub webhooks are not set up on this server' })

  const raw = await readRawBody(event, false)
  if (!raw) throw createError({ statusCode: 401, message: 'Signature does not match' })

  const presented = Buffer.from(getHeader(event, 'x-hub-signature-256') ?? '')
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`)
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    throw createError({ statusCode: 401, message: 'Signature does not match' })
  }

  const name = getHeader(event, 'x-github-event') ?? ''
  if (!HANDLED_EVENTS.has(name)) {
    setResponseStatus(event, 202)
    return { ok: true, handled: false }
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw.toString('utf8'))
  } catch {
    throw createError({ statusCode: 400, message: 'The webhook body is not JSON' })
  }

  // GitHub wants a quick answer; the refresh of the affected links runs after it.
  // A failed refresh is kept in the cache's retry time, so nothing is lost by dropping it here.
  refreshForEvent(name, (payload ?? {}) as Parameters<typeof refreshForEvent>[1]).catch(() => undefined)
  setResponseStatus(event, 202)
  return { ok: true, handled: true }
})
