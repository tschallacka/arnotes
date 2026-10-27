import type { H3Event } from 'h3'
import { createHash, randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { customers, member } from '../db/schema'
import { getUserActiveTeamId } from './auth-helpers'

const MANAGER_ROLES = ['owner', 'admin']

/**
 * The caller's active organisation and their role in it, 403 without one.
 * Customers are managed from the organisation, never from a personal workspace.
 * With `manage`, only owners and admins pass.
 */
export async function requireOrgStaff(event: H3Event, options: { manage?: boolean } = {}) {
  const organizationId = await getUserActiveTeamId(event)
  if (!organizationId) throw createError({ statusCode: 403, message: 'Switch to an organisation first' })

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, event.context.session.user.id)))
  if (!membership) throw createError({ statusCode: 403, message: 'Switch to an organisation first' })

  const canManage = membership.role.split(',').some(role => MANAGER_ROLES.includes(role))
  if (options.manage && !canManage) {
    throw createError({ statusCode: 403, message: 'Only owners and admins can manage customers' })
  }
  return { organizationId, canManage }
}

/** A customer of the caller's active organisation, 404 otherwise. */
export async function requireCustomer(event: H3Event, customerId: string, options: { manage?: boolean } = {}) {
  const staff = await requireOrgStaff(event, options)
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, staff.organizationId)))
  if (!customer) throw createError({ statusCode: 404, message: 'Customer not found' })
  return { customer, ...staff }
}

/**
 * Resolves a customer of the given organisation, 400 otherwise. A project can
 * only be filed under a customer of its own organisation, and a customer id
 * from another organisation must not be accepted by guessing it.
 */
export async function requireOrgCustomer(customerId: string, organizationId: string | null) {
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'Only a team project can belong to a customer' })
  }
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)))
  if (!customer) throw createError({ statusCode: 400, message: 'Unknown customer' })
  return customer
}

/** How long an invitation link stays usable. */
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000

/** The cookie that carries an invitation through sign-up and OAuth round trips. */
export const INVITATION_COOKIE = 'arnotes_invite'

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** A new invitation token and the hash that is stored for it. */
export function newInvitationToken(): { token: string, tokenHash: string } {
  const token = randomBytes(24).toString('base64url')
  return { token, tokenHash: hashInvitationToken(token) }
}
