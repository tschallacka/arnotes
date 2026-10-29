import { realtimeHeaders } from '~/composables/useRealtime'

interface CollectionOptions {
  /** Where a newly added row goes. Feeds read newest first, conversations oldest first. */
  addAt?: 'start' | 'end'
}

// Nuxt types `$fetch` by route, which cannot say what a URL built from a
// resource name returns; the collection states its own row type instead.
const request = $fetch as unknown as <R>(url: string, options?: Record<string, unknown>) => Promise<R>

function messageOf(error: unknown, fallback: string): string {
  const e = error as { data?: { message?: string }, statusMessage?: string }
  return e?.data?.message ?? e?.statusMessage ?? fallback
}

/**
 * One of a project's own collections — status updates, messages, time entries —
 * read from `/api/projects/:id/:resource`, added to by POST and removed by
 * DELETE `:resource/:rowId`. Each view owns its collection and the rows follow
 * the project they are about: opening another project empties the list and
 * reads that project's.
 *
 * A request that is overtaken by a newer one (the project changed while it was
 * in flight) is dropped, so a slow answer for the old project never lands in
 * the new one's list.
 */
export function useProjectCollection<T extends { id: string }>(
  projectId: MaybeRefOrGetter<string>,
  resource: string,
  options: CollectionOptions = {}
) {
  const items = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const error = ref('')
  let latest = 0

  const url = () => `/api/projects/${toValue(projectId)}/${resource}`

  async function load() {
    const mine = ++latest
    loading.value = true
    error.value = ''
    try {
      const rows = await request<T[]>(url())
      if (mine === latest) items.value = rows
    } catch (e) {
      if (mine === latest) error.value = messageOf(e, 'Could not load')
    } finally {
      if (mine === latest) loading.value = false
    }
  }

  async function add(body: Record<string, unknown>): Promise<T> {
    const created = await request<T>(url(), { method: 'POST', headers: realtimeHeaders(), body })
    items.value = options.addAt === 'end' ? [...items.value, created] : [created, ...items.value]
    return created
  }

  async function remove(rowId: string) {
    await request(`${url()}/${rowId}`, { method: 'DELETE', headers: realtimeHeaders() })
    items.value = items.value.filter(row => row.id !== rowId)
  }

  watch(() => toValue(projectId), () => {
    items.value = []
    load()
  }, { immediate: true })

  return { items, loading, error, load, add, remove, messageOf }
}
