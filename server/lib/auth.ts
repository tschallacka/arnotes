import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'
import { organization } from 'better-auth/plugins/organization'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { passkey } from '@better-auth/passkey'
import { db } from '../db'
import * as schema from '../db/schema'
import { mailEnabled, sendMail } from './mailer'

const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000'

// One switch for every way an account can be created. A provider that ignored it
// would turn a private instance back into an open one through its sign-in button.
const signUpDisabled = process.env.ALLOW_SIGN_UP === 'false'

const discordEnabled = process.env.NUXT_PUBLIC_DISCORD_ENABLED === 'true'
  && Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET)
const githubEnabled = process.env.NUXT_PUBLIC_GITHUB_ENABLED === 'true'
  && Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
const googleEnabled = process.env.NUXT_PUBLIC_GOOGLE_ENABLED === 'true'
  && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const oidcEnabled = process.env.NUXT_PUBLIC_OIDC_ENABLED === 'true'
  && Boolean(process.env.OIDC_DISCOVERY_URL && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET)
const emailCodeEnabled = process.env.NUXT_PUBLIC_EMAIL_CODE_ENABLED === 'true' && mailEnabled
// Passkeys need nothing from outside, so they are on unless switched off.
const passkeysEnabled = process.env.NUXT_PUBLIC_PASSKEYS_ENABLED !== 'false'

const SIGN_IN_CODE_MINUTES = 10

function signInCodeMail(otp: string) {
  const text = `Your Arnotes sign-in code is ${otp}.\n\nIt expires in ${SIGN_IN_CODE_MINUTES} minutes. If you did not try to sign in, you can ignore this email.`
  const html = `<p>Your Arnotes sign-in code is</p>`
    + `<p style="font-size:28px;font-weight:600;letter-spacing:6px;font-family:monospace">${otp}</p>`
    + `<p>It expires in ${SIGN_IN_CODE_MINUTES} minutes. If you did not try to sign in, you can ignore this email.</p>`
  return { subject: `${otp} is your Arnotes sign-in code`, text, html }
}

export const auth = betterAuth({
  appName: 'Arnotes',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
      passkey: schema.passkey,
      twoFactor: schema.twoFactor
    }
  }),
  plugins: [
    organization({
      // Better Auth only returns columns it knows about, so `joinCode` has to be
      // declared here or it is stripped from every organization response.
      // `input: false` keeps it server-issued — clients can never set their own.
      schema: {
        organization: {
          additionalFields: {
            joinCode: { type: 'string', required: false, input: false }
          }
        }
      }
    }),
    // Asks for an authenticator code after a correct password. Better Auth only
    // applies it to password sign-in; the hook below covers email codes.
    twoFactor({ issuer: 'Arnotes' }),
    ...(passkeysEnabled
      ? [passkey({
          // A passkey is bound to this hostname, so one created on localhost
          // does not work on the production domain and vice versa.
          rpID: new URL(baseURL).hostname,
          rpName: 'Arnotes',
          origin: new URL(baseURL).origin
        })]
      : []),
    ...(emailCodeEnabled
      ? [emailOTP({
          expiresIn: SIGN_IN_CODE_MINUTES * 60,
          disableSignUp: signUpDisabled,
          async sendVerificationOTP({ email, otp, type }) {
            if (type !== 'sign-in') return
            // Not awaited: the response would otherwise take longer for an address
            // that has an account than for one that does not.
            sendMail({ to: email, ...signInCodeMail(otp) })
              .catch(error => console.error('[auth] sign-in code email failed', error))
          }
        })]
      : []),
    ...(oidcEnabled
      ? [genericOAuth({
          config: [{
            providerId: 'oidc',
            discoveryUrl: process.env.OIDC_DISCOVERY_URL!,
            clientId: process.env.OIDC_CLIENT_ID!,
            clientSecret: process.env.OIDC_CLIENT_SECRET!,
            scopes: ['openid', 'email', 'profile'],
            pkce: true,
            disableSignUp: signUpDisabled
          }]
        })]
      : [])
  ],
  hooks: {
    // An email code proves only access to the inbox. For an account that turned on
    // two-factor, letting it in on that alone would make the second factor optional.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email-otp') return
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email.toLowerCase() : ''
      const found = email ? await ctx.context.internalAdapter.findUserByEmail(email) : null
      if ((found?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled) {
        throw new APIError('FORBIDDEN', {
          message: 'This account uses two-factor authentication. Sign in with your password or a passkey.'
        })
      }
    })
  },
  databaseHooks: {
    user: {
      create: {
        // Signing up with an email code asks for no name, and an empty one
        // leaves the avatar and team member lists with nothing to show.
        async before(user) {
          if (user.name?.trim()) return
          return { data: { ...user, name: user.email.split('@')[0] } }
        }
      }
    }
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: signUpDisabled
  },
  socialProviders: {
    ...(discordEnabled
      ? {
          discord: {
            clientId: process.env.DISCORD_CLIENT_ID!,
            clientSecret: process.env.DISCORD_CLIENT_SECRET!,
            disableSignUp: signUpDisabled
          }
        }
      : {}),
    ...(githubEnabled
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            disableSignUp: signUpDisabled
          }
        }
      : {}),
    ...(googleEnabled
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            disableSignUp: signUpDisabled
          }
        }
      : {})
  },
  trustedOrigins: [baseURL]
})
