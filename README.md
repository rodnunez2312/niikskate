# Niik Skate

Niik Skate is the operating system for the academy in Mérida. It runs classes, families, coaches, the shop, and custom ramp builds. The app is in Spanish and English.

The site is a Nuxt 3 app on Vercel. Data, logins, and uploaded photos live in Supabase. Vercel does not apply SQL: new tables and columns are run by hand in the Supabase SQL editor from `supabase/migrations/`.

## Who uses it

| Role | What they do |
|------|----------------|
| Admin | Runs the academy: calendar, coaches, students, finance, shop, ramps. |
| Coach | Teaches assigned classes, marks them done or cancelled, and follows students. |
| Family | The login account. Holds the email and can book for the students inside it. |
| Student | The person who trains. Stays in the academy even if the family account is removed. |

One person can be both admin and coach (the head coach). Other admin accounts are not treated as coaches.

## Sports

The academy is not skate-only. A program, a class, and a coach can belong to:

- Skate
- Scooter
- Patines (rollerblading)
- BMX
- Parkour

A coach can teach more than one sport and shows up in each of those sections. New class titles start with the sport name. On screens that used to say “skaters” for a class roster, the word is “students.”

## Blueprint

```
Public site
  Book a class · Seasons · Shop · Community · Skate spots · Ramp catalog

Staff
  Calendar ── assigns coaches ── day list (done / cancel / cover)
  Coaches ── sports, backup, class times, certifications
  Students ── families and a board per program
  Programs ── levels, tricks, strength, lesson plans
  Finance ── prices, payments, coupons, expenses
  Shop ── products and stock
  Ramps ── design studio and customer requests
```

### Calendar

Admins plan seasons and the classes inside them. Official class days are Tuesday, Thursday, and Saturday.

| Class | Time |
|-------|------|
| Morning (Saturday) | 7:00 AM |
| Early | 5:30 PM |
| Late | 7:00 PM |

The day list groups every class that shares a start time. Each row shows the sport, how many students are in it, the place, and the coach’s initials.

From that list an admin can:

- Assign who teaches the class. Assigning someone does not count as a class given.
- Mark one class done, or mark every class that day done. Done is what counts as a class given.
- Cancel one class, or cancel the day (rain, wet park). Cancel asks when it can be retaken, emails the enrolled families, and does not count as given.

Coaches do not open this calendar. They mark their own classes from the coach home.

Places start with Skatepark La Plancha. New places are added from the class form and stored so they can later become full spot profiles.

### Coaches

Coach cards open the editor. Each coach has:

- One or more sports.
- A backup. Rodrigo’s backup is Marco, Marco’s is Rodrigo, Itza’s is Marco. This can be changed on the coach.
- Class times, not just dates. A green day means at least one class that day is confirmed. Turning off 7:00 PM does not turn off 5:30 PM.

If the assigned coach is off for that class time and the backup is on, the backup takes the class and the row says they are covering. When the original coach turns that time back on, the class returns to them. If the backup is also off, the row keeps a warning.

Coach activity counts classes actually given and classes cancelled. The coach profile shows the same totals plus students taught.

Certifications (Niik levels, first aid, safeguarding, monthly sign-offs) open from the Coaches page. There is no separate certifications page.

### Students and families

Estudiantes is a board per program. The program names sit in a scrollable row between the arrows, next to the Students title.

A family chip edits or deletes that family. Deleting a family removes the email and the login. The students stay and are only unlinked.

Students move across level columns. Search can jump to the program that student belongs to.

### Programs and coaching tools

- Programs and skill levels, including progress on a student’s program.
- Bag of tricks and a strength library.
- Lesson plans and a knowledge base.
- Evaluations on a student.
- Competitions for students who are far enough along to enter them.

### Finance

Month result for the academy: class prices, what the academy keeps, coach tiers, payments, coupons, income, and expenses. Payments can be tied to a coach and a student.

### Shop

Product catalog, stock, and a cart. Admins manage products from Skateshop. Families buy from the public shop.

### Ramps

The design studio keeps a project as an idea, a concept, or a build.

- Construction type: kicker, quarters, mini-ramp, grind box, rails, or other.
- A written build plan, dimensions, and a materials list with costs.
- Three photos and one video. Clicking one opens a full-screen carousel.
- Files go to Supabase Storage. The links are saved on the project as soon as a photo is added, so a refresh does not drop them.
- A finished project can be published into the shop.
- Families can request a ramp. Admins read those requests separately from the studio.

The public ramp catalog reads the same projects.

### Community and skate spots

Community links to a skate-spots directory. The directory is a list of places (name and city) so the academy can collect parks in Mexico. Photos, obstacles, and maps are stored as columns for later. The public page is not a full spot editor yet.

## What is stored where

| Piece | Where it lives |
|-------|----------------|
| Accounts, classes, coaches, payments | Supabase Postgres |
| Photos and ramp videos | Supabase Storage (`images` bucket) |
| The website | Vercel, from this git repo |
| Schema changes | `supabase/migrations/`, pasted into the SQL editor |

A coach who is off for a class time is an explicit “not available” row. No row means they can teach that class.

## Run it locally

Node 18+, then:

```bash
npm install
cp .env.example .env
npm run dev
```

Put the Supabase URL and anon key in `.env`. Service-role key is required for admin actions that create or delete logins and send mail. Class-cancel emails use Resend when that key is set.

Deploy is a push to the repo. After a feature that adds a migration, run that SQL in Supabase before expecting the new column in production.

Setup and security notes: [`SETUP_GUIDE.md`](SETUP_GUIDE.md).
