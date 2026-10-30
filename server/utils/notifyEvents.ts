// Who hears about what. Each event names the people it concerns; `notify` then
// drops whoever did it and whoever may not read it.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { projectMessages, taskComments, user } from '../db/schema'
import { notificationExcerpt, notify } from './notifications'
import { projectPeople } from './people'

type Project = { id: string, name: string, userId: string, teamId: string | null, customerId: string | null }
type Task = { id: string, title: string, visibility: 'internal' | 'customer', assigneeId?: string | null, createdBy?: string | null }

async function nameOf(userId: string | null): Promise<string> {
  if (!userId) return 'Someone'
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId))
  return row?.name ?? 'Someone'
}

/** A task was given to someone. */
export async function notifyAssigned(project: Project, task: Task, actorId: string | null, assigneeId: string) {
  await notify({
    project,
    task,
    actorId,
    type: 'assigned',
    recipients: [assigneeId],
    title: `${await nameOf(actorId)} assigned you "${task.title}"`
  })
}

/** An update was posted on a task: its assignee and the others who have written on it hear. */
export async function notifyComment(project: Project, task: Task, actorId: string | null, body: string, internal: boolean) {
  const writers = await db.select({ userId: taskComments.userId }).from(taskComments).where(eq(taskComments.taskId, task.id))
  await notify({
    project,
    task,
    actorId,
    type: 'comment',
    recipients: [...new Set([...(task.assigneeId ? [task.assigneeId] : []), ...(task.createdBy ? [task.createdBy] : []), ...writers.map(writer => writer.userId)])],
    staffOnly: internal,
    title: `${await nameOf(actorId)} commented on "${task.title}"`,
    body: notificationExcerpt(body)
  })
}

/**
 * A message or a reply. A new message goes to the whole team on the project; a
 * reply goes to the people already in that conversation. The team's own talk is
 * never shown to a customer's contact.
 */
export async function notifyMessage(project: Project, message: { title: string, body: string, parentId: string | null }, actorId: string | null) {
  const actor = await nameOf(actorId)

  if (!message.parentId) {
    const staff = (await projectPeople(project)).filter(person => person.kind === 'staff').map(person => person.id)
    await notify({
      project,
      actorId,
      type: 'message',
      recipients: staff,
      staffOnly: true,
      title: `${actor} posted in ${project.name}${message.title ? `: ${message.title}` : ''}`,
      body: notificationExcerpt(message.body)
    })
    return
  }

  const thread = await db
    .select({ userId: projectMessages.userId })
    .from(projectMessages)
    .where(eq(projectMessages.parentId, message.parentId))
  const [parent] = await db.select({ userId: projectMessages.userId, title: projectMessages.title })
    .from(projectMessages).where(eq(projectMessages.id, message.parentId))

  await notify({
    project,
    actorId,
    type: 'reply',
    recipients: [...(parent ? [parent.userId] : []), ...thread.map(reply => reply.userId)],
    staffOnly: true,
    title: `${actor} replied${parent?.title ? ` to "${parent.title}"` : ''} in ${project.name}`,
    body: notificationExcerpt(message.body)
  })
}

/**
 * Something about a task changed: done, reopened, a new due date, a move. The
 * people on it hear: its assignee and everyone who has written on it.
 */
export async function notifyTaskChange(project: Project, task: Task, actorId: string | null, changes: string[]) {
  if (!changes.length) return
  const writers = await db.select({ userId: taskComments.userId }).from(taskComments).where(eq(taskComments.taskId, task.id))
  await notify({
    project,
    task,
    actorId,
    type: 'update',
    recipients: [...new Set([...(task.assigneeId ? [task.assigneeId] : []), ...(task.createdBy ? [task.createdBy] : []), ...writers.map(writer => writer.userId)])],
    title: `${await nameOf(actorId)} updated "${task.title}"`,
    body: changes.join(' · ')
  })
}
