import { requireStaff, requireTask } from '../utils/projects'
import { currentTimer, parseEntryDay, startTimer } from '../utils/timeTracking'
import { publishFromEvent } from '../utils/realtime'

// Starts a timer on a task. One at a time: a timer already running is stopped
// and what it measured is logged, and that entry comes back as `stopped`.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ taskId?: string, day?: unknown }>(event)
  if (typeof body.taskId !== 'string' || !body.taskId) throw createError({ statusCode: 400, message: 'taskId is required' })

  const { task, project } = await requireTask(event, body.taskId)
  requireStaff(project)

  const userId = event.context.session.user.id
  const stopped = await startTimer(userId, task.id, body.day === undefined ? undefined : parseEntryDay(body.day))
  // A timer that was stopped to make room has logged an entry.
  if (stopped) await publishFromEvent(event, { type: 'resource', projectId: stopped.projectId, resource: 'time' })
  return { timer: await currentTimer(userId), stopped }
})
