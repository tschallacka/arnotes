<script setup lang="ts">
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { dueDayToMs, isOverdueDay, todayIso } from '~/utils/dueDate'
import type { TaskSearchRow } from '~/composables/useProjects'

// My tasks as Asana draws it: columns for when work is due rather than for
// stages. Dragging a card to another column reschedules it; the columns are the
// same buckets a task falls into by its due date, so a card never stays where
// its date says it does not belong.
const props = defineProps<{ tasks: TaskSearchRow[] }>()

const emit = defineEmits<{
  open: [task: TaskSearchRow]
  complete: [task: TaskSearchRow]
  schedule: [taskId: string, dueOn: string | null]
}>()

const iso = (date: Date) => format(date, 'yyyy-MM-dd')

type Bucket = 'overdue' | 'today' | 'upcoming' | 'later' | 'none'

const columns = computed(() => {
  const today = todayIso()
  const todayDate = new Date(dueDayToMs(today))
  return [
    // What dropping into a column sets. Overdue has none: a task cannot be
    // scheduled into the past from here.
    { key: 'overdue' as Bucket, title: 'Overdue', hint: 'Past due', dot: 'bg-error', drop: undefined },
    { key: 'today' as Bucket, title: 'Today', hint: format(todayDate, 'EEE, MMM d'), dot: 'bg-primary', drop: today },
    { key: 'upcoming' as Bucket, title: 'Upcoming', hint: 'Next 7 days', dot: 'bg-sky-500', drop: iso(addDays(todayDate, 7)) },
    { key: 'later' as Bucket, title: 'Later', hint: 'After that', dot: 'bg-violet-500', drop: iso(addDays(todayDate, 14)) },
    { key: 'none' as Bucket, title: 'No date', hint: 'Not scheduled', dot: 'bg-dimmed', drop: null }
  ]
})

function bucketOf(task: TaskSearchRow): Bucket {
  if (!task.dueOn) return 'none'
  if (isOverdueDay(task.dueOn)) return 'overdue'
  const days = differenceInCalendarDays(new Date(dueDayToMs(task.dueOn)), new Date(dueDayToMs(todayIso())))
  if (days === 0) return 'today'
  return days <= 7 ? 'upcoming' : 'later'
}

const grouped = computed(() => {
  const groups: Record<Bucket, TaskSearchRow[]> = { overdue: [], today: [], upcoming: [], later: [], none: [] }
  for (const task of props.tasks) {
    if (task.completedAt == null) groups[bucketOf(task)].push(task)
  }
  for (const list of Object.values(groups)) list.sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
  return groups
})

// ─── Drag and drop ──────────────────────────────────────────

const dragging = ref<string | null>(null)
const over = ref<Bucket | null>(null)

function onDragStart(event: DragEvent, task: TaskSearchRow) {
  dragging.value = task.id
  event.dataTransfer?.setData('text/plain', task.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragEnd() {
  dragging.value = null
  over.value = null
}

function onDragOver(event: DragEvent, key: Bucket, droppable: boolean) {
  if (!droppable) return
  event.preventDefault()
  over.value = key
}

function onDrop(event: DragEvent, column: { key: Bucket, drop: string | null | undefined }) {
  const id = event.dataTransfer?.getData('text/plain') ?? dragging.value
  const task = props.tasks.find(candidate => candidate.id === id)
  onDragEnd()
  if (!task || column.drop === undefined || bucketOf(task) === column.key) return
  emit('schedule', task.id, column.drop)
}

function dueLabel(day: string) {
  return format(dueDayToMs(day), 'MMM d')
}
</script>

<template>
  <div
    class="flex h-full min-h-0 gap-3 overflow-x-auto px-4 pb-4 pt-4 lg:px-6"
    data-my-board
  >
    <section
      v-for="column in columns"
      :key="column.key"
      class="flex min-w-56 flex-1 flex-col rounded-xl border bg-elevated/40 transition-colors"
      :class="over === column.key ? 'border-primary bg-primary/5' : 'border-default'"
      :data-board-column="column.key"
      @dragover="onDragOver($event, column.key, column.drop !== undefined)"
      @dragleave="over === column.key && (over = null)"
      @drop.prevent="onDrop($event, column)"
    >
      <header class="flex items-center gap-2 px-3 pb-1 pt-3">
        <span
          class="size-2 rounded-full"
          :class="column.dot"
        />
        <h3 class="text-sm font-semibold text-default">
          {{ column.title }}
        </h3>
        <span class="text-xs tabular-nums text-dimmed">{{ grouped[column.key].length }}</span>
        <span class="ml-auto truncate text-xs text-dimmed">{{ column.hint }}</span>
      </header>

      <ul class="min-h-24 flex-1 space-y-2 overflow-y-auto px-2 pb-3 pt-1">
        <li
          v-for="task in grouped[column.key]"
          :key="task.id"
          draggable="true"
          class="group cursor-pointer rounded-lg border border-default bg-default px-3 py-2.5 transition-all hover:border-primary/40 hover:shadow-sm"
          :class="dragging === task.id ? 'opacity-40' : ''"
          data-board-card
          @dragstart="onDragStart($event, task)"
          @dragend="onDragEnd"
          @click="emit('open', task)"
        >
          <div class="flex items-start gap-2">
            <button
              class="mt-px flex size-4 shrink-0 items-center justify-center rounded-full border border-accented text-transparent transition-all hover:border-success hover:text-success"
              aria-label="Mark complete"
              @click.stop="emit('complete', task)"
            >
              <UIcon
                name="i-lucide-check"
                class="size-2.5"
              />
            </button>
            <p class="line-clamp-2 text-sm font-medium leading-snug text-default">
              {{ task.title }}
            </p>
          </div>
          <div class="mt-2 flex items-center gap-2 text-xs">
            <span class="flex min-w-0 items-center gap-1.5 truncate rounded-md bg-elevated px-1.5 py-0.5 text-muted">
              <span class="size-1.5 shrink-0 rounded-full bg-primary" />
              <span class="truncate">{{ task.projectName }}</span>
            </span>
            <span
              v-if="task.dueOn"
              class="ml-auto shrink-0 tabular-nums"
              :class="column.key === 'overdue' ? 'font-medium text-error' : 'text-dimmed'"
            >{{ dueLabel(task.dueOn) }}</span>
          </div>
        </li>

        <li
          v-if="!grouped[column.key].length"
          class="rounded-lg border border-dashed border-default px-3 py-6 text-center text-xs text-dimmed"
        >
          {{ column.drop === undefined ? 'Nothing overdue' : 'Drop a task here' }}
        </li>
      </ul>
    </section>
  </div>
</template>
