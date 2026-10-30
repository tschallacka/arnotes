import { requireTask } from '../../../../utils/projects'
import { createTaskGithubLink } from '../../../../utils/githubTaskLinks'
import type { GithubLinkRefusal } from '../../../../utils/githubTaskLinks'
import { publishFromEvent } from '../../../../utils/realtime'

const STATUS: Record<GithubLinkRefusal['reason'], number> = {
  not_staff: 403,
  owner_not_allowed: 403,
  invalid_reference: 400,
  bad_visibility: 400,
  already_linked: 409,
  not_linked: 404
}

// Links a GitHub issue, pull request, branch or workflow run to the task. The rules
// (parsing, allowlist, duplicates, kind mapping) live in githubTaskLinks.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { task, project } = await requireTask(event, id)
  const body = await readBody<{ input?: unknown, visibility?: unknown }>(event)

  const result = await createTaskGithubLink({
    task,
    board: project,
    audience: project.audience,
    input: typeof body.input === 'string' ? body.input : '',
    visibility: body.visibility === undefined ? undefined : String(body.visibility),
    userId: event.context.session.user.id
  })
  if (!result.ok) throw createError({ statusCode: STATUS[result.reason], message: result.message })

  await publishFromEvent(event, { type: 'board', projectId: project.id })
  return result.link
})
