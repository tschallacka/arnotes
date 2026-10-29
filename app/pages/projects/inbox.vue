<script setup lang="ts">
import { format } from 'date-fns'
import { relativeTime } from '~/composables/useRelativeTime'
import { dueDayToMs } from '~/utils/dueDate'
import { notificationLink } from '~/composables/useNotifications'
import type { NotificationItem } from '~/composables/useNotifications'

definePageMeta({ layout: 'app' })

const { sidebarOpen } = useSidebar()
useSeoMeta({ title: 'Inbox' })

const { items, unread, prefs, loaded, load, markRead, markAllRead, setPreference } = useNotifications()
onMounted(load)

const filter = ref<'all' | 'unread'>('all')
const shown = computed(() => filter.value === 'unread' ? items.value.filter(item => !item.readAt) : items.value)

// Grouped by the day they arrived, newest day first.
const byDay = computed(() => {
  const groups = new Map<string, NotificationItem[]>()
  for (const item of shown.value) {
    const day = format(item.createdAt, 'yyyy-MM-dd')
    groups.set(day, [...(groups.get(day) ?? []), item])
  }
  return [...groups]
})

function dayLabel(day: string) {
  const today = format(Date.now(), 'yyyy-MM-dd')
  const yesterday = format(Date.now() - 86_400_000, 'yyyy-MM-dd')
  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  return format(dueDayToMs(day), 'EEEE, MMM d')
}

async function open(item: NotificationItem) {
  if (!item.readAt) markRead([item.id])
  await navigateTo(notificationLink(item))
}

const settingsOpen = ref(false)
const settingsError = ref('')

async function toggle(key: 'email' | 'browser') {
  settingsError.value = (await setPreference(key, !prefs.value[key])) ?? ''
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="flex shrink-0 items-center gap-2 border-b border-default px-4 py-3 lg:px-6">
      <UButton
        icon="i-lucide-panel-left"
        color="neutral"
        variant="ghost"
        size="sm"
        class="lg:hidden"
        aria-label="Open sidebar"
        @click="sidebarOpen = true"
      />
      <h1 class="text-base font-semibold text-default">
        Inbox
      </h1>
      <span
        v-if="unread"
        class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary"
        data-inbox-unread
      >{{ unread }} unread</span>
      <div class="ml-auto flex items-center gap-1">
        <UButton
          v-if="unread"
          label="Mark all read"
          icon="i-lucide-check-check"
          size="xs"
          color="neutral"
          variant="ghost"
          data-inbox-mark-all
          @click="markAllRead"
        />
        <UButton
          icon="i-lucide-settings-2"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="Notification settings"
          data-inbox-settings
          @click="settingsOpen = !settingsOpen"
        />
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
      <div class="mx-auto max-w-3xl">
        <section
          v-if="settingsOpen"
          class="mb-4 rounded-xl border border-default bg-default p-4"
          data-inbox-prefs
        >
          <h2 class="text-sm font-semibold text-default">
            How you hear
          </h2>
          <p class="mt-1 text-xs text-muted">
            Everything arrives here. These are extra ways to be told.
          </p>
          <div class="mt-3 space-y-3">
            <label class="flex items-start gap-3">
              <input
                type="checkbox"
                class="mt-0.5 size-4 accent-primary"
                :checked="prefs.browser"
                data-pref-browser
                @change="toggle('browser')"
              >
              <span>
                <span class="block text-sm text-default">Desktop notifications</span>
                <span class="block text-xs text-muted">Shown by your browser when Taskmanager is open in a tab you are not looking at.</span>
              </span>
            </label>
            <label class="flex items-start gap-3">
              <input
                type="checkbox"
                class="mt-0.5 size-4 accent-primary"
                :checked="prefs.email"
                data-pref-email
                @change="toggle('email')"
              >
              <span>
                <span class="block text-sm text-default">Email</span>
                <span class="block text-xs text-muted">A message for each notification, with a link to open it.</span>
                <span
                  v-if="prefs.email && !prefs.mailEnabled"
                  class="mt-1 block text-xs text-warning"
                  data-mail-note
                >This server has no mail set up yet, so nothing is being sent.</span>
              </span>
            </label>
          </div>
          <p
            v-if="settingsError"
            class="mt-3 text-xs text-error"
            data-pref-error
          >
            {{ settingsError }}
          </p>
        </section>

        <div class="mb-3 flex gap-1">
          <button
            v-for="option in (['all', 'unread'] as const)"
            :key="option"
            class="rounded-md px-2.5 py-1 text-xs capitalize transition-colors"
            :class="filter === option ? 'bg-elevated font-medium text-default' : 'text-muted hover:text-default'"
            :data-inbox-filter="option"
            @click="filter = option"
          >
            {{ option }}
          </button>
        </div>

        <p
          v-if="loaded && !shown.length"
          class="rounded-xl border border-dashed border-default px-4 py-12 text-center text-sm text-muted"
          data-inbox-empty
        >
          {{ filter === 'unread' ? 'You are all caught up.' : 'Nothing yet. Assignments, comments and messages for you will land here.' }}
        </p>

        <section
          v-for="[day, dayItems] in byDay"
          :key="day"
          class="mb-5"
        >
          <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-dimmed">
            {{ dayLabel(day) }}
          </h3>
          <ul class="overflow-hidden rounded-xl border border-default bg-default">
            <li
              v-for="item in dayItems"
              :key="item.id"
              class="flex cursor-pointer items-start gap-3 border-b border-default px-3 py-3 transition-colors last:border-b-0 hover:bg-elevated/60"
              :data-inbox-item="item.type"
              :data-unread="item.readAt ? 'false' : 'true'"
              @click="open(item)"
            >
              <span
                class="mt-1.5 size-2 shrink-0 rounded-full"
                :class="item.readAt ? 'bg-transparent' : 'bg-primary'"
              />
              <UAvatar
                :src="item.actorImage ?? undefined"
                :alt="item.actorName ?? 'Someone'"
                size="xs"
                class="mt-0.5"
              />
              <div class="min-w-0 flex-1">
                <p
                  class="text-sm"
                  :class="item.readAt ? 'text-muted' : 'font-medium text-default'"
                >
                  {{ item.title }}
                </p>
                <p
                  v-if="item.body"
                  class="mt-0.5 line-clamp-2 text-xs text-muted"
                >
                  {{ item.body }}
                </p>
                <p class="mt-1 text-xs text-dimmed">
                  {{ item.projectName }}
                </p>
              </div>
              <span class="shrink-0 text-xs text-dimmed">{{ relativeTime(item.createdAt) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
