// Agent tools for goals and portfolios: read them, make them, change them. They
// belong to the key's workspace, as they do in the app, so a key only ever sees
// the goals its person sees there. Deleting is left to the app: a goal gone is
// not in a trash.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { goals, portfolios } from '../db/schema'
import { listGoals, requireGoal, viewGoal } from './goals'
import { readGoalPatch, replaceGoalProjects } from './goalWrites'
import { ownProjectIds, parseIdList, parseText, parseTitle } from './portfolios'
import { listPortfolios, replacePortfolioProjects, requirePortfolio, viewPortfolio } from './portfolioViews'
import { asToolErrorAsync, newId, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'

const GOAL_PROPERTIES = {
  title: { type: 'string', description: 'What the goal is.' },
  description: { type: 'string', description: 'Why it matters, in a few sentences.' },
  status: { type: 'string', description: 'on_track, at_risk, off_track, achieved or dropped. An empty string clears it.' },
  progress: { type: 'number', description: 'Typed-in progress, a whole number from 0 to 100. Ignored while progressFromProjects is on.' },
  progressFromProjects: { type: 'boolean', description: 'Read progress from the linked projects instead: the average of how much of each is done.' },
  dueOn: { type: 'string', description: 'Due date as YYYY-MM-DD. An empty string clears it.' },
  ownerId: { type: 'string', description: 'The id of a person in the workspace who owns the goal. An empty string clears it.' },
  parentId: { type: 'string', description: 'The id of a goal this one sits under. An empty string makes it a top-level goal.' },
  projectIds: { type: 'array', items: { type: 'string' }, description: 'Replaces the projects linked to the goal. Ids from list_boards; others are ignored.' }
}

export const MCP_GOAL_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_goals',
    title: 'Read the workspace\'s goals',
    description: 'The goals of the key\'s workspace: status, owner, due date, progress, the projects linked to each (with their health and how much is done) and which goal each sits under.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    async handler(_args, context) {
      const list = await listGoals(context.userId, context.teamId)
      return { total: list.length, goals: list }
    }
  },
  {
    name: 'create_goal',
    title: 'Create a goal',
    description: 'Create a goal in the key\'s workspace. Only the title is needed; the owner defaults to the key\'s person.',
    scope: 'boards:write',
    collection: 'goals',
    readOnly: false,
    inputSchema: { type: 'object', properties: GOAL_PROPERTIES, required: ['title'] },
    async handler(args, context) {
      requireString(args, 'title')
      return asToolErrorAsync(async () => {
        const { values, projectIds } = await readGoalPatch(context.userId, context.teamId, args, null)
        const now = Date.now()
        const [row] = await db.insert(goals).values({
          ownerId: context.userId,
          ...values,
          id: newId(),
          userId: context.userId,
          teamId: context.teamId,
          title: values.title!,
          createdAt: now,
          updatedAt: now
        }).returning()
        if (projectIds) await replaceGoalProjects(row!.id, projectIds)
        return viewGoal(row!)
      })
    }
  },
  {
    name: 'update_goal',
    title: 'Change a goal',
    description: 'Change the fields you pass on a goal; the rest stay. Passing projectIds replaces the linked projects.',
    scope: 'boards:write',
    collection: 'goals',
    readOnly: false,
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Goal id from list_goals.' }, ...GOAL_PROPERTIES }, required: ['id'] },
    async handler(args, context) {
      return asToolErrorAsync(async () => {
        const goal = await requireGoal(context.userId, context.teamId, requireString(args, 'id'))
        const { values, projectIds } = await readGoalPatch(context.userId, context.teamId, args, goal.id)
        const [row] = await db.update(goals).set({ ...values, updatedAt: Date.now() }).where(eq(goals.id, goal.id)).returning()
        if (projectIds) await replaceGoalProjects(goal.id, projectIds)
        return viewGoal(row!)
      })
    }
  },
  {
    name: 'list_portfolios',
    title: 'Read the workspace\'s portfolios',
    description: 'The portfolios of the key\'s workspace: each with its projects, their health and how much of each is done, and a roll-up of the whole set.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    async handler(_args, context) {
      const list = await listPortfolios(context.userId, context.teamId)
      return { total: list.length, portfolios: list }
    }
  },
  {
    name: 'create_portfolio',
    title: 'Create a portfolio',
    description: 'Create a portfolio, a named set of projects read side by side.',
    scope: 'boards:write',
    collection: 'portfolios',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The portfolio\'s name.' },
        description: { type: 'string', description: 'What the set is for.' },
        projectIds: { type: 'array', items: { type: 'string' }, description: 'Projects in it, ids from list_boards; others are ignored.' }
      },
      required: ['name']
    },
    async handler(args, context) {
      return asToolErrorAsync(async () => {
        const now = Date.now()
        const [row] = await db.insert(portfolios).values({
          id: newId(),
          userId: context.userId,
          teamId: context.teamId,
          name: parseTitle(args.name, 'A name'),
          description: 'description' in args ? parseText(args.description, 'The description') : '',
          createdAt: now,
          updatedAt: now
        }).returning()
        if ('projectIds' in args) await replacePortfolioProjects(row!.id, await ownProjectIds(context.userId, context.teamId, parseIdList(args.projectIds, 'The projects')))
        return viewPortfolio(row!)
      })
    }
  },
  {
    name: 'update_portfolio',
    title: 'Change a portfolio',
    description: 'Change the fields you pass on a portfolio; the rest stay. Passing projectIds replaces the set of projects.',
    scope: 'boards:write',
    collection: 'portfolios',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Portfolio id from list_portfolios.' },
        name: { type: 'string', description: 'A new name.' },
        description: { type: 'string', description: 'A new description.' },
        projectIds: { type: 'array', items: { type: 'string' }, description: 'The projects it holds from now on.' }
      },
      required: ['id']
    },
    async handler(args, context) {
      return asToolErrorAsync(async () => {
        const portfolio = await requirePortfolio(context.userId, context.teamId, requireString(args, 'id'))
        const values: Partial<typeof portfolios.$inferInsert> = {}
        if ('name' in args) values.name = parseTitle(args.name, 'A name')
        if ('description' in args) values.description = parseText(args.description, 'The description')
        const projectIds = 'projectIds' in args ? await ownProjectIds(context.userId, context.teamId, parseIdList(args.projectIds, 'The projects')) : undefined
        const [row] = await db.update(portfolios).set({ ...values, updatedAt: Date.now() }).where(eq(portfolios.id, portfolio.id)).returning()
        if (projectIds) await replacePortfolioProjects(portfolio.id, projectIds)
        return viewPortfolio(row!)
      })
    }
  }
]
