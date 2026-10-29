import { addDays, format, startOfWeek } from 'date-fns'

/**
 * A week at a time, Monday to Sunday, for the screens that read time by week:
 * the days as `YYYY-MM-DD`, a label for the header, and stepping either way.
 */
export function useWeek() {
  const monday = () => startOfWeek(new Date(), { weekStartsOn: 1 })
  const start = ref(monday())

  const days = computed(() => Array.from({ length: 7 }, (_, i) => format(addDays(start.value, i), 'yyyy-MM-dd')))
  const from = computed(() => days.value[0]!)
  const to = computed(() => days.value[6]!)
  const label = computed(() => `${format(start.value, 'MMM d')} – ${format(addDays(start.value, 6), 'MMM d, yyyy')}`)
  const isCurrent = computed(() => format(start.value, 'yyyy-MM-dd') === format(monday(), 'yyyy-MM-dd'))

  function shift(weeks: number) {
    start.value = addDays(start.value, weeks * 7)
  }

  function reset() {
    start.value = monday()
  }

  return { days, from, to, label, isCurrent, shift, reset }
}
