// The rules API of one project, for the Rules section of Settings. Staff only: the
// server answers a customer's contact with a 404. Writes send the same realtime
// headers as the other project calls, so open boards hear about the change.

// The shapes the rule model (server/utils/ruleSpec.ts) stores. Loose on purpose:
// the server checks each rule, and these only say which keys a kind carries.
export interface RuleTrigger {
  kind: string
  columnId?: string
  assigneeId?: string
}

export interface RuleCondition {
  kind: string
  columnId?: string
  assigneeId?: string | null
  label?: string
  value?: boolean | string
}

export interface RuleAction {
  kind: string
  columnId?: string
  assigneeId?: string
  days?: number
  label?: string
  text?: string
  title?: string
  value?: string
}

export interface RuleRun {
  id: string
  taskId: string | null
  trigger: string
  outcome: 'ran' | 'failed' | 'loop_stopped'
  // The sentence for a run that ran, the reason for one that failed, and the
  // steps for one stopped to prevent a loop.
  detail: string
  depth: number
  createdAt: number
}

export interface ProjectRule {
  id: string
  name: string
  enabled: boolean
  position: number
  trigger: RuleTrigger
  conditions: RuleCondition[]
  actions: RuleAction[]
  description: string
  lastRun: RuleRun | null
  createdAt: number
  updatedAt: number
}

export interface RuleBody {
  name?: string
  trigger: RuleTrigger
  conditions: RuleCondition[]
  actions: RuleAction[]
}

export async function listProjectRules(projectId: string): Promise<ProjectRule[]> {
  const res = await $fetch<{ rules: ProjectRule[] }>(`/api/projects/${projectId}/rules`)
  return res.rules
}

export function createProjectRule(projectId: string, body: RuleBody): Promise<ProjectRule> {
  return $fetch<ProjectRule>(`/api/projects/${projectId}/rules`, {
    method: 'POST', headers: realtimeHeaders(), body
  })
}

// Sending only `enabled` is the on/off switch; anything else is a full rule body.
export function updateProjectRule(projectId: string, ruleId: string, body: RuleBody | { enabled: boolean }): Promise<ProjectRule> {
  return $fetch<ProjectRule>(`/api/projects/${projectId}/rules/${ruleId}`, {
    method: 'PUT', headers: realtimeHeaders(), body
  })
}

export function deleteProjectRule(projectId: string, ruleId: string): Promise<{ ok: true }> {
  return $fetch<{ ok: true }>(`/api/projects/${projectId}/rules/${ruleId}`, {
    method: 'DELETE', headers: realtimeHeaders()
  })
}

export async function listProjectRuleRuns(projectId: string, ruleId: string): Promise<RuleRun[]> {
  const res = await $fetch<{ runs: RuleRun[] }>(`/api/projects/${projectId}/rules/${ruleId}/runs`)
  return res.runs
}

// The server's refusal names every problem in words; fall back to a plain line.
export function ruleErrorMessage(e: unknown, fallback: string): string {
  const data = (e as { data?: { message?: unknown, problems?: unknown } })?.data
  if (Array.isArray(data?.problems) && data.problems.length > 0) return data.problems.join(' ')
  return typeof data?.message === 'string' ? data.message : fallback
}
