import { routeStaffProject } from '../../../utils/projectResources'
import { entriesWhere, loadEntries, parseRange } from '../../../utils/timeTracking'

// Every entry logged on the project's tasks for `from`–`to`, from everyone on the team.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const { from, to } = parseRange(getQuery(event).from, getQuery(event).to)
  return loadEntries(entriesWhere({ projectIds: [project.id], from, to }))
})
