<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

interface InstanceUser {
  id: string
  name: string
  email: string
  createdAt: string
  isInstanceAdmin: boolean
  canCreateOrganizations: boolean
}

const users = ref<InstanceUser[]>([])
const loading = ref(false)
const saving = ref<string | null>(null)
const toast = useToast()

watch(open, async (isOpen) => {
  if (!isOpen) return
  loading.value = true
  try {
    users.value = await $fetch<InstanceUser[]>('/api/admin/users')
  } catch {
    toast.add({ title: 'Could not load accounts', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    loading.value = false
  }
})

async function setCanCreate(u: InstanceUser, value: boolean) {
  saving.value = u.id
  try {
    await $fetch(`/api/admin/users/${u.id}`, { method: 'PUT', body: { canCreateOrganizations: value } })
    u.canCreateOrganizations = value
  } catch {
    toast.add({ title: 'Could not change that account', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Accounts on this instance"
    description="Choose who may create organisations of their own. Taking the right away leaves organisations they already own in place."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div
        v-if="loading"
        class="flex justify-center py-6"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="size-5 animate-spin text-muted"
        />
      </div>
      <div
        v-else
        class="divide-y divide-default rounded-xl border border-default overflow-hidden text-sm"
      >
        <div
          v-for="u in users"
          :key="u.id"
          class="flex items-center justify-between gap-3 px-3 py-2.5"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <UAvatar
              :alt="u.name || u.email"
              size="xs"
            />
            <div class="min-w-0">
              <p class="truncate text-xs font-medium text-default">
                {{ u.name || u.email }}
                <UBadge
                  v-if="u.isInstanceAdmin"
                  size="xs"
                  variant="subtle"
                  class="ml-1"
                >
                  admin
                </UBadge>
              </p>
              <p
                v-if="u.name"
                class="truncate text-[11px] text-muted"
              >
                {{ u.email }}
              </p>
            </div>
          </div>
          <USwitch
            :model-value="u.canCreateOrganizations"
            :disabled="u.isInstanceAdmin || saving === u.id"
            label="Can create organisations"
            :ui="{ label: 'text-xs text-muted' }"
            @update:model-value="(value: boolean) => setCanCreate(u, value)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
