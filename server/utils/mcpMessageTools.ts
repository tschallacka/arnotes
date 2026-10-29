// Agent tools for a board's conversations: read the messages, and post one or a
// reply.
import { asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { projectMessages, user } from '../db/schema'
import { findBoard } from './mcpBoardTools'
import { McpToolError, asToolError, asToolErrorAsync, newId, optionalLimit, optionalString, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'
import { parseMessageBody, parseMessageTitle, requireReplyTarget } from './messages'

export const MCP_MESSAGE_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_messages',
    title: 'Read a board\'s messages',
    description: 'Read the conversations on a board, newest first, each with its replies in order. Use it to see what the team has been discussing before posting.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: 'Board id, board name, or a link to the board.' },
        limit: { type: 'number', description: 'Maximum conversations to return (default 10, max 50).' }
      },
      required: ['board']
    },
    async handler(args, context) {
      const board = await findBoard(requireString(args, 'board'), context)
      const limit = optionalLimit(args, 'limit', 10, 50)

      const rows = await db
        .select({
          id: projectMessages.id,
          parentId: projectMessages.parentId,
          title: projectMessages.title,
          body: projectMessages.body,
          createdAt: projectMessages.createdAt,
          authorName: user.name
        })
        .from(projectMessages)
        .leftJoin(user, eq(user.id, projectMessages.userId))
        .where(eq(projectMessages.projectId, board.id))
        .orderBy(asc(projectMessages.createdAt))

      const shape = (row: typeof rows[number]) => ({
        id: row.id,
        author: row.authorName ?? 'Unknown',
        at: new Date(row.createdAt).toISOString(),
        ...(row.title ? { title: row.title } : {}),
        body: row.body
      })
      const repliesTo = (id: string) => rows.filter(row => row.parentId === id).map(shape)
      const threads = rows.filter(row => !row.parentId).reverse()

      return {
        board: { id: board.id, name: board.name },
        total: threads.length,
        messages: threads.slice(0, limit).map(row => ({ ...shape(row), replies: repliesTo(row.id) }))
      }
    }
  },
  {
    name: 'post_message',
    title: 'Post a message',
    description: 'Post a message on a board, or a reply to an existing one with "replyTo". A new message may have a short subject; a reply does not. Read the conversation with list_messages first.',
    scope: 'boards:write',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: 'Board id, board name, or a link to the board.' },
        body: { type: 'string', description: 'The message.' },
        title: { type: 'string', description: 'A short subject for a new message.' },
        replyTo: { type: 'string', description: 'The id of the message to reply to. It must be a top-level message, not a reply.' }
      },
      required: ['board', 'body']
    },
    async handler(args, context) {
      const board = await findBoard(requireString(args, 'board'), context)
      const body = asToolError(() => parseMessageBody(args.body))
      const replyTo = optionalString(args, 'replyTo')
      const title = optionalString(args, 'title')
      if (replyTo && title) throw new McpToolError('A reply has no subject; leave "title" out.')
      if (replyTo) await asToolErrorAsync(() => requireReplyTarget(board.id, replyTo))

      const [created] = await db.insert(projectMessages).values({
        id: newId(),
        projectId: board.id,
        userId: context.userId,
        parentId: replyTo ?? null,
        title: replyTo ? '' : asToolError(() => parseMessageTitle(title)),
        body,
        createdAt: Date.now()
      }).returning()

      return {
        posted: true,
        board: { id: board.id, name: board.name },
        message: { id: created!.id, ...(replyTo ? { replyTo } : {}), ...(created!.title ? { title: created!.title } : {}), body: created!.body }
      }
    }
  }
]
