import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { user } from '../db/schema'

/** 403 unless the caller runs this instance. Read from the database, not the session cache. */
export async function requireInstanceAdmin(event: H3Event) {
  const [row] = await db
    .select({ isInstanceAdmin: user.isInstanceAdmin })
    .from(user)
    .where(eq(user.id, event.context.session.user.id))
  if (!row?.isInstanceAdmin) throw createError({ statusCode: 403, message: 'Only the instance admin can do this' })
}
