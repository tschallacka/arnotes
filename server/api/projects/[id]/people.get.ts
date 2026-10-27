import { requireProject } from '../../../utils/projects'
import { projectPeople } from '../../../utils/people'

// Everyone a task on this board can be assigned to, for the assignee picker and
// for drawing an assignee's name and avatar.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  return projectPeople(project)
})
