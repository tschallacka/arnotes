import { db } from '../../db'
import { notificationPreferences } from '../../db/schema'
import { mailEnabled } from '../../lib/mailer'
import { loadPreferences } from '../../utils/notifications'

// How the signed-in person wants to be told. `mailEnabled` says whether this
// server can send mail at all, so the settings can say why an email switch does
// nothing instead of pretending.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id

  if (event.method === 'PUT') {
    const body = await readBody<{ email?: unknown, browser?: unknown }>(event)
    for (const key of ['email', 'browser'] as const) {
      if (body[key] !== undefined && typeof body[key] !== 'boolean') {
        throw createError({ statusCode: 400, message: `"${key}" is true or false` })
      }
    }
    const current = await loadPreferences(userId)
    const next = { email: body.email ?? current.email, browser: body.browser ?? current.browser } as { email: boolean, browser: boolean }
    await db.insert(notificationPreferences).values({ userId, ...next })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: next })
  } else if (event.method !== 'GET') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  return { ...(await loadPreferences(userId)), mailEnabled }
})
