// What every endpoint that hangs a collection off a project has in common: find
// the project the caller may see, hold staff-only collections to staff, and
// tell the project's other viewers something changed. Status updates, messages,
// time entries and the like each add only their own table and rules.
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { projects, user } from '../db/schema'
import { requireProject, requireStaff } from './projects'
import { publishFromEvent } from './realtime'
import type { ProjectResource } from './realtime'

/** The project named by the route's `id`, for a collection anyone on the project may read. */
export function routeProject(event: H3Event) {
  return requireProject(event, getRouterParam(event, 'id')!)
}

/** The same, for a collection only the project team may read or write. */
export async function routeStaffProject(event: H3Event) {
  const project = await routeProject(event)
  requireStaff(project)
  return project
}

/** The columns of an author, for joining a collection's rows to who wrote them. */
export const authorColumns = {
  authorId: user.id,
  authorName: user.name,
  authorImage: user.image
}

export function authorOf(row: { authorId: string | null, authorName: string | null, authorImage: string | null }) {
  return { id: row.authorId ?? '', name: row.authorName ?? 'Unknown', image: row.authorImage }
}

/** Bumps the project's timestamp and tells everyone looking at it to refetch. */
export async function touchProject(event: H3Event, projectId: string, kind: 'projects' | 'board' = 'projects') {
  await db.update(projects).set({ updatedAt: Date.now() }).where(eq(projects.id, projectId))
  await publishFromEvent(event, kind === 'board' ? { type: 'board', projectId } : { type: 'projects', projectId })
}

/**
 * Tells everyone on the team who has a project open that one of its staff-only
 * collections changed, so the view showing it refetches. Customers' contacts and
 * shared-link readers are not told: the event only reaches the workspace.
 */
export async function publishResource(event: H3Event, projectId: string, resource: ProjectResource) {
  await publishFromEvent(event, { type: 'resource', projectId, resource })
}
