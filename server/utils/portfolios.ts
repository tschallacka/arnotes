// What goals and portfolios share: the workspace they live in, the projects they
// may point at, and reading a project down to a health and a percentage.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { projectColumns, projectStatusUpdates, projectTasks, projects } from '../db/schema'
import { terminalColumnIds } from '#shared/utils/board'
import { projectAccessFilter } from './auth-helpers'

/** Scopes a goal or portfolio query to the caller's workspace, as projects are. */
export function workspaceFilter(table: { userId: AnyPgColumn, teamId: AnyPgColumn }, userId: string, teamId: string | null): SQL | undefined {
  return teamId ? eq(table.teamId, teamId) : and(eq(table.userId, userId), isNull(table.teamId))
}

/**
 * The ids, from those asked for, of projects the caller's own workspace holds.
 * A project of another workspace, or one the caller only reaches as a customer's
 * contact, is simply not in the answer: it cannot be linked.
 */
export async function ownProjectIds(userId: string, teamId: string | null, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const rows = await db.select({ id: projects.id }).from(projects)
    .where(and(inArray(projects.id, ids), projectAccessFilter(userId, teamId)))
  return rows.map(row => row.id)
}

export interface ProjectSummary {
  id: string
  name: string
  status: string | null
  customerId: string | null
  updatedAt: number
  /** Top-level tasks, and how many of them sit in a finishing column. */
  total: number
  done: number
  /** done / total as 0-100; 0 for a project with no tasks. */
  percent: number
  /** The words of the newest status update, if there is one. */
  latestUpdate: { status: string, body: string, createdAt: number } | null
}

/** Reads the given projects (already checked to be the caller's) down to a summary each. */
export async function summariseProjects(projectIds: string[]): Promise<ProjectSummary[]> {
  if (!projectIds.length) return []
  const rows = await db.select().from(projects).where(inArray(projects.id, projectIds))

  const columns = await db.select({ id: projectColumns.id, projectId: projectColumns.projectId, name: projectColumns.name })
    .from(projectColumns)
    .where(and(inArray(projectColumns.projectId, projectIds), isNull(projectColumns.deletedAt)))
    .orderBy(asc(projectColumns.position))
  const finishing = new Set<string>()
  for (const id of projectIds) terminalColumnIds(columns.filter(column => column.projectId === id)).forEach(column => finishing.add(column))

  const tasks = await db.select({ projectId: projectTasks.projectId, columnId: projectTasks.columnId, completedAt: projectTasks.completedAt })
    .from(projectTasks)
    .where(and(inArray(projectTasks.projectId, projectIds), isNull(projectTasks.deletedAt), isNull(projectTasks.parentTaskId)))

  const updates = await db.select().from(projectStatusUpdates)
    .where(inArray(projectStatusUpdates.projectId, projectIds))
    .orderBy(desc(projectStatusUpdates.createdAt))

  return rows.map((project) => {
    const own = tasks.filter(task => task.projectId === project.id)
    // A task is done when it was marked done, or when it sits in a finishing column.
    const done = own.filter(task => task.completedAt != null || finishing.has(task.columnId)).length
    const latest = updates.find(update => update.projectId === project.id)
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      customerId: project.customerId,
      updatedAt: project.updatedAt,
      total: own.length,
      done,
      percent: own.length ? Math.round((done / own.length) * 100) : 0,
      latestUpdate: latest ? { status: latest.status, body: latest.body, createdAt: latest.createdAt } : null
    }
  })
}

export const GOAL_STATUSES = ['on_track', 'at_risk', 'off_track', 'achieved', 'dropped'] as const
export type GoalStatus = typeof GOAL_STATUSES[number]

/** One of the goal statuses, or null to clear it. Throws 400 otherwise. */
export function parseGoalStatus(value: unknown): GoalStatus | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !(GOAL_STATUSES as readonly string[]).includes(value)) {
    throw createError({ statusCode: 400, message: 'Unknown goal status' })
  }
  return value as GoalStatus
}

/** A whole number from 0 to 100. Throws 400 otherwise. */
export function parseProgress(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    throw createError({ statusCode: 400, message: 'Progress is a whole number from 0 to 100' })
  }
  return value
}

/** A required title or name, trimmed and kept short. Throws 400 otherwise. */
export function parseTitle(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw createError({ statusCode: 400, message: `${what} is needed, and at most 200 characters` })
  }
  return value.trim()
}

export function parseText(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length > 20000) {
    throw createError({ statusCode: 400, message: `${what} is text of at most 20000 characters` })
  }
  return value
}

export function parseIdList(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(id => typeof id !== 'string' || !id || id.length > 80)) {
    throw createError({ statusCode: 400, message: `${what} is a list of ids` })
  }
  return [...new Set(value as string[])]
}
