import { parseEntryDay, stopTimer } from '../utils/timeTracking'
import { publishFromEvent } from '../utils/realtime'

// Stops the running timer and logs it against the day it was started, or `?day=`.
export default defineEventHandler(async (event) => {
  const day = getQuery(event).day
  const entry = await stopTimer(event.context.session.user.id, { day: day === undefined ? undefined : parseEntryDay(day) })
  if (entry) await publishFromEvent(event, { type: 'resource', projectId: entry.projectId, resource: 'time' })
  return { timer: null, entry }
})
