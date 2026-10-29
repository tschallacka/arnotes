import { db } from '../../../db'
import { projectMessages } from '../../../db/schema'
import { genId } from '../../../utils/projects'
import { publishResource, routeStaffProject } from '../../../utils/projectResources'
import { parseMessageBody, parseMessageTitle, requireReplyTarget } from '../../../utils/messages'

// Posts a message, or a reply to one when `parentId` is given. A reply has no
// subject of its own.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const body = await readBody<{ title?: unknown, body?: unknown, parentId?: unknown }>(event)

  const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null
  if (parentId) await requireReplyTarget(project.id, parentId)

  const user = event.context.session.user
  const [created] = await db.insert(projectMessages).values({
    id: genId(),
    projectId: project.id,
    userId: user.id,
    parentId,
    title: parentId ? '' : parseMessageTitle(body.title),
    body: parseMessageBody(body.body),
    createdAt: Date.now()
  }).returning()

  await publishResource(event, project.id, 'messages')

  return {
    id: created!.id,
    parentId: created!.parentId,
    title: created!.title,
    body: created!.body,
    createdAt: created!.createdAt,
    author: { id: user.id, name: user.name, image: user.image ?? null }
  }
})
