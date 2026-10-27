import { db } from '../../../../db'
import { customerInvitations } from '../../../../db/schema'
import { and, eq } from 'drizzle-orm'
import { requireCustomer } from '../../../../utils/customers'

// Revokes a link that has not been used yet.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const invitationId = getRouterParam(event, 'invitationId')!
  const { customer } = await requireCustomer(event, id, { manage: true })

  await db
    .delete(customerInvitations)
    .where(and(eq(customerInvitations.id, invitationId), eq(customerInvitations.customerId, customer.id)))
  return { ok: true }
})
