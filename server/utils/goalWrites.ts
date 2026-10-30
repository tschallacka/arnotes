// Reading a goal's fields out of a request body, shared by create and update.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { goalProjects, goals } from '../db/schema'
import { parseDueOn } from './taskFields'
import { checkOwner, requireGoal } from './goals'
import { ownProjectIds, parseGoalStatus, parseIdList, parseProgress, parseText, parseTitle } from './portfolios'

export interface GoalPatch {
  values: Partial<typeof goals.$inferInsert>
  /** Present when the request named the projects to link; replaces the old set. */
  projectIds?: string[]
}

/** Only the fields the request carries are read, so an update can be one field. */
export async function readGoalPatch(userId: string, teamId: string | null, body: Record<string, unknown>, goalId: string | null): Promise<GoalPatch> {
  const values: GoalPatch['values'] = {}
  if ('title' in body) values.title = parseTitle(body.title, 'A title')
  if ('description' in body) values.description = parseText(body.description, 'The description')
  if ('status' in body) values.status = parseGoalStatus(body.status)
  if ('progress' in body) values.progress = parseProgress(body.progress)
  if ('progressFromProjects' in body) {
    if (typeof body.progressFromProjects !== 'boolean') throw createError({ statusCode: 400, message: '"progressFromProjects" is true or false' })
    values.progressFromProjects = body.progressFromProjects
  }
  if ('dueOn' in body) values.dueOn = parseDueOn(body.dueOn)
  if ('ownerId' in body) values.ownerId = await checkOwner(userId, teamId, body.ownerId)
  if ('parentId' in body) {
    if (body.parentId === null || body.parentId === '') {
      values.parentId = null
    } else if (typeof body.parentId === 'string') {
      const parent = await requireGoal(userId, teamId, body.parentId).catch(() => {
        throw createError({ statusCode: 400, message: 'The parent goal is not in this workspace' })
      })
      // A goal cannot sit under itself or under one of its own sub-goals.
      for (let up: string | null = parent.id; up; up = (await db.select({ parentId: goals.parentId }).from(goals).where(eq(goals.id, up)))[0]?.parentId ?? null) {
        if (up === goalId) throw createError({ statusCode: 400, message: 'A goal cannot be under itself' })
      }
      values.parentId = parent.id
    } else {
      throw createError({ statusCode: 400, message: 'The parent is a goal id' })
    }
  }
  const projectIds = 'projectIds' in body ? await ownProjectIds(userId, teamId, parseIdList(body.projectIds, 'The projects')) : undefined
  return { values, projectIds }
}

export async function replaceGoalProjects(goalId: string, projectIds: string[]) {
  await db.delete(goalProjects).where(eq(goalProjects.goalId, goalId))
  if (projectIds.length) await db.insert(goalProjects).values(projectIds.map(projectId => ({ goalId, projectId })))
}
