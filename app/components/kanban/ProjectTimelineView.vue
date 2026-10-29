<script setup lang="ts">
import { addDays, differenceInCalendarDays, format, startOfDay, startOfWeek } from 'date-fns'
import { dueDayToMs } from '~/utils/dueDate'

const emit = defineEmits<{ openTask: [taskId: string] }>()

const { boardColumns, visibleColumnTasks, isTrashed } = useProjects()

const DAY_W = 28
const MIN_DAYS = 6 * 7

const sections = computed(() =>
  boardColumns.value
    .filter(column => !isTrashed(column))
    .map(column => ({
      column,
      tasks: visibleColumnTasks(column.id).filter(task => !isTrashed(task) && (task.dueOn || task.startOn))
    }))
    .filter(section => section.tasks.length)
)

const undatedCount = computed(() =>
  boardColumns.value
    .filter(column => !isTrashed(column))
    .flatMap(column => visibleColumnTasks(column.id))
    .filter(task => !isTrashed(task) && !task.dueOn && !task.startOn).length
)

const range = computed(() => {
  const today = startOfDay(new Date())
  const stamps = sections.value.flatMap(s => s.tasks.flatMap(t => [t.startOn, t.dueOn].filter((v): v is string => !!v).map(dueDayToMs)))
  const first = stamps.length ? new Date(Math.min(...stamps, today.getTime())) : today
  const last = stamps.length ? new Date(Math.max(...stamps, today.getTime())) : today
  const start = startOfWeek(addDays(first, -7), { weekStartsOn: 1 })
  const days = Math.max(MIN_DAYS, differenceInCalendarDays(last, start) + 14)
  return { start, days }
})

const weeks = computed(() =>
  Array.from({ length: Math.ceil(range.value.days / 7) }, (_, i) => addDays(range.value.start, i * 7))
)

const todayX = computed(() => differenceInCalendarDays(startOfDay(new Date()), range.value.start) * DAY_W + DAY_W / 2)

function bar(task: { startOn?: string | null, dueOn?: string | null }) {
  const from = startOfDay(new Date(dueDayToMs((task.startOn ?? task.dueOn)!)))
  const to = startOfDay(new Date(dueDayToMs((task.dueOn ?? task.startOn)!)))
  const left = differenceInCalendarDays(from, range.value.start) * DAY_W
  const width = (Math.max(0, differenceInCalendarDays(to, from)) + 1) * DAY_W
  return { left: `${left + 2}px`, width: `${width - 4}px` }
}

const scroller = ref<HTMLElement | null>(null)

function scrollToToday() {
  scroller.value?.scrollTo({ left: Math.max(0, todayX.value - 80) })
}

onMounted(() => requestAnimationFrame(scrollToToday))
watch(() => sections.value.length, () => nextTick(scrollToToday), { once: true })
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <p
      v-if="undatedCount"
      class="shrink-0 px-4 py-2 text-xs text-dimmed lg:px-6"
    >
      {{ undatedCount }} {{ undatedCount === 1 ? 'task has' : 'tasks have' }} no dates and {{ undatedCount === 1 ? 'is' : 'are' }} not shown.
    </p>

    <div
      v-if="!sections.length"
      class="flex flex-1 flex-col items-center justify-center gap-2 text-center"
    >
      <UIcon
        name="i-lucide-gantt-chart"
        class="size-6 text-dimmed"
      />
      <p class="text-sm text-muted">
        Give tasks a start or due date to see them on the timeline.
      </p>
    </div>

    <div
      v-else
      ref="scroller"
      class="min-h-0 flex-1 overflow-auto"
      data-timeline
    >
      <div
        class="relative"
        :style="{ width: `${range.days * DAY_W + 192}px` }"
      >
        <div class="sticky top-0 z-20 flex border-b border-default bg-default">
          <div class="sticky left-0 z-10 w-48 shrink-0 border-r border-default bg-default" />
          <div
            v-for="week in weeks"
            :key="week.toISOString()"
            class="shrink-0 border-r border-default px-2 py-1.5 text-xs text-dimmed"
            :style="{ width: `${7 * DAY_W}px` }"
          >
            {{ format(week, 'MMM d') }}
          </div>
        </div>

        <div
          class="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-primary/60"
          :style="{ left: `${192 + todayX}px` }"
        />

        <template
          v-for="section in sections"
          :key="section.column.id"
        >
          <div class="flex border-b border-default bg-elevated/40">
            <div class="sticky left-0 z-10 w-48 shrink-0 border-r border-default bg-elevated px-3 py-1.5 text-xs font-semibold text-default">
              {{ section.column.name }}
            </div>
          </div>
          <div
            v-for="task in section.tasks"
            :key="task.id"
            class="flex h-9 border-b border-default"
          >
            <button
              class="sticky left-0 z-10 w-48 shrink-0 truncate border-r border-default bg-default px-3 text-left text-sm text-default transition-colors hover:bg-elevated"
              @click="emit('openTask', task.id)"
            >
              {{ task.title }}
            </button>
            <div class="relative flex-1">
              <button
                class="absolute top-1.5 h-6 truncate rounded-md px-2 text-left text-xs transition-colors"
                :class="task.completedAt ? 'bg-success/25 text-default' : 'bg-primary/80 text-inverted hover:bg-primary'"
                :style="bar(task)"
                data-timeline-bar
                :title="task.title"
                @click="emit('openTask', task.id)"
              >
                {{ task.title }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
