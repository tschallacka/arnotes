// The owner allowlist for GitHub links: GITHUB_ALLOWED_OWNERS, comma separated.
// Unset or empty means any owner may be linked. The token can read any repo it
// can reach, so this list is the gate. Read at call time, so a changed env is
// picked up without a restart. No imports, so it tests on its own.

const OWNER = /^[A-Za-z0-9_.-]{1,100}$/

let warnedAboutBadEntry = false

/** The allowed owners, lower-cased, or an empty list when none are set. */
export function allowedOwners(): string[] {
  const raw = process.env.GITHUB_ALLOWED_OWNERS ?? ''
  const owners: string[] = []
  let bad = 0
  for (const part of raw.split(',')) {
    const name = part.trim().toLowerCase()
    if (!name) continue
    // A bad entry is dropped. The warning names no entry and no list.
    if (OWNER.test(name) && name !== '.' && name !== '..') owners.push(name)
    else bad++
  }
  if (bad > 0 && !warnedAboutBadEntry) {
    warnedAboutBadEntry = true
    console.warn(`GITHUB_ALLOWED_OWNERS: ignored ${bad} entr${bad === 1 ? 'y' : 'ies'} with characters GitHub does not use`)
  }
  return owners
}

/**
 * Whether a GitHub owner may be linked or synced. Names are compared whole and
 * case-insensitively, so `acme` never matches `acme-evil`.
 */
export function ownerAllowed(owner: string): { ok: true } | { ok: false, message: string } {
  // Unset or blank means no gate. Set to text with no usable entry must fail
  // closed, so a typo like "*" never opens the server to every owner.
  if ((process.env.GITHUB_ALLOWED_OWNERS ?? '').trim() === '') return { ok: true }
  const allowed = allowedOwners()
  if (allowed.length === 0) {
    return { ok: false, message: 'The GitHub owner allowlist (GITHUB_ALLOWED_OWNERS) is set but has no usable entry, so no owner can be linked' }
  }
  if (allowed.includes(owner.trim().toLowerCase())) return { ok: true }
  return {
    ok: false,
    message: `GitHub owner "${owner}" is not on this server's allowlist (GITHUB_ALLOWED_OWNERS)`
  }
}
