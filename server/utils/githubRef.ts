// GitHub references a person pastes: a github.com link, `owner/repo#123`, or `#123`
// when the project has a default repo. Pure, with no imports, so it can be tested
// on its own. Anything that is not a plain github.com link or a strict owner/repo
// is refused here, before any api.github.com address is built from it.

export type GithubRefKind = 'issue' | 'pull' | 'branch' | 'run'

export interface GithubRef {
  kind: GithubRefKind
  owner: string
  repo: string
  /** The issue or pull request number, the run id, or the branch name. */
  ref: string
  /** The canonical github.com page for the reference. */
  url: string
}

export type GithubRefErrorReason
  = | 'empty'
    | 'not-github'
    | 'bad-repo'
    | 'bad-number'
    | 'bad-branch'
    | 'unknown-shape'
    | 'no-default-repo'

export interface GithubRefError {
  error: true
  reason: GithubRefErrorReason
  /** Plain words, safe to show the person. */
  message: string
}

// GitHub owners and repos use these characters. `..` and `.` are refused below
// because they would climb out of the path they are put in.
const NAME = /^[A-Za-z0-9_.-]{1,100}$/
const NUMBER = /^[1-9]\d{0,9}$/
const BRANCH = /^[A-Za-z0-9_./-]{1,250}$/
const SHORT = /^([^\s/#]+)\/([^\s/#]+)#(\d+)$/
const SHORT_REPO = /^([^\s/#]+)\/([^\s/#]+)$/

export function isGithubRefError(value: GithubRef | GithubRefError): value is GithubRefError {
  return 'error' in value
}

function fail(reason: GithubRefErrorReason, message: string): GithubRefError {
  return { error: true, reason, message }
}

function checkRepo(owner: string, repo: string): GithubRefError | null {
  const valid = NAME.test(owner) && NAME.test(repo)
    && owner !== '.' && owner !== '..' && repo !== '.' && repo !== '..'
  return valid ? null : fail('bad-repo', 'Owner and repo use letters, digits, - _ and . only')
}

/** A branch name is a path of safe segments: no empty parts, no `..`, no escapes. */
function checkBranch(branch: string): GithubRefError | null {
  const valid = BRANCH.test(branch) && !branch.includes('..') && !branch.includes('//')
    && !branch.startsWith('/') && !branch.endsWith('/')
  return valid ? null : fail('bad-branch', `"${branch}" is not a branch name GitHub would accept`)
}

function checkNumber(value: string, what: string): GithubRefError | null {
  return NUMBER.test(value) ? null : fail('bad-number', `${what} must be a whole number`)
}

/**
 * Reads one reference. Returns the reference, or an error with a plain-words
 * message. `defaultRepo` is the project's `owner/repo`, used only for `#123`.
 */
export function parseGithubRef(input: unknown, defaultRepo?: string | null): GithubRef | GithubRefError {
  const text = typeof input === 'string' ? input.trim() : ''
  if (!text) return fail('empty', 'Paste a GitHub issue or pull request link, or owner/repo#123')

  if (text.startsWith('#')) {
    const number = text.slice(1)
    const repoText = (defaultRepo ?? '').trim()
    const repoMatch = SHORT_REPO.exec(repoText)
    if (!repoMatch) return fail('no-default-repo', 'This project has no default repo, so write owner/repo#123')
    const bad = checkRepo(repoMatch[1]!, repoMatch[2]!) ?? checkNumber(number, 'The issue number')
    if (bad) return bad
    return build('issue', repoMatch[1]!, repoMatch[2]!, number)
  }

  if (/^[a-z]+:\/\//i.test(text) || text.startsWith('//') || text.startsWith('github.com')) {
    return parseLink(text)
  }

  const match = SHORT.exec(text)
  if (!match) {
    return fail('unknown-shape', 'Paste a github.com link, owner/repo#123, or #123 when the project has a default repo')
  }
  const bad = checkRepo(match[1]!, match[2]!) ?? checkNumber(match[3]!, 'The issue number')
  if (bad) return bad
  return build('issue', match[1]!, match[2]!, match[3]!)
}

function parseLink(text: string): GithubRef | GithubRefError {
  // Only https://github.com is read. Refuse anything else before the URL parser
  // gets a chance to normalise it into something that looks fine.
  if (!/^https:\/\/github\.com\//.test(text)) {
    return fail('not-github', 'Only links to https://github.com are read')
  }
  if (text.includes('..') || text.includes('\\') || text.includes('%')) {
    return fail('unknown-shape', 'That link has parts GitHub links do not use')
  }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return fail('unknown-shape', 'That link is not a valid URL')
  }
  if (url.username || url.password || url.port || url.hostname !== 'github.com') {
    return fail('not-github', 'Only links to https://github.com are read')
  }

  const path = url.pathname.replace(/\/$/, '')
  const parts = path.split('/').slice(1)
  const [owner, repo, kind, ...rest] = parts
  if (!owner || !repo || !kind) {
    return fail('unknown-shape', 'Link to an issue, pull request, branch or workflow run')
  }
  const bad = checkRepo(owner, repo)
  if (bad) return bad

  if (kind === 'issues' || kind === 'pull') {
    if (rest.length !== 1) return fail('unknown-shape', 'Link to an issue, pull request, branch or workflow run')
    const number = checkNumber(rest[0]!, kind === 'pull' ? 'The pull request number' : 'The issue number')
    if (number) return number
    return build(kind === 'pull' ? 'pull' : 'issue', owner, repo, rest[0]!)
  }

  if (kind === 'tree') {
    if (rest.length === 0) return fail('unknown-shape', 'Link to an issue, pull request, branch or workflow run')
    const branch = rest.join('/')
    const bad = checkBranch(branch)
    if (bad) return bad
    return build('branch', owner, repo, branch)
  }

  if (kind === 'actions' && rest.length === 2 && rest[0] === 'runs') {
    const number = checkNumber(rest[1]!, 'The workflow run id')
    if (number) return number
    return build('run', owner, repo, rest[1]!)
  }

  return fail('unknown-shape', 'Link to an issue, pull request, branch or workflow run')
}

function build(kind: GithubRefKind, owner: string, repo: string, ref: string): GithubRef {
  const base = `https://github.com/${owner}/${repo}`
  const paths: Record<GithubRefKind, string> = {
    issue: `issues/${ref}`,
    pull: `pull/${ref}`,
    branch: `tree/${ref}`,
    run: `actions/runs/${ref}`
  }
  return { kind, owner, repo, ref, url: `${base}/${paths[kind]}` }
}
