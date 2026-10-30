import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { listGoals } from '../../utils/goals'

// The goals of the caller's workspace, newest change first.
export default defineEventHandler(async (event) => {
  return listGoals(event.context.session.user.id, await getUserActiveTeamId(event))
})
