import { db } from '../../db'
import { portfolios } from '../../db/schema'
import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { ownProjectIds, parseIdList, parseText, parseTitle } from '../../utils/portfolios'
import { replacePortfolioProjects, viewPortfolio } from '../../utils/portfolioViews'
import { genId } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const teamId = await getUserActiveTeamId(event)
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}

  const now = Date.now()
  const [row] = await db.insert(portfolios).values({
    id: genId(),
    userId,
    teamId,
    name: parseTitle(body.name, 'A name'),
    description: 'description' in body ? parseText(body.description, 'The description') : '',
    createdAt: now,
    updatedAt: now
  }).returning()
  if ('projectIds' in body) await replacePortfolioProjects(row!.id, await ownProjectIds(userId, teamId, parseIdList(body.projectIds, 'The projects')))
  await publishCollection(event, 'portfolios')
  setResponseStatus(event, 201)
  return viewPortfolio(row!)
})
