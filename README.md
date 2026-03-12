# Skateboard Academy

A mobile-first app for managing skateboard classes, coach schedules, and equipment sales. Built with Nuxt 3, Supabase, and Capacitor.

## Features

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

### Running from a local folder (e.g. C:\Scheduling)

If you keep the project in a local folder like `C:\Scheduling` (to avoid OneDrive sync issues with `node_modules` and the dev server), use that folder for daily work and push to GitHub when you're ready.

**Open and run the app**

1. In Cursor: **File → Open Folder** → choose `C:\Scheduling`.
2. In the terminal: `npm run dev`.
3. Develop as usual in `C:\Scheduling`.

**Push your changes to GitHub (OneDrive repo)**

Choose one of these:

- **Option 1 – Push from C:\Scheduling (recommended)**  
  If `C:\Scheduling` is a git clone of this repo:
  1. In Cursor with `C:\Scheduling` open, open **Source Control** (Ctrl+Shift+G).
  2. Stage your changes, write a commit message, then **Commit**.
  3. Click **Sync** or **Push** to update GitHub.  
  Your OneDrive repo will sync the updated files from GitHub.

- **Option 2 – Copy into the OneDrive repo, then push**  
  If `C:\Scheduling` is just a copy (not a git repo):
  1. Copy the files you changed from `C:\Scheduling` into your OneDrive repo folder  
     `...\Documents\GitHub\niikskate`.
  2. In Cursor, open that OneDrive repo folder.
  3. In **Source Control**, commit and push to GitHub.

To make `C:\Scheduling` a proper clone so you can use Option 1: clone the repo into `C:\Scheduling` (or run `git init` there and add the GitHub remote), then run `npm install` and `npm run dev` in that folder.

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

## License

MIT License
