import { db } from '../../../db'
import { user } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireInstanceAdmin } from '../../../utils/instanceAdmin'

// Grants or withdraws the right to own an organisation. Withdrawing it leaves
// organisations the user already owns in place; it only stops new ones.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ canCreateOrganizations?: boolean }>(event)
  if (typeof body.canCreateOrganizations !== 'boolean') {
    throw createError({ statusCode: 400, message: 'canCreateOrganizations must be true or false' })
  }

  const [updated] = await db
    .update(user)
    .set({ canCreateOrganizations: body.canCreateOrganizations, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning({ id: user.id, canCreateOrganizations: user.canCreateOrganizations })
  if (!updated) throw createError({ statusCode: 404, message: 'User not found' })
  return updated
})
