// Who a project's tasks can be assigned to: its organisation's members, plus
// the contacts of its customer, or only its owner when it is a personal board.
import { asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { customerMembers, member, user } from '../db/schema'

export interface ProjectPerson {
  id: string
  name: string
  email: string
  image: string | null
  kind: 'staff' | 'customer'
}

export async function projectPeople(project: { userId: string, teamId: string | null, customerId: string | null }): Promise<ProjectPerson[]> {
  const columns = { id: user.id, name: user.name, email: user.email, image: user.image }

  const staff = project.teamId
    ? await db.select(columns).from(member).innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, project.teamId)).orderBy(asc(user.name))
    : await db.select(columns).from(user).where(eq(user.id, project.userId))

  const contacts = project.customerId
    ? await db.select(columns).from(customerMembers).innerJoin(user, eq(user.id, customerMembers.userId))
        .where(eq(customerMembers.customerId, project.customerId)).orderBy(asc(user.name))
    : []

  const staffIds = new Set(staff.map(p => p.id))
  return [
    ...staff.map(p => ({ ...p, kind: 'staff' as const })),
    ...contacts.filter(p => !staffIds.has(p.id)).map(p => ({ ...p, kind: 'customer' as const }))
  ]
}

/** 400 unless the account can be given work on this project. */
export async function requireAssignable(
  project: { userId: string, teamId: string | null, customerId: string | null },
  userId: string
) {
  const people = await projectPeople(project)
  if (!people.some(p => p.id === userId)) {
    throw createError({ statusCode: 400, message: 'That person is not on this project' })
  }
}
