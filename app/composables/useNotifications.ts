import { onNotification, realtimeHeaders } from '~/composables/useRealtime'
import { errorMessage, untypedFetch } from '~/utils/untypedFetch'

export interface NotificationItem {
  id: string
  type: 'assigned' | 'comment' | 'message' | 'reply'
  projectId: string
  projectName: string
  taskId: string | null
  taskTitle: string | null
  title: string
  body: string
  createdAt: number
  readAt: number | null
  actorName: string | null
  actorImage: string | null
}

export interface NotificationPreferences {
  email: boolean
  browser: boolean
  /** Whether this server can send mail at all. */
  mailEnabled: boolean
}

const request = untypedFetch

// One inbox for the whole app: the sidebar badge and the Inbox page read it.
const _items = ref<NotificationItem[]>([])
const _unread = ref(0)
const _prefs = ref<NotificationPreferences>({ email: false, browser: false, mailEnabled: false })
const _loaded = ref(false)
// What has already been shown as a desktop notification, so a refetch does not
// show it twice.
const announced = new Set<string>()
let started = false

/** Where a notification leads: the task it is about, or the conversation. */
export function notificationLink(item: Pick<NotificationItem, 'type' | 'projectId' | 'taskId'>): string {
  if (item.taskId) return `/projects/${item.projectId}?task=${item.taskId}`
  if (item.type === 'message' || item.type === 'reply') return `/projects/${item.projectId}?view=messages`
  return `/projects/${item.projectId}`
}

function desktopCanShow(): boolean {
  return import.meta.client
    && _prefs.value.browser
    && 'Notification' in window
    && Notification.permission === 'granted'
    // A tab you are looking at already shows it; the desktop is for when you are not.
    && document.visibilityState !== 'visible'
}

function showDesktop(item: NotificationItem) {
  try {
    const shown = new Notification(item.title, { body: item.body, tag: item.id })
    shown.onclick = () => {
      window.focus()
      navigateTo(notificationLink(item))
      shown.close()
    }
  } catch { /* a browser that refuses is a browser that does not get one */ }
}

async function load() {
  try {
    const res = await request<{ unread: number, items: NotificationItem[] }>('/api/notifications')
    const fresh = res.items.filter(item => !item.readAt && !announced.has(item.id))
    for (const item of fresh) announced.add(item.id)
    // The first read only learns what is already there; it announces nothing.
    if (_loaded.value && desktopCanShow()) fresh.forEach(showDesktop)
    _items.value = res.items
    _unread.value = res.unread
    _loaded.value = true
  } catch { /* signed out, or offline: the inbox stays as it was */ }
}

async function loadPreferences() {
  try {
    _prefs.value = await request<NotificationPreferences>('/api/notifications/preferences')
  } catch { /* as above */ }
}

export function useNotifications() {
  async function markRead(ids: string[]) {
    const now = Date.now()
    const unread = _items.value.filter(item => ids.includes(item.id) && !item.readAt).length
    _items.value = _items.value.map(item => ids.includes(item.id) && !item.readAt ? { ...item, readAt: now } : item)
    _unread.value = Math.max(0, _unread.value - unread)
    await request('/api/notifications/read', { method: 'POST', headers: realtimeHeaders(), body: { ids } })
  }

  async function markAllRead() {
    const now = Date.now()
    _items.value = _items.value.map(item => item.readAt ? item : { ...item, readAt: now })
    _unread.value = 0
    await request('/api/notifications/read', { method: 'POST', headers: realtimeHeaders(), body: { all: true } })
  }

  /** Turns a way of being told on or off; a desktop notification needs the browser's permission first. */
  async function setPreference(key: 'email' | 'browser', value: boolean): Promise<string | null> {
    if (key === 'browser' && value) {
      if (!('Notification' in window)) return 'This browser cannot show desktop notifications'
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') return 'Allow notifications for this site in the browser, then try again'
    }
    try {
      _prefs.value = await request<NotificationPreferences>('/api/notifications/preferences', {
        method: 'PUT', headers: realtimeHeaders(), body: { [key]: value }
      })
      return null
    } catch (e) {
      return errorMessage(e, 'Could not save that')
    }
  }

  /** Loads the inbox and keeps it live; safe to call from anywhere, it runs once. */
  function init() {
    if (started || !import.meta.client) return
    started = true
    load()
    loadPreferences()
    onNotification(load)
    // A tab that slept through some comes back to a stale count.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load()
    })
  }

  return { items: _items, unread: _unread, prefs: _prefs, loaded: _loaded, load, markRead, markAllRead, setPreference, init }
}
