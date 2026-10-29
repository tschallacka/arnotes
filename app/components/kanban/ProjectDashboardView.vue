<script setup lang="ts">
import { addDays, format, startOfDay } from 'date-fns'
import { terminalColumnIds } from '#shared/utils/board'
import { isOverdueDay } from '~/utils/dueDate'
import { colorHex } from '#shared/utils/colors'
import { errorMessage } from '~/utils/untypedFetch'

const { board, boardColumns, isTrashed, activeProject, activeProjectId, updateProjectDetails, personById } = useProjects()
const { fields, valueOf } = useCustomFields(activeProjectId)
const toast = useToast()

const columns = computed(() => boardColumns.value.filter(column => !isTrashed(column)))
const tasks = computed(() => (board.value?.tasks ?? []).filter(task => !isTrashed(task)))
const terminal = computed(() => new Set(terminalColumnIds(columns.value)))

function isDone(task: { completedAt?: number | null, columnId: string }) {
  return !!task.completedAt || terminal.value.has(task.columnId)
}

const completed = computed(() => tasks.value.filter(isDone))
const incomplete = computed(() => tasks.value.filter(task => !isDone(task)))
const overdue = computed(() =>
  incomplete.value.filter(task => task.dueOn && isOverdueDay(task.dueOn))
)

const tiles = computed(() => [
  { label: 'Completed tasks', value: completed.value.length },
  { label: 'Incomplete tasks', value: incomplete.value.length },
  { label: 'Overdue tasks', value: overdue.value.length, alert: overdue.value.length > 0 },
  { label: 'Total tasks', value: tasks.value.length }
])

const bySection = computed(() => {
  const rows = columns.value.map(column => ({
    name: column.name,
    count: incomplete.value.filter(task => task.columnId === column.id).length
  }))
  return { rows, max: Math.max(1, ...rows.map(row => row.count)) }
})

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const donutDone = computed(() =>
  tasks.value.length ? (completed.value.length / tasks.value.length) * CIRCUMFERENCE : 0
)

const DAYS = 14

const overTime = computed(() => {
  const start = addDays(startOfDay(new Date()), -(DAYS - 1))
  const points = Array.from({ length: DAYS }, (_, i) => {
    const day = addDays(start, i)
    const end = addDays(day, 1).getTime()
    return {
      label: format(day, 'M/d'),
      done: tasks.value.filter(task => task.completedAt && task.completedAt < end).length
    }
  })
  return { points, total: tasks.value.length }
})

const CHART_W = 560
const CHART_H = 140

const linePath = computed(() => {
  const { points, total } = overTime.value
  const top = Math.max(1, total)
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * CHART_W,
    y: CHART_H - (p.done / top) * CHART_H
  }))
  const line = coords.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return { line, area: `${line} L${CHART_W},${CHART_H} L0,${CHART_H} Z` }
})

// ─── Which widgets, in what order ───────────────────────────
// The layout is the project's own: whoever customises it changes it for
// everyone on the project. No saved layout means the default set.

const DEFAULT_WIDGETS = ['tiles', 'sections', 'completion', 'timeline']

const BUILT_IN_WIDGETS = [
  { id: 'tiles', title: 'Task counts', wide: true },
  { id: 'sections', title: 'Incomplete tasks by section', wide: false },
  { id: 'completion', title: 'Tasks by completion status', wide: false },
  { id: 'assignees', title: 'Incomplete tasks by assignee', wide: false },
  { id: 'timeline', title: 'Task completion over time', wide: true }
]

// Every dropdown custom field can be charted too.
const catalog = computed(() => [
  ...BUILT_IN_WIDGETS,
  ...fields.value.filter(field => field.type === 'select').map(field => ({ id: `field:${field.id}`, title: `Tasks by ${field.name}`, wide: false }))
])

// A saved id for a field that has since been deleted is skipped, not an error.
const widgets = computed(() => {
  const saved = activeProject.value?.dashboardWidgets ?? DEFAULT_WIDGETS
  return saved.flatMap(id => catalog.value.find(widget => widget.id === id) ?? [])
})

const hiddenWidgets = computed(() => catalog.value.filter(widget => !widgets.value.some(shown => shown.id === widget.id)))
const customised = computed(() => !!activeProject.value?.dashboardWidgets)
const editing = ref(false)

async function saveLayout(ids: string[] | null) {
  if (!activeProject.value) return
  try {
    await updateProjectDetails(activeProject.value.id, { dashboardWidgets: ids })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save the dashboard'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

function moveWidget(id: string, by: -1 | 1) {
  const ids = widgets.value.map(widget => widget.id)
  const from = ids.indexOf(id)
  const to = from + by
  if (from < 0 || to < 0 || to >= ids.length) return
  ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
  return saveLayout(ids)
}

function hideWidget(id: string) {
  return saveLayout(widgets.value.map(widget => widget.id).filter(shown => shown !== id))
}

function showWidget(id: string) {
  return saveLayout([...widgets.value.map(widget => widget.id), id])
}

function resetLayout() {
  return saveLayout(null)
}

// ─── The two widgets that are not about stages ──────────────

const assigneeRows = computed(() => {
  const counts = new Map<string, number>()
  for (const task of incomplete.value) counts.set(task.assigneeId ?? '', (counts.get(task.assigneeId ?? '') ?? 0) + 1)
  const rows = [...counts].map(([id, count]) => ({ name: id ? (personById(id)?.name || personById(id)?.email || 'Someone') : 'Unassigned', count }))
    .sort((a, b) => b.count - a.count)
  return { rows, max: Math.max(1, ...rows.map(row => row.count)) }
})

// A dropdown field's spread over every task: one bar per option, and the tasks
// that have not chosen one.
function fieldRows(widgetId: string) {
  const field = fields.value.find(candidate => `field:${candidate.id}` === widgetId)
  if (!field) return { rows: [], max: 1 }
  const counts = new Map<string, number>()
  for (const task of tasks.value) {
    const chosen = field.options.some(option => option.id === valueOf(task.id, field.id)) ? valueOf(task.id, field.id)! : ''
    counts.set(chosen, (counts.get(chosen) ?? 0) + 1)
  }
  const rows = [
    ...field.options.map(option => ({ name: option.label, color: colorHex(option.color), count: counts.get(option.id) ?? 0 })),
    { name: 'None', color: '', count: counts.get('') ?? 0 }
  ]
  return { rows, max: Math.max(1, ...rows.map(row => row.count)) }
}
</script>

<template>
  <div class="h-full overflow-y-auto px-4 pb-10 pt-4 lg:px-6">
    <div class="mb-3 flex items-center justify-end gap-2">
      <UButton
        v-if="editing && customised"
        label="Reset to default"
        size="xs"
        color="neutral"
        variant="ghost"
        data-dashboard-reset
        @click="resetLayout"
      />
      <UButton
        :label="editing ? 'Done' : 'Customize'"
        :icon="editing ? 'i-lucide-check' : 'i-lucide-sliders-horizontal'"
        size="xs"
        color="neutral"
        variant="soft"
        data-dashboard-customize
        @click="editing = !editing"
      />
    </div>

    <div class="grid gap-3 lg:grid-cols-2">
      <section
        v-for="(widget, index) in widgets"
        :key="widget.id"
        class="relative"
        :class="[widget.wide ? 'lg:col-span-2' : '', editing ? 'rounded-xl ring-2 ring-primary/30 ring-offset-2 ring-offset-default' : '']"
        :data-widget="widget.id"
      >
        <div
          v-if="editing"
          class="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-default bg-default p-0.5 shadow-sm"
        >
          <UButton
            icon="i-lucide-arrow-up"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Move up"
            :disabled="index === 0"
            data-widget-up
            @click="moveWidget(widget.id, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Move down"
            :disabled="index === widgets.length - 1"
            data-widget-down
            @click="moveWidget(widget.id, 1)"
          />
          <UButton
            icon="i-lucide-eye-off"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Hide widget"
            data-widget-hide
            @click="hideWidget(widget.id)"
          />
        </div>

        <div
          v-if="widget.id === 'tiles'"
          class="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <div
            v-for="tile in tiles"
            :key="tile.label"
            class="rounded-xl border border-default bg-default p-4 transition-shadow hover:shadow-sm"
          >
            <p class="text-sm font-medium text-muted">
              {{ tile.label }}
            </p>
            <p
              class="mt-2 text-4xl font-semibold tabular-nums"
              :class="tile.alert ? 'text-error' : 'text-default'"
              :data-tile="tile.label"
            >
              {{ tile.value }}
            </p>
          </div>
        </div>

        <div
          v-else-if="widget.id === 'sections'"
          class="h-full rounded-xl border border-default bg-default p-4"
        >
          <h3 class="text-sm font-semibold text-default">
            {{ widget.title }}
          </h3>
          <ul class="mt-4 space-y-2.5">
            <li
              v-for="row in bySection.rows"
              :key="row.name"
              class="flex items-center gap-3"
            >
              <span class="w-28 shrink-0 truncate text-xs text-muted">{{ row.name }}</span>
              <span class="h-5 min-w-0 flex-1 rounded bg-elevated">
                <span
                  class="block h-full rounded bg-primary/70 transition-all duration-500"
                  :style="{ width: `${(row.count / bySection.max) * 100}%` }"
                />
              </span>
              <span class="w-6 shrink-0 text-right text-xs tabular-nums text-default">{{ row.count }}</span>
            </li>
          </ul>
        </div>

        <div
          v-else-if="widget.id === 'completion'"
          class="h-full rounded-xl border border-default bg-default p-4"
        >
          <h3 class="text-sm font-semibold text-default">
            {{ widget.title }}
          </h3>
          <div class="mt-4 flex items-center justify-center gap-8">
            <svg
              viewBox="0 0 128 128"
              class="size-40"
              role="img"
              aria-label="Completed versus incomplete tasks"
            >
              <circle
                cx="64"
                cy="64"
                :r="RADIUS"
                fill="none"
                stroke="var(--ui-bg-accented)"
                stroke-width="16"
              />
              <circle
                cx="64"
                cy="64"
                :r="RADIUS"
                fill="none"
                stroke="var(--ui-primary)"
                stroke-width="16"
                stroke-linecap="butt"
                :stroke-dasharray="`${donutDone} ${CIRCUMFERENCE}`"
                transform="rotate(-90 64 64)"
                class="transition-all duration-700"
              />
              <text
                x="64"
                y="70"
                text-anchor="middle"
                class="fill-current text-2xl font-semibold text-default"
              >
                {{ tasks.length }}
              </text>
            </svg>
            <ul class="space-y-2 text-xs text-muted">
              <li class="flex items-center gap-2">
                <span class="size-2.5 rounded-sm bg-primary" />Completed ({{ completed.length }})
              </li>
              <li class="flex items-center gap-2">
                <span class="size-2.5 rounded-sm bg-accented" />Incomplete ({{ incomplete.length }})
              </li>
            </ul>
          </div>
        </div>

        <div
          v-else-if="widget.id === 'assignees'"
          class="h-full rounded-xl border border-default bg-default p-4"
        >
          <h3 class="text-sm font-semibold text-default">
            {{ widget.title }}
          </h3>
          <ul class="mt-4 space-y-2.5">
            <li
              v-for="row in assigneeRows.rows"
              :key="row.name"
              class="flex items-center gap-3"
              data-assignee-row
            >
              <span class="w-28 shrink-0 truncate text-xs text-muted">{{ row.name }}</span>
              <span class="h-5 min-w-0 flex-1 rounded bg-elevated">
                <span
                  class="block h-full rounded bg-primary/70 transition-all duration-500"
                  :style="{ width: `${(row.count / assigneeRows.max) * 100}%` }"
                />
              </span>
              <span class="w-6 shrink-0 text-right text-xs tabular-nums text-default">{{ row.count }}</span>
            </li>
            <li
              v-if="!assigneeRows.rows.length"
              class="text-xs text-dimmed"
            >
              Nothing left to do.
            </li>
          </ul>
        </div>

        <div
          v-else-if="widget.id.startsWith('field:')"
          class="h-full rounded-xl border border-default bg-default p-4"
        >
          <h3 class="text-sm font-semibold text-default">
            {{ widget.title }}
          </h3>
          <ul class="mt-4 space-y-2.5">
            <li
              v-for="row in fieldRows(widget.id).rows"
              :key="row.name"
              class="flex items-center gap-3"
              data-field-row-bar
            >
              <span class="w-28 shrink-0 truncate text-xs text-muted">{{ row.name }}</span>
              <span class="h-5 min-w-0 flex-1 rounded bg-elevated">
                <span
                  class="block h-full rounded transition-all duration-500"
                  :class="row.color ? '' : 'bg-accented'"
                  :style="{ width: `${(row.count / fieldRows(widget.id).max) * 100}%`, ...(row.color ? { backgroundColor: row.color } : {}) }"
                />
              </span>
              <span class="w-6 shrink-0 text-right text-xs tabular-nums text-default">{{ row.count }}</span>
            </li>
          </ul>
        </div>

        <div
          v-else-if="widget.id === 'timeline'"
          class="rounded-xl border border-default bg-default p-4"
        >
          <h3 class="text-sm font-semibold text-default">
            {{ widget.title }}
          </h3>
          <svg
            :viewBox="`-24 -4 ${CHART_W + 48} ${CHART_H + 28}`"
            class="mt-4 h-44 w-full"
            role="img"
            aria-label="Completed tasks over the last 14 days"
          >
            <path
              :d="linePath.area"
              fill="var(--ui-primary)"
              fill-opacity="0.15"
            />
            <path
              :d="linePath.line"
              fill="none"
              stroke="var(--ui-primary)"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <text
              v-for="(point, i) in overTime.points"
              v-show="i % 2 === 0"
              :key="point.label"
              :x="(i / (overTime.points.length - 1)) * CHART_W"
              :y="CHART_H + 18"
              text-anchor="middle"
              class="fill-current text-[10px] text-dimmed"
            >
              {{ point.label }}
            </text>
          </svg>
        </div>
      </section>
    </div>

    <div
      v-if="editing"
      class="mt-4 rounded-xl border border-dashed border-default p-4"
      data-widget-picker
    >
      <p class="text-sm font-medium text-default">
        Add a widget
      </p>
      <div
        v-if="hiddenWidgets.length"
        class="mt-3 flex flex-wrap gap-2"
      >
        <button
          v-for="widget in hiddenWidgets"
          :key="widget.id"
          class="flex items-center gap-1.5 rounded-lg border border-default px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-elevated hover:text-default"
          :data-widget-add="widget.id"
          @click="showWidget(widget.id)"
        >
          <UIcon
            name="i-lucide-plus"
            class="size-3.5"
          />
          {{ widget.title }}
        </button>
      </div>
      <p
        v-else
        class="mt-2 text-xs text-dimmed"
      >
        Every widget is already on the dashboard.
      </p>
    </div>
  </div>
</template>
