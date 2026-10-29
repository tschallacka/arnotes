// The rules for a project message, shared by the endpoint and the MCP tools.
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { projectMessages } from '../db/schema'

export const MAX_MESSAGE_BODY = 10_000
export const MAX_MESSAGE_TITLE = 200

function bad(message: string): never {
  throw createError({ statusCode: 400, message })
}

export function parseMessageBody(raw: unknown): string {
  const body = typeof raw === 'string' ? raw.trim() : ''
  if (!body) bad('Write something to post')
  if (body.length > MAX_MESSAGE_BODY) bad(`Messages are limited to ${MAX_MESSAGE_BODY} characters`)
  return body
}

export function parseMessageTitle(raw: unknown): string {
  const title = typeof raw === 'string' ? raw.trim() : ''
  if (title.length > MAX_MESSAGE_TITLE) bad(`Subjects are limited to ${MAX_MESSAGE_TITLE} characters`)
  return title
}

/**
 * The message a reply answers, which must be a top-level message of the same
 * project: a conversation is one message and its replies, never a tree.
 */
export async function requireReplyTarget(projectId: string, parentId: string) {
  const [parent] = await db.select({ id: projectMessages.id }).from(projectMessages)
    .where(and(eq(projectMessages.id, parentId), eq(projectMessages.projectId, projectId), isNull(projectMessages.parentId)))
  if (!parent) bad('That message is not on this project, or is itself a reply')
  return parent
}
