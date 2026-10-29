import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { timeEntries } from '../../db/schema'

// Only whoever logged an entry can take it back.
export default defineEventHandler(async (event) => {
  const deleted = await db.delete(timeEntries)
    .where(and(
      eq(timeEntries.id, getRouterParam(event, 'entryId')!),
      eq(timeEntries.userId, event.context.session.user.id)
    ))
    .returning({ id: timeEntries.id })

  if (!deleted.length) throw createError({ statusCode: 404, message: 'Time entry not found' })
  return { ok: true }
})
