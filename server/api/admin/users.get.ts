import { db } from '../../db'
import { user } from '../../db/schema'
import { asc } from 'drizzle-orm'
import { requireInstanceAdmin } from '../../utils/instanceAdmin'

// Every account on the instance, for the instance admin to hand out the right
// to own an organisation.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      isInstanceAdmin: user.isInstanceAdmin,
      canCreateOrganizations: user.canCreateOrganizations
    })
    .from(user)
    .orderBy(asc(user.createdAt))
})
