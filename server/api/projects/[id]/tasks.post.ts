import { db } from '../../../db'
import { projects, projectTasks, VISIBILITIES } from '../../../db/schema'
import type { Visibility } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireColumn, requireStaff, requireTask, columnTasksOrdered, subtasksOrdered, genId } from '../../../utils/projects'
import { publishFromEvent } from '../../../utils/realtime'
import { requireAssignable } from '../../../utils/people'
import { parseDueOn } from '../../../utils/taskFields'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    columnId?: string
    parentTaskId?: string
    title?: string
    description?: string
    tags?: string[]
    visibility?: Visibility
    assigneeId?: string | null
    dueOn?: string | null
  }>(event)
  if (body.visibility !== undefined && !VISIBILITIES.includes(body.visibility)) {
    throw createError({ statusCode: 400, message: 'Unknown visibility' })
  }

  // A subtask takes its board, column and audience from its parent; a task takes
  // them from the column it is filed in.
  let projectRow: Awaited<ReturnType<typeof requireColumn>>['project']
  let columnId: string, position: number, parentTaskId: string | null = null
  let inheritedVisibility: Visibility | null = null
  if (body.parentTaskId) {
    const { task: parent, project } = await requireTask(event, body.parentTaskId)
    requireStaff(project)
    if (project.id !== getRouterParam(event, 'id')) {
      throw createError({ statusCode: 400, message: 'That task belongs to another project' })
    }
    const siblings = await subtasksOrdered(parent.id)
    projectRow = project
    columnId = parent.columnId
    position = (siblings.at(-1)?.position ?? -1000) + 1000
    parentTaskId = parent.id
    // A subtask of an internal task would otherwise show a customer the inside
    // of work they cannot see.
    inheritedVisibility = parent.visibility
  } else {
    if (typeof body.columnId !== 'string' || !body.columnId) {
      throw createError({ statusCode: 400, message: 'columnId is required' })
    }
    const { column, project } = await requireColumn(event, body.columnId)
    const existing = await columnTasksOrdered(column.id)
    projectRow = project
    columnId = column.id
    position = (existing.at(-1)?.position ?? -1000) + 1000
  }

  const isCustomer = projectRow.audience === 'customer'
  // Planning fields are the team's call; a contact files the request and the
  // team decides who takes it and when.
  if (isCustomer && (body.assigneeId || body.dueOn)) requireStaff(projectRow)
  if (body.assigneeId) await requireAssignable(projectRow, body.assigneeId)
  const dueOn = body.dueOn === undefined ? null : parseDueOn(body.dueOn)

  const now = Date.now()
  const [task] = await db.insert(projectTasks).values({
    id: genId(),
    projectId: projectRow.id,
    columnId,
    parentTaskId,
    title: body.title?.trim() || 'Untitled',
    description: body.description ?? '',
    tags: body.tags ?? [],
    // A customer's own request is for the team and for them; a contact cannot
    // file something they would then be unable to see.
    visibility: isCustomer ? 'customer' : (inheritedVisibility ?? body.visibility ?? 'customer'),
    assigneeId: body.assigneeId ?? null,
    dueOn,
    position,
    createdAt: now,
    updatedAt: now
  }).returning()

  await db.update(projects).set({ updatedAt: now }).where(eq(projects.id, projectRow.id))

  await publishFromEvent(event, { type: 'board', projectId: projectRow.id })
  return task
})
