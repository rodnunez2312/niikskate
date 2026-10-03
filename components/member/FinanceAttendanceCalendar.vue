<script setup lang="ts">
import type { FinanceAttendanceMark, FinanceAttendanceStatus } from '~/utils/finance'

const props = defineProps<{
  marks: FinanceAttendanceMark[]
  saving?: boolean
  es?: boolean
}>()

const emit = defineEmits<{
  set: [date: string, status: FinanceAttendanceStatus]
  clear: [mark: FinanceAttendanceMark]
}>()

const month = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad(monthIndex + 1)}-${pad(day)}`

const title = computed(() => new Intl.DateTimeFormat(props.es ? 'es-MX' : 'en-US', {
  month: 'long',
  year: 'numeric',
}).format(month.value))

const cells = computed(() => {
  const year = month.value.getFullYear()
  const monthIndex = month.value.getMonth()
  const leading = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const count = new Date(year, monthIndex + 1, 0).getDate()
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: count }, (_, i) => {
      const date = ymd(year, monthIndex, i + 1)
      return { day: i + 1, date, mark: props.marks.find(m => m.session_date === date) }
    }),
  ]
})

function move(delta: number) {
  month.value = new Date(month.value.getFullYear(), month.value.getMonth() + delta, 1)
}

function cycle(cell: Exclude<(typeof cells.value)[number], null>) {
  if (props.saving) return
  if (!cell.mark) emit('set', cell.date, 'attended')
  else if (cell.mark.status === 'attended') emit('set', cell.date, 'absent')
  else emit('clear', cell.mark)
}
</script>

<template>
  <div class="rounded-2xl border border-gray-800 bg-black/30 p-3">
    <div class="flex items-center justify-between mb-3">
      <button type="button" class="h-8 w-8 rounded-lg bg-gray-800 text-gray-300" @click="move(-1)">‹</button>
      <p class="text-sm font-bold text-white capitalize">{{ title }}</p>
      <button type="button" class="h-8 w-8 rounded-lg bg-gray-800 text-gray-300" @click="move(1)">›</button>
    </div>
    <div class="grid grid-cols-7 gap-1 text-center">
      <span v-for="(day, index) in (es ? ['L','M','M','J','V','S','D'] : ['M','T','W','T','F','S','S'])"
        :key="index" class="text-[9px] font-bold text-gray-500 py-1">{{ day }}</span>
      <template v-for="(cell, index) in cells" :key="cell?.date ?? `blank-${index}`">
        <span v-if="!cell" />
        <button
          v-else
          type="button"
          class="aspect-square rounded-lg border text-xs font-bold transition-colors"
          :class="cell.mark?.status === 'attended'
            ? 'border-green-500/70 bg-green-500/25 text-green-200'
            : cell.mark?.status === 'absent'
              ? 'border-red-500/70 bg-red-500/25 text-red-200'
              : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-600'"
          :title="cell.mark?.status ?? (es ? 'Sin registro' : 'No mark')"
          @click="cycle(cell)"
        >
          {{ cell.day }}
        </button>
      </template>
    </div>
    <p class="mt-3 text-[10px] text-gray-500">
      {{ es ? 'Toca: presente → falta → borrar.' : 'Tap: attended → absent → clear.' }}
      <span class="text-green-300">● {{ es ? 'Asistió' : 'Attended' }}</span>
      · <span class="text-red-300">● {{ es ? 'Falta' : 'Absent' }}</span>
    </p>
  </div>
</template>
