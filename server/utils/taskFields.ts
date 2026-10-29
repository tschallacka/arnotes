// Field checks shared by the task endpoints and the MCP board tools, so a value
// an agent sends is held to the same rule as one typed in the panel.

export const PROJECT_STATUSES = ['on_track', 'at_risk', 'off_track'] as const
export type ProjectStatus = typeof PROJECT_STATUSES[number]

/** One of the project health values, or null to clear it. Throws 400 otherwise. */
export function parseProjectStatus(value: unknown): ProjectStatus | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !(PROJECT_STATUSES as readonly string[]).includes(value)) {
    throw createError({ statusCode: 400, message: 'Unknown status' })
  }
  return value as ProjectStatus
}

/** The most a project description may hold. */
export const MAX_PROJECT_DESCRIPTION = 20000

/** A real calendar day as `YYYY-MM-DD`, or null to clear it. Throws 400 otherwise. */
export function parseDueOn(value: unknown): string | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError({ statusCode: 400, message: 'Due dates are written YYYY-MM-DD' })
  }
  // Round-tripping through a Date rejects the 31st of a 30-day month.
  const day = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) {
    throw createError({ statusCode: 400, message: 'That due date does not exist' })
  }
  // A date field half-typed, such as year 0202, is a real date but never a
  // deadline anyone meant.
  const year = Number(value.slice(0, 4))
  if (year < 2000 || year > 2999) {
    throw createError({ statusCode: 400, message: 'Due dates fall between 2000 and 2999' })
  }
  return value
}
