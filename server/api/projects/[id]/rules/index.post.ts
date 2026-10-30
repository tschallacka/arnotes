import { count, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { projectRules } from '../../../../db/schema'
import { genId } from '../../../../utils/projects'
import { validateRule } from '../../../../utils/ruleSpec'
import { loadRuleFrame, nextRulePosition, routeRuleProject, ruleLimitMessage, ruleValues, ruleView } from '../../../../utils/ruleStore'

// Adds a rule at the end of the list. The rule model checks it; a rule that does
// not pass is refused with every sentence that says what to fix.
export default defineEventHandler(async (event) => {
  const project = await routeRuleProject(event)
  const userId = event.context.session.user.id
  const body = await readBody(event)

  const [counted] = await db.select({ total: count() }).from(projectRules).where(eq(projectRules.projectId, project.id))
  const limit = ruleLimitMessage(counted?.total ?? 0)
  if (limit) throw createError({ statusCode: 400, message: limit })

  const frame = await loadRuleFrame(project, userId)
  const checked = validateRule(body, frame.context)
  if (!checked.ok) {
    throw createError({ statusCode: 400, message: checked.problems.join(' '), data: { problems: checked.problems } })
  }

  const now = Date.now()
  const [created] = await db.insert(projectRules).values({
    id: genId(),
    projectId: project.id,
    ...ruleValues(checked.rule),
    position: await nextRulePosition(project.id),
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  }).returning()

  return ruleView(created!, frame.names, null)
})
