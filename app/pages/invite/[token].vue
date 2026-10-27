<script setup lang="ts">
useSeoMeta({ title: 'Invitation' })

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))
const { session, isPending: sessionPending } = useAuth()

interface InvitationPreview {
  customerName: string
  organizationName: string
}

// Reading the invitation also sets the cookie that lets its recipient create an
// account where sign-up is otherwise closed, so it has to happen in the browser.
const { data: invitation, error: loadError, pending } = await useFetch<InvitationPreview>(
  () => `/api/invitations/${token.value}`,
  { server: false }
)

const loadMessage = computed(() => {
  const status = loadError.value?.statusCode
  if (status === 410) return 'This invitation has already been used or has expired.'
  if (status === 404) return 'This invitation link is not valid.'
  return loadError.value ? 'This invitation could not be loaded.' : ''
})

const accepting = ref(false)
const acceptError = ref('')

async function accept() {
  accepting.value = true
  acceptError.value = ''
  try {
    await $fetch(`/api/invitations/${token.value}/accept`, { method: 'POST' })
    // A full load, so the projects store picks up the customer's boards.
    await navigateTo('/projects', { external: true })
  } catch (e: unknown) {
    acceptError.value = (e as { data?: { message?: string } })?.data?.message || 'Could not accept the invitation'
  } finally {
    accepting.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-zinc-950">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm space-y-6 shadow-xl">
      <div class="text-center space-y-2">
        <AppLogo class="text-2xl mx-auto block" />
        <h1 class="text-xl font-semibold text-white">
          You're invited
        </h1>
        <p
          v-if="invitation"
          class="text-sm text-zinc-400"
        >
          {{ invitation.organizationName }} invited you to follow the projects of
          <span class="text-zinc-200 font-medium">{{ invitation.customerName }}</span>.
        </p>
      </div>

      <div
        v-if="pending || sessionPending"
        class="flex justify-center py-2"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="size-5 animate-spin text-zinc-500"
        />
      </div>

      <UAlert
        v-else-if="loadMessage"
        color="error"
        variant="subtle"
        :description="loadMessage"
      />

      <template v-else-if="invitation">
        <template v-if="session">
          <p class="text-sm text-zinc-400 text-center">
            Signed in as <span class="text-zinc-200">{{ session.user.email }}</span>.
          </p>
          <UAlert
            v-if="acceptError"
            color="error"
            variant="subtle"
            :description="acceptError"
          />
          <UButton
            block
            size="lg"
            color="primary"
            :loading="accepting"
            @click="accept"
          >
            Accept invitation
          </UButton>
        </template>
        <UButton
          v-else
          block
          size="lg"
          color="primary"
          :to="`/login?invite=${encodeURIComponent(token)}`"
        >
          Sign in or create an account
        </UButton>
      </template>
    </div>
  </div>
</template>
