import type { Ref } from 'vue'
import { computeSkaterCareer, type CareerSkill, type TrickRarity } from '~/utils/skaterCareer'

type CareerSources = {
  studentId: Ref<string | null | undefined>
  skills: Ref<CareerSkill[]>
  progress: Ref<{ skill_id: string; learned_at?: string | null; created_at?: string | null }[]>
  programSkillIds?: Ref<string[]>
  skatingStyle: Ref<string | null | undefined>
  /** True once the page finished its own initial load; celebrations only fire after that. */
  ready: Ref<boolean>
}

export type CareerCelebration = {
  id: number
  kind: 'trick' | 'phase' | 'level'
  title: string
  subject: string
  xp?: number
  rarity?: TrickRarity
}

export function useSkaterCareer(src: CareerSources) {
  const client = useSupabaseClient()
  const { language } = useI18n()

  const attendance = ref<{ class_date: string; attended: boolean }[]>([])
  const videos = ref<{ created_at: string }[]>([])
  const evaluations = ref<{ evaluation_date: string }[]>([])
  const extrasLoaded = ref(false)

  async function reload() {
    const id = src.studentId.value
    if (!id) {
      attendance.value = []
      videos.value = []
      evaluations.value = []
      extrasLoaded.value = true
      return
    }
    const [attRes, vidRes, evalRes] = await Promise.all([
      client.from('attendance').select('class_date, attended').eq('student_id', id).eq('attended', true),
      client.from('trick_evidence_videos').select('created_at').eq('student_id', id),
      client.from('student_evaluations').select('evaluation_date').eq('student_id', id),
    ])
    attendance.value = (attRes.data as typeof attendance.value) || []
    videos.value = (vidRes.data as typeof videos.value) || []
    evaluations.value = (evalRes.data as typeof evaluations.value) || []
    extrasLoaded.value = true
  }

  const career = computed(() =>
    computeSkaterCareer({
      skills: src.skills.value,
      progress: src.progress.value,
      attendance: attendance.value,
      videos: videos.value,
      evaluations: evaluations.value,
      programSkillIds: src.programSkillIds?.value,
      skatingStyle: src.skatingStyle.value,
      es: language.value === 'es',
    }),
  )

  const celebrations = ref<CareerCelebration[]>([])
  let seenKeys: Set<string> | null = null
  let seenLevel = 1
  let nextId = 1

  watch(src.studentId, () => {
    seenKeys = null
    extrasLoaded.value = false
    celebrations.value = []
    void reload()
  }, { immediate: true })

  watch(
    [career, src.ready, extrasLoaded],
    ([c, ready, loaded]) => {
      if (!ready || !loaded) return
      if (!seenKeys) {
        seenKeys = new Set(c.events.map(e => e.key))
        seenLevel = c.level
        return
      }
      const es = language.value === 'es'
      const fresh = c.events.filter(e => !seenKeys!.has(e.key))
      seenKeys = new Set(c.events.map(e => e.key))
      for (const e of fresh) {
        if (e.kind === 'trick') {
          celebrations.value.push({ id: nextId++, kind: 'trick', title: es ? '🎉 NUEVO TRUCO DESBLOQUEADO' : '🎉 NEW TRICK UNLOCKED', subject: e.subject || '', xp: e.xp, rarity: e.rarity })
        } else if (e.kind === 'phase') {
          celebrations.value.push({ id: nextId++, kind: 'phase', title: es ? '🏆 NIVEL COMPLETADO' : '🏆 LEVEL COMPLETE', subject: e.subject || '', xp: e.xp })
        }
      }
      if (c.level > seenLevel) {
        celebrations.value.push({ id: nextId++, kind: 'level', title: '⬆ LEVEL UP', subject: `LEVEL ${c.level} · ${c.rank.label.toUpperCase()}` })
      }
      seenLevel = c.level
    },
  )

  function dismissCelebration(id: number) {
    celebrations.value = celebrations.value.filter(c => c.id !== id)
  }

  return { career, reload, celebrations, dismissCelebration }
}
