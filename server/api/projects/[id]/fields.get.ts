import { FIELD_TEMPLATES, listFields } from '../../../utils/customFields'
import { routeStaffProject } from '../../../utils/projectResources'

// The project's custom fields, and the ready-made ones it could add. Staff only:
// fields are the team's own bookkeeping and a customer's contact never sees them.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const fields = await listFields(project.id)
  return {
    fields,
    templates: Object.entries(FIELD_TEMPLATES)
      .filter(([, template]) => !fields.some(field => field.name.toLowerCase() === template.name.toLowerCase()))
      .map(([key, template]) => ({ key, name: template.name, type: template.type }))
  }
})
