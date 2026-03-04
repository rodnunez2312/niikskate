# Changelog

All notable changes to NiikSkate Academy app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-02-03

### 🎫 Credit/Token System & Reservations

#### New Features
- **User Credits System** - Purchase class packages to receive credits/tokens
- **My Reservations Page** (`/user/reservations`) - Use credits to book specific class dates
- **Monthly Program Rules** - Max 2 classes per week for monthly beginner/intermediate programs
- **Credit Expiration** - Credits expire 30 days after purchase

#### Credit Types
| Package | Credits | Weekly Limit |
|---------|---------|--------------|
| Monthly Beginner | 8 | 2 per week |
| Monthly Intermediate | 8 | 2 per week |
| 5-Class Package | 5 | None |
| 3-Class Package | 3 | None |
| Saturdays Only | 4 | Saturdays only |
| Single Group | 1 | None |
| Single Individual | 1 | None |

#### Database Changes
- Added `user_credits` table - Tracks purchased credit packs
- Added `class_reservations` table - Tracks individual class bookings
- Added triggers for automatic credit deduction and restoration on cancellation

#### UI Updates
- Highlighted "Mis Reservas" link in profile menu
- Visual indicators for weekly limits on calendar
- Success messages for reservation confirmations

---

## [1.0.0] - 2026-02-03

### 🎉 Initial Release - Role-Based Dashboard System

#### Core Features
- **Multi-step Booking Wizard** - 5-step booking flow with class selection, packages, equipment rental, date/time selection, and payment
- **Bilingual Support** - English/Spanish language toggle with linked USD/MXN currency
- **Dark Theme UI** - Modern stained-glass inspired design with gold accents

#### Class System
- **Class Types**: Group Beginner, Group Intermediate, Individual
- **Packages**: Monthly programs (8 classes), 3-class pack, 5-class pack, Saturdays Only (4 classes)
- **Equipment Rental**: Helmet, knee/elbow pads, skateboard with bundle pricing
- **Booking Window**: 30-day advance booking limit

#### User Dashboard
- Profile page with booking history and monthly summary
- Progress tracking with skill checklist
- Tips & Tricks library (28 predefined skills across 5 categories)
- News & Events feed

#### Coach Dashboard
- Availability management
- Booking calendar view
- Student progress marking (skill proficiency 1-5 stars)
- Class planning with skill selection and notes
- Payment history (read-only)

#### Admin Dashboard
- Registration approval workflow (pending → approved/rejected)
- User management with role assignment (Admin, Coach, Customer)
- Attendance tracking by date and session
- Payment recording and history
- Quick stats overview

#### Database Schema
New tables added:
- `skills_library` - 28 predefined tricks with categories and difficulty
- `student_progress` - Track skills learned by students
- `guest_bookings` - Store bookings for non-logged-in users
- `registration_requests` - Admin approval workflow
- `attendance` - Class attendance tracking
- `class_plans` - Coach lesson planning
- `coach_payments` - Coach compensation records
- `news_events` - News and announcements

#### Pricing (MXN / USD)
| Item | MXN | USD |
|------|-----|-----|
| Monthly Beginners (8 classes) | $600 | $35 |
| Monthly Intermediate (8 classes) | $800 | $50 |
| Single Group Class | $130 | $10 |
| Individual Class | $250 | $20 |
| 3-Class Package | $350 | $20 |
| 5-Class Package | $520 | $30 |
| Saturdays Only (4 classes) | $420 | $25 |
| Equipment (each) | $50 | $5 |
| Equipment Bundle (all 3) | $100 | $10 |

#### Coaches
- **Rod** - Vert & Street specialist
- **Leo** - Vert & Street specialist  
- **Itza** - Fundamentals specialist

---

## Version History Summary

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-02-03 | Initial release with role-based dashboards |

---

## Upcoming Features (Planned)

- [ ] Online payment integration (Stripe/PayPal)
- [ ] Email notifications for bookings and approvals
- [ ] Push notifications via Capacitor
- [ ] Google Calendar integration
- [ ] Equipment store with inventory management
- [ ] Financial reports export (CSV/PDF)
- [ ] Student attendance analytics
