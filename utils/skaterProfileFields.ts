export type SkaterTraitIconId =
  | 'stance_regular'
  | 'stance_goofy'
  | 'style_street'
  | 'style_vert'
  | 'style_park'
  | 'style_bowl'
  | 'style_all_around'
  | 'push_clean'
  | 'push_mongo'

export type SkaterTraitOption = {
  value: string
  labelEn: string
  labelEs: string
  icon: SkaterTraitIconId
}

export const SKATER_STANCE_OPTIONS: readonly SkaterTraitOption[] = [
  { value: 'regular', labelEn: 'Regular', labelEs: 'Regular', icon: 'stance_regular' },
  { value: 'goofy', labelEn: 'Goofy', labelEs: 'Goofy', icon: 'stance_goofy' },
] as const

export const SKATER_STYLE_OPTIONS: readonly SkaterTraitOption[] = [
  { value: 'all_around', labelEn: 'All-around', labelEs: 'Mixto', icon: 'style_all_around' },
  { value: 'street', labelEn: 'Street', labelEs: 'Street', icon: 'style_street' },
  { value: 'park', labelEn: 'Park', labelEs: 'Park', icon: 'style_park' },
  { value: 'bowl', labelEn: 'Bowl', labelEs: 'Bowl', icon: 'style_bowl' },
  { value: 'vert', labelEn: 'Vert', labelEs: 'Vert', icon: 'style_vert' },
] as const

export const SKATER_PUSH_OPTIONS: readonly SkaterTraitOption[] = [
  { value: 'never_mongo', labelEn: 'No mongo', labelEs: 'Sin mongo', icon: 'push_clean' },
  { value: 'mongo', labelEn: 'Mongo', labelEs: 'Mongo', icon: 'push_mongo' },
] as const

function labelFor<T extends { value: string; labelEn: string; labelEs: string }>(
  options: readonly T[],
  value: string | null | undefined,
  es: boolean,
): string {
  const v = (value || '').trim()
  if (!v) return '—'
  const hit = options.find(o => o.value === v)
  if (hit) return es ? hit.labelEs : hit.labelEn
  return v.replace(/_/g, ' ')
}

export function skaterStanceLabel(value: string | null | undefined, es: boolean): string {
  return labelFor(SKATER_STANCE_OPTIONS, value, es)
}

export function skaterStyleLabel(value: string | null | undefined, es: boolean): string {
  return labelFor(SKATER_STYLE_OPTIONS, value, es)
}

export function skaterPushLabel(value: string | null | undefined, es: boolean): string {
  return labelFor(SKATER_PUSH_OPTIONS, value, es)
}
