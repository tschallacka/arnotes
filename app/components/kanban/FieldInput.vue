<script setup lang="ts">
import { colorHex } from '#shared/utils/colors'
import type { ProjectField } from '~/composables/useCustomFields'

// One custom field's editor, shaped by the field's type. It reports a change as
// the raw string to store, or null to clear it; checking and saving are the
// caller's, so the same editor serves the task panel and the list's rows.
const props = defineProps<{
  field: ProjectField
  value: string | undefined
}>()

const emit = defineEmits<{ change: [value: string | null] }>()

const selected = computed(() => props.field.options.find(option => option.id === props.value))

function onChange(event: Event) {
  const raw = (event.target as HTMLInputElement | HTMLSelectElement).value
  emit('change', raw === '' ? null : raw)
}
</script>

<template>
  <span class="flex min-w-0 items-center gap-1.5">
    <select
      v-if="field.type === 'select'"
      :value="value ?? ''"
      class="min-w-0 max-w-full cursor-pointer appearance-none rounded bg-transparent px-1 py-0.5 text-xs outline-none transition-colors hover:bg-elevated focus:ring-1 focus:ring-primary"
      :class="value ? 'text-default' : 'text-dimmed'"
      :data-field-input="field.name"
      @click.stop
      @change="onChange"
    >
      <option value="">
        —
      </option>
      <option
        v-for="option in field.options"
        :key="option.id"
        :value="option.id"
      >
        {{ option.label }}
      </option>
    </select>
    <span
      v-if="field.type === 'select' && selected"
      class="size-2 shrink-0 rounded-full"
      :style="{ backgroundColor: colorHex(selected.color) }"
    />

    <input
      v-else-if="field.type === 'number'"
      type="number"
      step="any"
      :value="value ?? ''"
      placeholder="—"
      class="w-20 rounded bg-transparent px-1 py-0.5 text-xs tabular-nums outline-none transition-colors placeholder:text-dimmed hover:bg-elevated focus:ring-1 focus:ring-primary"
      :data-field-input="field.name"
      @click.stop
      @change="onChange"
    >
    <input
      v-else-if="field.type === 'date'"
      type="date"
      min="2000-01-01"
      max="2999-12-31"
      :value="value ?? ''"
      class="rounded bg-transparent px-1 py-0.5 text-xs outline-none transition-colors hover:bg-elevated focus:ring-1 focus:ring-primary"
      :class="value ? 'text-default' : 'text-dimmed'"
      :data-field-input="field.name"
      @click.stop
      @change="onChange"
    >
    <input
      v-else-if="field.type === 'text'"
      type="text"
      maxlength="500"
      :value="value ?? ''"
      placeholder="—"
      class="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs outline-none transition-colors placeholder:text-dimmed hover:bg-elevated focus:ring-1 focus:ring-primary"
      :data-field-input="field.name"
      @click.stop
      @change="onChange"
    >
  </span>
</template>
