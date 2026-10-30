import { realtimeHeaders } from '~/composables/useRealtime'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'

// The shapes the GH6 task routes send. See the JSON contract on that task.
export type GithubVisibility = 'internal' | 'customer'
export type GithubErrorCode = 'not_found' | 'rate_limited' | 'refused' | 'unavailable'
export type GithubKind = 'issue' | 'pull' | 'branch' | 'workflow_run'

export interface GithubLabel { name: string, color: string }

export interface GithubComment { author: string | null, body: string, createdAt: string, htmlUrl: string }

export interface GithubPullSummary {
  number: number
  title: string
  state: 'open' | 'closed'
  merged: boolean
  draft: boolean
  author: string | null
  htmlUrl: string
  reviewState: 'approved' | 'changes_requested' | 'commented' | 'none'
}

export interface GithubIssueData {
  issue: {
    number: number
    title: string
    state: 'open' | 'closed'
    labels: GithubLabel[]
    assignees: string[]
    author: string | null
    body: string
    htmlUrl: string
    createdAt: string
    updatedAt: string
    closedAt: string | null
    commentCount: number
    comments: GithubComment[]
  }
  pulls: GithubPullSummary[]
}

export interface GithubCheckRun { name: string, status: string, conclusion: string | null, htmlUrl: string | null }

export interface GithubPullData extends GithubPullSummary {
  updatedAt: string
  mergedAt: string | null
  headRef: string
  headSha: string
  baseRef: string
  headBranchDeleted: boolean | null
  checks: { state: 'passing' | 'failing' | 'running' | 'none', runs: GithubCheckRun[] }
}

export interface GithubBranchData {
  name: string
  defaultBranch: string
  aheadBy: number
  behindBy: number
  lastCommit: { sha: string, message: string, author: string | null, date: string | null, htmlUrl: string } | null
}

export interface GithubRunData {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: string | null
  event: string
  headBranch: string
  headSha: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

export interface GithubLink {
  id: string
  kind: GithubKind
  owner: string
  repo: string
  ref: string
  url: string
  visibility: GithubVisibility
  createdAt: number
  data: GithubIssueData | GithubPullData | GithubBranchData | GithubRunData | null
  error: GithubErrorCode | null
  message: string | null
  fetchedAt: string | null
  nextRetryAt: string | null
}

export interface GithubSettings { defaultRepo: string | null, defaultVisibility: GithubVisibility }

const request = untypedFetch

/**
 * The GitHub links on a task, read from `/api/tasks/:id/github`. The board's
 * own reload is the live signal: a board event means a link may have changed
 * (this panel, a teammate or an agent), so the links are read again.
 */
export function useGithub(taskId: MaybeRefOrGetter<string>) {
  const { activeProjectId, board } = useProjects()

  const links = ref<GithubLink[]>([])
  const settings = ref<GithubSettings | null>(null)
  const loading = ref(false)
  const refreshing = ref(false)
  let latest = 0

  const url = () => `/api/tasks/${toValue(taskId)}/github`

  async function load() {
    const mine = ++latest
    loading.value = true
    try {
      const rows = await request<GithubLink[]>(url())
      if (mine === latest) links.value = rows
    } finally {
      if (mine === latest) loading.value = false
    }
  }

  // Staff only: a customer contact cannot read the project's defaults.
  async function loadSettings() {
    const projectId = activeProjectId.value
    if (!projectId) return
    settings.value = await request<GithubSettings>(`/api/projects/${projectId}/github`)
  }

  async function add(input: string, visibility: GithubVisibility): Promise<GithubLink> {
    const created = await request<GithubLink>(url(), {
      method: 'POST', headers: realtimeHeaders(), body: { input, visibility }
    })
    links.value = [...links.value, created]
    return created
  }

  // A 403 or 404 means the link was not removed; the caller says so.
  async function unlink(linkId: string) {
    await request(`${url()}/${linkId}`, { method: 'DELETE', headers: realtimeHeaders() })
    links.value = links.value.filter(link => link.id !== linkId)
  }

  async function refresh() {
    refreshing.value = true
    try {
      links.value = await request<GithubLink[]>(`${url()}/refresh`, { method: 'POST', headers: realtimeHeaders() })
    } finally {
      refreshing.value = false
    }
  }

  watch(() => toValue(taskId), () => {
    links.value = []
    load()
  }, { immediate: true })

  watch(board, () => {
    if (!refreshing.value) load()
  })

  return {
    links,
    settings,
    loading,
    refreshing,
    load,
    loadSettings,
    add,
    unlink,
    refresh,
    messageOf: errorMessage
  }
}
