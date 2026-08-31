# Supabase SQL manual — Niik Skate (users & payments)

Use this in the **Supabase Dashboard → SQL Editor**. Queries run there typically execute as a privileged database role and **bypass Row Level Security (RLS)**—the same statements from the app (as a logged-in user) may return fewer rows.

**Before `UPDATE` / `DELETE`:** take a backup or run the matching `SELECT` first and export results.

---

## 1. How users are represented

| Layer | Table | Purpose |
|--------|--------|---------|
| Authentication | `auth.users` | Email, sign-in metadata, `id` (UUID). Managed by Supabase Auth. |
| Application profile | `public.profiles` | One row per skater/coach/admin: `id` **equals** `auth.users.id`, plus `email`, `full_name`, `role`, etc. |

Most operational queries start from **`profiles`** and join to **`auth.users`** only when you need auth-only fields (e.g. `last_sign_in_at`, `email_confirmed_at`).

**If you insert into `auth.users` with raw SQL** (not the Admin API), set `confirmation_token`, `email_change`, `email_change_token_new`, and `recovery_token` to `''` (empty string), not `NULL`, or password sign-in can fail with *Database error querying schema* ([auth#1940](https://github.com/supabase/auth/issues/1940)). To fix existing rows, run `supabase/scripts/fix_auth_users_null_token_columns.sql` in the SQL Editor.

**Roles** (enum `user_role`): `admin`, `coach`, `customer`.

### Family crew (parents + children)

| Table | Purpose |
|--------|---------|
| `crew_members` | Skaters managed by a guardian (`guardian_user_id` → `profiles.id`). Children without their own login. |
| `class_session_enrollments.crew_member_id` | Which crew skater is enrolled; `NULL` = account holder enrolled for self. |

Run migration: `supabase/migrations/add_crew_members.sql`

Run migration: `supabase/migrations/add_monday_slot_and_audience_categories.sql` (monday slot + audience columns)

Run migration: `supabase/migrations/add_program_age_skill_bands.sql` (**required after monday script** — allows `tots_5_7` / `kids_7_12` / `teens_13_17` used by the admin UI)

Run migration: `supabase/migrations/add_morning_slot_program_series.sql` (morning slot, program series, max 6 cap)

Run migration: `supabase/migrations/add_birthday_and_class_individual.sql` (birthday events + individual class programs)

Run migration: `supabase/migrations/seed_mexico_holidays_2026_2027.sql` (national holidays 2026–2027; also auto-seeded when opening admin calendar)

Run migration: `supabase/migrations/add_brand_and_ramp_storage_policies.sql` (**required for brand logo uploads** in Admin → Skateshop → Marcas) — `storage.objects` only had policies for `products/` and `avatars/`, so every write to `brands/` was denied by RLS and the logo silently fell back to a device-local `blob:` URL. Also covers `skateramps/`, which had the same gap for the ramp studio reference photos.

Run migration: `supabase/migrations/add_skateramp_projects.sql` (Skateramps studio + public catalog projects)

Run migration: `supabase/migrations/add_skateramp_requests.sql` (**required for the "Contactar" form** on `/skateramps`) — creates `skateramp_requests`, the customer inbox shown at `/member/admin/skateramp-requests`. Rows are written by `/api/skateramps/request` with the service role and photos are uploaded server-side to `images/ramp-requests/<uuid>/`, so there is intentionally **no** anon INSERT policy here and no public write policy on storage. Only admins can read. Email to `niikskateacademy@gmail.com` is best-effort on top of this table: set `RESEND_API_KEY` and `MAIL_FROM` (see `.env.example`) to enable it — without them the enquiry is still captured, and the admin page flags anything that was not emailed. Safe to re-run: it adds `email_error` to tables created before that column existed, which is what the admin banner reads to name the cause instead of guessing at the config.

Run migration: `supabase/migrations/add_strength_exercises.sql` (strength library: 5 pillars, body areas, training phases + `class_plans.strength_block`)

Run migration: `supabase/migrations/add_finance_module.sql` (**required for the Finanzas section** at `/member/admin/finance`) — creates `finance_price_list` (seeded with the full class price sheet: Coach Niik / Pro Street / Pro Bowl), `finance_payments` (income), `finance_expenses` (costs), `finance_student_enrollments` (per-skater control sheet) and `finance_settings` (break-even inputs). Safe to re-run: every statement is idempotent and the price seed uses `ON CONFLICT DO NOTHING`, so edits made in the app are never overwritten.

Run migration: `supabase/migrations/add_coupons.sql` (**required for Finanzas → Cupones** and for the code box at checkout) — creates `coupons`, `coupon_skaters` (the allow-list) and `coupon_redemptions`, and seeds `NIIKDAY1S`, which pins the beginner 8-class monthly at $800. The seeded coupon is restricted, so it does nothing until you add skaters to it in Finanzas → Cupones. Customers deliberately have **no** read policy on `coupons`: validation runs through `/api/coupons/validate` with the service role so codes cannot be enumerated.

Run migration: `supabase/migrations/fix_detached_program_occurrences.sql` (only if renaming a class in the admin calendar once split an extra copy of a program out of the sidebar — reattaches classes whose `program_series_id` was cleared)

Run migration: `supabase/migrations/fix_skills_library_sync_rls_and_restore.sql` (fixes *"new row violates row-level security policy for table skills_library"* on **Sincronizar desde Excel**, and re-activates the library if a failed sync left every trick switched off)

Run migration: `supabase/migrations/add_skater_challenges.sql` (**required for Desafíos** on the skater panel) — creates `skater_challenges`, the coach-set goals shown above the trick bag. Challenges are free text and deliberately unrelated to `skills_library`, so they never move the "Trucos aprendidos" counter. Staff create and delete them; the skater (or their guardian's kid account) can tick one off, and only staff can reopen it.

Run migration: `supabase/migrations/add_skater_self_trick_completion.sql` (**required so skaters can mark their own tricks done**) — adds an INSERT policy on `student_progress` for `auth.uid() = student_id`, gated on the trick already being in that skater's `student_skill_focus` bag. Without it, a skater tapping "¡Ya lo logré!" flips the bag status but the trick never unlocks. Undoing a completion stays coach/admin-only.

Run migration: `supabase/migrations/split_strength_from_trick_manual.sql` (**required before the next "Sync from Excel"**) — strength moved to its own Excel sheet, so every trick's `#` shifted down by 24 (320 → 296 rows). `skills_library` upserts on `manual_id`, so syncing without re-keying first would rewrite rows in place and re-point skaters' trick bags at the wrong tricks. The script refuses to run unless the library is in the exact pre-split shape.

```sql
-- List a parent's crew
SELECT id, first_name, last_name, date_of_birth, age
FROM crew_members
WHERE guardian_user_id = 'PARENT_PROFILE_UUID'
ORDER BY sort_order, created_at;
```

---

## 2. Checking users (basics)

### 2.1 List recent profiles

```sql
SELECT id, email, full_name, role, is_active, phone, created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 50;
```

### 2.2 Find one user by email (profile)

```sql
SELECT *
FROM profiles
WHERE lower(email) = lower('someone@example.com');
```

### 2.3 Profile + last sign-in from Auth

```sql
SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  u.last_sign_in_at,
  u.email_confirmed_at,
  u.created_at AS auth_created_at
FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE lower(p.email) = lower('someone@example.com');
```

### 2.4 Count users by role

```sql
SELECT role, COUNT(*) AS n
FROM profiles
GROUP BY role
ORDER BY n DESC;
```

### 2.5 Active skaters (customers) only

```sql
SELECT id, email, full_name, created_at
FROM profiles
WHERE role = 'customer'
  AND is_active IS DISTINCT FROM FALSE
ORDER BY full_name;
```

### 2.6 Auth user exists but no profile (should be rare)

```sql
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

### 2.7 Profile without matching auth user (orphaned profile)

```sql
SELECT p.*
FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE u.id IS NULL;
```

---

## 3. Payments and money-adjacent data

Your schema has **several** payment surfaces; use the one that matches the product flow.

| Table | Typical use |
|--------|-------------|
| **`finance_payments`** | **Academy income ledger** written by Finanzas → Ingresos. Free of the `orders`/`bookings` requirement, so a cash class payment can be recorded on its own. `academy_cut_mxn` and `coach_pay_mxn` are generated from `amount_mxn * academy_pct`. |
| **`finance_expenses`** | **Cost ledger** (rent, coaches paid directly, supplies…). `is_recurring` + `recurrence` mark the fixed monthly costs used for break-even. |
| **`finance_price_list`** | Editable class price sheet per coach tier: `list_mxn`, `discount_pct`, `final_mxn`, `sessions`, `academy_pct`, `min_fee_mxn`. |
| **`finance_student_enrollments`** | Per-skater control sheet: classes paid, committed weekdays, attendance, absences, `remaining_sessions` (generated). |
| **`coupons`** / **`coupon_skaters`** / **`coupon_redemptions`** | Discount codes, their skater allow-list, and one audit row per use with `original_mxn` / `discount_mxn` / `final_mxn` frozen at redemption. |
| **`user_credits`** | Class packages / tokens: `price_paid_mxn`, `price_paid_usd`, `payment_method`, `payment_status`, optional `guest_booking_id`. |
| **`guest_bookings`** | Checkout payload (`booking_data`), link to user via `linked_user_id`. |
| **`class_reservations`** | Booked slots; status may include payment-pending workflow (see enum `credit_status` in DB). |
| **`bookings`** | Legacy schedule-based bookings: `amount_paid`, `payment_status`, `payment_method`. |
| **`orders` / `order_items`** | Shop / POS-style orders. |
| **`payments`** | Individual payment lines tied to **`orders`** and/or **`bookings`** (`order_id` XOR `booking_id` enforced by CHECK). |
| **`coach_payments`** | **Coach payroll** (amounts you pay coaches)—not customer payments. |

### 3.1 Month result (Finanzas overview, in SQL)

```sql
SELECT
  (SELECT COALESCE(SUM(academy_cut_mxn), 0)
     FROM finance_payments
    WHERE status = 'paid'
      AND paid_on >= date_trunc('month', CURRENT_DATE)) AS academy_net_mxn,
  (SELECT COALESCE(SUM(amount_mxn), 0)
     FROM finance_expenses
    WHERE status = 'paid'
      AND incurred_on >= date_trunc('month', CURRENT_DATE)) AS spend_mxn;
```

### 3.1b Add the day-1 skaters to NIIKDAY1S in bulk

The UI does this one skater at a time; this is the shortcut when you already know the emails.

```sql
INSERT INTO coupon_skaters (coupon_id, skater_id)
SELECT c.id, p.id
FROM coupons c
JOIN profiles p ON p.email IN ('parent1@example.com', 'parent2@example.com')
WHERE c.code = 'NIIKDAY1S'
ON CONFLICT DO NOTHING;
```

### 3.1c Coupon usage and what it cost

```sql
SELECT c.code,
       c.label_es,
       count(r.id)                       AS uses,
       COALESCE(SUM(r.discount_mxn), 0)  AS discounted_mxn
FROM coupons c
LEFT JOIN coupon_redemptions r ON r.coupon_id = c.id
GROUP BY c.code, c.label_es
ORDER BY discounted_mxn DESC;
```

### 3.2 Students who ran out of classes or owe a payment

```sql
SELECT student_name,
       plan_label,
       sessions_paid,
       attended,
       absences,
       remaining_sessions,
       last_payment_on,
       CURRENT_DATE - last_payment_on AS days_since_payment
FROM finance_student_enrollments
WHERE is_active
  AND (remaining_sessions <= 0
       OR last_payment_on IS NULL
       OR last_payment_on < CURRENT_DATE - INTERVAL '33 days')
ORDER BY remaining_sessions, last_payment_on NULLS FIRST;
```

---

## 4. Queries — user payments (credits & checkout)

### 4.1 All credit purchases for one user (main “what did they pay for?” view)

```sql
SELECT
  uc.id,
  uc.credit_type,
  uc.total_credits,
  uc.remaining_credits,
  uc.price_paid_mxn,
  uc.price_paid_usd,
  uc.payment_method,
  uc.payment_status,
  uc.purchase_date,
  uc.expiration_date,
  uc.guest_booking_id,
  uc.notes,
  uc.created_at
FROM user_credits uc
JOIN profiles p ON p.id = uc.user_id
WHERE lower(p.email) = lower('someone@example.com')
ORDER BY uc.purchase_date DESC;
```

### 4.2 Pending credit purchases (awaiting confirmation)

```sql
SELECT
  p.email,
  p.full_name,
  uc.id AS credit_id,
  uc.credit_type,
  uc.payment_status,
  uc.price_paid_mxn,
  uc.created_at
FROM user_credits uc
JOIN profiles p ON p.id = uc.user_id
WHERE coalesce(uc.payment_status, '') ILIKE 'pending'
ORDER BY uc.created_at DESC;
```

### 4.3 Recent credit purchases across all users

```sql
SELECT
  p.email,
  p.full_name,
  uc.credit_type,
  uc.payment_status,
  uc.payment_method,
  uc.price_paid_mxn,
  uc.purchase_date
FROM user_credits uc
JOIN profiles p ON p.id = uc.user_id
ORDER BY uc.created_at DESC
LIMIT 100;
```

### 4.4 Credits linked to a guest checkout row

```sql
SELECT
  gb.id AS guest_booking_id,
  gb.email AS guest_email,
  gb.full_name AS guest_name,
  gb.created_at AS checkout_at,
  uc.id AS user_credit_id,
  uc.user_id,
  p.email AS profile_email,
  uc.payment_status,
  uc.price_paid_mxn
FROM guest_bookings gb
LEFT JOIN user_credits uc ON uc.guest_booking_id = gb.id
LEFT JOIN profiles p ON p.id = uc.user_id
ORDER BY gb.created_at DESC
LIMIT 50;
```

### 4.5 Sum revenue from paid credits in a date range (MXN)

Adjust date bounds as needed.

```sql
SELECT
  coalesce(sum(price_paid_mxn), 0) AS total_mxn,
  count(*) AS n_purchases
FROM user_credits
WHERE payment_status ILIKE 'paid'
  AND purchase_date >= date_trunc('month', now())
  AND purchase_date < date_trunc('month', now()) + interval '1 month';
```

### 4.6 Reservations still waiting on payment (if `pending_payment` exists on `credit_status`)

```sql
SELECT
  p.email,
  cr.reservation_date,
  cr.time_slot,
  cr.status,
  cr.credit_id,
  cr.created_at
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE cr.status::text = 'pending_payment'
ORDER BY cr.reservation_date, cr.time_slot;
```

---

## 5. Queries — schedule bookings & shop (if you use them)

### 5.1 Bookings with payment status for one user

```sql
SELECT
  b.id,
  b.amount_paid,
  b.payment_status,
  b.payment_method,
  b.status AS booking_status,
  cs.date AS class_date,
  cs.time_slot,
  b.booked_at
FROM bookings b
JOIN class_schedules cs ON cs.id = b.schedule_id
JOIN profiles p ON p.id = b.user_id
WHERE lower(p.email) = lower('someone@example.com')
ORDER BY cs.date DESC;
```

### 5.2 Payment rows linked to bookings

```sql
SELECT
  p.email,
  pay.amount,
  pay.payment_method,
  pay.reference_number,
  pay.created_at,
  b.id AS booking_id
FROM payments pay
JOIN bookings b ON b.id = pay.booking_id
JOIN profiles p ON p.id = b.user_id
WHERE pay.booking_id IS NOT NULL
ORDER BY pay.created_at DESC
LIMIT 50;
```

### 5.2b Brand logos that only worked on the uploader's device

A logo saved before the upload fix can hold a `blob:` URL, which resolves only in
the browser tab that created it. The storefront now ignores those, but clear them
so the admin catalog shows "Sin logo" and you know which ones to upload again.

```sql
-- See the broken ones
SELECT name, logo_url FROM shop_brands
WHERE logo_url IS NOT NULL AND logo_url NOT LIKE 'http%';

-- Clear them, then re-upload from Skateshop admin -> Marcas
UPDATE shop_brands SET logo_url = NULL, updated_at = now()
WHERE logo_url IS NOT NULL AND logo_url NOT LIKE 'http%';
```

### 5.3 Orders for a customer profile

```sql
SELECT
  o.id,
  o.order_number,
  o.total,
  o.amount_paid,
  o.payment_status,
  o.status AS order_status,
  o.created_at
FROM orders o
JOIN profiles p ON p.id = o.customer_id
WHERE lower(p.email) = lower('someone@example.com')
ORDER BY o.created_at DESC;
```

---

## 6. Coach payroll (not skater payments)

```sql
SELECT
  p.email AS coach_email,
  p.full_name AS coach_name,
  cp.period_start,
  cp.period_end,
  cp.amount,
  cp.currency,
  cp.status,
  cp.paid_at
FROM coach_payments cp
JOIN profiles p ON p.id = cp.coach_id
WHERE cp.status = 'pending'
ORDER BY cp.period_start;
```

---

## 7. Quick reference — inspect column types

```sql
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'user_credits', 'class_reservations',
    'guest_bookings', 'bookings', 'orders', 'payments', 'coach_payments'
  )
ORDER BY table_name, ordinal_position;
```

---

## 8. Optional: export-friendly user + credits snapshot

```sql
SELECT
  p.id AS user_id,
  p.email,
  p.full_name,
  p.role,
  uc.id AS credit_pack_id,
  uc.credit_type,
  uc.total_credits,
  uc.remaining_credits,
  uc.payment_status,
  uc.price_paid_mxn,
  uc.purchase_date
FROM profiles p
LEFT JOIN user_credits uc ON uc.user_id = p.id
WHERE lower(p.email) = lower('someone@example.com')
ORDER BY uc.purchase_date DESC NULLS LAST;
```

If a column or enum value differs in your live project (migrations applied out of order), use **Section 7** and adjust filters (for example `payment_status` is **TEXT** on `user_credits` but a proper **enum** on `bookings` / `orders`).
