<script setup lang="ts">
import { format } from 'date-fns'
import { formatDuration, formatElapsed } from '#shared/utils/duration'
import { dueDayToMs, todayIso } from '~/utils/dueDate'

// A task's time: a timer to start and stop, a box to log by hand, and the
// entries so far.
const props = defineProps<{ taskId: string }>()

const toast = useToast()
const { session } = useAuth()
const me = computed(() => session.value?.user)

const { timer, elapsedMs, start, stop } = useRunningTimer()
const { entries, totalMinutes, log, remove, errorMessage } = useTaskTime(() => props.taskId)

const runningHere = computed(() => timer.value?.taskId === props.taskId)
const timerBusy = ref(false)

async function toggleTimer() {
  timerBusy.value = true
  try {
    if (runningHere.value) await stop()
    else await start(props.taskId)
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not change the timer'), icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    timerBusy.value = false
  }
}

const duration = ref('')
const day = ref(todayIso())
const note = ref('')
const error = ref('')
const adding = ref(false)

async function add() {
  if (!duration.value.trim() || adding.value) return
  adding.value = true
  error.value = ''
  try {
    await log(duration.value, day.value || todayIso(), note.value)
    duration.value = ''
    note.value = ''
  } catch (e) {
    error.value = errorMessage(e, (e as Error).message)
  } finally {
    adding.value = false
  }
}

function dayLabel(value: string) {
  return value === todayIso() ? 'Today' : format(dueDayToMs(value), 'MMM d')
}
</script>

<template>
  <div
    class="shrink-0 border-t border-default px-5 py-2.5"
    data-task-time
  >
    <div class="mb-1.5 flex items-center gap-2">
      <p class="text-xs font-medium text-muted">
        Time
        <span
          v-if="totalMinutes"
          class="tabular-nums text-dimmed"
          data-time-total
        >{{ formatDuration(totalMinutes) }} logged</span>
      </p>
      <UButton
        class="ml-auto"
        size="xs"
        :color="runningHere ? 'error' : 'neutral'"
        :variant="runningHere ? 'soft' : 'ghost'"
        :icon="runningHere ? 'i-lucide-square' : 'i-lucide-play'"
        :loading="timerBusy"
        data-timer-toggle
        :title="timer && !runningHere ? 'Starting this timer stops the one running on another task' : undefined"
        @click="toggleTimer"
      >
        <template v-if="runningHere">
          Stop <span class="tabular-nums">{{ formatElapsed(elapsedMs) }}</span>
        </template>
        <template v-else>
          Start timer
        </template>
      </UButton>
    </div>

    <form
      class="flex flex-wrap items-center gap-1.5"
      @submit.prevent="add"
    >
      <input
        v-model="duration"
        type="text"
        placeholder="1h 30m"
        class="w-20 rounded-md border border-default bg-transparent px-2 py-1 text-xs tabular-nums outline-none placeholder:text-dimmed focus:border-primary"
        data-time-duration
      >
      <input
        v-model="day"
        type="date"
        min="2000-01-01"
        max="2999-12-31"
        class="rounded-md border border-default bg-transparent px-2 py-1 text-xs outline-none focus:border-primary"
        data-time-day
      >
      <input
        v-model="note"
        type="text"
        maxlength="500"
        placeholder="What was it?"
        class="min-w-24 flex-1 rounded-md border border-default bg-transparent px-2 py-1 text-xs outline-none placeholder:text-dimmed focus:border-primary"
        data-time-note
      >
      <UButton
        type="submit"
        label="Add"
        size="xs"
        :disabled="!duration.trim()"
        :loading="adding"
        data-time-add
      />
    </form>
    <p
      v-if="error"
      class="mt-1 text-xs text-error"
      data-time-error
    >
      {{ error }}
    </p>

    <ul
      v-if="entries.length"
      class="mt-2 max-h-32 space-y-0.5 overflow-y-auto"
    >
      <li
        v-for="entry in entries"
        :key="entry.id"
        class="group flex items-center gap-2 text-xs"
        data-time-entry
      >
        <span class="w-14 shrink-0 text-dimmed">{{ dayLabel(entry.day) }}</span>
        <span class="w-14 shrink-0 font-medium tabular-nums text-default">{{ formatDuration(entry.minutes) }}</span>
        <span class="shrink-0 text-muted">{{ entry.author.name }}</span>
        <span class="min-w-0 flex-1 truncate text-dimmed">{{ entry.note }}</span>
        <button
          v-if="entry.author.id === me?.id"
          class="shrink-0 text-dimmed opacity-0 transition-opacity hover:text-error focus:opacity-100 group-hover:opacity-100"
          aria-label="Delete entry"
          data-time-delete
          @click="remove(entry.id)"
        >
          <UIcon
            name="i-lucide-trash-2"
            class="size-3.5"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
