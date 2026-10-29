import { realtimeHeaders } from '~/composables/useRealtime'
import { parseDuration } from '#shared/utils/duration'
import { todayIso } from '~/utils/dueDate'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'

export interface TimeEntry {
  id: string
  taskId: string
  taskTitle: string
  projectId: string
  projectName: string
  minutes: number
  day: string
  note: string
  createdAt: number
  author: { id: string, name: string, image: string | null }
}

export interface RunningTimer {
  taskId: string
  startedAt: number
  taskTitle: string
  projectId: string
  projectName: string
}

const request = untypedFetch

// The signed-in person's one running timer, shared by every place that shows it.
const _timer = ref<RunningTimer | null>(null)
const _now = ref(Date.now())
// Bumped whenever a timer is started or stopped, because either may have logged
// an entry that a task's list has not seen.
const _revision = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null

// One clock for every elapsed display, running only while a timer is.
watch(_timer, (timer) => {
  if (!import.meta.client) return
  if (timer && !ticker) {
    _now.value = Date.now()
    ticker = setInterval(() => {
      _now.value = Date.now()
    }, 1000)
  } else if (!timer && ticker) {
    clearInterval(ticker)
    ticker = null
  }
}, { immediate: true })

export function useRunningTimer() {
  const elapsedMs = computed(() => _timer.value ? Math.max(0, _now.value - _timer.value.startedAt) : 0)

  async function load() {
    try {
      _timer.value = (await request<{ timer: RunningTimer | null }>('/api/timer')).timer
    } catch { /* not signed in, or offline: no timer to show */ }
  }

  async function start(taskId: string) {
    const res = await request<{ timer: RunningTimer | null }>('/api/timer', {
      method: 'POST', headers: realtimeHeaders(), body: { taskId, day: todayIso() }
    })
    _timer.value = res.timer
    _revision.value++
  }

  async function stop() {
    await request('/api/timer', { method: 'DELETE', headers: realtimeHeaders(), query: { day: todayIso() } })
    _timer.value = null
    _revision.value++
  }

  return { timer: _timer, elapsedMs, revision: _revision, load, start, stop }
}

/** One task's logged time and what it takes to add to it or take from it. */
export function useTaskTime(taskId: MaybeRefOrGetter<string | null | undefined>) {
  const entries = ref<TimeEntry[]>([])
  const loading = ref(false)
  let latest = 0

  const totalMinutes = computed(() => entries.value.reduce((sum, entry) => sum + entry.minutes, 0))

  async function load() {
    const id = toValue(taskId)
    const mine = ++latest
    if (!id) {
      entries.value = []
      return
    }
    loading.value = true
    try {
      const rows = await request<TimeEntry[]>(`/api/tasks/${id}/time`)
      if (mine === latest) entries.value = rows
    } catch {
      if (mine === latest) entries.value = []
    } finally {
      if (mine === latest) loading.value = false
    }
  }

  /** Throws a readable message when the duration is not one. */
  async function log(duration: string, day: string, note: string) {
    const minutes = parseDuration(duration)
    if (minutes === null) throw new Error('Write the time like 1h 30m, 1:30 or 45m')
    const created = await request<TimeEntry>(`/api/tasks/${toValue(taskId)}/time`, {
      method: 'POST', headers: realtimeHeaders(), body: { minutes, day, note }
    })
    entries.value = [created, ...entries.value].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt)
    return created
  }

  async function remove(entryId: string) {
    await request(`/api/time/${entryId}`, { method: 'DELETE', headers: realtimeHeaders() })
    entries.value = entries.value.filter(entry => entry.id !== entryId)
  }

  watch(() => toValue(taskId), load, { immediate: true })
  // A timer stopped elsewhere has logged an entry on this task.
  watch(_revision, load)

  return { entries, loading, totalMinutes, load, log, remove, errorMessage }
}
