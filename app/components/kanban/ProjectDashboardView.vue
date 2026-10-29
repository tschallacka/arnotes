<script setup lang="ts">
import { addDays, format, startOfDay } from 'date-fns'
import { terminalColumnIds } from '#shared/utils/board'
import { isOverdueDay } from '~/utils/dueDate'

const { board, boardColumns, isTrashed } = useProjects()

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
</script>

<template>
  <div class="h-full overflow-y-auto px-4 pb-10 pt-4 lg:px-6">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

    <div class="mt-3 grid gap-3 lg:grid-cols-2">
      <section class="rounded-xl border border-default bg-default p-4">
        <h3 class="text-sm font-semibold text-default">
          Incomplete tasks by section
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
      </section>

      <section class="rounded-xl border border-default bg-default p-4">
        <h3 class="text-sm font-semibold text-default">
          Tasks by completion status
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
      </section>

      <section class="rounded-xl border border-default bg-default p-4 lg:col-span-2">
        <h3 class="text-sm font-semibold text-default">
          Task completion over time
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
      </section>
    </div>
  </div>
</template>
