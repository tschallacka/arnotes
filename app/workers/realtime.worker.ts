// The live-update socket, kept off the main thread.
//
// The socket, its heartbeat and its reconnect backoff live here, so a busy page
// cannot make a heartbeat late, and a tab in the background — whose main-thread
// timers the browser slows to a crawl — keeps its connection alive. The page
// stays in charge of what an event means: this only delivers them.
//
// Messages from the page: `start` with the socket's URL, `wake` when the tab
// comes back to the front, `stop`. Messages to the page: `status` when the
// connection opens or closes, `event` with each raw frame, and `gone` when the
// session is over and reconnecting would only fail again.

interface WorkerScope {
  postMessage: (message: unknown) => void
  onmessage: ((event: MessageEvent) => void) | null
}

const scope = self as unknown as WorkerScope

// The server closes with this code when the session behind the socket is gone.
const SESSION_GONE = 4401
const HEARTBEAT_MS = 30_000

let url = ''
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null
let attempt = 0
let stopped = true

function connect() {
  if (stopped || socket || !url) return

  try {
    socket = new WebSocket(url)
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    attempt = 0
    scope.postMessage({ type: 'status', connected: true })
    // Idle proxies drop a silent socket; a ping every 30s keeps it open.
    heartbeat = setInterval(() => socket?.send('ping'), HEARTBEAT_MS)
  }

  socket.onmessage = (raw) => {
    scope.postMessage({ type: 'event', data: raw.data as string })
  }

  socket.onclose = (closeEvent) => {
    teardown()
    if (closeEvent.code === SESSION_GONE) {
      stopped = true
      scope.postMessage({ type: 'gone' })
      return
    }
    scheduleReconnect()
  }

  socket.onerror = () => socket?.close()
}

function teardown() {
  scope.postMessage({ type: 'status', connected: false })
  if (heartbeat) {
    clearInterval(heartbeat)
    heartbeat = null
  }
  socket = null
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return
  // 1s, 2s, 4s … capped at 30s, so a restarted server is picked up quickly
  // without hammering one that is down.
  const delay = Math.min(1000 * 2 ** attempt++, 30_000)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function stop() {
  stopped = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  teardown()
}

scope.onmessage = (event: MessageEvent<{ type: string, url?: string }>) => {
  switch (event.data.type) {
    case 'start':
      url = event.data.url ?? url
      stopped = false
      connect()
      break
    case 'wake':
      // A tab that slept through a change comes back with a stale socket, or none.
      if (!socket) {
        attempt = 0
        connect()
      }
      break
    case 'stop':
      stop()
      break
  }
}
