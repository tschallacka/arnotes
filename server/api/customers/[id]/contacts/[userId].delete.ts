import { db } from '../../../../db'
import { customerMembers } from '../../../../db/schema'
import { and, eq } from 'drizzle-orm'
import { requireCustomer } from '../../../../utils/customers'
import { closeTopic, customerTopic } from '../../../../utils/realtime'

// Ends one contact's access to a customer. Their account stays; it just no
// longer reaches this customer's projects.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!
  const { customer } = await requireCustomer(event, id, { manage: true })

  await db
    .delete(customerMembers)
    .where(and(eq(customerMembers.customerId, customer.id), eq(customerMembers.userId, userId)))

  // Open sockets were subscribed while the person was a contact. Hanging up on
  // the customer's topic drops theirs too; everyone reconnects, and only those
  // still on the customer subscribe to it again.
  closeTopic(customerTopic(customer.id), 4000, 'Access changed')
  return { ok: true }
})
