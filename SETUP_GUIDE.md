# NiikSkate Academy - Setup & Deployment Guide

## 1. Database Setup (Supabase)

### Step 1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose your organization
4. Name it (e.g., "niikskate-academy")
5. Set a strong database password (save it!)
6. Choose region closest to you
7. Click "Create new project"

### Step 2: Get Your API Keys
1. Go to **Settings → API** in your Supabase dashboard
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...` (long string)

### Step 3: Configure Your App
Create/update your `.env` file:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-public-key

# Required for Admin "Add user" (Dashboard → Settings → API → service_role key)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
**Important:** Never expose the service role key in the client. It is only used by the server API for creating users.

### Step 4: Run Database Migrations (SQL Editor)

**What this means:** A "migration" is just a `.sql` file that changes your database. You don't need the Supabase CLI. You run each file manually in the **Supabase SQL Editor** — that *is* running the migration.

**How to run a migration:**

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. In the left sidebar, click **SQL Editor**.
3. Click **New query** (or use the existing query box).
4. Open the migration file from your project (e.g. `c:\Scheduling\supabase\migrations\add_programs_structure.sql`) in a text editor.
5. **Copy the entire contents** of the file (Ctrl+A, Ctrl+C).
6. **Paste** into the SQL Editor (Ctrl+V).
7. Click **Run** (or press Ctrl+Enter).
8. Check the result: you should see "Success. No rows returned" or a message that the statements ran. If you see an error, read it (e.g. "relation already exists" often means that migration was already run).
9. Repeat for the next migration file when you need that feature.

**Order to run migrations (only run what you haven’t run yet):**

| Order | File | What it does |
|-------|------|----------------|
| 1 | `add_dashboard_tables.sql` | Core tables (profiles, bookings, etc.) |
| 2 | `add_motor_skills_column.sql` | Adds `motor_skills` to skills_library |
| 3 | `add_coach_features.sql` | Emergency contacts, evaluations, etc. |
| 4 | `add_programs_structure.sql` | Programs, program_coaches, program_students + seed |
| 5 | `add_programs_color_and_default.sql` | `color`, `is_default` on programs |
| 6 | `add_program_schedule.sql` | `schedule_start_time`, `schedule_end_time`, `schedule_days` on programs |
| 7 | `add_programs_seed_four.sql` | Seeds 4 main programs (if you already had programs table) |
| 8 | `add_student_profile_skater_fields.sql` | Skater profile fields (city, stance, ratings) |
| 9 | `add_attendance_confirmed.sql` | Attendance confirmation table |
| 10 | `add_attendance_report_sent_and_unconfirm.sql` | Report-sent tracking |
| 11 | `add_skill_groups_structure.sql` | Skill groups, areas, subgroups (Skills page) |

**Tip:** If a migration fails with "already exists", that part is already in your database; you can skip that file or run only the new statements. For "add column if not exists" style migrations, running them again is safe.

### Step 5: Fix RLS for Skills Sync
Run this SQL to allow coaches to update skills:

```sql
-- Allow authenticated users to update skills_library (for sync)
CREATE POLICY "Authenticated users can update skills" 
ON skills_library 
FOR UPDATE 
USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert skills
CREATE POLICY "Authenticated users can insert skills" 
ON skills_library 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');
```

---

## 2. Syncing tricks from Excel (Niik Plan Clases)

When you change **Niik_Plan_Clases.xlsx** (Program, Categoria, Tipo, new tricks, etc.), the app does **not** read the Excel directly. It reads a **JSON file** that you must regenerate from the Excel, then the app syncs that JSON to Supabase.

### Step 1: Put the Excel in the right place

The parse script looks for the file in either location (inside your project folder, e.g. `c:\Scheduling\`):

- `data\Niik_source\Niik_Plan_Clases.xlsx`
- `data\Niik_Plan_Clases.xlsx`

Save your updated Excel in one of these paths.

### Step 2: Regenerate the JSON from Excel

In a terminal, from the project folder:

```bash
npm run niik:parse
```

This reads **Niik_Plan_Clases.xlsx** and writes:

- `data\niik-trick-library.json`
- `public\data\niik-trick-library.json`

You should see something like: `Wrote 155 tricks to ... and ...`

### Step 3: Get the new data into the app

**Option A – Using the app (easiest)**

1. Start the dev server if it’s not running: `npm run dev`
2. Open the app and go to **Coaching** (or Dashboard) → **Trucos** (the Tricks tab).
3. The page **auto-syncs**: it loads `public/data/niik-trick-library.json` and upserts into Supabase.
4. Do a **hard refresh** (Ctrl+F5 or Cmd+Shift+R) so the browser doesn’t use a cached JSON. Then the new Program/categories and trick list will appear.

**Option B – Command-line sync (no browser)**

1. In `.env`, set `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Settings → API).
2. Run:
   ```bash
   npm run niik:refresh
   ```
   This runs **parse** then **sync** (reads Excel → writes JSON → pushes JSON to Supabase). No need to open the app.

### Why updates don’t show until you do this

| Step | What happens |
|------|-------------------------------|
| You edit Excel | Only the file on your machine changes. |
| You don’t run parse | `public/data/niik-trick-library.json` stays old. |
| App loads | It fetches that **old** JSON and syncs it to Supabase. |

So: **after every Excel change, run `npm run niik:parse`**, then refresh the Trucos page (or run `npm run niik:refresh` if you use CLI sync).

---

## 3. Publishing Your App Online

### Option A: Vercel (Recommended - Free)

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/niikskate-academy.git
   git push -u origin main
   ```

2. **Deploy to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub
   - Click "Import Project"
   - Select your repository
   - Add Environment Variables:
     - `SUPABASE_URL` = your project URL
     - `SUPABASE_KEY` = your anon key
   - Click "Deploy"

3. **Done!** Your app will be live at `https://your-project.vercel.app`

### Updating your live Vercel app (push new version)

When you’ve made changes locally and want the same version live:

1. **If you edit in a different folder than your Git repo (e.g. C:\\Scheduling vs OneDrive\\GitHub\\niikskate):**  
   Run `sync-to-onedrive.bat` from the project folder. It copies your code into the OneDrive repo (excluding `node_modules`, `.nuxt`, `.git`). Then open GitHub Desktop and you’ll see the changes.

2. **Commit and push to GitHub** (from your OneDrive repo in GitHub Desktop, or from terminal in that folder):
   - In GitHub Desktop: review changes → write summary → **Commit to main** → **Push origin**.
   - Or in terminal: `git add .` → `git commit -m "Your message"` → `git push origin main`.

3. **Vercel** will detect the new push and start a new deployment. Check the [Vercel Dashboard](https://vercel.com/dashboard) → your project → **Deployments** to see the build and when it’s live.

4. **Optional:** If you added env vars (e.g. in `.env`) that the live app needs, add them in Vercel: **Project → Settings → Environment Variables**, then redeploy.

**Tip:** Make sure `public/data/niik-trick-library.json` is committed so the live app has trick data. If you prefer to sync from the app instead, run “Sincronizar desde Excel” once as admin after deploy.

### Option B: Netlify (Also Free)

1. Push to GitHub (same as above)
2. Go to [netlify.com](https://netlify.com)
3. Click "Add new site" → "Import existing project"
4. Connect GitHub and select your repo
5. Build settings:
   - Build command: `npm run generate`
   - Publish directory: `.output/public`
6. Add environment variables (same as Vercel)
7. Click "Deploy"

---

## 4. Custom Domain (Optional)

### With Vercel:
1. Go to your project → Settings → Domains
2. Add your domain (e.g., `niikskate.com`)
3. Update DNS at your registrar:
   - A Record: `76.76.21.21`
   - Or CNAME: `cname.vercel-dns.com`

### With Netlify:
1. Go to Site settings → Domain management
2. Add custom domain
3. Follow DNS instructions

---

## 5. Quick Checklist

- [ ] Supabase project created
- [ ] `.env` file configured with correct keys
- [ ] Database migrations run in SQL Editor
- [ ] RLS policies updated for skills sync
- [ ] Code pushed to GitHub
- [ ] Deployed to Vercel/Netlify
- [ ] Environment variables added to deployment

---

## Troubleshooting

### "Skills not syncing"
- Check browser console for errors
- Make sure you're logged in as admin
- Verify RLS policies allow updates

### "Database connection failed"
- Check `.env` has correct SUPABASE_URL and SUPABASE_KEY
- Restart dev server after changing `.env`

### "App won't build"
- Run `npm install` to ensure all dependencies
- Check for TypeScript errors: `npm run build`
