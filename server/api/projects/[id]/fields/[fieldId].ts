import { and, eq, notInArray } from 'drizzle-orm'
import { db } from '../../../../db'
import { projectFields, taskFieldValues } from '../../../../db/schema'
import { listFields, parseFieldName, parseFieldOptions } from '../../../../utils/customFields'
import { routeStaffProject, touchProject } from '../../../../utils/projectResources'

// PUT renames a field or replaces a select's options; DELETE removes the field
// and every task's value for it. A field's type is fixed once it exists, because
// the values already stored were checked against it.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const fieldId = getRouterParam(event, 'fieldId')!

  const fields = await listFields(project.id)
  const field = fields.find(candidate => candidate.id === fieldId)
  if (!field) throw createError({ statusCode: 404, message: 'Field not found' })

  if (event.method === 'DELETE') {
    await db.delete(projectFields).where(eq(projectFields.id, field.id))
    await touchProject(event, project.id, 'board')
    return { ok: true }
  }

  if (event.method !== 'PUT') throw createError({ statusCode: 405, message: 'Method not allowed' })

  const body = await readBody<{ name?: string, options?: unknown }>(event)
  const name = body.name === undefined ? field.name : parseFieldName(body.name)
  if (fields.some(other => other.id !== field.id && other.name.toLowerCase() === name.toLowerCase())) {
    throw createError({ statusCode: 400, message: `There is already a field called "${name}"` })
  }

  let options = field.options
  if (body.options !== undefined) {
    if (field.type !== 'select') throw createError({ statusCode: 400, message: 'Only a select field has options' })
    options = parseFieldOptions(body.options)
    // A task that chose an option which is gone no longer has a value.
    const kept = options.map(option => option.id)
    await db.delete(taskFieldValues).where(and(
      eq(taskFieldValues.fieldId, field.id),
      kept.length ? notInArray(taskFieldValues.value, kept) : undefined
    ))
  }

  const [updated] = await db.update(projectFields).set({ name, options }).where(eq(projectFields.id, field.id)).returning()
  await touchProject(event, project.id, 'board')
  return updated
})
