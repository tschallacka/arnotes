<script setup lang="ts">
// A checklist of the workspace's projects, for linking them to a goal or a
// portfolio. Only projects the person works on as staff are offered: a customer's
// contact cannot put a project in one.
const model = defineModel<string[]>({ required: true })
const { projects } = useProjects()

const choices = computed(() => projects.value.filter(project => project.audience !== 'customer'))

function toggle(id: string) {
  model.value = model.value.includes(id) ? model.value.filter(other => other !== id) : [...model.value, id]
}
</script>

<template>
  <div
    class="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-default p-1"
    data-project-picker
  >
    <p
      v-if="!choices.length"
      class="px-2 py-1.5 text-xs text-muted"
    >
      There are no projects yet.
    </p>
    <label
      v-for="project in choices"
      :key="project.id"
      class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated"
    >
      <input
        type="checkbox"
        class="size-4 accent-primary"
        :checked="model.includes(project.id)"
        :data-pick-project="project.id"
        @change="toggle(project.id)"
      >
      <span class="truncate text-default">{{ project.name }}</span>
    </label>
  </div>
</template>
