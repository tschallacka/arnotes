<script setup lang="ts">
import { formatDuration } from '#shared/utils/duration'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'
import type { TimeEntry } from '~/composables/useTimeTracking'

// The project's time, a week at a time: who spent it and what on.
const props = defineProps<{ projectId: string }>()

const week = useWeek()
const entries = ref<TimeEntry[]>([])
const loading = ref(false)
const error = ref('')
let latest = 0

async function load() {
  const mine = ++latest
  loading.value = true
  error.value = ''
  try {
    const rows = await untypedFetch<TimeEntry[]>(`/api/projects/${props.projectId}/time`, { query: { from: week.from.value, to: week.to.value } })
    if (mine === latest) entries.value = rows
  } catch (e) {
    if (mine === latest) error.value = errorMessage(e, 'Could not load the time')
  } finally {
    if (mine === latest) loading.value = false
  }
}

watch([() => props.projectId, week.from], load, { immediate: true })
// A timer stopped while this is open has logged something.
const { revision } = useRunningTimer()
watch(revision, load)

const total = computed(() => entries.value.reduce((sum, entry) => sum + entry.minutes, 0))
</script>

<template>
  <div class="h-full overflow-y-auto px-4 pb-10 pt-4 lg:px-6">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <UButton
        icon="i-lucide-chevron-left"
        size="xs"
        color="neutral"
        variant="soft"
        aria-label="Previous week"
        data-week-prev
        @click="week.shift(-1)"
      />
      <UButton
        icon="i-lucide-chevron-right"
        size="xs"
        color="neutral"
        variant="soft"
        aria-label="Next week"
        data-week-next
        @click="week.shift(1)"
      />
      <h2
        class="text-sm font-semibold text-default"
        data-week-label
      >
        {{ week.label.value }}
      </h2>
      <UButton
        v-if="!week.isCurrent.value"
        label="This week"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="week.reset()"
      />
      <span class="ml-auto text-sm text-muted">
        <span
          class="font-semibold tabular-nums text-default"
          data-week-total
        >{{ formatDuration(total) || '0m' }}</span> this week
      </span>
    </div>

    <p
      v-if="error"
      class="mb-3 text-sm text-error"
    >
      {{ error }}
    </p>

    <h3 class="mb-2 text-sm font-semibold text-default">
      By person
    </h3>
    <TimeGrid
      :entries="entries"
      :days="week.days.value"
      by="person"
      data-grid="person"
    />

    <h3 class="mb-2 mt-6 text-sm font-semibold text-default">
      By task
    </h3>
    <TimeGrid
      :entries="entries"
      :days="week.days.value"
      by="task"
      data-grid="task"
    />
  </div>
</template>
