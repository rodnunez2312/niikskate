type Bilingual = { es: string; en: string }

export type NiikMethodStage = {
  icon: string
  name: Bilingual
  /** What students practice on the board. */
  board: Bilingual
  /** What they take beyond skateboarding. */
  life: Bilingual
}

export const NIIK_METHOD_STAGES: NiikMethodStage[] = [
  {
    icon: '👣',
    name: { es: 'Exposición', en: 'Exposure' },
    board: { es: 'Acercarse a un nuevo reto adecuado', en: 'Approach an appropriate new challenge' },
    life: { es: 'Aprender a enfrentar la incertidumbre', en: 'Learn to face uncertainty' },
  },
  {
    icon: '🧠',
    name: { es: 'Mentalidad', en: 'Mindset' },
    board: { es: 'Practicar el enfoque y el diálogo interno constructivo', en: 'Practice focus and constructive self-talk' },
    life: { es: 'Manejar la frustración', en: 'Manage frustration' },
  },
  {
    icon: '📈',
    name: { es: 'Progresión', en: 'Progression' },
    board: { es: 'Desarrollar habilidades con repetición guiada', en: 'Develop skills through guided repetition' },
    life: { es: 'Construir persistencia', en: 'Build persistence' },
  },
  {
    icon: '🛡️',
    name: { es: 'Confianza', en: 'Confidence' },
    board: { es: 'Reconocer el progreso personal', en: 'Recognize personal progress' },
    life: { es: 'Fortalecer la confianza en uno mismo', en: 'Strengthen self-belief' },
  },
  {
    icon: '🌱',
    name: { es: 'Resiliencia', en: 'Resilience' },
    board: { es: 'Reflexionar, adaptarse e intentarlo de nuevo', en: 'Reflect, adapt, and try again' },
    life: { es: 'Aplicar lo aprendido en la vida diaria', en: 'Apply learning in everyday life' },
  },
]

export function localizeNiikMethodStages(es: boolean) {
  return NIIK_METHOD_STAGES.map(stage => ({
    icon: stage.icon,
    name: es ? stage.name.es : stage.name.en,
    board: es ? stage.board.es : stage.board.en,
    life: es ? stage.life.es : stage.life.en,
  }))
}
