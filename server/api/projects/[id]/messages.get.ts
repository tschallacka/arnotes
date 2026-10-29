import { asc, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { projectMessages, user } from '../../../db/schema'
import { authorColumns, authorOf, routeStaffProject } from '../../../utils/projectResources'

// The project's conversations, oldest first: a message and the replies to it
// are told apart by `parentId`, and the view groups them. Staff only.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)

  const rows = await db
    .select({
      id: projectMessages.id,
      parentId: projectMessages.parentId,
      title: projectMessages.title,
      body: projectMessages.body,
      createdAt: projectMessages.createdAt,
      ...authorColumns
    })
    .from(projectMessages)
    .leftJoin(user, eq(user.id, projectMessages.userId))
    .where(eq(projectMessages.projectId, project.id))
    .orderBy(asc(projectMessages.createdAt))
    .limit(1000)

  return rows.map(({ authorId, authorName, authorImage, ...rest }) => ({
    ...rest,
    author: authorOf({ authorId, authorName, authorImage })
  }))
})
