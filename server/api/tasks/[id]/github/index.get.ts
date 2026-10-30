import { requireTask } from '../../../../utils/projects'
import { readTaskGithubLinks } from '../../../../utils/githubTaskLinks'

// The GitHub links on a task that the caller may see, each with its fetched data.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { task, project } = await requireTask(event, id)
  const { links } = await readTaskGithubLinks({ taskId: task.id, audience: project.audience })
  return links
})
