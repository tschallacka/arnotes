<script setup lang="ts">
import { isOverdueDay } from '~/utils/dueDate'

const props = defineProps<{ projectId: string }>()

const { activeProject, updateProjectDetails, board, isTrashed } = useProjects()

const draft = ref('')
const saved = ref(false)

// The project can arrive from the store's cache first and again fresher from the
// server, so the draft follows its description until the user starts typing.
const dirty = ref(false)

watch(() => [activeProject.value?.id, activeProject.value?.description] as const, () => {
  if (!dirty.value) draft.value = activeProject.value?.description ?? ''
}, { immediate: true })

function clearSaved() {
  saved.value = false
}

async function saveDescription() {
  if (draft.value === (activeProject.value?.description ?? '')) {
    dirty.value = false
    return
  }
  await updateProjectDetails(props.projectId, { description: draft.value })
  dirty.value = false
  saved.value = true
  setTimeout(clearSaved, 1500)
}

const STATUSES = [
  { key: 'on_track', label: 'On track', dot: 'bg-success' },
  { key: 'at_risk', label: 'At risk', dot: 'bg-warning' },
  { key: 'off_track', label: 'Off track', dot: 'bg-error' }
] as const

function setStatus(key: (typeof STATUSES)[number]['key']) {
  const next = activeProject.value?.status === key ? null : key
  return updateProjectDetails(props.projectId, { status: next })
}

const counts = computed(() => {
  const tasks = (board.value?.tasks ?? []).filter(task => !isTrashed(task))
  return {
    total: tasks.length,
    done: tasks.filter(task => task.completedAt).length,
    overdue: tasks.filter(task => task.dueOn && !task.completedAt && isOverdueDay(task.dueOn)).length
  }
})
</script>

<template>
  <div class="h-full overflow-y-auto px-4 pb-10 pt-6 lg:px-6">
    <div class="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_18rem]">
      <div>
        <h2 class="text-lg font-semibold text-default">
          Project description
        </h2>
        <textarea
          v-model="draft"
          rows="8"
          placeholder="What is this project about? Add goals, links and context for everyone working on it."
          class="mt-3 w-full resize-y rounded-xl border border-default bg-default p-3 text-sm leading-relaxed text-default outline-none transition-shadow placeholder:text-dimmed focus:border-primary focus:ring-2 focus:ring-primary/20"
          data-overview-description
          @input="dirty = true"
          @blur="saveDescription"
        />
        <p
          class="mt-1 h-4 text-xs text-success transition-opacity"
          :class="saved ? 'opacity-100' : 'opacity-0'"
        >
          Saved
        </p>
      </div>

      <aside class="space-y-6">
        <section>
          <h3 class="text-sm font-semibold text-default">
            What's the status?
          </h3>
          <div class="mt-3 flex flex-wrap gap-2">
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
        </section>

        <section>
          <h3 class="text-sm font-semibold text-default">
            At a glance
          </h3>
          <dl class="mt-3 divide-y divide-default rounded-xl border border-default bg-default text-sm">
            <div class="flex justify-between px-3 py-2">
              <dt class="text-muted">
                Tasks
              </dt>
              <dd class="tabular-nums text-default">
                {{ counts.total }}
              </dd>
            </div>
            <div class="flex justify-between px-3 py-2">
              <dt class="text-muted">
                Completed
              </dt>
              <dd class="tabular-nums text-default">
                {{ counts.done }}
              </dd>
            </div>
            <div class="flex justify-between px-3 py-2">
              <dt class="text-muted">
                Overdue
              </dt>
              <dd
                class="tabular-nums"
                :class="counts.overdue ? 'text-error' : 'text-default'"
              >
                {{ counts.overdue }}
              </dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  </div>
</template>
