import { db } from '../../../db'
import { customerInvitations, customers, organization } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { hashInvitationToken, INVITATION_COOKIE } from '../../../utils/customers'

// What an invitation link is for, readable before signing in: the invite page
// has to say whose portal it opens. Opening it also drops the token in a cookie,
// which is what lets an invited person create an account while sign-up is
// closed — including through an OAuth round trip, which loses the URL.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const [row] = await db
    .select({
      expiresAt: customerInvitations.expiresAt,
      acceptedAt: customerInvitations.acceptedAt,
      customerName: customers.name,
      organizationName: organization.name
    })
    .from(customerInvitations)
    .innerJoin(customers, eq(customers.id, customerInvitations.customerId))
    .innerJoin(organization, eq(organization.id, customers.organizationId))
    .where(eq(customerInvitations.tokenHash, hashInvitationToken(token)))

  if (!row) throw createError({ statusCode: 404, message: 'This invitation does not exist' })
  if (row.acceptedAt) throw createError({ statusCode: 410, message: 'This invitation has already been used' })
  if (row.expiresAt <= Date.now()) throw createError({ statusCode: 410, message: 'This invitation has expired' })

  setCookie(event, INVITATION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getRequestProtocol(event) === 'https',
    path: '/',
    maxAge: 60 * 60 * 24
  })
  return { customerName: row.customerName, organizationName: row.organizationName }
})
