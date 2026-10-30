<script setup lang="ts">
// The General section of project settings: name, description and status. The
// parent mounts this for team members only.
const props = defineProps<{ projectId: string }>()

const { activeProject, renameProject, updateProjectDetails } = useProjects()

const STATUSES = [
  { key: 'on_track', label: 'On track', dot: 'bg-success' },
  { key: 'at_risk', label: 'At risk', dot: 'bg-warning' },
  { key: 'off_track', label: 'Off track', dot: 'bg-error' }
] as const

const name = ref('')
const description = ref('')
// Typing is kept while the server answers; a changed copy from the server only
// replaces the draft when nothing is being typed.
const descriptionDirty = ref(false)
const error = ref('')
const saved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined

watch(() => activeProject.value?.name, (value) => {
  name.value = value ?? ''
}, { immediate: true })

watch(() => activeProject.value?.description, (value) => {
  if (!descriptionDirty.value) description.value = value ?? ''
}, { immediate: true })

function messageOf(e: unknown, fallback: string) {
  const data = (e as { data?: { message?: unknown } })?.data
  return typeof data?.message === 'string' ? data.message : fallback
}

function flashSaved() {
  saved.value = true
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => saved.value = false, 1500)
}

// Enter ends the edit, and the blur it causes does the saving.
function blurOnEnter(event: KeyboardEvent) {
  ;(event.target as HTMLInputElement).blur()
}

async function saveName() {
  const project = activeProject.value
  const next = name.value.trim()
  if (!project) return
  if (!next) {
    name.value = project.name
    return
  }
  if (next === project.name) return
  error.value = ''
  try {
    await renameProject(props.projectId, next)
    flashSaved()
  } catch (e) {
    error.value = messageOf(e, 'Could not rename the project')
    name.value = project.name
  }
}

async function saveDescription() {
  if (description.value === (activeProject.value?.description ?? '')) {
    descriptionDirty.value = false
    return
  }
  error.value = ''
  try {
    await updateProjectDetails(props.projectId, { description: description.value })
    descriptionDirty.value = false
    flashSaved()
  } catch (e) {
    error.value = messageOf(e, 'Could not save the description')
  }
}

// Clicking the current status clears it, as on the Overview.
async function setStatus(key: (typeof STATUSES)[number]['key']) {
  const next = activeProject.value?.status === key ? null : key
  error.value = ''
  try {
    await updateProjectDetails(props.projectId, { status: next })
    flashSaved()
  } catch (e) {
    error.value = messageOf(e, 'Could not change the status')
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <label
        for="project-settings-name"
        class="text-sm font-semibold text-default"
      >Name</label>
      <input
        id="project-settings-name"
        v-model="name"
        type="text"
        class="mt-2 w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:border-primary"
        data-settings-name
        @keydown.enter.prevent="blurOnEnter"
        @blur="saveName"
      >
    </div>

    <div>
      <label
        for="project-settings-description"
        class="text-sm font-semibold text-default"
      >Description</label>
      <textarea
        id="project-settings-description"
        v-model="description"
        rows="6"
        placeholder="What is this project about? Add goals, links and context for everyone working on it."
        class="mt-2 w-full resize-y rounded-xl border border-default bg-default p-3 text-sm leading-relaxed text-default outline-none transition-shadow placeholder:text-dimmed focus:border-primary focus:ring-2 focus:ring-primary/20"
        data-settings-description
        @input="descriptionDirty = true"
        @blur="saveDescription"
      />
    </div>

    <div>
      <h3 class="text-sm font-semibold text-default">
        Status
      </h3>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="status in STATUSES"
          :key="status.key"
          class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
          :class="activeProject?.status === status.key
            ? 'border-primary bg-primary/10 font-medium text-default'
            : 'border-default text-muted hover:bg-elevated'"
          :data-status="status.key"
          @click="setStatus(status.key)"
        >
          <span
            class="size-2 rounded-full"
            :class="status.dot"
          />
          {{ status.label }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="text-xs text-error"
    >
      {{ error }}
    </p>
    <p
      class="h-4 text-xs text-success transition-opacity"
      :class="saved ? 'opacity-100' : 'opacity-0'"
    >
      Saved
    </p>
  </div>
</template>
