import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { pushSubscriptions } from '../../db/schema'
import { pushEnabled, sendPush } from '../../lib/webpush'

// Sends the signed-in person a push on every device they subscribed, so they can
// see it work. Answers how many reached their push service, which is not the
// same as the device showing it.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  if (!pushEnabled) throw createError({ statusCode: 501, message: 'Push notifications are not set up on this server' })

  const devices = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  let accepted = 0
  for (const device of devices) {
    const result = await sendPush(device, { title: 'Push notifications are on', body: 'This is how Taskmanager will tell you.', url: '/projects/inbox', tag: 'push-test' })
    if (result.gone) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id))
    else if (result.ok) accepted++
  }
  return { devices: devices.length, accepted }
})
