import { requireTask } from '../../../../utils/projects'
import { readTaskGithubLinks } from '../../../../utils/githubTaskLinks'
import { publishFromEvent } from '../../../../utils/realtime'

// Asks GitHub again for every link the caller may see on the task. A known rate
// limit is still respected: the answer then says when to retry.
export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }
  const id = getRouterParam(event, 'id')!
  const { task, project } = await requireTask(event, id)

  const { links } = await readTaskGithubLinks({ taskId: task.id, audience: project.audience, refresh: true })

  await publishFromEvent(event, { type: 'board', projectId: project.id })
  return links
})
