import { errorMessage, untypedFetch } from '~/utils/untypedFetch'

export interface ProjectSummary {
  id: string
  name: string
  status: string | null
  customerId: string | null
  updatedAt: number
  total: number
  done: number
  percent: number
  latestUpdate: { status: string, body: string, createdAt: number } | null
}

export interface Goal {
  id: string
  title: string
  description: string
  status: string | null
  progress: number
  manualProgress: number
  progressFromProjects: boolean
  dueOn: string | null
  parentId: string | null
  owner: { id: string, name: string, image: string | null } | null
  projects: ProjectSummary[]
  createdAt: number
  updatedAt: number
}

export interface Portfolio {
  id: string
  name: string
  description: string
  projects: ProjectSummary[]
  health: Record<'on_track' | 'at_risk' | 'off_track' | 'unset', number>
  percent: number
  createdAt: number
  updatedAt: number
}

/** How a status reads and what colour it takes, for goals and for project health alike. */
export const HEALTH = [
  { key: 'on_track', label: 'On track', dot: 'bg-success' },
  { key: 'at_risk', label: 'At risk', dot: 'bg-warning' },
  { key: 'off_track', label: 'Off track', dot: 'bg-error' }
] as const

export const GOAL_STATUSES = [
  ...HEALTH,
  { key: 'achieved', label: 'Achieved', dot: 'bg-primary' },
  { key: 'dropped', label: 'Dropped', dot: 'bg-neutral-400' }
] as const

export function statusMeta(key: string | null) {
  return GOAL_STATUSES.find(status => status.key === key) ?? null
}

// Goals and portfolios are the workspace's own, so one list of each serves every
// page. A change answers with the row as stored and replaces it here.
const _goals = ref<Goal[]>([])
const _portfolios = ref<Portfolio[]>([])

function replace<T extends { id: string }>(list: Ref<T[]>, row: T) {
  list.value = list.value.some(item => item.id === row.id)
    ? list.value.map(item => item.id === row.id ? row : item)
    : [row, ...list.value]
}

export function useGoals() {
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      _goals.value = await untypedFetch<Goal[]>('/api/goals')
    } finally {
      loading.value = false
    }
  }

  async function create(body: Record<string, unknown>) {
    const row = await untypedFetch<Goal>('/api/goals', { method: 'POST', body })
    replace(_goals, row)
    return row
  }

  async function update(id: string, body: Record<string, unknown>) {
    const row = await untypedFetch<Goal>(`/api/goals/${id}`, { method: 'PUT', body })
    replace(_goals, row)
    // Sub-goals do not change with their parent, but a goal moved under another does.
    return row
  }

  async function remove(id: string) {
    await untypedFetch(`/api/goals/${id}`, { method: 'DELETE' })
    _goals.value = _goals.value.filter(goal => goal.id !== id).map(goal => goal.parentId === id ? { ...goal, parentId: null } : goal)
  }

  return { goals: _goals, loading, load, create, update, remove, errorMessage }
}

export function usePortfolios() {
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      _portfolios.value = await untypedFetch<Portfolio[]>('/api/portfolios')
    } finally {
      loading.value = false
    }
  }

  async function create(body: Record<string, unknown>) {
    const row = await untypedFetch<Portfolio>('/api/portfolios', { method: 'POST', body })
    replace(_portfolios, row)
    return row
  }

  async function update(id: string, body: Record<string, unknown>) {
    const row = await untypedFetch<Portfolio>(`/api/portfolios/${id}`, { method: 'PUT', body })
    replace(_portfolios, row)
    return row
  }

  async function remove(id: string) {
    await untypedFetch(`/api/portfolios/${id}`, { method: 'DELETE' })
    _portfolios.value = _portfolios.value.filter(portfolio => portfolio.id !== id)
  }

  return { portfolios: _portfolios, loading, load, create, update, remove, errorMessage }
}
