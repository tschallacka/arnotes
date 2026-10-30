// What changed on a linked pull request between two syncs with GitHub. Pure: no
// database and no network, so the rules engine and the tests can use it alone.
// A pull with no previous snapshot has no transitions, so importing a project
// does not fire rules.

export type PullEventKind = 'pr_merged' | 'pr_closed' | 'pr_checks_failed'

/** A pull as one sync saw it. `checks` is null when the checks were not read. */
export interface PullSnapshot {
  state: 'open' | 'closed'
  merged: boolean
  checks: 'passing' | 'failing' | 'running' | 'none' | null
}

/**
 * The events between the previous snapshot and the new one, or none when nothing
 * changed. Checks count only from a known state that was not failing, so a commit
 * that starts failing counts, and a pull that stays failing does not fire again.
 */
export function pullTransitions(before: PullSnapshot | null, after: PullSnapshot | null): PullEventKind[] {
  if (!before || !after) return []
  const events: PullEventKind[] = []
  if (before.state === 'open' && after.merged) events.push('pr_merged')
  else if (before.state === 'open' && after.state === 'closed') events.push('pr_closed')
  if (before.checks !== null && after.checks !== null && before.checks !== 'failing' && after.checks === 'failing') {
    events.push('pr_checks_failed')
  }
  return events
}
