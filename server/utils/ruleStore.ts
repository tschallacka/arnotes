// What the rules API routes and the agent tools share: loading a project's rules,
// the names and people a rule is checked against, and how a stored rule reads
// back. Rules are the team's: any staff member may change them, but only the
// project owner may let a rule make a task customer-visible (see ruleContext).
import type { H3Event } from 'h3'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { projectColumns, projectRuleRuns, projectRules } from '../db/schema'
import type { Project, ProjectRule, ProjectRuleRun } from '../db/schema'
import { projectPeople } from './people'
import { routeProject } from './projectResources'
import { describeRule, MAX_RULES_PER_PROJECT } from './ruleSpec'
import type { Action, Condition, Rule, RuleContext, RuleNames, Trigger } from './ruleSpec'

/** Runs one rule's log returns at most this many, newest first. */
export const RUN_PAGE_SIZE = 50

export interface RuleFrame {
  context: RuleContext
  names: RuleNames
}

/** The columns, people and owner a rule is checked against, read once per request. */
export async function loadRuleFrame(project: Project, userId: string): Promise<RuleFrame> {
  const columns = await db
    .select({ id: projectColumns.id, name: projectColumns.name, deletedAt: projectColumns.deletedAt })
    .from(projectColumns)
    .where(eq(projectColumns.projectId, project.id))
  const people = await projectPeople(project)

  const columnNames = new Map(columns.map(column => [column.id, column.name]))
  const personNames = new Map(people.map(person => [person.id, person.name || person.email]))
  return {
    context: {
      // A trashed column cannot be the target of a new rule, though old rules may name it.
      columnIds: columns.filter(column => !column.deletedAt).map(column => column.id),
      memberIds: people.map(person => person.id),
      // Setting a task customer-visible is the owner's call, not every team member's.
      mayChangeVisibility: project.userId === userId
    },
    names: {
      column: id => columnNames.get(id) ?? 'a column that has been removed',
      person: id => personNames.get(id) ?? 'someone who is no longer on the project'
    }
  }
}

/** The project a rules route works on. Customers' contacts get a 404, never a hint that rules exist. */
export async function routeRuleProject(event: H3Event) {
  const project = await routeProject(event)
  if (project.audience !== 'staff') throw createError({ statusCode: 404, message: 'Project not found' })
  return project
}

export async function loadRules(projectId: string): Promise<ProjectRule[]> {
  return db
    .select()
    .from(projectRules)
    .where(eq(projectRules.projectId, projectId))
    .orderBy(asc(projectRules.position), asc(projectRules.createdAt))
}

/** The position for a rule added at the end of the list, with room left between rules. */
export async function nextRulePosition(projectId: string): Promise<number> {
  const [last] = await db
    .select({ position: projectRules.position })
    .from(projectRules)
    .where(eq(projectRules.projectId, projectId))
    .orderBy(desc(projectRules.position))
    .limit(1)
  return (last?.position ?? 0) + 1000
}

export function ruleLimitMessage(count: number): string | null {
  if (count < MAX_RULES_PER_PROJECT) return null
  return `A project can hold at most ${MAX_RULES_PER_PROJECT} rules, and it already has ${count}. Remove or switch off a rule before adding another.`
}

/** The rule as it is stored, in the shape the rule model checks. */
export function storedRule(row: ProjectRule): Rule {
  return {
    name: row.name,
    enabled: row.enabled,
    trigger: row.trigger as Trigger,
    conditions: row.conditions as Condition[],
    actions: row.actions as Action[]
  }
}

/** The columns a rule insert or update writes, from a rule the model has checked. */
export function ruleValues(rule: Rule) {
  return {
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger,
    conditions: rule.conditions,
    actions: rule.actions
  }
}

export function runView(run: ProjectRuleRun) {
  return {
    id: run.id,
    taskId: run.taskId,
    trigger: run.trigger,
    outcome: run.outcome,
    detail: run.detail,
    depth: run.depth,
    createdAt: run.createdAt
  }
}

/** The newest run of a rule, or null when it has never fired. */
export async function lastRunOf(ruleId: string) {
  const [run] = await db
    .select()
    .from(projectRuleRuns)
    .where(eq(projectRuleRuns.ruleId, ruleId))
    .orderBy(desc(projectRuleRuns.createdAt))
    .limit(1)
  return run ? runView(run) : null
}

/** A rule as the UI and the agents read it: its parts, one plain sentence, and its last run. */
export function ruleView(row: ProjectRule, names: RuleNames, lastRun: ReturnType<typeof runView> | null) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    position: row.position,
    trigger: row.trigger,
    conditions: row.conditions,
    actions: row.actions,
    description: describeRule(storedRule(row), names),
    lastRun,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/** Only the rule's own project's rows; a rule id from another project is simply not found. */
export async function findRuleRow(projectId: string, ruleId: string): Promise<ProjectRule | undefined> {
  const [row] = await db
    .select()
    .from(projectRules)
    .where(and(eq(projectRules.id, ruleId), eq(projectRules.projectId, projectId)))
  return row
}
