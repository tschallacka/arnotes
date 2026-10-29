<script setup lang="ts">
import { errorMessage } from '~/utils/untypedFetch'

// A task's custom fields, laid out like the dates above it in the panel.
const props = defineProps<{ taskId: string }>()

const toast = useToast()
const { activeProjectId } = useProjects()
const { fields, valueOf, setValues } = useCustomFields(activeProjectId)

async function change(fieldId: string, value: string | null) {
  try {
    await setValues(props.taskId, { [fieldId]: value })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save the field'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}
</script>

<template>
  <dl
    v-if="fields.length"
    class="grid shrink-0 grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-1.5 px-5 pb-3 text-xs"
    data-task-fields
  >
    <template
      v-for="field in fields"
      :key="field.id"
    >
      <dt class="truncate text-muted">
        {{ field.name }}
      </dt>
      <dd class="min-w-0">
        <KanbanFieldInput
          :field="field"
          :value="valueOf(taskId, field.id)"
          @change="change(field.id, $event)"
        />
      </dd>
    </template>
  </dl>
</template>
