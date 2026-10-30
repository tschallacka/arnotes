// Agent tool for the thread under a task: write an update on it, as a person does
// in the app. The thread is also where an agent answers a question or reports
// back, so it is signed with the key the agent came in on.
import { db } from '../db'
import { taskComments, VISIBILITIES } from '../db/schema'
import type { Visibility } from '../db/schema'
import { audienceOf } from './mcpAccess'
import { findTask } from './mcpBoardTools'
import { McpToolError, newId, optionalString, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'
import { notificationExcerpt } from './notifications'
import { notifyComment } from './notifyEvents'

export const MCP_UPDATE_TOOLS: McpToolDefinition[] = [
  {
    name: 'post_task_update',
    title: 'Write an update on a task',
    description: 'Add an update to a task\'s thread: report progress, ask a question, answer one. The people on the task are told in their Inbox. Staff updates are internal unless you say "customer"; a customer contact\'s are always visible to the customer. Read the thread first with get_task.',
    scope: 'boards:write',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The task id.' },
        body: { type: 'string', description: 'The update, as inline Markdown.' },
        visibility: { type: 'string', description: '"internal" (default for staff) or "customer".' }
      },
      required: ['id', 'body']
    },
    async handler(args, context) {
      const { task, board } = await findTask(requireString(args, 'id'), context)
      const body = requireString(args, 'body').trim()
      if (!body) throw new McpToolError('The update is empty.')
      const asked = optionalString(args, 'visibility')
      if (asked !== undefined && !VISIBILITIES.includes(asked as Visibility)) {
        throw new McpToolError('Visibility is "internal" or "customer".')
      }
      const visibility: Visibility = audienceOf(context, board) === 'customer' ? 'customer' : ((asked as Visibility | undefined) ?? 'internal')

      const [comment] = await db.insert(taskComments).values({
        id: newId(),
        taskId: task.id,
        userId: context.userId,
        body,
        visibility,
        createdVia: 'mcp',
        apiKeyId: context.keyId,
        createdAt: Date.now()
      }).returning()

      await notifyComment(board, task, context.userId, body, visibility === 'internal')
      return {
        posted: true,
        // At the top level so the open browsers are told which board changed.
        board: { id: board.id, name: board.name },
        update: { id: comment!.id, visibility, excerpt: notificationExcerpt(body) }
      }
    }
  }
]
