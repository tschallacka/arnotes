import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireProject, requireStaff } from '../../../utils/projects'
import { publishFromEvent } from '../../../utils/realtime'

// Archiving hides the project from the lists and stops its rules (the rule engine
// checks archived_at). The board stays readable and its tasks stay editable: this
// is not a read-only mode.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const project = await requireProject(event, id)
  requireStaff(project)

  // Archiving twice keeps the first time, so the date says when it was archived.
  const [updated] = await db.update(projects)
    .set({ archivedAt: project.archivedAt ?? Date.now() })
    .where(eq(projects.id, id))
    .returning()

  await publishFromEvent(event, { type: 'projects', projectId: id })
  return updated
})
