import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireProject, requireStaff } from '../../../utils/projects'
import { publishFromEvent } from '../../../utils/realtime'

// Gives an archived project back to the lists and lets its rules run again.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const project = await requireProject(event, id)
  requireStaff(project)

  const [updated] = await db.update(projects)
    .set({ archivedAt: null })
    .where(eq(projects.id, id))
    .returning()

  await publishFromEvent(event, { type: 'projects', projectId: id })
  return updated
})
