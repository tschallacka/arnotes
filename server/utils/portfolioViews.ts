// Portfolios as the API returns them: the name, and each project read down to a
// health and a percentage, with a roll-up of the whole set.
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { portfolioProjects, portfolios } from '../db/schema'
import type { Portfolio } from '../db/schema'
import { summariseProjects, workspaceFilter } from './portfolios'
import type { ProjectSummary } from './portfolios'

export interface PortfolioView {
  id: string
  name: string
  description: string
  projects: ProjectSummary[]
  /** How many of its projects sit in each health, `unset` for those with none. */
  health: Record<'on_track' | 'at_risk' | 'off_track' | 'unset', number>
  /** The average completion of its projects, 0-100. */
  percent: number
  createdAt: number
  updatedAt: number
}

async function viewsOf(rows: Portfolio[]): Promise<PortfolioView[]> {
  if (!rows.length) return []
  const links = await db.select().from(portfolioProjects).where(inArray(portfolioProjects.portfolioId, rows.map(row => row.id)))
  const summaries = new Map((await summariseProjects([...new Set(links.map(link => link.projectId))])).map(summary => [summary.id, summary]))

  return rows.map((row) => {
    const projects = links.filter(link => link.portfolioId === row.id)
      .map(link => summaries.get(link.projectId))
      .filter((summary): summary is ProjectSummary => Boolean(summary))
      .sort((a, b) => a.name.localeCompare(b.name))
    const health = { on_track: 0, at_risk: 0, off_track: 0, unset: 0 }
    for (const project of projects) health[(project.status as keyof typeof health) in health ? (project.status as keyof typeof health) : 'unset']++
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      projects,
      health,
      percent: projects.length ? Math.round(projects.reduce((sum, project) => sum + project.percent, 0) / projects.length) : 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  })
}

export async function listPortfolios(userId: string, teamId: string | null): Promise<PortfolioView[]> {
  return viewsOf(await db.select().from(portfolios).where(workspaceFilter(portfolios, userId, teamId)).orderBy(desc(portfolios.updatedAt)))
}

/** One portfolio of the caller's workspace, or 404. */
export async function requirePortfolio(userId: string, teamId: string | null, id: string): Promise<Portfolio> {
  const [row] = await db.select().from(portfolios).where(eq(portfolios.id, id))
  if (!row || row.teamId !== teamId || (!teamId && row.userId !== userId)) throw createError({ statusCode: 404, message: 'Portfolio not found' })
  return row
}

export async function viewPortfolio(row: Portfolio): Promise<PortfolioView> {
  return (await viewsOf([row]))[0]!
}

export async function replacePortfolioProjects(portfolioId: string, projectIds: string[]) {
  await db.delete(portfolioProjects).where(eq(portfolioProjects.portfolioId, portfolioId))
  if (projectIds.length) await db.insert(portfolioProjects).values(projectIds.map(projectId => ({ portfolioId, projectId })))
}
