import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANNING_SKILL_GROUP_NAMES, STRENGTH_TRAINING_DISPLAY_NAME } from '~/utils/skillGroupLevels'

/** Planning-only group (strength drills) — not used for skater level assignment. */
export async function resolvePlanningSkillGroupId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('skill_groups')
    .select('id, name, sort_order, is_active')
    .in('name', [...PLANNING_SKILL_GROUP_NAMES])
    .order('sort_order')
  if (error) {
    console.error('resolvePlanningSkillGroupId:', error)
    return null
  }
  const rows = data || []
  const active = rows.filter(g => g.is_active !== false)
  return (
    active.find(g => g.name === STRENGTH_TRAINING_DISPLAY_NAME)?.id
    ?? active.find(g => g.name === '0 - Warmup')?.id
    ?? null
  )
}

/** @deprecated Skaters are not assigned to Strength Training; returns null. */
export async function resolveDefaultSkaterSkillGroupId(
  supabase: SupabaseClient,
): Promise<string | null> {
  return null
}
