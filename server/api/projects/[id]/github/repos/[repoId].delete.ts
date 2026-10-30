import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../../../../db'
import { githubLinks, projectGithubRepos, projectGithubSettings } from '../../../../../db/schema'
import { routeStaffProject, touchProject } from '../../../../../utils/projectResources'

// Unlinks a repository from the project only. Task links to it are left where
// they are, so they are counted and the answer says so. If it was the default,
// the default is cleared and `#123` needs owner/repo until another is chosen.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const repoId = getRouterParam(event, 'repoId')!

  const [row] = await db
    .select()
    .from(projectGithubRepos)
    .where(and(eq(projectGithubRepos.id, repoId), eq(projectGithubRepos.projectId, project.id)))
  if (!row) throw createError({ statusCode: 404, message: 'Repository not found' })

  const fullName = `${row.owner}/${row.repo}`
  await db.delete(projectGithubRepos).where(eq(projectGithubRepos.id, row.id))

  const [settings] = await db
    .select()
    .from(projectGithubSettings)
    .where(eq(projectGithubSettings.projectId, project.id))
  const clearedDefault = !!settings?.defaultRepo && settings.defaultRepo.toLowerCase() === fullName.toLowerCase()
  if (clearedDefault) {
    await db.update(projectGithubSettings)
      .set({ defaultRepo: null })
      .where(eq(projectGithubSettings.projectId, project.id))
  }

  const kept = await db
    .select({ id: githubLinks.id })
    .from(githubLinks)
    .where(and(
      eq(githubLinks.projectId, project.id),
      sql`lower(${githubLinks.owner}) = ${row.owner.toLowerCase()}`,
      sql`lower(${githubLinks.repo}) = ${row.repo.toLowerCase()}`
    ))

  await touchProject(event, project.id)
  const keptNote = kept.length === 0
    ? `No task links point at ${fullName}.`
    : `${kept.length} task ${kept.length === 1 ? 'link' : 'links'} to ${fullName} stay on their tasks.`
  return {
    ok: true,
    removed: fullName,
    clearedDefault,
    keptTaskLinks: kept.length,
    message: `${fullName} is no longer linked to this project. ${keptNote}`
  }
})
