import { and, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { projectMessages } from '../../../../db/schema'
import { routeStaffProject } from '../../../../utils/projectResources'

// Only the author can take a message back, and the replies to it go with it.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)

  const deleted = await db.delete(projectMessages)
    .where(and(
      eq(projectMessages.id, getRouterParam(event, 'messageId')!),
      eq(projectMessages.projectId, project.id),
      eq(projectMessages.userId, event.context.session.user.id)
    ))
    .returning({ id: projectMessages.id })

  if (!deleted.length) throw createError({ statusCode: 404, message: 'Message not found' })
  return { ok: true }
})
