// Agent tools for a project's status updates: read the health history, and post
// a new entry, which also sets the project's current status.
import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { projects, projectStatusUpdates, user } from '../db/schema'
import { findBoard, touchBoard } from './mcpBoardTools'
import { McpToolError, asToolError, newId, optionalLimit, optionalString, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'
import { PROJECT_STATUSES, parseProjectStatus } from './taskFields'

const MAX_BODY = 5000

export const MCP_STATUS_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_status_updates',
    title: 'Read a board\'s status updates',
    description: 'Read the history of a board\'s status updates, newest first: who said it, the status at the time (on_track, at_risk, off_track) and what they wrote. Use it to see how a project has been going before posting a new one.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: 'Board id, board name, or a link to the board.' },
        limit: { type: 'number', description: 'Maximum updates to return (default 10, max 100).' }
      },
      required: ['board']
    },
    async handler(args, context) {
      const board = await findBoard(requireString(args, 'board'), context)
      const limit = optionalLimit(args, 'limit', 10, 100)

      const rows = await db
        .select({
          status: projectStatusUpdates.status,
          body: projectStatusUpdates.body,
          createdAt: projectStatusUpdates.createdAt,
          authorName: user.name
        })
        .from(projectStatusUpdates)
        .leftJoin(user, eq(user.id, projectStatusUpdates.userId))
        .where(eq(projectStatusUpdates.projectId, board.id))
        .orderBy(desc(projectStatusUpdates.createdAt))
        .limit(limit)

      return {
        board: { id: board.id, name: board.name },
        currentStatus: board.status ?? null,
        updates: rows.map(row => ({
          status: row.status,
          body: row.body,
          author: row.authorName ?? 'Unknown',
          at: new Date(row.createdAt).toISOString()
        }))
      }
    }
  },
  {
    name: 'post_status_update',
    title: 'Post a status update',
    description: `Post a status update on a board. It sets the board's status to one of ${PROJECT_STATUSES.join(', ')} and records what you wrote beside it, so the team can see how the project got there. Read the history with list_status_updates first and write what changed since the last update.`,
    scope: 'boards:write',
    readOnly: false,
    resource: 'status-updates',
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: 'Board id, board name, or a link to the board.' },
        status: { type: 'string', description: `The project's health: ${PROJECT_STATUSES.join(', ')}.` },
        body: { type: 'string', description: 'What changed and why, in a few sentences.' }
      },
      required: ['board', 'status']
    },
    async handler(args, context) {
      const board = await findBoard(requireString(args, 'board'), context)
      const status = asToolError(() => parseProjectStatus(requireString(args, 'status')))
      if (!status) throw new McpToolError('"status" is required.')
      const body = (optionalString(args, 'body') ?? '').trim().slice(0, MAX_BODY)

      const [created] = await db.insert(projectStatusUpdates).values({
        id: newId(),
        projectId: board.id,
        userId: context.userId,
        status,
        body,
        createdAt: Date.now()
      }).returning()

      await db.update(projects).set({ status }).where(eq(projects.id, board.id))
      await touchBoard(board.id)

      return {
        posted: true,
        board: { id: board.id, name: board.name },
        update: { id: created!.id, status, body, at: new Date(created!.createdAt).toISOString() }
      }
    }
  }
]
