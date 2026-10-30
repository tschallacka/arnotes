import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { goals } from '../../db/schema'
import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { requireGoal, viewGoal } from '../../utils/goals'
import { readGoalPatch, replaceGoalProjects } from '../../utils/goalWrites'

// Changes the fields the request carries; `projectIds` replaces the linked projects.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const teamId = await getUserActiveTeamId(event)
  const goal = await requireGoal(userId, teamId, getRouterParam(event, 'id')!)
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}

  const { values, projectIds } = await readGoalPatch(userId, teamId, body, goal.id)
  const [row] = await db.update(goals).set({ ...values, updatedAt: Date.now() }).where(eq(goals.id, goal.id)).returning()
  if (projectIds) await replaceGoalProjects(goal.id, projectIds)
  await publishCollection(event, 'goals')
  return viewGoal(row!)
})
