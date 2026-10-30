<script setup lang="ts">
// A rule's run log: one line per firing, newest first. A failed run keeps the
// steps it did before the failure, so the log says that in words.
import { listProjectRuleRuns, ruleErrorMessage } from '~/composables/useProjectRules'
import type { RuleRun } from '~/composables/useProjectRules'
import { relativeTime } from '~/composables/useRelativeTime'

const props = defineProps<{ projectId: string, ruleId: string }>()

const { board } = useProjects()

const runs = ref<RuleRun[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    runs.value = await listProjectRuleRuns(props.projectId, props.ruleId)
  } catch (e) {
    error.value = ruleErrorMessage(e, 'Could not load the run log')
  } finally {
    loading.value = false
  }
}

watch(() => [props.projectId, props.ruleId], load, { immediate: true })

const OUTCOMES: Record<RuleRun['outcome'], { label: string, dot: string }> = {
  ran: { label: 'Ran', dot: 'bg-success' },
  failed: { label: 'Failed', dot: 'bg-error' },
  loop_stopped: { label: 'Stopped to prevent a loop', dot: 'bg-warning' }
}

function taskTitle(taskId: string | null) {
  if (!taskId) return null
  return board.value?.tasks.find(task => task.id === taskId)?.title ?? 'A task'
}
</script>

<template>
  <div class="space-y-2 rounded-xl border border-default bg-default p-3">
    <p class="text-xs text-muted">
      When a step fails, the steps before it stay applied: they are not undone.
    </p>

    <p
      v-if="loading"
      class="text-xs text-dimmed"
    >
      Loading the run log...
    </p>
    <p
      v-else-if="error"
      class="text-xs text-error"
    >
      {{ error }}
    </p>
    <p
      v-else-if="!runs.length"
      class="text-xs text-muted"
      data-run-empty
    >
      This rule has not run yet.
    </p>
    <ul
      v-else
      class="divide-y divide-default text-sm"
      data-run-log
    >
      <li
        v-for="run in runs"
        :key="run.id"
        class="py-2"
        data-run
        :data-run-outcome="run.outcome"
      >
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            class="size-2 shrink-0 rounded-full"
            :class="OUTCOMES[run.outcome].dot"
          />
          <span class="font-medium text-default">{{ OUTCOMES[run.outcome].label }}</span>
          <span class="text-xs text-dimmed">{{ relativeTime(run.createdAt) }}</span>
          <NuxtLink
            v-if="run.taskId"
            :to="`/projects/${projectId}?task=${run.taskId}`"
            class="min-w-0 truncate text-xs text-primary hover:underline"
          >
            {{ taskTitle(run.taskId) }}
          </NuxtLink>
        </div>
        <p
          v-if="run.detail"
          class="mt-1 text-xs leading-relaxed text-muted"
        >
          {{ run.detail }}
        </p>
      </li>
    </ul>
  </div>
</template>
