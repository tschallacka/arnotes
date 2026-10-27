import { createAuthClient } from 'better-auth/vue'
import { emailOTPClient, genericOAuthClient, inferAdditionalFields, organizationClient, twoFactorClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  plugins: [
    organizationClient(),
    twoFactorClient(),
    passkeyClient(),
    emailOTPClient(),
    genericOAuthClient(),
    // Mirrors user.additionalFields in server/lib/auth.ts, so the session is typed with them.
    inferAdditionalFields({
      user: {
        isInstanceAdmin: { type: 'boolean', input: false },
        canCreateOrganizations: { type: 'boolean', input: false }
      }
    })
  ]
})

export function useAuth() {
  const sessionRef = authClient.useSession()

  const session = computed(() => sessionRef.value.data)
  const isPending = computed(() => sessionRef.value.isPending)
  const isInstanceAdmin = computed(() => Boolean(session.value?.user?.isInstanceAdmin))
  const canCreateOrganizations = computed(() => Boolean(session.value?.user?.canCreateOrganizations))

  // Each provider comes back to `callbackURL`, which is an invitation page when
  // the sign-in started from one.
  async function signInWithDiscord(callbackURL = '/note') {
    await authClient.signIn.social({ provider: 'discord', callbackURL })
  }

  async function signInWithGitHub(callbackURL = '/note') {
    await authClient.signIn.social({ provider: 'github', callbackURL })
  }

  async function signInWithGoogle(callbackURL = '/note') {
    await authClient.signIn.social({ provider: 'google', callbackURL })
  }

  async function signInWithOidc(callbackURL = '/note') {
    await authClient.signIn.oauth2({ providerId: 'oidc', callbackURL })
  }

  async function signOut() {
    await authClient.signOut()
    window.location.href = '/login'
  }

  return {
    session,
    isPending,
    isInstanceAdmin,
    canCreateOrganizations,
    signInWithDiscord,
    signInWithGitHub,
    signInWithGoogle,
    signInWithOidc,
    signOut
  }
}

export { authClient }
