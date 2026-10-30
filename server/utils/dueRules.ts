import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { projectRuleRuns, projectRules, projectTasks, projects } from '../db/schema'
import { fireRules } from './ruleEngine'
import type { RuleChain } from './ruleActions'

// The "due date passes" trigger fires once per task and due date, when that date is
// behind us. Dates are UTC (YYYY-MM-DD), the same day ruleActions writes when a rule
// sets one, so "overdue" means before the UTC day that is today.
//
// Once per due date is kept by the chain id: every run row a firing writes carries it,
// so a due date that already has a row is done. A task whose due date is moved gets a
// new id and fires again when that new date passes.

function chainIdFor(taskId: string, dueOn: string): string {
  return `due:${taskId}:${dueOn}`
}

/** Fires the due-date rules for overdue open tasks in projects with an enabled due_passed rule. Returns how many tasks fired. */
export async function sweepDueRules(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)

  // Only projects with an enabled due-date rule are looked at at all.
  const withRule = await db.selectDistinct({ projectId: projectRules.projectId }).from(projectRules)
    .where(and(eq(projectRules.enabled, true), sql`${projectRules.trigger}->>'kind' = 'due_passed'`))
  if (!withRule.length) return 0

  const overdue = await db.select({ id: projectTasks.id, projectId: projectTasks.projectId, dueOn: projectTasks.dueOn })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(and(
      inArray(projectTasks.projectId, withRule.map(row => row.projectId)),
      isNull(projectTasks.deletedAt),
      isNull(projectTasks.completedAt),
      isNull(projects.archivedAt),
      isNotNull(projectTasks.dueOn),
      lt(projectTasks.dueOn, today)
    ))
  if (!overdue.length) return 0

  const due = overdue.map(task => ({ ...task, chainId: chainIdFor(task.id, task.dueOn ?? '') }))
  const logged = await db.selectDistinct({ chainId: projectRuleRuns.chainId }).from(projectRuleRuns)
    .where(inArray(projectRuleRuns.chainId, due.map(task => task.chainId)))
  const done = new Set(logged.map(row => row.chainId))

  let fired = 0
  for (const task of due) {
    if (done.has(task.chainId)) continue
    const chain: RuleChain = { id: task.chainId, depth: 0, fired: new Set() }
    await fireRules({ type: 'due_passed', projectId: task.projectId, taskId: task.id, actorId: null, actorIsAgent: false, detail: null }, chain)
    fired++
  }
  return fired
}
