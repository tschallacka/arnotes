// Agent tools for a board's custom fields. Reading and writing a task's values
// goes through get_board, get_task, create_task and update_task, which carry a
// `fields` map; these are for seeing which fields a board has and adding one.
import { db } from '../db'
import { projectFields } from '../db/schema'
import { MAX_FIELDS_PER_PROJECT, listFields, parseFieldName, parseFieldOptions, parseFieldType } from './customFields'
import { findStaffBoard, touchBoard } from './mcpBoardTools'
import { McpToolError, asToolError, newId, optionalStringArray, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'

export const MCP_FIELD_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_fields',
    title: 'List a board\'s custom fields',
    description: 'List the custom fields of a board, such as Priority or Estimate: each one\'s name, type (text, number, select, date) and, for a select, its options. Use the names and option labels it returns when setting "fields" on create_task or update_task.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: 'Board id, board name, or a link to the board.' }
      },
      required: ['board']
    },
    async handler(args, context) {
      const board = await findStaffBoard(requireString(args, 'board'), context, 'custom fields')
      const fields = await listFields(board.id)
      return {
        board: { id: board.id, name: board.name },
        fields: fields.map(field => ({
          name: field.name,
          type: field.type,
          ...(field.type === 'select' ? { options: field.options.map(option => option.label) } : {})
        }))
      }
    }
  },
  {
    name: 'create_field',
    title: 'Add a custom field',
    description: 'Add a custom field to a board. A select field takes "options"; the other types do not. Fields cannot be removed or changed in type over MCP.',
    scope: 'boards:write',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: 'Board id, board name, or a link to the board.' },
        name: { type: 'string', description: 'Field name, such as "Priority".' },
        type: { type: 'string', description: 'One of text, number, select, date.' },
        options: { type: 'array', items: { type: 'string' }, description: 'The choices of a select field, such as ["Low", "Medium", "High"].' }
      },
      required: ['board', 'name', 'type']
    },
    async handler(args, context) {
      const board = await findStaffBoard(requireString(args, 'board'), context, 'custom fields')
      const name = asToolError(() => parseFieldName(requireString(args, 'name')))
      const type = asToolError(() => parseFieldType(requireString(args, 'type')))
      const requested = optionalStringArray(args, 'options')
      if (type !== 'select' && requested?.length) throw new McpToolError('Only a select field has options.')
      const options = type === 'select' ? asToolError(() => parseFieldOptions(requested ?? [])) : []
      if (type === 'select' && !options.length) throw new McpToolError('A select field needs at least one option.')

      const existing = await listFields(board.id)
      if (existing.length >= MAX_FIELDS_PER_PROJECT) throw new McpToolError(`A board has at most ${MAX_FIELDS_PER_PROJECT} fields.`)
      if (existing.some(field => field.name.toLowerCase() === name.toLowerCase())) {
        throw new McpToolError(`Board "${board.name}" already has a field called "${name}".`)
      }

      const [created] = await db.insert(projectFields).values({
        id: newId(),
        projectId: board.id,
        name,
        type,
        options,
        position: (existing.at(-1)?.position ?? -1000) + 1000,
        createdAt: Date.now()
      }).returning()

      await touchBoard(board.id)
      return {
        created: true,
        board: { id: board.id, name: board.name },
        field: { name: created!.name, type: created!.type, ...(type === 'select' ? { options: options.map(option => option.label) } : {}) }
      }
    }
  }
]
