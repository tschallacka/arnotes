import { db } from '../../../db'
import { projectGithubSettings, VISIBILITIES, type Visibility } from '../../../db/schema'
import { isGithubRefError, parseGithubRef } from '../../../utils/githubRef'
import { routeStaffProject } from '../../../utils/projectResources'

// Sets the project's GitHub defaults. Only the fields sent change; an empty
// default repo clears it.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const body = await readBody<{ defaultRepo?: string | null, defaultVisibility?: string }>(event)

  const values: { defaultRepo?: string | null, defaultVisibility?: Visibility } = {}

  if (body.defaultRepo !== undefined) {
    const repo = (body.defaultRepo ?? '').trim()
    if (repo) {
      // Only owner/repo is a default repo. The `#1` is a stand-in issue number so
      // the shared parser checks the names the same way it checks pasted links.
      if (!/^[^\s/#]+\/[^\s/#]+$/.test(repo)) {
        throw createError({ statusCode: 400, message: 'Write the default repo as owner/repo' })
      }
      const ref = parseGithubRef(`${repo}#1`)
      if (isGithubRefError(ref)) throw createError({ statusCode: 400, message: ref.message })
    }
    values.defaultRepo = repo || null
  }

  if (body.defaultVisibility !== undefined) {
    if (!VISIBILITIES.includes(body.defaultVisibility as Visibility)) {
      throw createError({ statusCode: 400, message: 'Unknown visibility' })
    }
    values.defaultVisibility = body.defaultVisibility as Visibility
  }

  const [saved] = await db.insert(projectGithubSettings)
    .values({ projectId: project.id, ...values })
    .onConflictDoUpdate({ target: projectGithubSettings.projectId, set: values })
    .returning()

  return {
    defaultRepo: saved!.defaultRepo,
    defaultVisibility: saved!.defaultVisibility
  }
})
