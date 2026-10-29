import { currentTimer } from '../utils/timeTracking'

// The timer the signed-in person has running, if any.
export default defineEventHandler(async (event) => {
  return { timer: await currentTimer(event.context.session.user.id) }
})
