export type SkaterampStage = 'idea' | 'concept' | 'build' | 'published'

export type RampSketchType =
  | 'quarter'
  | 'half'
  | 'funbox'
  | 'mini'
  | 'manual_pad'
  | 'custom'

export type RampSketch = {
  rampType: RampSketchType
  heightFt: number
  widthFt: number
  lengthFt: number
  transitionRadiusFt: number
  platformDepthFt: number
  notes: string
}

export const DEFAULT_RAMP_SKETCH: RampSketch = {
  rampType: 'quarter',
  heightFt: 3,
  widthFt: 8,
  lengthFt: 12,
  transitionRadiusFt: 6,
  platformDepthFt: 2,
  notes: '',
}

export const RAMP_TYPE_OPTIONS: Array<{
  id: RampSketchType
  label: { en: string; es: string }
}> = [
  { id: 'quarter', label: { en: 'Quarter pipe', es: 'Quarter pipe' } },
  { id: 'half', label: { en: 'Half pipe', es: 'Half pipe' } },
  { id: 'mini', label: { en: 'Mini ramp', es: 'Mini ramp' } },
  { id: 'funbox', label: { en: 'Fun box', es: 'Fun box' } },
  { id: 'manual_pad', label: { en: 'Manual pad', es: 'Manual pad' } },
  { id: 'custom', label: { en: 'Custom', es: 'Personalizado' } },
]

export function parseRampSketch(raw: unknown): RampSketch {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rampType = RAMP_TYPE_OPTIONS.some(t => t.id === o.rampType)
    ? (o.rampType as RampSketchType)
    : 'quarter'
  return {
    rampType,
    heightFt: clampNum(o.heightFt, 1, 14, DEFAULT_RAMP_SKETCH.heightFt),
    widthFt: clampNum(o.widthFt, 4, 24, DEFAULT_RAMP_SKETCH.widthFt),
    lengthFt: clampNum(o.lengthFt, 4, 40, DEFAULT_RAMP_SKETCH.lengthFt),
    transitionRadiusFt: clampNum(o.transitionRadiusFt, 2, 12, DEFAULT_RAMP_SKETCH.transitionRadiusFt),
    platformDepthFt: clampNum(o.platformDepthFt, 0, 8, DEFAULT_RAMP_SKETCH.platformDepthFt),
    notes: typeof o.notes === 'string' ? o.notes : '',
  }
}

function clampNum(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Side-profile SVG for admin sketch preview (not to scale — proportional). */
export function rampSketchSvg(sketch: RampSketch): string {
  const h = sketch.heightFt * 18
  const r = Math.min(sketch.transitionRadiusFt * 14, h * 0.85)
  const deck = sketch.platformDepthFt * 16
  const run = sketch.lengthFt * 10
  const w = 280
  const baseY = 160

  let profile = ''
  if (sketch.rampType === 'funbox') {
    profile = `
      M 40 ${baseY} L 40 ${baseY - h * 0.55} L 120 ${baseY - h * 0.55} L 120 ${baseY - h} L 200 ${baseY - h} L 200 ${baseY - h * 0.55} L 260 ${baseY - h * 0.55} L 260 ${baseY}
    `
  } else if (sketch.rampType === 'manual_pad') {
    profile = `
      M 40 ${baseY} L 40 ${baseY - h * 0.35} L 240 ${baseY - h * 0.35} L 240 ${baseY}
    `
  } else if (sketch.rampType === 'half') {
    profile = `
      M 40 ${baseY} L 40 ${baseY - h} A ${r} ${r} 0 0 1 ${40 + r * 2} ${baseY - h}
      L ${40 + r * 2 + deck} ${baseY - h} A ${r} ${r} 0 0 1 ${40 + r * 4 + deck} ${baseY}
    `
  } else {
    // quarter, mini, custom
    profile = `
      M 40 ${baseY} L 40 ${baseY - h + r} A ${r} ${r} 0 0 1 ${40 + r} ${baseY - h}
      L ${40 + r + deck} ${baseY - h} L ${40 + r + deck + run * 0.15} ${baseY - h} L ${40 + r + deck + run * 0.15} ${baseY}
    `
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 180" role="img" aria-label="Ramp sketch">
    <rect x="0" y="0" width="${w}" height="180" fill="#0f172a"/>
    <line x1="20" y1="${baseY}" x2="${w - 20}" y2="${baseY}" stroke="#334155" stroke-width="2"/>
    <path d="${profile.trim()}" fill="none" stroke="#2dd4bf" stroke-width="3" stroke-linejoin="round"/>
    <text x="24" y="24" fill="#94a3b8" font-size="11" font-family="monospace">${sketch.rampType} · ${sketch.heightFt}ft × ${sketch.widthFt}ft</text>
  </svg>`
}

export function slugifyRampTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'rampa'
}
