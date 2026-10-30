import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { goals } from '../../db/schema'
import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { requireGoal } from '../../utils/goals'

// Deleting a goal leaves its sub-goals standing, now at the top.
export default defineEventHandler(async (event) => {
  const goal = await requireGoal(event.context.session.user.id, await getUserActiveTeamId(event), getRouterParam(event, 'id')!)
  await db.delete(goals).where(eq(goals.id, goal.id))
  await publishCollection(event, 'goals')
  return { ok: true }
})
