import { realtimeHeaders } from '~/composables/useRealtime'

export type FieldType = 'text' | 'number' | 'select' | 'date'

export interface FieldOption {
  id: string
  label: string
  color: string
}

export interface ProjectField {
  id: string
  projectId: string
  name: string
  type: FieldType
  options: FieldOption[]
  position: number
}

/** One task's values, keyed by field id. */
export type FieldValues = Record<string, string>

export interface FieldTemplate {
  key: string
  name: string
  type: FieldType
}

// Module-level state, keyed by project: a board read from the cache comes back
// with its fields, and the list, the cards and the task panel all read the same
// copy. The board endpoint is what fills it; the functions below keep it right
// between reads.
const _fields = ref<Record<string, ProjectField[]>>({})
const _values = ref<Record<string, Record<string, FieldValues>>>({})
const _templates = ref<Record<string, FieldTemplate[]>>({})

const request = untypedFetch

/** Called with every board read: replaces what is held for that project. */
export function ingestBoardFields(projectId: string, fields: ProjectField[], values: Record<string, FieldValues>) {
  _fields.value = { ..._fields.value, [projectId]: fields }
  _values.value = { ..._values.value, [projectId]: values }
}

/** A team switch leaves nothing of the old workspace behind. */
export function clearCustomFields() {
  _fields.value = {}
  _values.value = {}
  _templates.value = {}
}

export function fieldsOf(projectId: string | null | undefined): ProjectField[] {
  return (projectId && _fields.value[projectId]) || []
}

export function fieldValueOf(projectId: string | null | undefined, taskId: string, fieldId: string): string | undefined {
  return projectId ? _values.value[projectId]?.[taskId]?.[fieldId] : undefined
}

/** The colour-coded values a task shows on its card: one chip per select field it has a choice for. */
export function selectChipsOf(projectId: string | null | undefined, taskId: string) {
  const chips: { fieldId: string, label: string, color: string }[] = []
  for (const field of fieldsOf(projectId)) {
    if (field.type !== 'select') continue
    const option = field.options.find(candidate => candidate.id === fieldValueOf(projectId, taskId, field.id))
    if (option) chips.push({ fieldId: field.id, label: option.label, color: option.color })
  }
  return chips
}

/** A stored value as it reads on screen. */
export function displayFieldValue(field: ProjectField, raw: string | undefined): string {
  if (raw === undefined) return ''
  if (field.type === 'select') return field.options.find(option => option.id === raw)?.label ?? ''
  return raw
}

/**
 * A project's custom fields and the values its tasks hold, with what it takes to
 * change them. Values go through the task endpoint, which checks each against its
 * field and answers with the task's values as stored — a number typed as "3,5"
 * comes back as 3.5 — and that answer is what the screen then shows.
 */
export function useCustomFields(projectId: MaybeRefOrGetter<string | null | undefined>) {
  const id = () => toValue(projectId) ?? ''
  const fields = computed(() => fieldsOf(id()))
  const templates = computed(() => _templates.value[id()] ?? [])

  async function loadTemplates() {
    if (!id()) return
    const res = await request<{ templates: FieldTemplate[] }>(`/api/projects/${id()}/fields`)
    _templates.value = { ..._templates.value, [id()]: res.templates }
  }

  function valueOf(taskId: string, fieldId: string) {
    return fieldValueOf(id(), taskId, fieldId)
  }

  async function setValues(taskId: string, patch: Record<string, string | number | null>) {
    const res = await request<{ fieldValues?: FieldValues }>(`/api/tasks/${taskId}`, {
      method: 'PUT', headers: realtimeHeaders(), body: { fields: patch }
    })
    const pid = id()
    _values.value = { ..._values.value, [pid]: { ...(_values.value[pid] ?? {}), [taskId]: res.fieldValues ?? {} } }
  }

  function setField(created: ProjectField) {
    const pid = id()
    const others = fieldsOf(pid).filter(field => field.id !== created.id)
    _fields.value = { ..._fields.value, [pid]: [...others, created].sort((a, b) => a.position - b.position) }
  }

  async function addField(body: { template?: string, name?: string, type?: FieldType, options?: string[] }) {
    const created = await request<ProjectField>(`/api/projects/${id()}/fields`, { method: 'POST', headers: realtimeHeaders(), body })
    setField(created)
    await loadTemplates()
    return created
  }

  async function updateField(fieldId: string, body: { name?: string, options?: (string | FieldOption)[] }) {
    const updated = await request<ProjectField>(`/api/projects/${id()}/fields/${fieldId}`, { method: 'PUT', headers: realtimeHeaders(), body })
    setField(updated)
    return updated
  }

  async function removeField(fieldId: string) {
    await request(`/api/projects/${id()}/fields/${fieldId}`, { method: 'DELETE', headers: realtimeHeaders() })
    const pid = id()
    _fields.value = { ..._fields.value, [pid]: fieldsOf(pid).filter(field => field.id !== fieldId) }
    // The values went with it on the server.
    const values = _values.value[pid] ?? {}
    _values.value = {
      ..._values.value,
      [pid]: Object.fromEntries(Object.entries(values).map(([taskId, byField]) => {
        const { [fieldId]: _gone, ...rest } = byField
        return [taskId, rest]
      }))
    }
    await loadTemplates()
  }

  return { fields, templates, loadTemplates, valueOf, setValues, addField, updateField, removeField, messageOf: errorMessage }
}
