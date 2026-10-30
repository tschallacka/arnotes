// The one-line GitHub badges a board card shows: state and number for each linked
// item. Built from the cache only, so the board never asks GitHub; the task panel's
// refresh is where GitHub is asked. Two queries for the whole board (the links, then
// their cache rows), however many tasks it holds. The cache keys below mirror the ones
// githubSync writes, and a row is read only for its body, so no status, etag or token
// leaves here.
import { and, eq, inArray, like, or } from 'drizzle-orm'
import { db } from '../db'
import { githubCache, githubLinks } from '../db/schema'
import type { GithubLink } from '../db/schema'
import type { Audience } from './auth-helpers'
import { visibleGithubLinks } from './githubAudience'

export type BadgeChecks = 'passing' | 'failing' | 'running' | 'none'

export interface GithubBadge {
  kind: GithubLink['kind']
  /** open, closed, merged or draft for a PR; open or closed for an issue; the run's conclusion or status; `N ahead` for a branch. `not fetched` until the panel has looked. */
  state: string
  /** The issue or PR number, the run id, or the branch name, as text. */
  ref: string
  title: string | null
  /** A PR's checks. Null for other kinds, and for a PR whose checks are not cached yet. */
  checks: BadgeChecks | null
}

// The parts of the cached GitHub answers a badge reads.
interface CachedIssue { title: string, state: string }
interface CachedPull { title: string, state: string, merged?: boolean, draft?: boolean, head: { sha: string } }
interface CachedChecks { check_runs: { status: string, conclusion: string | null }[] }
interface CachedRuns { workflow_runs: { id: number, name?: string | null, status?: string | null, conclusion?: string | null }[] }
interface CachedCompare { ahead_by: number }

const PASSING = new Set(['success', 'neutral', 'skipped'])
const NOT_FETCHED = 'not fetched'

/** The cache key prefix of one link: `owner/repo#ref`, lower-cased on the repo as githubSync does. */
function baseOf(link: Pick<GithubLink, 'owner' | 'repo' | 'ref'>): string {
  return `${link.owner.toLowerCase()}/${link.repo.toLowerCase()}#${link.ref}`
}

/** Escapes LIKE wildcards, so a repo name with `_` matches only itself. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, match => `\\${match}`)
}

function checksOf(body: CachedChecks): BadgeChecks {
  const runs = body.check_runs
  if (runs.length === 0) return 'none'
  if (runs.some(run => run.status === 'completed' && !PASSING.has(run.conclusion ?? ''))) return 'failing'
  if (runs.some(run => run.status !== 'completed')) return 'running'
  return 'passing'
}

function badgeFor(link: GithubLink, cache: Map<string, unknown>): GithubBadge {
  const base = baseOf(link)
  const badge = { kind: link.kind, ref: link.ref, checks: null } as const

  if (link.kind === 'issue') {
    const issue = cache.get(`${base}:issue`) as CachedIssue | undefined
    return { ...badge, state: issue?.state ?? NOT_FETCHED, title: issue?.title ?? null }
  }

  if (link.kind === 'pull') {
    const pull = cache.get(`${base}:pull`) as CachedPull | undefined
    if (!pull) return { ...badge, state: NOT_FETCHED, title: null }
    const state = pull.merged ? 'merged' : pull.draft ? 'draft' : pull.state
    const checks = cache.get(`${base}:checks:${pull.head.sha}`) as CachedChecks | undefined
    return { ...badge, state, title: pull.title, checks: checks ? checksOf(checks) : null }
  }

  if (link.kind === 'branch') {
    // The compare is keyed by the repo's default branch, which is not stored on the link.
    const prefix = `${base}:compare:`
    const key = [...cache.keys()].find(k => k.startsWith(prefix))
    const compare = key ? cache.get(key) as CachedCompare : undefined
    return { ...badge, state: compare ? `${compare.ahead_by} ahead` : NOT_FETCHED, title: link.ref }
  }

  // workflow_run: the cached runs list holds the run; the stored ref is its id.
  const runs = cache.get(`${base}:runs`) as CachedRuns | undefined
  const run = runs?.workflow_runs.find(r => String(r.id) === link.ref)
  if (!run) return { ...badge, state: NOT_FETCHED, title: null }
  return { ...badge, state: run.conclusion ?? run.status ?? NOT_FETCHED, title: run.name ?? null }
}

/**
 * The badges of the given tasks' links, keyed by task id. A task with no visible
 * link has no entry. `taskIds` are the tasks already filtered for the caller.
 */
export async function githubBadgesForBoard(
  projectId: string,
  taskIds: string[],
  audience: Audience
): Promise<Record<string, GithubBadge[]>> {
  if (taskIds.length === 0) return {}
  const rows = await db.select().from(githubLinks)
    .where(and(eq(githubLinks.projectId, projectId), inArray(githubLinks.taskId, taskIds)))
  const links = visibleGithubLinks(audience, rows)
  if (links.length === 0) return {}

  // One cache query for every link: exact keys, plus prefixes for the keys that
  // depend on data inside another answer (a PR's checks, a branch's compare).
  const exact: string[] = []
  const prefixes: string[] = []
  for (const link of links) {
    const base = baseOf(link)
    if (link.kind === 'issue') exact.push(`${base}:issue`)
    if (link.kind === 'pull') {
      exact.push(`${base}:pull`)
      prefixes.push(`${base}:checks:`)
    }
    if (link.kind === 'branch') prefixes.push(`${base}:compare:`)
    if (link.kind === 'workflow_run') exact.push(`${base}:runs`)
  }
  const conditions = [
    ...(exact.length ? [inArray(githubCache.key, exact)] : []),
    ...prefixes.map(prefix => like(githubCache.key, `${escapeLike(prefix)}%`))
  ]
  const cached = await db.select({ key: githubCache.key, body: githubCache.body }).from(githubCache)
    .where(or(...conditions))

  const cache = new Map<string, unknown>()
  for (const row of cached) if (row.body != null) cache.set(row.key, row.body)

  const out: Record<string, GithubBadge[]> = {}
  for (const link of links) {
    const list = out[link.taskId] ?? []
    list.push(badgeFor(link, cache))
    out[link.taskId] = list
  }
  return out
}
