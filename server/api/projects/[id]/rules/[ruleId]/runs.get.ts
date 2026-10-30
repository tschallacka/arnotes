import { desc, eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { projectRuleRuns } from '../../../../../db/schema'
import { RUN_PAGE_SIZE, findRuleRow, routeRuleProject, runView } from '../../../../../utils/ruleStore'

// A rule's run log: one row per firing, newest first, at most RUN_PAGE_SIZE rows.
export default defineEventHandler(async (event) => {
  const project = await routeRuleProject(event)
  const ruleId = getRouterParam(event, 'ruleId')!

  const row = await findRuleRow(project.id, ruleId)
  if (!row) throw createError({ statusCode: 404, message: 'Rule not found' })

  const runs = await db
    .select()
    .from(projectRuleRuns)
    .where(eq(projectRuleRuns.ruleId, row.id))
    .orderBy(desc(projectRuleRuns.createdAt))
    .limit(RUN_PAGE_SIZE)

  return { rule: { id: row.id, name: row.name }, runs: runs.map(runView) }
})
