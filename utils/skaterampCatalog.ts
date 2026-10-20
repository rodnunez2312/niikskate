/**
 * Catalog construction types, client options and the first build templates.
 * Start with Mini Quarter; more templates can follow the same shape.
 */

export const RAMP_CONSTRUCTION_TYPES = [
  { id: 'kicker', es: 'Kicker', en: 'Kicker' },
  { id: 'quarters', es: 'Quarters', en: 'Quarters' },
  { id: 'mini_ramp', es: 'Mini-ramp', en: 'Mini-ramp' },
  { id: 'grind_box', es: 'Grind-box', en: 'Grind-box' },
  { id: 'rails', es: 'Rails', en: 'Rails' },
  { id: 'other', es: 'Other', en: 'Other' },
] as const

export type RampConstructionType = (typeof RAMP_CONSTRUCTION_TYPES)[number]['id']

export const RAMP_SURFACING_OPTIONS = [
  { id: 'standard_birch', es: 'Abedul estándar', en: 'Standard Birch' },
  { id: 'skatelite_pro', es: 'Skatelite Pro', en: 'Skatelite Pro' },
] as const

export type RampSurfacing = (typeof RAMP_SURFACING_OPTIONS)[number]['id']

export type RampClientOptions = {
  surfacing: RampSurfacing | null
  casterWheels: boolean | null
  weatherCoating: boolean | null
}

export const DEFAULT_RAMP_CLIENT_OPTIONS: RampClientOptions = {
  surfacing: null,
  casterWheels: null,
  weatherCoating: null,
}

/** What Niik pays a supplier for one material line. Costs change by provider. */
export type RampMaterialGroup = 'wood' | 'coping' | 'hardware' | 'extra'

export type RampMaterialLine = {
  id: string
  name: string
  provider: string
  qty: number
  unit: string
  unitCostMxn: number
  group: RampMaterialGroup
  /** Set on the single coping line: 8, 7, or 6 cm. */
  sizeCm?: number | null
}

export const RAMP_COPING_SIZES = [8, 7, 6] as const

/** What the client pays for each optional upgrade. */
export type RampOptionPrices = {
  standard_birch: number
  skatelite_pro: number
  casterWheels: number
  weatherCoating: number
}

export type RampPricing = {
  materials: RampMaterialLine[]
  optionPrices: RampOptionPrices
  /** Applied to material cost only. Option prices are already client prices. */
  marginPct: number
}

export function emptyMaterialLine(): RampMaterialLine {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { id, name: '', provider: '', qty: 1, unit: 'pza', unitCostMxn: 0, group: 'extra' }
}

export const DEFAULT_RAMP_OPTION_PRICES: RampOptionPrices = {
  standard_birch: 0,
  skatelite_pro: 0,
  casterWheels: 0,
  weatherCoating: 0,
}

/**
 * Supplier price lists the admin already buys from.
 * Qty stays 0 until a ramp actually uses that piece, so the quote does not
 * charge for every sheet in the catalog.
 */
export const RAMP_MATERIAL_GROUPS: Array<{ id: RampMaterialGroup; es: string; en: string }> = [
  { id: 'wood', es: 'Siempre', en: 'Always' },
  { id: 'coping', es: 'Coping', en: 'Coping' },
  { id: 'hardware', es: 'Tornillos, sheet metal y recubrimiento', en: 'Screws, sheet metal and coating' },
]

/**
 * The three supplier lists already sent.
 * Wood costs switch with the proveedor chosen on each line.
 */
export const RAMP_WOOD_PROVIDERS: Array<{
  id: string
  name: string
  costs: Record<string, number>
}> = [
  {
    id: 'comatesa',
    name: 'COMATESA Mérida',
    costs: {
      'comatesa-barrote-pino': 46,
      'comatesa-triplay-9': 360,
      'comatesa-cimbraplay-18': 600,
    },
  },
  {
    id: 'proveedor-2',
    name: 'Proveedor 2',
    costs: {
      'comatesa-barrote-pino': 75,
      'comatesa-triplay-9': 692,
      'comatesa-cimbraplay-18': 890,
    },
  },
  {
    id: 'proveedor-3',
    name: 'Proveedor 3',
    costs: {
      'comatesa-barrote-pino': 160,
      'comatesa-triplay-9': 580,
      'comatesa-cimbraplay-18': 880,
    },
  },
]

export function woodProviderCost(materialId: string, providerName: string) {
  const provider = RAMP_WOOD_PROVIDERS.find(row => row.name === providerName) || RAMP_WOOD_PROVIDERS[0]
  return provider?.costs[materialId] ?? 0
}

export const RAMP_SUPPLIER_CATALOG: Array<Omit<RampMaterialLine, 'qty'>> = [
  { id: 'comatesa-barrote-pino', group: 'wood', provider: 'COMATESA Mérida', name: 'Barrotes', unit: 'pza', unitCostMxn: 46 },
  { id: 'comatesa-triplay-9', group: 'wood', provider: 'COMATESA Mérida', name: 'Triplay 9mm', unit: 'hoja', unitCostMxn: 360 },
  { id: 'comatesa-cimbraplay-18', group: 'wood', provider: 'COMATESA Mérida', name: 'Triplay 18mm', unit: 'hoja', unitCostMxn: 600 },
  { id: 'coping', group: 'coping', provider: '', name: 'Coping', unit: 'pza', unitCostMxn: 0, sizeCm: 8 },
  { id: 'screws', group: 'hardware', provider: '', name: 'Tornillos', unit: 'pza', unitCostMxn: 0 },
  { id: 'metal-plate', group: 'hardware', provider: '', name: 'Sheet metal', unit: 'pza', unitCostMxn: 0 },
  { id: 'coating', group: 'hardware', provider: '', name: 'Recubrimiento', unit: 'pza', unitCostMxn: 0 },
]

export function supplierMaterialLines(): RampMaterialLine[] {
  return RAMP_SUPPLIER_CATALOG.map(row => ({ ...row, qty: 0 }))
}

export function defaultRampPricing(): RampPricing {
  return {
    materials: supplierMaterialLines(),
    optionPrices: { ...DEFAULT_RAMP_OPTION_PRICES },
    marginPct: 40,
  }
}

function money(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function parseRampPricing(raw: unknown): RampPricing {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pricing = root.pricing && typeof root.pricing === 'object'
    ? (root.pricing as Record<string, unknown>)
    : {}
  const prices = pricing.optionPrices && typeof pricing.optionPrices === 'object'
    ? (pricing.optionPrices as Record<string, unknown>)
    : {}
  const materials = Array.isArray(pricing.materials)
    ? pricing.materials
        .map((row): RampMaterialLine | null => {
          if (!row || typeof row !== 'object') return null
          const line = row as Record<string, unknown>
          return {
            id: typeof line.id === 'string' && line.id ? line.id : emptyMaterialLine().id,
            name: typeof line.name === 'string' ? line.name : '',
            provider: typeof line.provider === 'string' ? line.provider : '',
            qty: money(line.qty) || (Number(line.qty) === 0 ? 0 : 1),
            unit: typeof line.unit === 'string' && line.unit ? line.unit : 'pza',
            unitCostMxn: money(line.unitCostMxn),
            group: line.group === 'wood' || line.group === 'coping' || line.group === 'hardware' || line.group === 'extra'
              ? line.group
              : 'extra',
            sizeCm: line.sizeCm === 8 || line.sizeCm === 7 || line.sizeCm === 6 ? line.sizeCm : null,
          }
        })
        .filter((row): row is RampMaterialLine => row != null)
    : []
  const margin = Number(pricing.marginPct)
  const savedById = new Map(materials.map(line => [line.id, line]))
  const catalogIds = new Set(RAMP_SUPPLIER_CATALOG.map(row => row.id))
  const core = supplierMaterialLines().map(line => {
    const saved = savedById.get(line.id)
    if (!saved) return line
    return {
      ...line,
      qty: saved.qty,
      unitCostMxn: saved.unitCostMxn || line.unitCostMxn,
      provider: saved.provider || line.provider,
      sizeCm: saved.sizeCm || line.sizeCm,
    }
  })
  const retiredCoping = ['coping-8', 'coping-7', 'coping-6']
    .map(id => savedById.get(id))
    .filter((line): line is RampMaterialLine => !!line)
  const coping = core.find(line => line.id === 'coping')
  const previousCoping = retiredCoping.find(line => line.qty > 0) || retiredCoping[0]
  if (coping && previousCoping && !savedById.has('coping')) {
    coping.qty = previousCoping.qty
    coping.unitCostMxn = previousCoping.unitCostMxn
    coping.sizeCm = previousCoping.id === 'coping-7' ? 7 : previousCoping.id === 'coping-6' ? 6 : 8
  }
  const retiredIds = new Set(['coping-8', 'coping-7', 'coping-6'])
  const extras = materials.filter(line => !catalogIds.has(line.id) && !retiredIds.has(line.id) && line.name.trim())
  return {
    materials: [...core, ...extras],
    optionPrices: {
      standard_birch: money(prices.standard_birch),
      skatelite_pro: money(prices.skatelite_pro),
      casterWheels: money(prices.casterWheels),
      weatherCoating: money(prices.weatherCoating),
    },
    marginPct: Number.isFinite(margin) && margin >= 0 ? margin : 40,
  }
}

const PLY_SHEET_SQFT = 32
const BARROTE_FT = 8
const COPING_STICK_FT = 12
const COATING_SQFT_PER_UNIT = 50
/** Each sheet-metal piece is 30 cm tall and as long as the ramp is wide. */
const SHEET_METAL_HEIGHT_CM = 30

export type RampTakeoff = {
  ridingSqFt: number
  sideSqFt: number
  volumeCuFt: number
  surfaceLengthFt: number
  surfaceWidthFt: number
  /** How many 30 cm × width strips the lips need. */
  sheetMetalStrips: number
  sheetMetalHeightCm: number
  qtyById: Record<string, number>
}

function transitionProfile(heightFt: number, radiusFt: number) {
  const height = Math.max(0, heightFt)
  const radius = Math.max(radiusFt, height, 0.5)
  const alpha = Math.acos(Math.min(1, Math.max(-1, 1 - height / radius)))
  const run = Math.sqrt(Math.max(0, 2 * radius * height - height * height))
  const arc = radius * alpha
  const sideCurve = (radius * radius / 2) * (alpha - Math.sin(alpha) * Math.cos(alpha))
  return { run, arc, sideCurve }
}

function ceilPositive(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.ceil(value)
}

/**
 * Piece counts from the ramp envelope.
 * Riding area and side area size the plywood. The volume under the sides
 * sizes the framing. Coping, sheet metal and coating follow the lip length.
 */
export function estimateRampTakeoff(
  sketch: {
    heightFt: number
    widthFt: number
    lengthFt: number
    transitionRadiusFt: number
    platformDepthFt: number
    kickerShape?: 'radius' | 'angle'
    bankAngleDeg?: number
    flatLengthFt?: number
  },
  construction: RampConstructionType,
): RampTakeoff {
  const height = Math.max(0, Number(sketch.heightFt) || 0)
  const width = Math.max(0, Number(sketch.widthFt) || 0)
  const length = Math.max(0, Number(sketch.lengthFt) || 0)
  const platform = Math.max(0, Number(sketch.platformDepthFt) || 0)
  const profile = transitionProfile(height, sketch.transitionRadiusFt)

  let ridingSqFt = 0
  let panelSqFt = 0
  let spineFt = 0
  let lipFt = 0
  let surfaceLengthFt = 0

  if (construction === 'kicker' && sketch.kickerShape === 'radius') {
    const arcProfile = transitionProfile(height, sketch.transitionRadiusFt)
    surfaceLengthFt = arcProfile.arc
    ridingSqFt = width * arcProfile.arc
    panelSqFt = arcProfile.sideCurve
    spineFt = arcProfile.arc
  } else if (construction === 'kicker') {
    const deg = Math.min(80, Math.max(1, Number(sketch.bankAngleDeg) || Math.atan2(height, Math.max(length, 0.1)) * 180 / Math.PI))
    const rad = (deg * Math.PI) / 180
    const run = height / Math.tan(rad)
    const slope = height / Math.sin(rad)
    surfaceLengthFt = slope
    ridingSqFt = width * slope
    panelSqFt = 0.5 * run * height
    spineFt = slope
  } else if (construction === 'grind_box' || construction === 'other') {
    surfaceLengthFt = length
    ridingSqFt = length * width
    panelSqFt = (length + width) * height
    spineFt = 2 * (length + width)
    lipFt = 2 * length
  } else if (construction === 'rails') {
    lipFt = length
    spineFt = length
  } else {
    const transitions = construction === 'mini_ramp' ? 2 : 1
    const decks = transitions
    const typedFlat = construction === 'mini_ramp' ? Number(sketch.flatLengthFt) || 0 : 0
    const flat = typedFlat > 0
      ? typedFlat
      : Math.max(0, length - transitions * profile.run - decks * platform)
    const curveRun = transitions * profile.arc + decks * platform + flat
    surfaceLengthFt = curveRun
    ridingSqFt = curveRun * width
    panelSqFt = transitions * profile.sideCurve + decks * platform * height + flat * height
    spineFt = curveRun
    lipFt = transitions * width
  }

  const sideSqFt = panelSqFt * 2
  const boxVolume = construction === 'grind_box' || construction === 'other'
    ? length * width * height
    : panelSqFt * width

  const ribFt = 8 / 12
  const ribs = spineFt > 0 ? Math.ceil(spineFt / ribFt) + 1 : 0
  const piecesPerRib = width > 0 ? Math.ceil(width / BARROTE_FT) : 0
  const chords = 4 * ceilPositive(spineFt / BARROTE_FT)
  const posts = 4 * ceilPositive(height / BARROTE_FT)
  const barrotes = construction === 'rails'
    ? ceilPositive(length / 4)
    : Math.ceil((ribs * piecesPerRib + chords + posts) * 1.1)

  const sheets9 = ceilPositive((ridingSqFt * 2 * 1.12) / PLY_SHEET_SQFT)
  const sheets18 = ceilPositive((sideSqFt * 1.15) / PLY_SHEET_SQFT)
  const coping = construction === 'rails' || construction === 'kicker'
    ? 0
    : ceilPositive(lipFt / COPING_STICK_FT)
  const sheetMetalStrips = width > 0 ? ceilPositive(lipFt / width) : 0
  const screws = construction === 'rails'
    ? ceilPositive(length * 4)
    : ceilPositive(ridingSqFt * 8 + sideSqFt * 2)
  const coating = ceilPositive((surfaceLengthFt * width) / COATING_SQFT_PER_UNIT)

  return {
    ridingSqFt: Math.round(ridingSqFt),
    sideSqFt: Math.round(sideSqFt),
    volumeCuFt: Math.round(boxVolume),
    surfaceLengthFt: Math.round(surfaceLengthFt * 10) / 10,
    surfaceWidthFt: Math.round(width * 10) / 10,
    sheetMetalStrips,
    sheetMetalHeightCm: SHEET_METAL_HEIGHT_CM,
    qtyById: {
      'comatesa-barrote-pino': barrotes,
      'comatesa-triplay-9': sheets9,
      'comatesa-cimbraplay-18': sheets18,
      coping,
      screws,
      'metal-plate': sheetMetalStrips,
      coating,
    },
  }
}

export function rampMaterialCost(lines: RampMaterialLine[]): number {
  return lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitCostMxn) || 0), 0)
}

export function selectedRampOptionPrice(options: RampClientOptions, prices: RampOptionPrices): number {
  let total = 0
  if (options.surfacing === 'standard_birch') total += prices.standard_birch || 0
  if (options.surfacing === 'skatelite_pro') total += prices.skatelite_pro || 0
  if (options.casterWheels) total += prices.casterWheels || 0
  if (options.weatherCoating) total += prices.weatherCoating || 0
  return total
}

export function rampQuote(pricing: RampPricing, options: RampClientOptions) {
  const materialCost = rampMaterialCost(pricing.materials)
  const marginPct = Number(pricing.marginPct) || 0
  const basePrice = materialCost * (1 + marginPct / 100)
  const optionsPrice = selectedRampOptionPrice(options, pricing.optionPrices)
  return {
    materialCost,
    basePrice,
    optionsPrice,
    sellingPrice: Math.round(basePrice + optionsPrice),
  }
}

export function parseRampClientOptions(raw: unknown): RampClientOptions {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const surfacing = RAMP_SURFACING_OPTIONS.some(opt => opt.id === o.surfacing)
    ? (o.surfacing as RampSurfacing)
    : null
  return {
    surfacing,
    casterWheels: typeof o.casterWheels === 'boolean' ? o.casterWheels : null,
    weatherCoating: typeof o.weatherCoating === 'boolean' ? o.weatherCoating : null,
  }
}

export type RampBuildTemplate = {
  id: string
  constructionType: RampConstructionType
  title: { es: string; en: string }
  spec: {
    altura: string
    ancho: string
    depth: string
    coping: string
    deck: string
    sides: string
    surfaceLayers: Array<{ label: string; size: string }>
  }
}

export const MINI_QUARTER_TEMPLATE: RampBuildTemplate = {
  id: 'mini_quarter',
  constructionType: 'quarters',
  title: { es: 'Mini quarter', en: 'Mini quarter' },
  spec: {
    altura: '32cm',
    ancho: '1.22m',
    depth: '1.38m',
    coping: '8cm',
    deck: '41cm x 1.22m',
    sides: '',
    surfaceLayers: [
      { label: 'Capa 1 de 9mm', size: '79.9 x 1.22m' },
      { label: 'Capa 2 de 9mm', size: '80cm x 1.22m' },
    ],
  },
}

export const RAMP_BUILD_TEMPLATES: RampBuildTemplate[] = [MINI_QUARTER_TEMPLATE]

export function templatesForConstruction(type: RampConstructionType | null | undefined) {
  if (!type) return []
  return RAMP_BUILD_TEMPLATES.filter(t => t.constructionType === type)
}

export function formatRampTemplateNotes(template: RampBuildTemplate): string {
  const layers = template.spec.surfaceLayers
    .map(layer => `${layer.label}: ${layer.size}`)
    .join('\n')
  return [
    `Altura: ${template.spec.altura}`,
    `Ancho: ${template.spec.ancho}`,
    `Depth: ${template.spec.depth}`,
    `Coping: ${template.spec.coping}`,
    `Deck: ${template.spec.deck}`,
    '',
    `Sides:${template.spec.sides ? ` ${template.spec.sides}` : ''}`,
    '',
    'Surface:',
    layers,
  ].join('\n')
}

export function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url)
}

export function isRampConstructionType(value: string | null | undefined): value is RampConstructionType {
  return RAMP_CONSTRUCTION_TYPES.some(opt => opt.id === value)
}
