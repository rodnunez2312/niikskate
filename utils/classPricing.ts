export const SEASON_TOTAL_CLASSES = 12

/** Curso de verano — flat group rate ($420/day; 5-day pack $1,860). */
export const SUMMER_COURSE_DAY_PRICE_MXN = 420
export const SUMMER_COURSE_PRICE_MXN: Record<5 | 10, number> = {
  5: 1860,
  10: SUMMER_COURSE_DAY_PRICE_MXN * 10,
}

export function summerCoursePriceMxn(days: 5 | 10): number {
  return SUMMER_COURSE_PRICE_MXN[days]
}

/** Coach Niik teaches fundamentals; Coach Pro is competition/pro experience (Street or Bowl). */
export type CoachPricingTier = 'principiante' | 'pro_street' | 'pro_bowl'

export type ClassPackageKind =
  | 'monthly_4'
  | 'monthly_8'
  | 'monthly_12'
  | 'monthly_16'
  | 'monthly_24'
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
  monthly_4: {
    listMxn: 600,
    sessions: 4,
    coachPayPerDayMxn: 90,
    label: { es: '4 clases (1 por semana · 4 sem)', en: '4 classes (1/week · 4 wk)' },
  },
  monthly_8: {
    listMxn: 1000,
    sessions: 8,
    coachPayPerDayMxn: 150,
    label: { es: '8 clases (2 por semana · 4 sem)', en: '8 classes (2/week · 4 wk)' },
  },
  monthly_12: {
    listMxn: 1500,
    sessions: 12,
    coachPayPerDayMxn: 225,
    label: { es: '12 clases (3 por semana · 4 sem)', en: '12 classes (3/week · 4 wk)' },
  },
  monthly_16: {
    listMxn: 2000,
    sessions: 16,
    coachPayPerDayMxn: 150,
    label: { es: '16 clases (2 por semana · 8 sem)', en: '16 classes (2/week · 8 wk)' },
  },
  monthly_24: {
    listMxn: 3000,
    sessions: 24,
    coachPayPerDayMxn: 225,
    label: { es: '24 clases (3 por semana · 8 sem)', en: '24 classes (3/week · 8 wk)' },
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
  monthly_4: {
    listMxn: 600,
    sessions: 4,
    label: { es: '4 clases (1 por semana · 4 sem)', en: '4 classes (1/week · 4 wk)' },
  },
  monthly_8: {
    listMxn: 1000,
    sessions: 8,
    label: { es: '8 clases (2 por semana · 4 sem)', en: '8 classes (2/week · 4 wk)' },
  },
  monthly_12: {
    listMxn: 1500,
    sessions: 12,
    label: { es: '12 clases (3 por semana · 4 sem)', en: '12 classes (3/week · 4 wk)' },
  },
  monthly_16: {
    listMxn: 2000,
    sessions: 16,
    label: { es: '16 clases (2 por semana · 8 sem)', en: '16 classes (2/week · 8 wk)' },
  },
  monthly_24: {
    listMxn: 3000,
    sessions: 24,
    label: { es: '24 clases (3 por semana · 8 sem)', en: '24 classes (3/week · 8 wk)' },
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
    // Same wording as the Finanzas price sheet so both screens name one coach.
    label: { es: 'Coach Niik', en: 'Coach Niik' },
    description: {
      es: 'Entrenador de fundamentos y técnica básica.',
      en: 'Fundamentals and basic technique coach.',
    },
  },
  pro_street: {
    label: { es: 'Coach Pro Street', en: 'Coach Pro Street' },
    description: {
      es: 'Especialista con experiencia en competencia y skate pro. Fundamentos hasta nivel competidor.',
      en: 'Specialist with competition and pro experience. Foundations through competitor level.',
    },
  },
  pro_bowl: {
    label: { es: 'Coach Pro Bowl', en: 'Coach Pro Bowl' },
    description: {
      es: 'Especialista en bowl con experiencia en competencia y skate pro.',
      en: 'Bowl specialist with competition and pro experience.',
    },
  },
}

/**
 * Programs sell at Coach Niik rates unless an admin picks another coach. The
 * tier used to be derived from the skill level, which silently charged Pro
 * Street prices for every Intermedio and Avanzado program.
 */
export const DEFAULT_COACH_TIER: CoachPricingTier = 'principiante'

export const COACH_PRICING_TIERS: CoachPricingTier[] = ['principiante', 'pro_street', 'pro_bowl']

/** Reads a tier off a DB row, falling back to Coach Niik for older programs. */
export function normalizeCoachTier(value: string | null | undefined): CoachPricingTier {
  return COACH_PRICING_TIERS.includes(value as CoachPricingTier)
    ? (value as CoachPricingTier)
    : DEFAULT_COACH_TIER
}

export function coachTierLabel(tier: CoachPricingTier, es: boolean): string {
  const row = COACH_PRICING_TIER_META[tier]
  return es ? row.label.es : row.label.en
}

/**
 * Pro Bowl only sells sessions and small packs, so a monthly program on that
 * coach falls back to the Coach Niik row instead of pricing itself at $0.
 */
export function getClassPriceRow(
  tier: CoachPricingTier,
  kind: ClassPackageKind,
): ClassPriceRow | undefined {
  return CLASS_PRICING[tier][kind] ?? CLASS_PRICING[DEFAULT_COACH_TIER][kind]
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
  if (n <= 4) return 'monthly_4'
  if (n <= 8) return 'monthly_8'
  if (n <= 12) return 'monthly_12'
  if (n <= 16) return 'monthly_16'
  return 'monthly_24'
}

export function resolveDefaultProgramPriceMxn(input: {
  eventType: 'class_session' | 'class_individual'
  isRecurring: boolean
  isSummerCourse: boolean
  summerWeeks?: 1 | 2
  classCount?: number
  coachTier?: CoachPricingTier
}): number {
  const tier = input.coachTier ?? DEFAULT_COACH_TIER
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

/** Full 12-class season pack. */
export function fullSeasonGroupPriceMxn(
  tier: CoachPricingTier = 'principiante',
  discounted = false,
): number {
  return getClassPriceMxn(tier, 'monthly_12', { discounted })
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
  'monthly_4',
  'monthly_8',
  'monthly_12',
  'monthly_16',
  'monthly_24',
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
    'monthly_4',
    'monthly_8',
    'monthly_12',
    'monthly_16',
    'monthly_24',
    'group_session',
    'individual_session',
    'group_pack_3',
    'group_pack_5',
  ],
  pro_street: [
    'monthly_4',
    'monthly_8',
    'monthly_12',
    'monthly_16',
    'monthly_24',
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

  const pack4 = getClassPriceMxn(tier, 'monthly_4')
  const pack16 = getClassPriceMxn(tier, 'monthly_16')
  const pack24 = getClassPriceMxn(tier, 'monthly_24')
  if (es) {
    return `${coach}: 4 sem — 4 clases $${pack4.toLocaleString('es-MX')}, 8 $${monthly.toLocaleString('es-MX')} o 12 $${fullSeason.toLocaleString('es-MX')}`
      + ` · 8 sem — 16 clases $${pack16.toLocaleString('es-MX')} o 24 $${pack24.toLocaleString('es-MX')}`
      + ` · grupal $${groupDropIn.toLocaleString('es-MX')} · individual $${indDropIn.toLocaleString('es-MX')} MXN.`
  }
  return `${coach}: 4 wk — 4 classes $${pack4.toLocaleString('en-US')}, 8 $${monthly.toLocaleString('en-US')} or 12 $${fullSeason.toLocaleString('en-US')}`
    + ` · 8 wk — 16 classes $${pack16.toLocaleString('en-US')} or 24 $${pack24.toLocaleString('en-US')}`
    + ` · group $${groupDropIn.toLocaleString('en-US')} · individual $${indDropIn.toLocaleString('en-US')} MXN.`
}
