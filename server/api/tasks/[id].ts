import { db } from '../../db'
import { projects, projectTasks, VISIBILITIES, type Visibility } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireTask, requireColumn, requireStaff, columnTasksOrdered, subtasksOrdered, positionBetween, uiDeletion, rootTaskId, isInAncestryChain } from '../../utils/projects'
import { publishFromEvent } from '../../utils/realtime'
import { removeTaskAttachments } from '../../utils/attachments'
import { requireAssignable } from '../../utils/people'
import { parseDueOn } from '../../utils/taskFields'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  // Widened for the delete below, which has to be able to find a card that is
  // already in the trash in order to remove it for good.
  const { task, project } = await requireTask(event, id, { includeDeleted: true })
  requireStaff(project)

  if (event.method === 'DELETE') {
    // Two stages: the first delete puts the card in the board's trash, and
    // deleting it again from there is what removes it. A subtask has no place
    // on the board for its trash to be drawn in, so it goes in one step.
    const permanent = task.deletedAt !== null || task.parentTaskId !== null

    if (permanent) {
      await db.delete(projectTasks).where(eq(projectTasks.id, id))
      removeTaskAttachments([id])
    } else {
      await db.update(projectTasks).set(uiDeletion(event)).where(eq(projectTasks.id, id))
    }

    await db.update(projects).set({ updatedAt: Date.now() }).where(eq(projects.id, project.id))

    await publishFromEvent(event, { type: 'board', projectId: project.id })
    return { ok: true, permanent }
  }

  if (event.method !== 'PUT') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  // A trashed card is read-only: restore it before editing or moving it.
  if (task.deletedAt) throw createError({ statusCode: 404, message: 'Task not found' })

  // PUT — edit fields and/or move (columnId + beforeId/afterId neighbors).
  const body = await readBody<{
    title?: string
    description?: string
    tags?: string[]
    visibility?: Visibility
    assigneeId?: string | null
    dueOn?: string | null
    startOn?: string | null
    completed?: boolean
    columnId?: string
    parentTaskId?: string | null
    beforeId?: string | null
    afterId?: string | null
  }>(event)

  const patch: {
    title?: string
    description?: string
    tags?: string[]
    visibility?: Visibility
    assigneeId?: string | null
    dueOn?: string | null
    startOn?: string | null
    completedAt?: number | null
    columnId?: string
    previousColumnId?: string | null
    parentTaskId?: string
    position?: number
    updatedAt: number
  } = {
    updatedAt: Date.now()
  }
  if (body.title !== undefined) patch.title = body.title.trim() || 'Untitled'
  if (body.description !== undefined) patch.description = body.description
  if (body.tags !== undefined) patch.tags = [...new Set(body.tags.map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
  if (body.visibility !== undefined) {
    if (!VISIBILITIES.includes(body.visibility)) throw createError({ statusCode: 400, message: 'Unknown visibility' })
    patch.visibility = body.visibility
  }
  if (body.assigneeId !== undefined) {
    if (body.assigneeId !== null) await requireAssignable(project, body.assigneeId)
    patch.assigneeId = body.assigneeId
  }
  if (body.dueOn !== undefined) patch.dueOn = parseDueOn(body.dueOn)
  if (body.startOn !== undefined) patch.startOn = parseDueOn(body.startOn)
  if (body.completed !== undefined) {
    // Ticking an already finished task again keeps the moment it was finished.
    patch.completedAt = body.completed ? (task.completedAt ?? Date.now()) : null
  }

  // A subtask follows its parent's column, so it only ever moves among the
  // tasks nested somewhere under the same top-level task. Within that tree it
  // can also be re-nested under a different parent (indent/outdent).
  if (task.parentTaskId) {
    if (body.columnId && body.columnId !== task.columnId) {
      throw createError({ statusCode: 400, message: 'A subtask moves with its parent' })
    }

    let parentId = task.parentTaskId
    if (body.parentTaskId !== undefined && body.parentTaskId !== task.parentTaskId) {
      const newParentId = body.parentTaskId
      if (!newParentId) {
        throw createError({ statusCode: 400, message: 'A subtask cannot be promoted to a card' })
      }
      if (newParentId === id) {
        throw createError({ statusCode: 400, message: 'A subtask cannot be its own parent' })
      }
      const [newParent] = await db.select().from(projectTasks).where(eq(projectTasks.id, newParentId))
      if (!newParent || newParent.deletedAt || newParent.projectId !== task.projectId) {
        throw createError({ statusCode: 400, message: 'New parent not found' })
      }
      // Re-nesting under one of its own descendants would turn the chain into a
      // loop, so the new parent must not sit anywhere below the task being moved.
      if (await isInAncestryChain(newParentId, id)) {
        throw createError({ statusCode: 400, message: 'A subtask cannot be nested inside its own descendant' })
      }
      // Bounded to the task it already belongs to — re-nesting across onto a
      // different card's subtask tree is not supported.
      if (await rootTaskId(newParentId) !== await rootTaskId(id)) {
        throw createError({ statusCode: 400, message: 'A subtask can only be nested within its own task' })
      }
      patch.parentTaskId = newParentId
      parentId = newParentId
    }

    if (body.beforeId !== undefined || body.afterId !== undefined || patch.parentTaskId) {
      const siblings = (await subtasksOrdered(parentId))
        .filter(t => t.id !== id)
        .map(t => ({ id: t.id, position: t.position }))
      patch.position = await positionBetween(siblings, body.beforeId ?? null, body.afterId ?? null, async (ids) => {
        for (const [idx, tid] of ids.entries()) {
          await db.update(projectTasks).set({ position: idx * 1000 }).where(eq(projectTasks.id, tid))
        }
      })
    }
    const [updated] = await db.update(projectTasks).set(patch).where(eq(projectTasks.id, id)).returning()
    await db.update(projects).set({ updatedAt: Date.now() }).where(eq(projects.id, project.id))
    await publishFromEvent(event, { type: 'board', projectId: project.id })
    return updated
  }

  let targetColumnId = task.columnId
  if (body.columnId && body.columnId !== task.columnId) {
    // The column must belong to this task's board. Without the check a task
    // could be parked in another board's column while its projectId stayed
    // behind, leaving it invisible on one board and orphaned on the other.
    const { column } = await requireColumn(event, body.columnId)
    if (column.projectId !== task.projectId) {
      throw createError({ statusCode: 400, message: 'That column belongs to another project' })
    }
    patch.columnId = body.columnId
    // Filing a card somewhere deliberately overrides where it happened to come
    // from, so restoring its old column later leaves this one alone.
    patch.previousColumnId = null
    targetColumnId = body.columnId
  }

  if (body.beforeId !== undefined || body.afterId !== undefined || patch.columnId) {
    const siblings = (await columnTasksOrdered(targetColumnId))
      .filter(t => t.id !== id)
      .map(t => ({ id: t.id, position: t.position }))
    patch.position = await positionBetween(
      siblings,
      body.beforeId ?? null,
      body.afterId ?? null,
      async (ids) => {
        for (const [idx, tid] of ids.entries()) {
          await db.update(projectTasks).set({ position: idx * 1000 }).where(eq(projectTasks.id, tid))
        }
      }
    )
  }

  const [updated] = await db.update(projectTasks).set(patch).where(eq(projectTasks.id, id)).returning()
  // Subtasks carry their parent's column, so they go where it goes.
  if (patch.columnId) {
    await db.update(projectTasks).set({ columnId: patch.columnId }).where(eq(projectTasks.parentTaskId, id))
  }
  await db.update(projects).set({ updatedAt: Date.now() }).where(eq(projects.id, project.id))

  await publishFromEvent(event, { type: 'board', projectId: project.id })
  return updated
})
