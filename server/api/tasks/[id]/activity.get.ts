import { requireTask } from '../../../utils/projects'
import { listActivity } from '../../../utils/taskActivity'

// What happened to a task, oldest first: made, finished, moved, rescheduled.
// Anyone who can open the task can read its log; a contact is not shown a change
// of who it is visible to.
export default defineEventHandler(async (event) => {
  const { task, project } = await requireTask(event, getRouterParam(event, 'id')!)
  return listActivity(task, project.audience === 'customer')
})
