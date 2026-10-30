// Who may see a task's GitHub links and their fetched data. The same rule the task
// endpoints use for tasks and comments (see taskVisibilityFilter in auth-helpers):
// staff see everything, a customer contact sees only what is marked for customers.
// Every route, live event, agent tool and search over GitHub data asks this file,
// so the rule lives in one place. Pure, so it can be tested on its own.
import type { Audience } from './auth-helpers'
import type { GithubLink, ProjectGithubSettings, Visibility } from '../db/schema'

const VISIBLE_TO_CUSTOMERS: Visibility = 'customer'

/** Staff see every link; a customer contact sees only links marked for customers. */
export function canSeeGithubLink(viewer: Audience, link: Pick<GithubLink, 'visibility'>): boolean {
  if (viewer === 'staff') return true
  // Anything but an exact `customer` is hidden, so a bad value fails closed.
  return link.visibility === VISIBLE_TO_CUSTOMERS
}

/** The links of a task the viewer may see, in the order given. */
export function visibleGithubLinks<T extends Pick<GithubLink, 'visibility'>>(viewer: Audience, links: T[]): T[] {
  return links.filter(link => canSeeGithubLink(viewer, link))
}

/**
 * The visibility a new link takes: the one asked for, else the project's default,
 * else internal. A value that is neither is not trusted and falls through.
 */
export function effectiveVisibility(
  link: { visibility?: string | null },
  settings?: Pick<ProjectGithubSettings, 'defaultVisibility'> | null
): Visibility {
  if (isVisibility(link.visibility)) return link.visibility
  if (isVisibility(settings?.defaultVisibility)) return settings.defaultVisibility
  return 'internal'
}

function isVisibility(value: unknown): value is Visibility {
  return value === 'internal' || value === 'customer'
}
