-- Links each credit row to the guest_bookings checkout row (admin history + status).
-- Run in Supabase SQL Editor if migrations are applied manually.

ALTER TABLE user_credits
  ADD COLUMN IF NOT EXISTS guest_booking_id UUID REFERENCES guest_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_credits_guest_booking_id ON user_credits(guest_booking_id);

COMMENT ON COLUMN user_credits.guest_booking_id IS 'Checkout row from guest_bookings created in the same session (for admin Compras recientes).';
