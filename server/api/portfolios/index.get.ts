import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { listPortfolios } from '../../utils/portfolioViews'

// The portfolios of the caller's workspace, each with its projects read down.
export default defineEventHandler(async (event) => {
  return listPortfolios(event.context.session.user.id, await getUserActiveTeamId(event))
})
