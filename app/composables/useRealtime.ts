import { ref } from 'vue'

// The client half of the live-update feed. The socket carries no data, only the
// news that something in this workspace changed; the stores then refetch the
// slice it names. That keeps the screen honest when a change comes from
// somewhere this tab cannot see — an AI agent over MCP, a teammate, or the same
// user in another tab.

// The id on `projects` addresses one shared board and is only read by the
// public pages (see usePublicLive); a workspace client refetches the whole
// slice either way.
type RealtimeMessage
  = | { type: 'ready' }
    | { type: 'pong' }
    | { type: 'projects', projectId?: string }
    | { type: 'board', projectId: string }
    | { type: 'resource', projectId: string, resource: string }
    | { type: 'notification' }
    | { type: 'collection', collection: string }

// One id per tab, sent on connect and with every mutating request, so the server
// can leave the tab that caused a change out of the fan-out.
const _clientId = ref('')
const _connected = ref(false)

// The worker that holds the socket.
let worker: Worker | null = null

// Changes arrive in bursts — a drag writes a task, a board and a project row —
// so refetches are coalesced per slice.
const pending = { projects: false, boards: new Set<string>() }
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_DELAY = 250

function clientId(): string {
  if (!_clientId.value) {
    _clientId.value = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
  }
  return _clientId.value
}

/** Header that marks a request as this tab's own work. */
export function realtimeHeaders(): Record<string, string> {
  return import.meta.client ? { 'x-client-id': clientId() } : {}
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flush, FLUSH_DELAY)
}

async function flush() {
  flushTimer = null
  const { projects } = pending
  const boards = [...pending.boards]
  pending.projects = false
  pending.boards.clear()

  const { syncProjects, reloadBoardQuiet, activeProjectId, commentsTaskId, loadComments } = useProjects()

  // Goals and portfolios read their numbers off the boards, so board news moves them too.
  if (projects || boards.length) notifyCollections(['goals', 'portfolios'])

  const work: Promise<unknown>[] = []

  // Either kind of board news moves the sidebar's task counts and "edited" line.
  if (projects || boards.length) work.push(syncProjects())

  // Only the board on screen is worth fetching; the others are read on open. A
  // list change can also mean the open board was renamed or deleted elsewhere.
  const reload = new Set(boards.filter(projectId => projectId === activeProjectId.value))
  if (projects && activeProjectId.value) reload.add(activeProjectId.value)
  for (const projectId of reload) work.push(reloadBoardQuiet(projectId))

  // An update posted on the task whose panel is open should land in the thread
  // the user is reading, not wait for them to close and reopen it.
  if (commentsTaskId.value && reload.size) work.push(loadComments(commentsTaskId.value))

  await Promise.allSettled(work)
}

// Views that show a staff-only collection (messages, time, status updates) ask
// to hear when it changes, and refetch it themselves; the socket carries no data.
type ResourceListener = (projectId: string) => void
const resourceListeners = new Map<string, Set<ResourceListener>>()
const notificationListeners = new Set<() => void>()

/** Calls back when the named collection changes on any project; returns the way to stop listening. */
export function onResourceChange(resource: string, listener: ResourceListener): () => void {
  const listeners = resourceListeners.get(resource) ?? new Set<ResourceListener>()
  listeners.add(listener)
  resourceListeners.set(resource, listeners)
  return () => {
    listeners.delete(listener)
  }
}

/** Tells whoever shows the named workspace lists that they changed. */
function notifyCollections(names: string[]) {
  for (const name of names) for (const listener of resourceListeners.get(name) ?? []) listener('')
}

/** Calls back when something lands in this person's inbox. */
export function onNotification(listener: () => void): () => void {
  notificationListeners.add(listener)
  return () => {
    notificationListeners.delete(listener)
  }
}

/** `onResourceChange` for a component or composable: it stops listening when its scope ends. */
export function useResourceListener(resource: string, listener: ResourceListener) {
  const stop = onResourceChange(resource, listener)
  if (getCurrentScope()) onScopeDispose(stop)
}

function handle(message: RealtimeMessage) {
  switch (message.type) {
    case 'projects':
      pending.projects = true
      break
    case 'board':
      pending.boards.add(message.projectId)
      break
    case 'resource':
      for (const listener of resourceListeners.get(message.resource) ?? []) listener(message.projectId)
      // A goal or portfolio shows its projects' latest status update.
      if (message.resource === 'status-updates') notifyCollections(['goals', 'portfolios'])
      return
    case 'collection':
      notifyCollections([message.collection])
      return
    case 'notification':
      for (const listener of notificationListeners) listener()
      return
    default:
      // 'ready' and 'pong' are liveness only.
      return
  }
  scheduleFlush()
}

function connect() {
  if (!import.meta.client || worker) return

  const url = new URL('/_ws', window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('client', clientId())

  // The socket, its heartbeat and its reconnecting live in a worker, off the
  // main thread. A browser without workers has no live updates, and the app
  // reads what it fetched, as it always could.
  try {
    worker = new Worker(new URL('../workers/realtime.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    worker = null
    return
  }

  worker.onmessage = (event: MessageEvent<{ type: string, connected?: boolean, data?: string }>) => {
    const message = event.data
    if (message.type === 'status') {
      _connected.value = !!message.connected
    } else if (message.type === 'gone') {
      // The session is over; a worker that went on trying would only fail again.
      closeWorker()
    } else if (message.type === 'event' && typeof message.data === 'string') {
      try {
        handle(JSON.parse(message.data) as RealtimeMessage)
      } catch {
        // Not our message shape; nothing to do.
      }
    }
  }

  worker.postMessage({ type: 'start', url: url.toString() })
}

function closeWorker() {
  worker?.postMessage({ type: 'stop' })
  worker?.terminate()
  worker = null
  _connected.value = false
}

export function useRealtime() {
  function start() {
    connect()

    // A tab that slept through a change comes back with stale data, so waking up
    // reconnects and resyncs.
    document.addEventListener('visibilitychange', onVisible)
  }

  function onVisible() {
    if (document.visibilityState !== 'visible') return
    worker?.postMessage({ type: 'wake' })
    pending.projects = true
    scheduleFlush()
  }

  function stop() {
    document.removeEventListener('visibilitychange', onVisible)
    closeWorker()
  }

  return { connected: _connected, clientId: _clientId, start, stop }
}
