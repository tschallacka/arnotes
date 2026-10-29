import { requireStaff, requireTask } from '../../../utils/projects'
import { entriesWhere, loadEntries } from '../../../utils/timeTracking'

// Everything logged against a task, newest day first. Staff only: time is the
// team's own bookkeeping, not something a customer's contact sees.
export default defineEventHandler(async (event) => {
  const { task, project } = await requireTask(event, getRouterParam(event, 'id')!)
  requireStaff(project)
  return loadEntries(entriesWhere({ taskId: task.id }))
})
