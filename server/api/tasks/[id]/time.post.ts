import { requireStaff, requireTask } from '../../../utils/projects'
import { logEntry, parseEntryDay, parseEntryMinutes, parseEntryNote } from '../../../utils/timeTracking'

// Logs time against a task: `minutes` or a typed `duration`, the `day` it was
// worked (today if omitted) and an optional note.
export default defineEventHandler(async (event) => {
  const { task, project } = await requireTask(event, getRouterParam(event, 'id')!)
  requireStaff(project)
  const body = await readBody<{ minutes?: unknown, duration?: unknown, day?: unknown, note?: unknown }>(event)

  const user = event.context.session.user
  const entry = await logEntry({
    taskId: task.id,
    projectId: project.id,
    userId: user.id,
    minutes: parseEntryMinutes(body),
    day: parseEntryDay(body.day),
    note: parseEntryNote(body.note)
  })

  return {
    id: entry.id,
    taskId: entry.taskId,
    taskTitle: task.title,
    projectId: entry.projectId,
    projectName: project.name,
    minutes: entry.minutes,
    day: entry.day,
    note: entry.note,
    createdAt: entry.createdAt,
    author: { id: user.id, name: user.name, image: user.image ?? null }
  }
})
