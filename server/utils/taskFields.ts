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

export const MAX_DASHBOARD_WIDGETS = 30
// A built-in widget, or one drawn from a custom field: `field:<id>`.
const DASHBOARD_WIDGET_ID = /^(?:tiles|sections|completion|timeline|assignees|field:[A-Za-z0-9]{1,40})$/

/** The widgets a dashboard shows, in order, or null for the default set. Throws 400 otherwise. */
export function parseDashboardWidgets(value: unknown): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value) || value.length > MAX_DASHBOARD_WIDGETS) {
    throw createError({ statusCode: 400, message: 'Dashboard widgets are a short list of widget ids' })
  }
  const ids = value.map(id => typeof id === 'string' && DASHBOARD_WIDGET_ID.test(id) ? id : null)
  if (ids.includes(null)) throw createError({ statusCode: 400, message: 'Unknown dashboard widget' })
  return [...new Set(ids as string[])]
}

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
