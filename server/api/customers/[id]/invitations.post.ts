import { db } from '../../../db'
import { customerInvitations } from '../../../db/schema'
import { genId } from '../../../utils/projects'
import { INVITATION_TTL_MS, newInvitationToken, requireCustomer } from '../../../utils/customers'

// Issues a single-use link that makes whoever opens it a contact of this
// customer, creating an account first if they have none. The token is shown in
// this response only; the database keeps its hash.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { customer } = await requireCustomer(event, id, { manage: true })
  const body = await readBody<{ label?: string }>(event)

  const { token, tokenHash } = newInvitationToken()
  const now = Date.now()
  const [invitation] = await db.insert(customerInvitations).values({
    id: genId(),
    customerId: customer.id,
    tokenHash,
    label: body?.label?.trim().slice(0, 120) || null,
    createdBy: event.context.session.user.id,
    createdAt: now,
    expiresAt: now + INVITATION_TTL_MS
  }).returning()

  const origin = process.env.BETTER_AUTH_URL || getRequestURL(event).origin
  return {
    id: invitation!.id,
    label: invitation!.label,
    expiresAt: invitation!.expiresAt,
    url: `${origin.replace(/\/$/, '')}/invite/${token}`
  }
})
