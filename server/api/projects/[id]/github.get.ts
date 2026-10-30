import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { projectGithubSettings } from '../../../db/schema'
import { routeStaffProject } from '../../../utils/projectResources'

// The project's GitHub defaults. A project that never set them reads as no
// default repo and internal visibility, the same as a fresh one.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const [settings] = await db
    .select()
    .from(projectGithubSettings)
    .where(eq(projectGithubSettings.projectId, project.id))

  return {
    defaultRepo: settings?.defaultRepo ?? null,
    defaultVisibility: settings?.defaultVisibility ?? 'internal'
  }
})
