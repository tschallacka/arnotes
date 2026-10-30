import { requireTask } from '../../../../utils/projects'
import { deleteTaskGithubLink } from '../../../../utils/githubTaskLinks'
import { publishFromEvent } from '../../../../utils/realtime'

// Removes one link from the task. A link the caller cannot see is a 404, the same
// as a link that does not exist.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const linkId = getRouterParam(event, 'linkId')!
  const { task, project } = await requireTask(event, id)

  const result = await deleteTaskGithubLink({ task, linkId, audience: project.audience })
  if (!result.ok) {
    const statusCode = result.reason === 'not_staff' ? 403 : 404
    throw createError({ statusCode, message: result.message })
  }

  await publishFromEvent(event, { type: 'board', projectId: project.id })
  return { ok: true }
})
