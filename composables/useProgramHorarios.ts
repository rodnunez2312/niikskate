import {
  BUILT_IN_HORARIO_SLOTS,
  customHorarioId,
  horarioFromId,
  type ProgramHorario,
} from '~/utils/programHorarios'

const STORAGE_KEY = 'niik.program-horarios.v1'

type Stored = { custom: string[]; hidden: string[] }

/** Horario pills for recurring programs: built-ins minus removed ones, plus custom ones. */
export function useProgramHorarios() {
  const custom = useState<string[]>('program-horarios-custom', () => [])
  const hidden = useState<string[]>('program-horarios-hidden', () => [])
  const loaded = useState('program-horarios-loaded', () => false)

  const persist = () => {
    if (!import.meta.client) return
    const data: Stored = { custom: custom.value, hidden: hidden.value }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  onMounted(() => {
    if (loaded.value) return
    loaded.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as Partial<Stored>
      custom.value = (data.custom ?? []).filter(id => horarioFromId(id))
      hidden.value = data.hidden ?? []
    } catch {
      // Corrupt storage just falls back to the built-ins.
    }
  })

  const horarios = computed((): ProgramHorario[] =>
    [
      ...BUILT_IN_HORARIO_SLOTS.filter(s => !hidden.value.includes(s)),
      ...custom.value,
    ]
      .map(horarioFromId)
      .filter((h): h is ProgramHorario => Boolean(h))
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
  )

  /** Returns the new horario id, or an error key. */
  const addHorario = (start: string, end: string): { id: string } | { error: 'invalid' | 'duplicate' } => {
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) {
      return { error: 'invalid' }
    }
    const existing = horarios.value.find(h => h.start === start && h.end === end)
    if (existing) return { error: 'duplicate' }

    const builtIn = BUILT_IN_HORARIO_SLOTS.find(s => {
      const h = horarioFromId(s)
      return h?.start === start && h.end === end
    })
    if (builtIn) {
      hidden.value = hidden.value.filter(s => s !== builtIn)
      persist()
      return { id: builtIn }
    }
    const id = customHorarioId(start, end)
    custom.value = [...custom.value, id]
    persist()
    return { id }
  }

  const removeHorario = (id: string) => {
    if (BUILT_IN_HORARIO_SLOTS.includes(id as never)) {
      if (!hidden.value.includes(id)) hidden.value = [...hidden.value, id]
    } else {
      custom.value = custom.value.filter(c => c !== id)
    }
    persist()
  }

  return { horarios, addHorario, removeHorario }
}
