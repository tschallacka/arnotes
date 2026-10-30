// The one entry point the task routes call after a task changes. It finds the
// project's enabled rules whose trigger matches, checks their conditions, runs
// their actions and writes one run-log line per firing. It never throws: a rule
// that breaks must not break the request that changed the task.
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { projectColumns, projectRuleRuns, projectRules, projects } from '../db/schema'
import { conditionsHold, describeRule, MAX_RULE_STEPS, type Action, type Condition, type Rule, type RuleNames, type Trigger } from './ruleSpec'
import { genId } from './projects'
import { projectPeople } from './people'
import { runAction, snapshotTask, type RuleChain, type RuleEvent, type RuleProject } from './ruleActions'

/** A fresh chain for one change made by a person or an agent. */
export function newRuleChain(): RuleChain {
  return { id: genId(), depth: 0, fired: new Set() }
}

// Keeps a run-log line short and free of anything a stack would show.
const MAX_DETAIL = 300

function clip(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > MAX_DETAIL ? `${oneLine.slice(0, MAX_DETAIL - 1)}…` : oneLine
}

// A readable reason for a failed action. Only errors the app wrote itself carry a
// message worth showing; anything else (a database error, say) gets a fixed line,
// so no query text or parameters reach the log.
function reasonOf(error: unknown): string {
  const known = error as { statusMessage?: unknown }
  if (typeof known.statusMessage === 'string' && known.statusMessage.trim()) return clip(known.statusMessage)
  return 'The action could not be completed.'
}

function triggerMatches(trigger: Trigger, event: RuleEvent): boolean {
  if (trigger.kind !== event.type) return false
  if (trigger.kind === 'task_moved') return event.detail === trigger.columnId
  if (trigger.kind === 'task_assigned' && trigger.assigneeId !== undefined) return event.detail === trigger.assigneeId
  return true
}

async function namesFor(project: RuleProject): Promise<RuleNames> {
  const columns = await db.select({ id: projectColumns.id, name: projectColumns.name })
    .from(projectColumns).where(eq(projectColumns.projectId, project.id))
  const people = await projectPeople(project)
  return {
    column: id => columns.find(column => column.id === id)?.name ?? 'a column',
    person: id => people.find(person => person.id === id)?.name ?? 'someone'
  }
}

async function writeRun(args: {
  ruleId: string
  projectId: string
  taskId: string | null
  trigger: string
  outcome: 'ran' | 'failed' | 'loop_stopped'
  detail: string
  chain: RuleChain
  createdAt: number
}) {
  await db.insert(projectRuleRuns).values({
    id: genId(),
    ruleId: args.ruleId,
    projectId: args.projectId,
    taskId: args.taskId,
    trigger: args.trigger,
    outcome: args.outcome,
    detail: clip(args.detail),
    chainId: args.chain.id,
    depth: args.chain.depth,
    createdAt: args.createdAt
  })
}

async function fire(event: RuleEvent, chain: RuleChain): Promise<void> {
  const [project] = await db.select({
    id: projects.id,
    name: projects.name,
    userId: projects.userId,
    teamId: projects.teamId,
    customerId: projects.customerId,
    archivedAt: projects.archivedAt
  }).from(projects).where(eq(projects.id, event.projectId))
  // An archived project runs nothing.
  if (!project || project.archivedAt) return

  const rules = await db.select().from(projectRules)
    .where(and(eq(projectRules.projectId, project.id), eq(projectRules.enabled, true)))
    .orderBy(asc(projectRules.position), asc(projectRules.createdAt))
  if (!rules.length) return

  let names: RuleNames | null = null
  // Each rule sees the task as the rules before it left it.
  for (const row of rules) {
    const trigger = row.trigger as Trigger
    if (!triggerMatches(trigger, event)) continue

    const task = await snapshotTask(event.taskId)
    if (!task || task.deleted) return

    const conditions = (row.conditions ?? []) as Condition[]
    if (!conditionsHold(conditions, task)) continue

    const rule: Rule = {
      name: row.name,
      enabled: row.enabled,
      trigger,
      conditions,
      actions: (row.actions ?? []) as Action[]
    }
    names ??= await namesFor(project)
    const startedAt = Date.now()
    const key = `${row.id}:${event.taskId}`
    const base = { ruleId: row.id, projectId: project.id, taskId: event.taskId, trigger: event.type, chain, createdAt: startedAt }

    if (chain.depth >= MAX_RULE_STEPS || chain.fired.has(key)) {
      const why = chain.fired.has(key)
        ? `"${row.name}" already ran on this task in this chain`
        : `the step limit of ${MAX_RULE_STEPS} was reached`
      await writeRun({ ...base, outcome: 'loop_stopped', detail: `Stopped after ${chain.depth} steps: ${why}, so it would have repeated.` })
      continue
    }

    chain.fired.add(key)
    const followUp = (next: RuleEvent) => fireRules(next, { id: chain.id, depth: chain.depth + 1, fired: chain.fired })
    try {
      for (const action of rule.actions) {
        await runAction(action, project, { id: row.id, name: row.name, createdBy: row.createdBy }, event.taskId, followUp)
      }
      await writeRun({ ...base, outcome: 'ran', detail: describeRule(rule, names) })
    } catch (error) {
      console.error(`[rules] "${row.name}" failed on task ${event.taskId}: ${reasonOf(error)}`)
      await writeRun({ ...base, outcome: 'failed', detail: reasonOf(error) })
    }
  }
}

/**
 * Runs the project's rules for one change to a task. Call it after the change is
 * saved, with the chain the change started (see newRuleChain). Never throws.
 */
export async function fireRules(event: RuleEvent, chain: RuleChain): Promise<void> {
  try {
    await fire(event, chain)
  } catch (error) {
    console.error(`[rules] ${event.type} on task ${event.taskId} stopped: ${reasonOf(error)}`)
  }
}
