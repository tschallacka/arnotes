import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { portfolios } from '../../db/schema'
import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { ownProjectIds, parseIdList, parseText, parseTitle } from '../../utils/portfolios'
import { replacePortfolioProjects, requirePortfolio, viewPortfolio } from '../../utils/portfolioViews'

// Changes the fields the request carries; `projectIds` replaces the set of projects.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const teamId = await getUserActiveTeamId(event)
  const portfolio = await requirePortfolio(userId, teamId, getRouterParam(event, 'id')!)
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}

  const values: Partial<typeof portfolios.$inferInsert> = {}
  if ('name' in body) values.name = parseTitle(body.name, 'A name')
  if ('description' in body) values.description = parseText(body.description, 'The description')
  const projectIds = 'projectIds' in body ? await ownProjectIds(userId, teamId, parseIdList(body.projectIds, 'The projects')) : undefined

  const [row] = await db.update(portfolios).set({ ...values, updatedAt: Date.now() }).where(eq(portfolios.id, portfolio.id)).returning()
  if (projectIds) await replacePortfolioProjects(portfolio.id, projectIds)
  return viewPortfolio(row!)
})
