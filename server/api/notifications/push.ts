import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { pushSubscriptions } from '../../db/schema'
import { checkPushEndpoint, pushEnabled, vapidPublicKey } from '../../lib/webpush'

const MAX_DEVICES = 20

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value || value.length > max) {
    throw createError({ statusCode: 400, message: `"${name}" is missing or too long` })
  }
  return value
}

// Web Push devices of the signed-in person. GET says whether this server can push
// and which key a browser subscribes with; POST adds this browser; DELETE removes
// it by its endpoint.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id

  if (event.method === 'POST') {
    if (!pushEnabled) throw createError({ statusCode: 501, message: 'Push notifications are not set up on this server' })
    const body = await readBody<{ endpoint?: unknown, keys?: { p256dh?: unknown, auth?: unknown } }>(event)
    const endpoint = text(body?.endpoint, 'endpoint', 1000)
    const p256dh = text(body?.keys?.p256dh, 'keys.p256dh', 200)
    const auth = text(body?.keys?.auth, 'keys.auth', 100)
    const refusal = await checkPushEndpoint(endpoint)
    if (refusal) throw createError({ statusCode: 400, message: refusal })

    const own = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    if (own.length >= MAX_DEVICES && !own.some(device => device.endpoint === endpoint)) {
      throw createError({ statusCode: 400, message: `At most ${MAX_DEVICES} devices can receive push notifications` })
    }

    // A browser that moves to another account keeps its endpoint: the row follows it.
    const values = { userId, endpoint, p256dh, auth, userAgent: (getHeader(event, 'user-agent') ?? '').slice(0, 300) }
    await db.insert(pushSubscriptions)
      .values({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`, createdAt: Date.now(), ...values })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
    setResponseStatus(event, 201)
  } else if (event.method === 'DELETE') {
    const endpoint = text((await readBody<{ endpoint?: unknown }>(event))?.endpoint, 'endpoint', 1000)
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
  } else if (event.method !== 'GET') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  const devices = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  return { enabled: pushEnabled, publicKey: pushEnabled ? vapidPublicKey : null, endpoints: devices.map(device => device.endpoint) }
})
