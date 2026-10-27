import { db } from '../../../../db'
import { taskComments, VISIBILITIES } from '../../../../db/schema'
import type { Visibility } from '../../../../db/schema'
import { and, eq } from 'drizzle-orm'
import { requireStaff, requireTask } from '../../../../utils/projects'
import { commentVisibilityFilter } from '../../../../utils/auth-helpers'
import { publishFromEvent } from '../../../../utils/realtime'

// Editing and removing an update. Only the account an update belongs to can do
// either — which includes what an agent once posted with that account's key,
// since that is the owner's to clean up. A teammate's update is theirs.
export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')!
  const commentId = getRouterParam(event, 'commentId')!
  const { task, project } = await requireTask(event, taskId)

  const [comment] = await db
    .select()
    .from(taskComments)
    .where(and(
      eq(taskComments.id, commentId),
      eq(taskComments.taskId, taskId),
      commentVisibilityFilter(project.audience)
    ))

  if (!comment) throw createError({ statusCode: 404, message: 'Update not found' })
  if (comment.userId !== event.context.session.user.id) {
    throw createError({ statusCode: 403, message: 'Only the author can change this update' })
  }

  if (event.method === 'DELETE') {
    await db.delete(taskComments).where(eq(taskComments.id, commentId))
    await publishFromEvent(event, { type: 'board', projectId: task.projectId })
    return { ok: true }
  }

  if (event.method !== 'PUT') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  const payload = await readBody<{ body?: string, visibility?: Visibility }>(event)
  const body = payload.body?.trim() ?? comment.body
  if (!body) throw createError({ statusCode: 400, message: 'Update body is required' })

  let visibility = comment.visibility
  if (payload.visibility !== undefined) {
    if (!VISIBILITIES.includes(payload.visibility)) throw createError({ statusCode: 400, message: 'Unknown visibility' })
    // Who reads a comment is the team's call; a contact's own stay visible to them.
    requireStaff(project)
    visibility = payload.visibility
  }

  if (body === comment.body && visibility === comment.visibility) {
    return { id: comment.id, body: comment.body, visibility: comment.visibility, editedAt: comment.editedAt }
  }

  const [updated] = await db
    .update(taskComments)
    .set({
      body,
      visibility,
      // Sharing a comment does not rewrite it, so only a new body marks it edited.
      ...(body !== comment.body && { editedAt: Date.now() })
    })
    .where(eq(taskComments.id, commentId))
    .returning()

  await publishFromEvent(event, { type: 'board', projectId: task.projectId })
  return { id: updated!.id, body: updated!.body, visibility: updated!.visibility, editedAt: updated!.editedAt }
})
