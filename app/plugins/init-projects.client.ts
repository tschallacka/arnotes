import MiniSearch from 'minisearch'
import { initProjectsStore } from '~/composables/useProjects'
import type { Project, TaskSearchRow } from '~/composables/useProjects'
import { authClient } from '~/composables/useAuth'

type BoardSearchDoc = { id: string, type: 'project' | 'task', name: string, title: string, descriptionText: string }

export default defineNuxtPlugin(async () => {
  const { data: session } = await authClient.getSession()
  if (!session) return

  const boardSearch = new MiniSearch<BoardSearchDoc>({
    idField: 'id',
    fields: ['name', 'title', 'descriptionText'],
    storeFields: ['id'],
    searchOptions: {
      boost: { title: 2, name: 2 },
      prefix: true,
      fuzzy: 0.2
    }
  })

  try {
    const [projects, tasks] = await Promise.all([
      $fetch<Project[]>('/api/projects'),
      $fetch<TaskSearchRow[]>('/api/tasks')
    ])
    initProjectsStore(projects, tasks, boardSearch)
  } catch {
    initProjectsStore([], [], boardSearch)
  }
})
