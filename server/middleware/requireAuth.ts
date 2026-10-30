import { auth } from '../lib/auth'

// Everything under these needs a session. `/api/invitations` is deliberately not
// here: an invite link has to be readable before its recipient has an account.
const PROTECTED_PREFIXES = [
  '/api/settings',
  '/api/ai',
  '/api/chat',
  '/api/teams',
  '/api/projects',
  '/api/tasks',
  '/api/columns',
  '/api/notifications',
  '/api/goals',
  '/api/portfolios',
  '/api/time',
  '/api/timer',
  '/api/customers',
  '/api/admin'
]

export default defineEventHandler(async (event) => {
  const path = event.path
  if (!PROTECTED_PREFIXES.some(prefix => path.startsWith(prefix))) return

  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) throw createError({ statusCode: 401, message: 'Unauthorized' })

  event.context.session = session
})
