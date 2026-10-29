import { db } from '../../../db'
import { projectFields } from '../../../db/schema'
import { FIELD_TEMPLATES, MAX_FIELDS_PER_PROJECT, listFields, parseFieldName, parseFieldOptions, parseFieldType } from '../../../utils/customFields'
import { genId } from '../../../utils/projects'
import { routeStaffProject, touchProject } from '../../../utils/projectResources'

// Adds a field: either a ready-made one by `template`, or one described by
// `name`, `type` and, for a select, `options`.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const body = await readBody<{ template?: string, name?: string, type?: string, options?: unknown }>(event)

  const template = body.template ? FIELD_TEMPLATES[body.template] : undefined
  if (body.template && !template) throw createError({ statusCode: 400, message: 'Unknown template' })

  const name = parseFieldName(template?.name ?? body.name)
  const type = template?.type ?? parseFieldType(body.type)
  const options = type === 'select' ? parseFieldOptions(template?.options ?? body.options ?? []) : []

  const existing = await listFields(project.id)
  if (existing.length >= MAX_FIELDS_PER_PROJECT) {
    throw createError({ statusCode: 400, message: `A project has at most ${MAX_FIELDS_PER_PROJECT} fields` })
  }
  if (existing.some(field => field.name.toLowerCase() === name.toLowerCase())) {
    throw createError({ statusCode: 400, message: `There is already a field called "${name}"` })
  }

  const [created] = await db.insert(projectFields).values({
    id: genId(),
    projectId: project.id,
    name,
    type,
    options,
    position: (existing.at(-1)?.position ?? -1000) + 1000,
    createdAt: Date.now()
  }).returning()

  await touchProject(event, project.id, 'board')
  return created
})
