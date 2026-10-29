// How long something took, written the way people write it and stored as whole
// minutes. Shared so the time box in the task panel, the API and the agent tools
// read "1h 30m" the same way.

export const MAX_ENTRY_MINUTES = 24 * 60

/**
 * Minutes from what someone typed: `1h 30m`, `1:30`, `90m`, `45min`, or a bare
 * number, which counts as hours (`1.5` is an hour and a half, `2` is two hours).
 * Null for anything else, and for a duration under a minute or over a day.
 */
export function parseDuration(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? clamp(Math.round(raw)) : null
  if (typeof raw !== 'string') return null
  const text = raw.trim().toLowerCase().replace(',', '.')
  if (!text) return null

  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text)
  if (clock) return clamp(Number(clock[1]) * 60 + Number(clock[2]))

  if (/^\d+(?:\.\d+)?$/.test(text)) return clamp(Math.round(Number(text) * 60))

  // Any mix of hours and minutes, in either order of writing: "1h30m", "1 h 30 min".
  const unit = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/.exec(text)
  if (unit && (unit[1] || unit[2])) return clamp(Math.round(Number(unit[1] ?? 0) * 60 + Number(unit[2] ?? 0)))
  return null
}

function clamp(minutes: number): number | null {
  return minutes >= 1 && minutes <= MAX_ENTRY_MINUTES ? minutes : null
}

/** `1h 30m`, `2h`, `45m`: the short form for a number of minutes. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/** `01:05:09`-style clock for a running timer, from elapsed milliseconds. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}
