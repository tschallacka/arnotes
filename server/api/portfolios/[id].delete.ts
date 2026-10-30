import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { portfolios } from '../../db/schema'
import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { requirePortfolio } from '../../utils/portfolioViews'

// Removing a portfolio removes the grouping only; its projects are untouched.
export default defineEventHandler(async (event) => {
  const portfolio = await requirePortfolio(event.context.session.user.id, await getUserActiveTeamId(event), getRouterParam(event, 'id')!)
  await db.delete(portfolios).where(eq(portfolios.id, portfolio.id))
  return { ok: true }
})
