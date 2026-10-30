import { and, eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { projectGithubRepos, VISIBILITIES, type Visibility } from '../../../../../db/schema'
import { routeStaffProject, touchProject } from '../../../../../utils/projectResources'

// Changes the visibility of one linked repository. Task links keep their own
// visibility; this only sets what new links to the repository get.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const repoId = getRouterParam(event, 'repoId')!
  const body = await readBody<{ visibility?: unknown }>(event)

  if (!VISIBILITIES.includes(body.visibility as Visibility)) {
    throw createError({ statusCode: 400, message: 'Unknown visibility' })
  }

  const [row] = await db
    .select()
    .from(projectGithubRepos)
    .where(and(eq(projectGithubRepos.id, repoId), eq(projectGithubRepos.projectId, project.id)))
  if (!row) throw createError({ statusCode: 404, message: 'Repository not found' })

  const [updated] = await db
    .update(projectGithubRepos)
    .set({ visibility: body.visibility as Visibility })
    .where(eq(projectGithubRepos.id, row.id))
    .returning()

  await touchProject(event, project.id)
  return {
    id: updated!.id,
    fullName: `${updated!.owner}/${updated!.repo}`,
    visibility: updated!.visibility
  }
})
