import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { projectRules } from '../../../../db/schema'
import { findRuleRow, routeRuleProject } from '../../../../utils/ruleStore'

// Deletes a rule. Its run log goes with it (the runs cascade). Staff only, like the rest of the rules API.
export default defineEventHandler(async (event) => {
  const project = await routeRuleProject(event)
  const ruleId = getRouterParam(event, 'ruleId')!

  const row = await findRuleRow(project.id, ruleId)
  if (!row) throw createError({ statusCode: 404, message: 'Rule not found' })

  await db.delete(projectRules).where(eq(projectRules.id, row.id))
  return { ok: true }
})
