<script setup lang="ts">
import { formatElapsed } from '#shared/utils/duration'

// The timer that is running, wherever you are in the app: what it is on, how
// long it has been going, and a way to stop it.
const toast = useToast()
const { timer, elapsedMs, load, stop } = useRunningTimer()

onMounted(load)

const stopping = ref(false)

async function stopTimer() {
  stopping.value = true
  try {
    await stop()
  } catch {
    toast.add({ title: 'Could not stop the timer', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    stopping.value = false
  }
}

function open() {
  if (timer.value) navigateTo(`/projects/${timer.value.projectId}?task=${timer.value.taskId}`)
}
</script>

<template>
  <div
    v-if="timer"
    class="mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2"
    data-running-timer
  >
    <span class="relative flex size-2 shrink-0">
      <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
      <span class="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
    <button
      class="min-w-0 flex-1 text-left"
      @click="open"
    >
      <span class="block truncate text-xs font-medium text-default">{{ timer.taskTitle }}</span>
      <span
        class="block text-xs tabular-nums text-muted"
        data-timer-elapsed
      >{{ formatElapsed(elapsedMs) }}</span>
    </button>
    <UButton
      icon="i-lucide-square"
      size="xs"
      color="error"
      variant="soft"
      aria-label="Stop timer"
      :loading="stopping"
      data-timer-stop
      @click="stopTimer"
    />
  </div>
</template>
