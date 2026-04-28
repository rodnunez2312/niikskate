/**
 * Supabase `Database` type for @nuxtjs/supabase (`supabase.types` in nuxt.config).
 *
 * Without a file here, the module generates `Database = unknown` and PostgREST types collapse to `never`.
 *
 * For strict per-table + FK types, replace this file with:
 *   npx supabase gen types typescript --project-id <ref> > types/database.types.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** Loose schema: lets app code assign query results to `NewsItem`, `Skill`, etc. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any
