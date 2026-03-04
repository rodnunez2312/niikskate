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
```

### Step 4: Run Database Migrations
In Supabase Dashboard, go to **SQL Editor** and run these files in order:

1. First, run `supabase/migrations/add_dashboard_tables.sql` - creates core tables
2. Then run `supabase/migrations/add_motor_skills_column.sql` - adds motor_skills column
3. Run other migrations as needed

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

## 2. Publishing Your App Online

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

## 3. Custom Domain (Optional)

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

## 4. Quick Checklist

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
