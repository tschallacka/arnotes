import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { timeEntries } from '../../db/schema'
import { publishFromEvent } from '../../utils/realtime'

// Only whoever logged an entry can take it back.
export default defineEventHandler(async (event) => {
  const deleted = await db.delete(timeEntries)
    .where(and(
      eq(timeEntries.id, getRouterParam(event, 'entryId')!),
      eq(timeEntries.userId, event.context.session.user.id)
    ))
    .returning({ id: timeEntries.id, projectId: timeEntries.projectId })

  if (!deleted.length) throw createError({ statusCode: 404, message: 'Time entry not found' })
  await publishFromEvent(event, { type: 'resource', projectId: deleted[0]!.projectId, resource: 'time' })
  return { ok: true }
})
