import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Maintenance mode is on while MAINTENANCE_MODE is a truthy word, or while the flag file
// exists. The file needs no restart: `touch maintenance.on` before a deploy, `rm` after.
const FLAG_FILE = process.env.MAINTENANCE_FILE?.trim() || 'maintenance.on'
const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

// A stat per request is cheap, but not worth doing more than once a second.
let checkedAt = 0
let fileOn = false

export function inMaintenance(now = Date.now()): boolean {
  if (TRUTHY.has((process.env.MAINTENANCE_MODE ?? '').trim().toLowerCase())) return true
  if (now - checkedAt >= 1000) {
    checkedAt = now
    fileOn = existsSync(resolve(FLAG_FILE))
  }
  return fileOn
}
