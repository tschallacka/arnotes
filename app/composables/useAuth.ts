import { createAuthClient } from 'better-auth/vue'
import { emailOTPClient, genericOAuthClient, organizationClient, twoFactorClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  plugins: [
    organizationClient(),
    twoFactorClient(),
    passkeyClient(),
    emailOTPClient(),
    genericOAuthClient()
  ]
})

export function useAuth() {
  const sessionRef = authClient.useSession()

  const session = computed(() => sessionRef.value.data)
  const isPending = computed(() => sessionRef.value.isPending)

  async function signInWithDiscord() {
    await authClient.signIn.social({ provider: 'discord', callbackURL: '/note' })
  }

  async function signInWithGitHub() {
    await authClient.signIn.social({ provider: 'github', callbackURL: '/note' })
  }

  async function signInWithGoogle() {
    await authClient.signIn.social({ provider: 'google', callbackURL: '/note' })
  }

  async function signInWithOidc() {
    await authClient.signIn.oauth2({ providerId: 'oidc', callbackURL: '/note' })
  }

  async function signOut() {
    await authClient.signOut()
    window.location.href = '/login'
  }

  return {
    session,
    isPending,
    signInWithDiscord,
    signInWithGitHub,
    signInWithGoogle,
    signInWithOidc,
    signOut
  }
}

export { authClient }
