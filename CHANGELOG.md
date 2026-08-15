# Changelog

All notable changes to this project are documented here. The format follows semantic-style versioning (`VERSION` file).

## [1.3.0] – 2026-08-15

### Summary
Admin and coach release: **school calendar programs**, **season pricing**, **family/skater admin**, and **coach student tools**. Production deploy via GitHub → Vercel.

### School calendar
- Recurring programs, summer course (Mon–Fri, 5 or 10 days), season titles, and a more reliable admin load (no endless spinner).
- Program create/edit modal: confirm before discarding unsaved changes; auto title from temporada.

### Pricing
- Separate reference tables for **Coach Principiante**, **Coach Street**, and **Coach Bowl**.
- Final prices aligned to the academy spreadsheet (monthly, drop-in, and packs).

### Academy & families
- Admin users: save-and-close, family create/edit, auto `@niikskate.com` emails, skater assign/remove.

### Coach tools
- Student profile: completed challenges list, assign-trick table with filters and scroll.
- Programs / tricks hub, skill-group structure, and related migrations in `supabase/migrations/`.

### Compared to [1.2.0]
- **`1.3.0`** ships live scheduling/pricing and roster workflows used daily by admin and coaches.

---

## [1.2.0] – 2026-04-26

### Summary
Production-oriented release: **program coaching hub**, fixed **class planning routes**, **skater roster fields** in the database, **navigation/UI polish**, operational **SQL docs/scripts**, and **auth middleware** on sensitive dashboard pages. Intended for real students with coaches and admins.

### Security
- **`auth` middleware** on `/dashboard/planning` (all tabs), `/dashboard/planning/programs`, and `/dashboard/planning/programs/[id]` so unauthenticated users cannot open coaching/planning tools by URL.
- **Production checklist** added to `SETUP_GUIDE.md` (secrets, RLS, Supabase Auth, Vercel env).

### Class planning & programs
- **Route fix:** `pages/dashboard/planning.vue` moved to `pages/dashboard/planning/index.vue` so nested route `/dashboard/planning/programs` registers correctly in Nuxt.
- **Program resource hub** at `/dashboard/planning/programs`: 90-minute session template (15′ warm-up / 15′ games / 45′ focused drills / 15′ closure), teaching pillars (safety, control, balance, strength), program list, calendar of **planned sessions** from `class_plans` (per coach, month navigation).
- **Per-program page** `/dashboard/planning/programs/[id]`: description, coaches, athletes (read-only note for coaches).
- **`ProgramPedagogyBlock`** shared component for pedagogy content.
- **Programs stat card** on Planning → Programas: skateboard icon, opens hub via **`navigateTo`** (reliable in WebView/Capacitor).

### Navigation & UI
- Bottom nav (coach/admin): **Inicio** = star, **Patinadores** = helmet, **Coaching** = checklist, **Program** = skateboard (was “Skate Program”; label shortened to **Program**).
- Skills pages: header title **Program** (was Skate Program).

### Data & Supabase (repo artifacts)
- **Migration** `add_profiles_name_dob_age.sql`: `first_name`, `last_name`, `date_of_birth`, `age` on `profiles` with sensible age check.
- **Script** `sync_skater_roster_2026.sql`: roster-driven profile updates (full names, levels, DOB handling).
- **Scripts:** onboarding users SQL, Fernanda→Valentina merge/delete SQL, **`SQL_MANUAL.md`** for admin queries.
- Additional migrations present in repo (news, reservations workflow, social accounts, skill focus, avatar storage, etc.) — apply only what your project still needs in Supabase SQL Editor.

### Types & composables
- **`User`** type extended with optional `first_name`, `last_name`, `date_of_birth`, `age`.
- Various composables and pages updated across booking, classes, coach directory, admin, home, profile (see git history for full file list).

### Documentation
- **`SETUP_GUIDE.md`:** expanded **GitHub + Vercel** deployment workflow and **production security** steps.
- **`CHANGELOG.md`:** this file.

### Compared to [1.1.0]
- Prior baseline (`1.1.0`): booking flow, pricing, payments, guest availability (per last tagged theme in git).
- **`1.2.0`** adds structured **program/coaching UX**, **DB roster fields**, **planning route correctness**, **stronger route protection** for planning pages, and **deployment/security documentation** for going live with real students.

---

## [1.1.0] – earlier

See git history (`git log`) for commits before this changelog file existed.
