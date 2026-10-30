import { db } from '../../db'
import { goals } from '../../db/schema'
import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { viewGoal } from '../../utils/goals'
import { readGoalPatch, replaceGoalProjects } from '../../utils/goalWrites'
import { genId } from '../../utils/projects'

// A new goal. Only the title is needed; the owner defaults to whoever made it.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const teamId = await getUserActiveTeamId(event)
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  if (!('title' in body)) throw createError({ statusCode: 400, message: 'A title is needed' })

  const { values, projectIds } = await readGoalPatch(userId, teamId, body, null)
  const now = Date.now()
  const [row] = await db.insert(goals).values({
    ownerId: userId,
    ...values,
    id: genId(),
    userId,
    teamId,
    title: values.title!,
    createdAt: now,
    updatedAt: now
  }).returning()
  if (projectIds) await replaceGoalProjects(row!.id, projectIds)
  setResponseStatus(event, 201)
  return viewGoal(row!)
})
