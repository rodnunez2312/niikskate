/**
 * Plain-text handout for a strength session, so a coach can open it on any
 * phone without logging into the app.
 */

import {
  STRETCH_MINUTES_LOCKED,
  TRAINING_PILLARS,
  formatDuration,
  levelLabel,
  phaseLabel,
  pillarLabel,
  totalSessionMinutes,
  type StrengthLevel,
  type TrainingPhase,
  type TrainingPillar,
} from './strengthTraining'
import type { GeneratedSession } from './strengthSessionGenerator'

export interface HandoutExercise {
  name: string
  prescription?: string | null
  equipment?: string | null
  coach_cue?: string | null
}

export interface HandoutSession {
  level: StrengthLevel
  trainingMinutes: number
  pillars: TrainingPillar[]
  stretchSeconds: number
  blocks: Array<{ phase: TrainingPhase; seconds: number; exercises: HandoutExercise[] }>
  stretch: HandoutExercise[]
}

export function handoutFromGenerated(session: GeneratedSession): HandoutSession {
  return {
    level: session.level,
    trainingMinutes: session.trainingMinutes,
    pillars: session.pillars,
    stretchSeconds: session.stretchSeconds,
    blocks: session.blocks.map(b => ({
      phase: b.phase,
      seconds: b.seconds,
      exercises: b.exercises.map(ex => ({
        name: ex.name,
        prescription: ex.prescription_es,
        equipment: ex.equipment_es,
        coach_cue: ex.coach_cue_es,
      })),
    })),
    stretch: session.stretch.map(ex => ({
      name: ex.name,
      prescription: ex.prescription_es,
    })),
  }
}

export function strengthSessionFileName(
  v: Pick<HandoutSession, 'level' | 'trainingMinutes'>,
): string {
  const day = new Date().toISOString().slice(0, 10)
  return `niik-fuerza-${v.level}-${v.trainingMinutes}min-${day}.txt`
}

export function buildStrengthSessionText(v: HandoutSession, es: boolean): string {
  const out: string[] = []
  const exerciseCount = v.blocks.reduce((n, b) => n + b.exercises.length, 0)

  out.push(`NIIK SKATE - ${es ? 'SESION DE FUERZA' : 'STRENGTH SESSION'}`)
  out.push('='.repeat(36))
  out.push(`${es ? 'Nivel' : 'Level'}: ${levelLabel(v.level, es)}`)
  out.push(
    `${es ? 'Duracion' : 'Duration'}: ${v.trainingMinutes} min + ${STRETCH_MINUTES_LOCKED} min`
    + ` = ${totalSessionMinutes(v.trainingMinutes)} min`,
  )
  out.push(
    `${es ? 'Pilares' : 'Pillars'}: `
    + (v.pillars.length === TRAINING_PILLARS.length
      ? (es ? 'todos' : 'all')
      : v.pillars.map(p => pillarLabel(p, es)).join(', ')),
  )
  out.push(`${es ? 'Ejercicios' : 'Exercises'}: ${exerciseCount}`)
  out.push('')

  for (const block of v.blocks) {
    out.push(`-- ${phaseLabel(block.phase, es).toUpperCase()} (${formatDuration(block.seconds)})`)
    block.exercises.forEach((ex, i) => {
      out.push(`${i + 1}. ${ex.name}`)
      if (ex.prescription) out.push(`   ${ex.prescription}`)
      if (ex.equipment) out.push(`   ${es ? 'Equipo' : 'Equipment'}: ${ex.equipment}`)
      if (ex.coach_cue) out.push(`   * ${ex.coach_cue}`)
    })
    out.push('')
  }

  out.push(`-- ${es ? 'ESTIRAMIENTO NIIK' : 'NIIK STRETCH'} (${formatDuration(v.stretchSeconds)})`)
  v.stretch.forEach((ex, i) => {
    out.push(`${i + 1}. ${ex.name}${ex.prescription ? ` - ${ex.prescription}` : ''}`)
  })
  out.push('')
  out.push(
    es
      ? 'El bloque de estiramiento es fijo (regla del sistema).'
      : 'The stretch block is locked by system rule.',
  )

  // CRLF so it renders correctly in phone and Windows text viewers.
  return out.join('\r\n')
}

export function downloadStrengthSessionTxt(v: HandoutSession, es: boolean): void {
  const text = buildStrengthSessionText(v, es)
  if (!text) return
  // BOM so Windows Notepad picks up UTF-8 accents.
  const blob = new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = strengthSessionFileName(v)
  link.click()
  URL.revokeObjectURL(url)
}

export async function shareStrengthSessionTxt(v: HandoutSession, es: boolean): Promise<void> {
  const text = buildStrengthSessionText(v, es)
  if (!text) return
  const title = es ? 'Sesión de fuerza NIÏK' : 'NIÏK strength session'
  try {
    const file = new File([text], strengthSessionFileName(v), { type: 'text/plain' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title })
      return
    }
    await navigator.share({ title, text })
  } catch {
    // Cancelled or unsupported — the download button stays available.
  }
}

/** Returns false when the clipboard is unavailable, so the caller can fall back. */
export async function copyStrengthSessionText(
  v: HandoutSession,
  es: boolean,
): Promise<boolean> {
  const text = buildStrengthSessionText(v, es)
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
