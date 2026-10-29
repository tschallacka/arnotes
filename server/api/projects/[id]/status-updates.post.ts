import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { projects, projectStatusUpdates } from '../../../db/schema'
import { genId } from '../../../utils/projects'
import { publishResource, routeStaffProject, touchProject } from '../../../utils/projectResources'
import { parseProjectStatus } from '../../../utils/taskFields'

const MAX_BODY = 5000

// Posting an update is also how the project's status changes: the project now
// reads as whatever the newest update says.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const body = await readBody<{ status?: string, body?: string }>(event)

  const status = parseProjectStatus(body.status)
  if (!status) throw createError({ statusCode: 400, message: 'Pick a status for the update' })

  const user = event.context.session.user
  const [created] = await db.insert(projectStatusUpdates).values({
    id: genId(),
    projectId: project.id,
    userId: user.id,
    status,
    body: (body.body ?? '').trim().slice(0, MAX_BODY),
    createdAt: Date.now()
  }).returning()

  await db.update(projects).set({ status }).where(eq(projects.id, project.id))
  await touchProject(event, project.id)
  await publishResource(event, project.id, 'status-updates')

  return {
    id: created!.id,
    status: created!.status,
    body: created!.body,
    createdAt: created!.createdAt,
    author: { id: user.id, name: user.name, image: user.image ?? null }
  }
})
