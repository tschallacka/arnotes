import { sweepDueRules } from '../utils/dueRules'
import { inMaintenance } from '../utils/maintenance'

// The due-date check is a timer only: once on boot, then every 15 minutes. The rules
// live in utils/dueRules.ts so a script can run the same sweep.
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000

// DUE_RULES_INTERVAL_MS shortens it for tests. Ignored in production.
function intervalMs(): number {
  const override = Number(process.env.DUE_RULES_INTERVAL_MS)
  if (process.env.NODE_ENV !== 'production' && Number.isFinite(override) && override > 0) return override
  return DEFAULT_INTERVAL_MS
}

export default defineNitroPlugin(() => {
  // A slow sweep is not started again by the next tick.
  let inFlight = false
  const run = async () => {
    // Rules write to the database, which a deploy may be changing under us.
    if (inFlight || inMaintenance()) return
    inFlight = true
    try {
      const fired = await sweepDueRules()
      if (fired) console.log(`[rules] due-date check fired for ${fired} overdue task(s)`)
    } catch (error) {
      // A failed check is retried on the next tick; the tasks are still overdue then.
      console.error('[rules] due-date check failed', error)
    } finally {
      inFlight = false
    }
  }

  // Once on boot, so a restart catches up at once, then on the interval.
  void run()

  const timer = setInterval(run, intervalMs())
  // The interval must not be what keeps the process alive on shutdown.
  timer.unref?.()
})
