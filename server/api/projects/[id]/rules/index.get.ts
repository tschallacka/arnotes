import { loadRuleFrame, lastRunOf, loadRules, routeRuleProject, ruleView } from '../../../../utils/ruleStore'

// The project's rules in the order they run, each with its plain sentence and its
// last run. Staff only: a customer's contact gets a 404.
export default defineEventHandler(async (event) => {
  const project = await routeRuleProject(event)
  const frame = await loadRuleFrame(project, event.context.session.user.id)
  const rows = await loadRules(project.id)

  const rules = await Promise.all(rows.map(async row =>
    ruleView(row, frame.names, await lastRunOf(row.id))
  ))
  return { rules }
})
