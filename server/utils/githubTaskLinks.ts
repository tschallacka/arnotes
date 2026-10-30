// The GitHub links of one task: create, remove and read them. This is the one place
// where a link is written, for the agent tools and for the HTTP routes alike. Every
// function takes the viewer's audience and returns plain data, or a typed refusal with
// a message fit to show. The audience rule runs before anything is fetched, so a
// viewer who may not see a link never causes a call to GitHub for it, and only the
// shape syncLink returns leaves here, never a cache row.
import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { githubLinks, projectGithubSettings } from '../db/schema'
import type { GithubLink, Project, ProjectTask, Visibility } from '../db/schema'
import type { Audience } from './auth-helpers'
import { canSeeGithubLink, effectiveVisibility, visibleGithubLinks } from './githubAudience'
import { ownerAllowed } from './githubAllow'
import { isGithubRefError, parseGithubRef } from './githubRef'
import { syncLink } from './githubSync'
import type { SyncResult } from './githubSync'

export type TaskGithubLink = Pick<GithubLink, 'id' | 'kind' | 'owner' | 'repo' | 'ref' | 'url' | 'visibility'>
  & SyncResult

/** Why a write was refused. `message` is plain words, safe to show the person. */
export interface GithubLinkRefusal {
  ok: false
  reason: 'not_staff' | 'invalid_reference' | 'bad_visibility' | 'owner_not_allowed' | 'already_linked' | 'not_linked'
  message: string
}

const UNAVAILABLE = 'GitHub could not be reached, try again in a moment'
const NOT_STAFF = 'Linking and unlinking GitHub items is for the team; a customer contact can only read the links marked for customers'

/** Syncs one stored link and shapes it for the caller. A stored link that cannot be read is reported, not thrown. */
async function view(link: Pick<GithubLink, 'id' | 'kind' | 'owner' | 'repo' | 'ref' | 'url' | 'visibility'>, force: boolean): Promise<TaskGithubLink> {
  const base = { id: link.id, kind: link.kind, owner: link.owner, repo: link.repo, ref: link.ref, url: link.url, visibility: link.visibility }
  try {
    return { ...base, ...(await syncLink(link, { force })) }
  } catch {
    return { ...base, data: null, error: 'unavailable', message: UNAVAILABLE, fetchedAt: null, nextRetryAt: null }
  }
}

/**
 * Reads the links of a task the viewer may see, each with what GitHub says about it
 * now. `refresh` asks GitHub instead of the cache (rate limits still apply).
 */
export async function readTaskGithubLinks(input: {
  taskId: string
  audience: Audience
  refresh?: boolean
}): Promise<{ ok: true, links: TaskGithubLink[] }> {
  const rows = await db.select().from(githubLinks).where(eq(githubLinks.taskId, input.taskId)).orderBy(asc(githubLinks.createdAt))
  const links: TaskGithubLink[] = []
  // Filtered first: an internal link never reaches syncLink for a customer.
  for (const link of visibleGithubLinks(input.audience, rows)) links.push(await view(link, input.refresh === true))
  return { ok: true, links }
}

/**
 * Links a GitHub item to the task. `input` is what a person would paste; the project's
 * default repo applies to `#123`. Staff only. The owner allowlist is checked here, before
 * anything is stored, so no route or tool can store a refused owner.
 */
export async function createTaskGithubLink(input: {
  task: ProjectTask
  board: Project
  audience: Audience
  input: string
  visibility?: string
  userId: string
}): Promise<{ ok: true, link: TaskGithubLink } | GithubLinkRefusal> {
  if (input.audience !== 'staff') return { ok: false, reason: 'not_staff', message: NOT_STAFF }

  const [settings] = await db.select().from(projectGithubSettings).where(eq(projectGithubSettings.projectId, input.board.id)).limit(1)
  const parsed = parseGithubRef(input.input, settings?.defaultRepo)
  if (isGithubRefError(parsed)) return { ok: false, reason: 'invalid_reference', message: parsed.message }

  const allowed = ownerAllowed(parsed.owner)
  if (!allowed.ok) return { ok: false, reason: 'owner_not_allowed', message: allowed.message }

  if (input.visibility !== undefined && input.visibility !== 'internal' && input.visibility !== 'customer') {
    return { ok: false, reason: 'bad_visibility', message: '"visibility" must be "internal" or "customer".' }
  }
  const visibility: Visibility = effectiveVisibility({ visibility: input.visibility }, settings)
  // The parser says `run`; the stored kind is `workflow_run` (PM decision, GH10).
  const kind = parsed.kind === 'run' ? 'workflow_run' : parsed.kind

  const [existing] = await db.select({ id: githubLinks.id }).from(githubLinks).where(and(
    eq(githubLinks.taskId, input.task.id),
    eq(githubLinks.kind, kind),
    eq(githubLinks.owner, parsed.owner),
    eq(githubLinks.repo, parsed.repo),
    eq(githubLinks.ref, parsed.ref)
  )).limit(1)
  if (existing) return { ok: false, reason: 'already_linked', message: 'This task already links that GitHub item.' }

  const [row] = await db.insert(githubLinks).values({
    id: randomUUID(),
    projectId: input.board.id,
    taskId: input.task.id,
    kind,
    owner: parsed.owner,
    repo: parsed.repo,
    ref: parsed.ref,
    url: parsed.url,
    visibility,
    createdBy: input.userId,
    createdAt: Date.now()
  }).returning()
  return { ok: true, link: await view(row!, false) }
}

/** Removes one link from the task. A link the viewer may not see is reported as not linked, as the app does. */
export async function deleteTaskGithubLink(input: {
  task: ProjectTask
  linkId: string
  audience: Audience
}): Promise<{ ok: true, linkId: string } | GithubLinkRefusal> {
  if (input.audience !== 'staff') return { ok: false, reason: 'not_staff', message: NOT_STAFF }
  const missing: GithubLinkRefusal = { ok: false, reason: 'not_linked', message: `No GitHub link "${input.linkId}" on this task.` }
  const [link] = await db.select().from(githubLinks).where(and(eq(githubLinks.id, input.linkId), eq(githubLinks.taskId, input.task.id))).limit(1)
  if (!link || !canSeeGithubLink(input.audience, link)) return missing
  await db.delete(githubLinks).where(eq(githubLinks.id, link.id))
  return { ok: true, linkId: link.id }
}
