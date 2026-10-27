import { db } from '../../../db'
import { customers } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireCustomer } from '../../../utils/customers'
import { publishFromEvent } from '../../../utils/realtime'

// Renaming or removing a customer. Removing one keeps its projects in the
// organisation as internal projects and ends every contact's access with it.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { customer } = await requireCustomer(event, id, { manage: true })

  if (event.method === 'PUT') {
    const body = await readBody<{ name?: string }>(event)
    const name = body.name?.trim()
    if (!name) throw createError({ statusCode: 400, message: 'A customer needs a name' })
    const [updated] = await db
      .update(customers)
      .set({ name: name.slice(0, 120), updatedAt: Date.now() })
      .where(eq(customers.id, customer.id))
      .returning()
    await publishFromEvent(event, { type: 'projects' })
    return updated
  }

  if (event.method !== 'DELETE') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  // Projects fall back to internal (customer_id set null); contacts and open
  // invitations go with the customer through the cascade.
  await db.delete(customers).where(eq(customers.id, customer.id))
  await publishFromEvent(event, { type: 'projects' })
  return { ok: true }
})
