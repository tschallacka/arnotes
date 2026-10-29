import { entriesWhere, loadEntries, parseRange } from '../utils/timeTracking'

// The signed-in person's own timesheet across every project, for `from`–`to`.
export default defineEventHandler(async (event) => {
  const { from, to } = parseRange(getQuery(event).from, getQuery(event).to)
  return loadEntries(entriesWhere({ userId: event.context.session.user.id, from, to }))
})
