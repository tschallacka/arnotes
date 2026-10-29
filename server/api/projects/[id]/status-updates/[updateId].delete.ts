import { and, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { projectStatusUpdates } from '../../../../db/schema'
import { routeStaffProject } from '../../../../utils/projectResources'

// Only the person who wrote an update can take it back. The project's status
// stays as it is: removing a post does not rewind the health it set.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const updateId = getRouterParam(event, 'updateId')!

  const deleted = await db.delete(projectStatusUpdates)
    .where(and(
      eq(projectStatusUpdates.id, updateId),
      eq(projectStatusUpdates.projectId, project.id),
      eq(projectStatusUpdates.userId, event.context.session.user.id)
    ))
    .returning({ id: projectStatusUpdates.id })

  if (!deleted.length) throw createError({ statusCode: 404, message: 'Update not found' })
  return { ok: true }
})
