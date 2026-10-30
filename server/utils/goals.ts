// Goals as the API and the agent tools return them: the stored row, who owns it,
// the projects it is linked to, and the progress it reports.
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { goalProjects, goals, user } from '../db/schema'
import type { Goal } from '../db/schema'
import { isTeamMember } from './auth-helpers'
import { summariseProjects, workspaceFilter } from './portfolios'
import type { ProjectSummary } from './portfolios'

export interface GoalView {
  id: string
  title: string
  description: string
  status: string | null
  /** What the goal reports: typed in, or the average of its projects. */
  progress: number
  manualProgress: number
  progressFromProjects: boolean
  dueOn: string | null
  parentId: string | null
  owner: { id: string, name: string, image: string | null } | null
  projects: ProjectSummary[]
  createdAt: number
  updatedAt: number
}

async function viewsOf(rows: Goal[]): Promise<GoalView[]> {
  if (!rows.length) return []
  const links = await db.select().from(goalProjects).where(inArray(goalProjects.goalId, rows.map(row => row.id)))
  const summaries = new Map((await summariseProjects([...new Set(links.map(link => link.projectId))])).map(summary => [summary.id, summary]))
  const ownerIds = [...new Set(rows.map(row => row.ownerId).filter((id): id is string => Boolean(id)))]
  const owners = ownerIds.length
    ? new Map((await db.select({ id: user.id, name: user.name, image: user.image }).from(user).where(inArray(user.id, ownerIds))).map(owner => [owner.id, owner]))
    : new Map()

  return rows.map((row) => {
    const linked = links.filter(link => link.goalId === row.id).map(link => summaries.get(link.projectId)).filter((s): s is ProjectSummary => Boolean(s))
    const fromProjects = linked.length ? Math.round(linked.reduce((sum, project) => sum + project.percent, 0) / linked.length) : 0
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      progress: row.progressFromProjects ? fromProjects : row.progress,
      manualProgress: row.progress,
      progressFromProjects: row.progressFromProjects,
      dueOn: row.dueOn,
      parentId: row.parentId,
      owner: row.ownerId ? owners.get(row.ownerId) ?? null : null,
      projects: linked,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  })
}

export async function listGoals(userId: string, teamId: string | null): Promise<GoalView[]> {
  return viewsOf(await db.select().from(goals).where(workspaceFilter(goals, userId, teamId)).orderBy(desc(goals.updatedAt)))
}

/** One goal of the caller's workspace, or 404. */
export async function requireGoal(userId: string, teamId: string | null, id: string): Promise<Goal> {
  const [row] = (await db.select().from(goals).where(eq(goals.id, id))).filter(goal => goal.teamId === teamId && (teamId || goal.userId === userId))
  if (!row) throw createError({ statusCode: 404, message: 'Goal not found' })
  return row
}

export async function viewGoal(row: Goal): Promise<GoalView> {
  return (await viewsOf([row]))[0]!
}

/** The person who owns a goal must work in the same workspace. Throws 400 otherwise. */
export async function checkOwner(userId: string, teamId: string | null, ownerId: unknown): Promise<string | null> {
  if (ownerId === null || ownerId === '') return null
  if (typeof ownerId !== 'string') throw createError({ statusCode: 400, message: 'The owner is a person\'s id' })
  const works = teamId ? await isTeamMember(ownerId, teamId) : ownerId === userId
  if (!works) throw createError({ statusCode: 400, message: 'The owner is not in this workspace' })
  return ownerId
}
