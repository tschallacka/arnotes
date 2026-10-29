// Custom fields, shared by the task endpoints and the MCP tools: the rules for
// what a field may be called and hold, and reading and writing a task's values.
// A value an agent sends is held to the same rule as one typed in the panel.
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { FIELD_TYPES, projectFields, taskFieldValues } from '../db/schema'
import type { FieldOption, FieldType, ProjectField } from '../db/schema'
import { ACCENT_COLORS, isAccentColor } from '#shared/utils/colors'
import { parseDueOn } from './taskFields'

export const MAX_FIELDS_PER_PROJECT = 20
export const MAX_FIELD_OPTIONS = 20
const MAX_FIELD_NAME = 40
const MAX_TEXT_VALUE = 500
const MAX_NUMBER = 1_000_000_000

/** What a task carries for each field it has a value for, keyed by field id. */
export type FieldValues = Record<string, string>

function bad(message: string): never {
  throw createError({ statusCode: 400, message })
}

function newOptionId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Ready-made fields the Overview offers in one click. */
export const FIELD_TEMPLATES: Record<string, { name: string, type: FieldType, options?: { label: string, color: string }[] }> = {
  priority: {
    name: 'Priority',
    type: 'select',
    options: [
      { label: 'Low', color: 'sky' },
      { label: 'Medium', color: 'amber' },
      { label: 'High', color: 'red' }
    ]
  },
  estimate: { name: 'Estimate (hours)', type: 'number' }
}

export function parseFieldName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name) bad('Give the field a name')
  if (name.length > MAX_FIELD_NAME) bad(`Field names are limited to ${MAX_FIELD_NAME} characters`)
  return name
}

export function parseFieldType(raw: unknown): FieldType {
  if (typeof raw !== 'string' || !(FIELD_TYPES as readonly string[]).includes(raw)) {
    bad(`A field is one of: ${FIELD_TYPES.join(', ')}`)
  }
  return raw as FieldType
}

/**
 * The choices of a select field, from labels or `{ id?, label, color? }` objects.
 * An option that keeps its id keeps the tasks that chose it when it is renamed;
 * colours not given are taken from the palette in turn.
 */
export function parseFieldOptions(raw: unknown): FieldOption[] {
  if (!Array.isArray(raw)) bad('Options are a list of choices')
  if (raw.length > MAX_FIELD_OPTIONS) bad(`A field has at most ${MAX_FIELD_OPTIONS} options`)

  const seen = new Set<string>()
  return raw.map((entry, index) => {
    const source = typeof entry === 'string' ? { label: entry } : (entry ?? {}) as { id?: unknown, label?: unknown, color?: unknown }
    const label = typeof source.label === 'string' ? source.label.trim() : ''
    if (!label) bad('Every option needs a label')
    if (label.length > MAX_FIELD_NAME) bad(`Option labels are limited to ${MAX_FIELD_NAME} characters`)
    if (seen.has(label.toLowerCase())) bad(`"${label}" appears twice`)
    seen.add(label.toLowerCase())

    const color = 'color' in source && source.color !== undefined && source.color !== null
      ? (isAccentColor(source.color) ? source.color : bad('Unknown colour'))
      : ACCENT_COLORS[(index * 3) % ACCENT_COLORS.length]!
    const id = 'id' in source && typeof source.id === 'string' && source.id ? source.id : newOptionId()
    return { id, label, color }
  })
}

/**
 * Checks a value against its field and returns what is stored: null clears it.
 * A select takes an option's id or its label, so a person and an agent can use
 * whichever they have.
 */
export function parseFieldValue(field: Pick<ProjectField, 'name' | 'type' | 'options'>, raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null

  switch (field.type) {
    case 'text': {
      if (typeof raw !== 'string') bad(`${field.name} takes text`)
      const text = raw.trim()
      if (text.length > MAX_TEXT_VALUE) bad(`${field.name} is limited to ${MAX_TEXT_VALUE} characters`)
      return text || null
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim().replace(',', '.')) : Number.NaN
      if (!Number.isFinite(n)) bad(`${field.name} takes a number`)
      if (Math.abs(n) > MAX_NUMBER) bad(`${field.name} is out of range`)
      return String(Math.round(n * 100) / 100)
    }
    case 'date':
      return parseDueOn(raw)
    case 'select': {
      if (typeof raw !== 'string') bad(`${field.name} takes one of its options`)
      const needle = raw.trim().toLowerCase()
      const match = field.options.find(option => option.id === raw)
        ?? field.options.find(option => option.label.toLowerCase() === needle)
      if (!match) bad(`"${raw}" is not an option of ${field.name}. Options: ${field.options.map(option => option.label).join(', ') || 'none yet'}`)
      return match.id
    }
  }
}

export function listFields(projectId: string): Promise<ProjectField[]> {
  return db.select().from(projectFields)
    .where(eq(projectFields.projectId, projectId))
    .orderBy(asc(projectFields.position), asc(projectFields.createdAt))
}

/** A field named by id, or by name as it reads in the list. */
export function findField(fields: ProjectField[], key: string): ProjectField | undefined {
  const needle = key.trim().toLowerCase()
  return fields.find(field => field.id === key) ?? fields.find(field => field.name.toLowerCase() === needle)
}

/** A task's values as they read to a person or an agent: by field name, a select by its label. */
export function describeFieldValues(fields: ProjectField[], values: FieldValues | undefined): Record<string, string | number> {
  const described: Record<string, string | number> = {}
  for (const field of fields) {
    const raw = values?.[field.id]
    if (raw === undefined) continue
    if (field.type === 'select') {
      const label = field.options.find(option => option.id === raw)?.label
      if (label) described[field.name] = label
    } else {
      described[field.name] = field.type === 'number' ? Number(raw) : raw
    }
  }
  return described
}

/** Every task's values for the given tasks, grouped by task. */
export async function loadFieldValues(taskIds: string[]): Promise<Record<string, FieldValues>> {
  if (!taskIds.length) return {}
  const rows = await db.select().from(taskFieldValues).where(inArray(taskFieldValues.taskId, taskIds))
  const byTask: Record<string, FieldValues> = {}
  for (const row of rows) (byTask[row.taskId] ??= {})[row.fieldId] = row.value
  return byTask
}

/**
 * Checks a `{ field: value }` map without touching anything: each key is a field
 * id or name, each value is checked against that field. Throws on the first bad
 * one, so a caller that has more to do first can find out before doing it.
 */
export function checkFieldValues(fields: ProjectField[], input: Record<string, unknown>) {
  const writes: { field: ProjectField, value: string | null }[] = []
  for (const [key, raw] of Object.entries(input)) {
    const field = findField(fields, key)
    if (!field) bad(`This project has no field "${key}". Fields: ${fields.map(f => f.name).join(', ') || 'none yet'}`)
    writes.push({ field, value: parseFieldValue(field, raw) })
  }
  return writes
}

/**
 * Applies a `{ field: value }` map to one task; null clears a value. Everything
 * is checked before anything is written, so a bad value changes nothing.
 * Returns the task's values as they now stand.
 */
export async function setFieldValues(taskId: string, fields: ProjectField[], input: Record<string, unknown>): Promise<FieldValues> {
  const writes = checkFieldValues(fields, input)

  for (const { field, value } of writes) {
    if (value === null) {
      await db.delete(taskFieldValues).where(sql`${taskFieldValues.taskId} = ${taskId} and ${taskFieldValues.fieldId} = ${field.id}`)
    } else {
      await db.insert(taskFieldValues).values({ taskId, fieldId: field.id, value })
        .onConflictDoUpdate({ target: [taskFieldValues.taskId, taskFieldValues.fieldId], set: { value } })
    }
  }
  return (await loadFieldValues([taskId]))[taskId] ?? {}
}
