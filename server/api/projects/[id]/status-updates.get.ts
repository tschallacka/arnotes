import { desc, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { projectStatusUpdates, user } from '../../../db/schema'
import { authorColumns, authorOf, routeStaffProject } from '../../../utils/projectResources'

// The project's health history, newest first. Staff only: it is the team's own
// account of how the work is going, not something for a customer's contact.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)

  const rows = await db
    .select({
      id: projectStatusUpdates.id,
      status: projectStatusUpdates.status,
      body: projectStatusUpdates.body,
      createdAt: projectStatusUpdates.createdAt,
      ...authorColumns
    })
    .from(projectStatusUpdates)
    .leftJoin(user, eq(user.id, projectStatusUpdates.userId))
    .where(eq(projectStatusUpdates.projectId, project.id))
    .orderBy(desc(projectStatusUpdates.createdAt))
    .limit(200)

  return rows.map(({ authorId, authorName, authorImage, ...rest }) => ({
    ...rest,
    author: authorOf({ authorId, authorName, authorImage })
  }))
})
