import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { projectRules } from '../../../../db/schema'
import { validateRule } from '../../../../utils/ruleSpec'
import type { Rule } from '../../../../utils/ruleSpec'
import { findRuleRow, lastRunOf, loadRuleFrame, routeRuleProject, ruleValues, ruleView, storedRule } from '../../../../utils/ruleStore'

// Changes a rule. Sending only `enabled` is the on/off switch, and skips the
// checks because switching a rule off must work for anyone, whatever it does.
// Any other change is merged onto the stored rule and checked as a whole.
export default defineEventHandler(async (event) => {
  const project = await routeRuleProject(event)
  const userId = event.context.session.user.id
  const ruleId = getRouterParam(event, 'ruleId')!

  const row = await findRuleRow(project.id, ruleId)
  if (!row) throw createError({ statusCode: 404, message: 'Rule not found' })

  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  const frame = await loadRuleFrame(project, userId)
  const now = Date.now()

  const keys = Object.keys(body)
  if (keys.length === 1 && keys[0] === 'enabled') {
    if (typeof body.enabled !== 'boolean') throw createError({ statusCode: 400, message: 'Say whether the rule is on or off' })
    const [updated] = await db.update(projectRules)
      .set({ enabled: body.enabled, updatedAt: now })
      .where(eq(projectRules.id, row.id))
      .returning()
    return ruleView(updated!, frame.names, await lastRunOf(row.id))
  }

  const stored = storedRule(row)
  const merged = {
    // An unnamed rule stores an empty name, which the model reads as no name at all.
    name: stored.name || undefined,
    enabled: stored.enabled,
    trigger: stored.trigger,
    conditions: stored.conditions,
    actions: stored.actions,
    ...body
  }
  const checked = validateRule(merged, frame.context)
  if (!checked.ok) {
    throw createError({ statusCode: 400, message: checked.problems.join(' '), data: { problems: checked.problems } })
  }
  const rule: Rule = checked.rule

  const [updated] = await db.update(projectRules)
    .set({ ...ruleValues(rule), updatedAt: now })
    .where(eq(projectRules.id, row.id))
    .returning()
  return ruleView(updated!, frame.names, await lastRunOf(row.id))
})
