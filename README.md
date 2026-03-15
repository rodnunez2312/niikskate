# Skateboard Academy

A mobile-first app for managing skateboard classes, coach schedules, and equipment sales. Built with Nuxt 3, Supabase, and Capacitor.

## Features

### 🛹 Student Dashboard (Skater Card)
A **central feature** of the app: each student has a dedicated **Student Dashboard** that coaches and admins open from the Alumnos list.

- **Skater cards**: From the Alumnos tab, each student is a **skater card**. Tapping the card or the **Dashboard** button goes to that student’s full dashboard.
- **Single place per student**: One dashboard per student at `/dashboard/students/[id]` with:
  - **Quick actions**: Link to Evaluaciones (evaluation history and new evaluation) for that student.
  - **Overall progress**: Progress bar and skills learned vs total in the library.
  - **Attendance calendar**: Monthly view of attended, missed, upcoming, and today’s sessions.
  - **Progress timeline**: Payment and skill milestones in one timeline.
  - **Skills by category**: Mark skills as learned and see progress by category.
- **Extensible**: The Student Dashboard is the main place to add more student-level features (notes, goals, media, etc.) over time.

### Class Scheduling
- **Monthly Calendar View**: See all available classes at a glance
- **Fixed Schedule**: Classes on Tuesday, Thursday, Saturday
- **Two Time Slots**: 5:30 PM - 7:00 PM and 7:00 PM - 8:30 PM
- **Three Class Types**:
  - Grouped Class - Beginners (up to 8 students)
  - Grouped Class - Intermediate (up to 6 students)
  - Individual Class (1-on-1 coaching)

### Coach Management
- **Availability System**: Coaches set their monthly availability
- **Per-Slot Control**: Choose which days/times to be available
- **Date Overrides**: Mark specific dates as unavailable (vacation, sick, etc.)
- **Profile Management**: Bio, specialties, and contact info

### Equipment Store
- **Product Categories**:
  - 🛡️ Safety Equipment (helmets, pads, wrist guards)
  - 🛹 Skateboards (complete boards, decks)
  - 🔧 Hardware (trucks, wheels, bearings, grip tape)
  - 👕 Merchandise (t-shirts, hoodies, caps, stickers)
  - 🏗️ Ramps (custom builds with quote system)
- **Inventory Tracking**: Stock levels, low stock alerts
- **Sales Management**: Order processing, payment tracking

### User Roles
- **Admin**: Full access to manage classes, coaches, inventory, and sales
- **Coach**: Manage own availability, view class bookings
- **Customer**: Book classes, shop equipment, manage bookings

## Tech Stack

- **Frontend**: Nuxt 3, Vue 3, TypeScript
- **Styling**: TailwindCSS (mobile-first design)
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Mobile**: Capacitor (iOS & Android)
- **State Management**: Pinia

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up Supabase**:
   - Create a new project at [supabase.com](https://supabase.com)
   - Run the SQL schema in `supabase/schema.sql` via the SQL Editor
   - This will create all tables, functions, triggers, and sample data
   - Copy your project URL and anon key

3. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your Supabase credentials:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   ```

4. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

### Building for Production

**Web**:
```bash
npm run build
npm run preview
```

**Mobile (iOS/Android)**:
```bash
# Generate static site
npm run generate

# Initialize Capacitor (first time only)
npm run cap:add:ios
npm run cap:add:android

# Sync and open
npm run cap:sync
npm run cap:open:ios    # Opens Xcode
npm run cap:open:android # Opens Android Studio
```

## Project Structure

```
├── assets/css/main.css      # Global styles & Tailwind
├── components/              # Vue components
├── composables/
│   ├── useClasses.ts        # Class/schedule data
│   ├── useCoachAvailability.ts # Coach availability
│   ├── useBookings.ts       # Booking management
│   └── useProducts.ts       # Products/inventory
├── layouts/
│   └── default.vue          # Main layout with bottom nav
├── pages/
│   ├── index.vue            # Home page
│   ├── schedule/            # Monthly calendar & booking
│   ├── shop/                # Product catalog & details
│   ├── bookings.vue         # User bookings
│   ├── cart.vue             # Shopping cart
│   ├── profile.vue          # User profile
│   ├── coach/
│   │   └── availability.vue # Coach availability management
│   └── auth/                # Authentication pages
├── stores/
│   └── cart.ts              # Pinia cart store
├── supabase/
│   └── schema.sql           # Complete database schema
├── types/
│   └── index.ts             # TypeScript types
├── capacitor.config.ts      # Capacitor config
├── nuxt.config.ts           # Nuxt config
└── tailwind.config.js       # Tailwind config
```

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profiles (extends Supabase auth) |
| `skate_classes` | Three class type definitions |
| `coach_availability` | Monthly coach availability |
| `coach_date_availability` | Date-specific overrides |
| `class_schedules` | Actual scheduled classes |
| `bookings` | User class bookings |
| `products` | Product catalog |
| `inventory_transactions` | Stock movement tracking |
| `orders` | Customer orders |
| `order_items` | Items in orders |
| `payments` | Payment records |
| `ramp_quotes` | Custom ramp quote requests |

### Key Features

- **Row Level Security (RLS)**: All tables have policies for secure access
- **Automatic Triggers**: Stock updates, booking counts, timestamps
- **Functions**: Availability checking, order number generation

## Class Schedule

| Day | Session 1 | Session 2 |
|-----|-----------|-----------|
| Tuesday | 5:30 PM - 7:00 PM | 7:00 PM - 8:30 PM |
| Thursday | 5:30 PM - 7:00 PM | 7:00 PM - 8:30 PM |
| Saturday | 5:30 PM - 7:00 PM | 7:00 PM - 8:30 PM |

## Setting Up Coaches

1. Create a user account (sign up)
2. In Supabase, update their profile role to 'coach':
   ```sql
   UPDATE profiles SET role = 'coach' WHERE email = 'coach@example.com';
   ```
3. Add coach details:
   ```sql
   UPDATE profiles 
   SET bio = 'Professional skater with 10 years experience',
       specialties = ARRAY['beginner', 'tricks', 'ramps'],
       hourly_rate = 50.00
   WHERE email = 'coach@example.com';
   ```

## Adding Payment Processing

Payment processing is stubbed out and ready for integration. When ready:

1. Set up a Stripe account
2. Install Stripe:
   ```bash
   npm install @stripe/stripe-js
   ```
3. Add Stripe keys to `.env`
4. Implement checkout in `pages/cart.vue`

## Custom Ramp Building

The app includes a quote request system for custom ramps:

- Quarter pipes
- Mini ramps
- Half pipes
- Grind boxes
- Rails
- Custom builds

Customers can request quotes, and admins manage them through the admin panel.

## Mobile Development

### iOS Requirements
- macOS with Xcode installed
- Apple Developer account (for device testing)

### Android Requirements
- Android Studio installed
- Android SDK

### Testing on Device
```bash
npm run mobile:build
npm run cap:open:ios     # or cap:open:android
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Local Sync Workflow

If you edit in `C:\Scheduling` but commit from a different OneDrive Git repo path, use:

- `SYNC_C_TO_ONEDRIVE_GIT.md`

## License

MIT License
