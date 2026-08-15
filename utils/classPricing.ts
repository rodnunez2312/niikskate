import type { ProgramSkillTrack } from '~/types'

export const SEASON_TOTAL_CLASSES = 24

/** Curso de verano — flat group rate ($420/day; 5-day pack $1,860). */
export const SUMMER_COURSE_DAY_PRICE_MXN = 420
export const SUMMER_COURSE_PRICE_MXN: Record<5 | 10, number> = {
  5: 1860,
  10: SUMMER_COURSE_DAY_PRICE_MXN * 10,
}

export function summerCoursePriceMxn(days: 5 | 10): number {
  return SUMMER_COURSE_PRICE_MXN[days]
}

function skillTrackFromLevelId(id: string | null | undefined): ProgramSkillTrack {
  if (!id) return 'beginner'
  if (id.startsWith('advanced')) return 'advanced'
  if (id.startsWith('intermediate')) return 'intermediate'
  return 'beginner'
}

/** Coach Principiante teaches fundamentals; Coach Pro is competition/pro experience (Street or Bowl). */
export type CoachPricingTier = 'principiante' | 'pro_street' | 'pro_bowl'

export type ClassPackageKind =
  | 'monthly_8'
  | 'monthly_12'
  | 'group_session'
  | 'individual_session'
  | 'group_pack_3'
  | 'group_pack_5'
  | 'individual_pack_3'
  | 'individual_pack_5'

export type ClassPriceRow = {
  listMxn: number
  discountMxn?: number
  discountPct?: number
  sessions: number
  coachPayPerDayMxn?: number
  label: { es: string; en: string }
}

const PRINCIPIANTE: Record<ClassPackageKind, ClassPriceRow> = {
  monthly_8: {
    listMxn: 1200,
    discountMxn: 1000,
    discountPct: 17,
    sessions: 8,
    coachPayPerDayMxn: 150,
    label: { es: 'Mensual (8 clases)', en: 'Monthly (8 classes)' },
  },
  monthly_12: {
    listMxn: 1800,
    discountMxn: 1500,
    discountPct: 17,
    sessions: 12,
    coachPayPerDayMxn: 225,
    label: { es: 'Mensual (12 clases)', en: 'Monthly (12 classes)' },
  },
  group_session: {
    listMxn: 150,
    discountMxn: 400,
    sessions: 1,
    label: { es: 'Grupal · 1 sesión', en: 'Group · 1 session' },
  },
  individual_session: {
    listMxn: 250,
    discountMxn: 660,
    sessions: 1,
    label: { es: 'Individual · 1 sesión', en: 'Individual · 1 session' },
  },
  group_pack_3: {
    listMxn: 450,
    discountMxn: 660,
    sessions: 3,
    coachPayPerDayMxn: 135,
    label: { es: 'Grupal · 3 sesiones', en: 'Group · 3 sessions' },
  },
  group_pack_5: {
    listMxn: 750,
    discountMxn: 1100,
    sessions: 5,
    coachPayPerDayMxn: 135,
    label: { es: 'Grupal · 5 sesiones', en: 'Group · 5 sessions' },
  },
  individual_pack_3: {
    listMxn: 750,
    discountMxn: 1660,
    sessions: 3,
    coachPayPerDayMxn: 225,
    label: { es: 'Individual · 3 sesiones', en: 'Individual · 3 sessions' },
  },
  individual_pack_5: {
    listMxn: 1250,
    discountMxn: 2500,
    sessions: 5,
    coachPayPerDayMxn: 225,
    label: { es: 'Individual · 5 sesiones', en: 'Individual · 5 sessions' },
  },
}

const PRO_STREET: Partial<Record<ClassPackageKind, ClassPriceRow>> = {
  monthly_8: {
    listMxn: 2000,
    sessions: 8,
    label: { es: 'Mensual (8 clases)', en: 'Monthly (8 classes)' },
  },
  group_session: {
    listMxn: 250,
    discountMxn: 660,
    sessions: 1,
    label: { es: 'Grupal · 1 sesión', en: 'Group · 1 session' },
  },
  individual_session: {
    listMxn: 500,
    discountMxn: 1100,
    sessions: 1,
    label: { es: 'Individual · 1 sesión', en: 'Individual · 1 session' },
  },
  group_pack_3: {
    listMxn: 750,
    discountMxn: 1300,
    sessions: 3,
    coachPayPerDayMxn: 225,
    label: { es: 'Grupal · 3 sesiones', en: 'Group · 3 sessions' },
  },
  group_pack_5: {
    listMxn: 1250,
    discountMxn: 2200,
    sessions: 5,
    coachPayPerDayMxn: 225,
    label: { es: 'Grupal · 5 sesiones', en: 'Group · 5 sessions' },
  },
  individual_pack_3: {
    listMxn: 1500,
    discountMxn: 1660,
    sessions: 3,
    coachPayPerDayMxn: 450,
    label: { es: 'Individual · 3 sesiones', en: 'Individual · 3 sessions' },
  },
  individual_pack_5: {
    listMxn: 2500,
    discountMxn: 2500,
    sessions: 5,
    coachPayPerDayMxn: 450,
    label: { es: 'Individual · 5 sesiones', en: 'Individual · 5 sessions' },
  },
}

const PRO_BOWL: Partial<Record<ClassPackageKind, ClassPriceRow>> = {
  group_session: {
    listMxn: 250,
    discountMxn: 660,
    sessions: 1,
    label: { es: 'Grupal · 1 sesión', en: 'Group · 1 session' },
  },
  individual_session: {
    listMxn: 500,
    discountMxn: 1100,
    sessions: 1,
    label: { es: 'Individual · 1 sesión', en: 'Individual · 1 session' },
  },
  group_pack_3: {
    listMxn: 750,
    discountMxn: 1300,
    sessions: 3,
    coachPayPerDayMxn: 225,
    label: { es: 'Grupal · 3 sesiones', en: 'Group · 3 sessions' },
  },
  group_pack_5: {
    listMxn: 1250,
    discountMxn: 2200,
    sessions: 5,
    coachPayPerDayMxn: 225,
    label: { es: 'Grupal · 5 sesiones', en: 'Group · 5 sessions' },
  },
}

export const CLASS_PRICING: Record<
  CoachPricingTier,
  Partial<Record<ClassPackageKind, ClassPriceRow>>
> = {
  principiante: PRINCIPIANTE,
  pro_street: PRO_STREET,
  pro_bowl: PRO_BOWL,
}

export const COACH_PRICING_TIER_META: Record<
  CoachPricingTier,
  { label: { es: string; en: string }; description: { es: string; en: string } }
> = {
  principiante: {
    label: { es: 'Coach Principiante', en: 'Beginner Coach' },
    description: {
      es: 'Entrenador de fundamentos y técnica básica.',
      en: 'Fundamentals and basic technique coach.',
    },
  },
  pro_street: {
    label: { es: 'Coach Street', en: 'Coach Street' },
    description: {
      es: 'Especialista con experiencia en competencia y skate pro. Fundamentos hasta nivel competidor.',
      en: 'Specialist with competition and pro experience. Foundations through competitor level.',
    },
  },
  pro_bowl: {
    label: { es: 'Coach Bowl', en: 'Coach Bowl' },
    description: {
      es: 'Especialista en bowl con experiencia en competencia y skate pro.',
      en: 'Bowl specialist with competition and pro experience.',
    },
  },
}

/** Programs with Intermedio or Avanzado use Pro specialist pricing; Principiante only → fundamentals coach. */
export function coachTierFromSkillTracks(tracks: ProgramSkillTrack[]): CoachPricingTier {
  if (tracks.some(t => t === 'intermediate' || t === 'advanced')) return 'pro_street'
  return 'principiante'
}

export function coachTierFromSkillLevel(skillLevel: string | null | undefined): CoachPricingTier {
  return coachTierFromSkillTracks([skillTrackFromLevelId(skillLevel)])
}

export function coachTierLabel(tier: CoachPricingTier, es: boolean): string {
  const row = COACH_PRICING_TIER_META[tier]
  return es ? row.label.es : row.label.en
}

export function getClassPriceRow(
  tier: CoachPricingTier,
  kind: ClassPackageKind,
): ClassPriceRow | undefined {
  return CLASS_PRICING[tier][kind]
}

export function getClassPriceMxn(
  tier: CoachPricingTier,
  kind: ClassPackageKind,
  opts?: { discounted?: boolean; summerDays?: 5 | 10 },
): number {
  if (opts?.summerDays != null) {
    return summerCoursePriceMxn(opts.summerDays)
  }

  const row = getClassPriceRow(tier, kind)
  if (!row) return 0

  if (opts?.discounted && row.discountMxn != null) return row.discountMxn
  return row.listMxn
}

export function resolveProgramPackageKind(input: {
  eventType: 'class_session' | 'class_individual'
  isRecurring: boolean
  isSummerCourse: boolean
  summerWeeks?: 1 | 2
  classCount?: number
}): ClassPackageKind {
  if (input.isSummerCourse) {
    return input.eventType === 'class_individual' ? 'individual_pack_5' : 'group_pack_5'
  }
  if (!input.isRecurring) {
    return input.eventType === 'class_individual' ? 'individual_session' : 'group_session'
  }
  if (input.eventType === 'class_individual') {
    const n = input.classCount ?? 5
    if (n <= 3) return 'individual_pack_3'
    return 'individual_pack_5'
  }
  const n = input.classCount ?? SEASON_TOTAL_CLASSES
  if (n <= 8) return 'monthly_8'
  if (n <= 12) return 'monthly_12'
  return 'monthly_8'
}

export function resolveDefaultProgramPriceMxn(input: {
  skillTracks: ProgramSkillTrack[]
  eventType: 'class_session' | 'class_individual'
  isRecurring: boolean
  isSummerCourse: boolean
  summerWeeks?: 1 | 2
  classCount?: number
  coachTier?: CoachPricingTier
}): number {
  const tier = input.coachTier ?? coachTierFromSkillTracks(input.skillTracks)
  const kind = resolveProgramPackageKind({
    eventType: input.eventType,
    isRecurring: input.isRecurring,
    isSummerCourse: input.isSummerCourse,
    summerWeeks: input.summerWeeks,
    classCount: input.classCount,
  })
  const summerDays = input.isSummerCourse
    ? (input.summerWeeks === 2 ? 10 : 5)
    : undefined
  return getClassPriceMxn(tier, kind, {
    summerDays: summerDays as 5 | 10 | undefined,
  })
}

/** Full season (24 group classes) at list rate — per-session × count. */
export function fullSeasonGroupPriceMxn(
  tier: CoachPricingTier = 'principiante',
  discounted = false,
): number {
  const perSession = getClassPriceMxn(tier, 'group_session')
  const full = perSession * SEASON_TOTAL_CLASSES
  return discounted ? Math.round(full * 0.9) : full
}

/** Legacy defaults (Principiante tier). */
export const MONTHLY_PROGRAM_PRICE_MXN = getClassPriceMxn('principiante', 'monthly_8')
export const FULL_PROGRAM_PRICE_MXN = fullSeasonGroupPriceMxn('principiante')
export const DROP_IN_CLASS_PRICE_MXN = getClassPriceMxn('principiante', 'group_session')
export const DROP_IN_INDIVIDUAL_PRICE_MXN = getClassPriceMxn('principiante', 'individual_session')

export function formatMxn(amount: number): string {
  return `$${amount.toLocaleString('es-MX')} MXN`
}

export type PricingReferenceRow = {
  tier: CoachPricingTier
  classType: string
  listMxn: number
  finalMxn: number | null
  sessions: number
  discountPct: number | null
}

const PRICING_REFERENCE_KINDS: ClassPackageKind[] = [
  'monthly_8',
  'monthly_12',
  'group_session',
  'individual_session',
  'group_pack_3',
  'group_pack_5',
  'individual_pack_3',
  'individual_pack_5',
]

/** Which package rows appear in the admin pricing popover per coach tier. */
export const PRICING_POPOVER_KINDS: Record<CoachPricingTier, ClassPackageKind[]> = {
  principiante: [
    'monthly_8',
    'monthly_12',
    'group_session',
    'individual_session',
    'group_pack_3',
    'group_pack_5',
  ],
  pro_street: [
    'group_session',
    'individual_session',
    'group_pack_3',
    'group_pack_5',
    'individual_pack_3',
    'individual_pack_5',
  ],
  pro_bowl: ['group_session', 'individual_session', 'group_pack_3', 'group_pack_5'],
}

function referenceDiscountPct(listMxn: number, finalMxn: number | null | undefined): number | null {
  if (finalMxn == null || finalMxn >= listMxn) return null
  return Math.round((1 - finalMxn / listMxn) * 100)
}

export function buildPricingReferenceRows(es: boolean): PricingReferenceRow[] {
  const tiers: CoachPricingTier[] = ['principiante', 'pro_street', 'pro_bowl']
  const out: PricingReferenceRow[] = []
  for (const tier of tiers) {
    for (const kind of PRICING_POPOVER_KINDS[tier]) {
      const row = getClassPriceRow(tier, kind)
      if (!row) continue
      const finalMxn = row.discountMxn ?? null
      out.push({
        tier,
        classType: es ? row.label.es : row.label.en,
        listMxn: row.listMxn,
        finalMxn,
        sessions: row.sessions,
        discountPct: row.discountPct ?? referenceDiscountPct(row.listMxn, finalMxn),
      })
    }
  }
  return out
}

export function pricingReferenceByTier(es: boolean) {
  const rows = buildPricingReferenceRows(es)
  const tiers: CoachPricingTier[] = ['principiante', 'pro_street', 'pro_bowl']
  return tiers
    .map(tier => ({
      tier,
      label: coachTierLabel(tier, es),
      rows: rows.filter(r => r.tier === tier),
    }))
    .filter(g => g.rows.length > 0)
}

export function buildSummerPricingReference(es: boolean) {
  return [
    {
      label: es ? '5 días · Lun–Vie' : '5 days · Mon–Fri',
      priceMxn: summerCoursePriceMxn(5),
      perDayMxn: SUMMER_COURSE_DAY_PRICE_MXN,
    },
    {
      label: es ? '10 días · Lun–Vie' : '10 days · Mon–Fri',
      priceMxn: summerCoursePriceMxn(10),
      perDayMxn: SUMMER_COURSE_DAY_PRICE_MXN,
    },
  ]
}

export function formatPriceCell(amount: number, es: boolean): string {
  return `$${amount.toLocaleString(es ? 'es-MX' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function programPriceHint(
  tier: CoachPricingTier,
  es: boolean,
  opts?: { isSummerCourse?: boolean; classCount?: number },
): string {
  const monthly = getClassPriceMxn(tier, 'monthly_8')
  const monthlyDisc = getClassPriceMxn(tier, 'monthly_8', { discounted: true })
  const groupDropIn = getClassPriceMxn(tier, 'group_session')
  const indDropIn = getClassPriceMxn(tier, 'individual_session')
  const fullSeason = fullSeasonGroupPriceMxn(tier)
  const coach = coachTierLabel(tier, es)

  if (opts?.isSummerCourse) {
    const five = summerCoursePriceMxn(5)
    const ten = summerCoursePriceMxn(10)
    const perDay = SUMMER_COURSE_DAY_PRICE_MXN
    return es
      ? `Curso de verano Lun–Vie · $${perDay.toLocaleString('es-MX')}/día · 5 días $${five.toLocaleString('es-MX')} · 10 días $${ten.toLocaleString('es-MX')} MXN.`
      : `Summer course Mon–Fri · $${perDay.toLocaleString('en-US')}/day · 5 days $${five.toLocaleString('en-US')} · 10 days $${ten.toLocaleString('en-US')} MXN.`
  }

  if (es) {
    return `${coach}: mensual 8 clases $${monthly.toLocaleString('es-MX')} MXN`
      + (monthlyDisc !== monthly ? ` (desc. $${monthlyDisc.toLocaleString('es-MX')})` : '')
      + ` · grupal $${groupDropIn.toLocaleString('es-MX')} · individual $${indDropIn.toLocaleString('es-MX')}`
      + ` · temporada completa (${SEASON_TOTAL_CLASSES} clases): $${fullSeason.toLocaleString('es-MX')} MXN.`
  }
  return `${coach}: monthly 8 classes $${monthly.toLocaleString('en-US')} MXN`
    + (monthlyDisc !== monthly ? ` (disc. $${monthlyDisc.toLocaleString('en-US')})` : '')
    + ` · group $${groupDropIn.toLocaleString('en-US')} · individual $${indDropIn.toLocaleString('en-US')}`
    + ` · full season (${SEASON_TOTAL_CLASSES} classes): $${fullSeason.toLocaleString('en-US')} MXN.`
}
