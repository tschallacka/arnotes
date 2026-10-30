<script setup lang="ts">
// The project's GitHub defaults: the repo that `#123` resolves against, and the
// visibility a new link takes. Staff only; the API refuses anyone else, and the
// parent only mounts this for staff.
const props = defineProps<{ projectId: string }>()

interface GithubSettings {
  defaultRepo: string | null
  defaultVisibility: 'internal' | 'customer'
}

const repo = ref('')
const visibility = ref<'internal' | 'customer'>('internal')
const loading = ref(true)
const saved = ref(false)
const error = ref('')
// What the server last agreed to, so a blur with no change sends nothing.
let lastRepo = ''

let savedTimer: ReturnType<typeof setTimeout> | undefined

function messageOf(e: unknown, fallback: string) {
  const data = (e as { data?: { message?: unknown } })?.data
  return typeof data?.message === 'string' ? data.message : fallback
}

function flashSaved() {
  saved.value = true
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => saved.value = false, 1500)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const settings = await $fetch<GithubSettings>(`/api/projects/${props.projectId}/github`)
    lastRepo = settings.defaultRepo ?? ''
    repo.value = lastRepo
    visibility.value = settings.defaultVisibility
  } catch (e) {
    error.value = messageOf(e, 'Could not load the GitHub settings')
  } finally {
    loading.value = false
  }
}

watch(() => props.projectId, load, { immediate: true })

async function put(body: Partial<GithubSettings>) {
  error.value = ''
  try {
    return await $fetch<GithubSettings>(`/api/projects/${props.projectId}/github`, { method: 'PUT', body })
  } catch (e) {
    error.value = messageOf(e, 'Could not save the GitHub settings')
    return null
  }
}

async function saveRepo() {
  const next = repo.value.trim()
  if (next === lastRepo) return
  const settings = await put({ defaultRepo: next })
  if (!settings) {
    repo.value = lastRepo
    return
  }
  lastRepo = settings.defaultRepo ?? ''
  repo.value = lastRepo
  flashSaved()
}

async function saveVisibility() {
  const settings = await put({ defaultVisibility: visibility.value })
  if (!settings) {
    await load()
    return
  }
  visibility.value = settings.defaultVisibility
  flashSaved()
}
</script>

<template>
  <section
    class="mt-8"
    data-github-settings
  >
    <h2 class="text-lg font-semibold text-default">
      GitHub
    </h2>
    <p class="mt-1 text-xs text-muted">
      Links pasted on tasks take these defaults. A bare <code>#123</code> means issue 123 in the default repo.
    </p>

    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <label class="block text-sm">
        <span class="text-muted">Default repo</span>
        <input
          v-model="repo"
          type="text"
          placeholder="owner/repo"
          :disabled="loading"
          autocomplete="off"
          class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default outline-none transition-shadow placeholder:text-dimmed focus:border-primary focus:ring-2 focus:ring-primary/20"
          data-github-default-repo
          @blur="saveRepo"
          @keydown.enter.prevent="saveRepo"
        >
      </label>

      <label class="block text-sm">
        <span class="text-muted">Default visibility for new links</span>
        <select
          v-model="visibility"
          :disabled="loading"
          class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          data-github-default-visibility
          @change="saveVisibility"
        >
          <option value="internal">
            Internal: customers do not see it
          </option>
          <option value="customer">
            Customer: customers see it
          </option>
        </select>
      </label>
    </div>

    <p
      v-if="error"
      role="alert"
      class="mt-2 text-xs text-error"
    >
      {{ error }}
    </p>
    <p
      class="mt-2 h-4 text-xs text-success transition-opacity"
      :class="saved ? 'opacity-100' : 'opacity-0'"
    >
      Saved
    </p>
  </section>
</template>
