-- ================================================
-- ROKTOKONIKA — Schema Update Script
-- Paste this ENTIRE script in:
-- Supabase Dashboard → SQL Editor → New Query → Run
-- ================================================

-- 1. Add gender to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text DEFAULT 'male';

-- 2. Add admin flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- 3. Add requester_gender to blood_requests
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS requester_gender text DEFAULT 'male';

-- 4. Add hospital_address to blood_requests (for map geocoding)
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS hospital_address text DEFAULT '';

-- 5. Create messages table (1-day auto-cleanup)
CREATE TABLE IF NOT EXISTS messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_id  uuid NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- 6. Create blood_appeals table
CREATE TABLE IF NOT EXISTS blood_appeals (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_donor_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_id   uuid NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  status       text DEFAULT 'pending',
  created_at   timestamptz DEFAULT now(),
  read_at      timestamptz,
  UNIQUE(from_user_id, to_donor_id, request_id)
);

-- 7. Enable RLS on new tables
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_appeals ENABLE ROW LEVEL SECURITY;

-- 8. messages policies
CREATE POLICY "msg_select" ON messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "msg_insert" ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "msg_delete" ON messages FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 9. blood_appeals policies
CREATE POLICY "appeal_select" ON blood_appeals FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_donor_id);
CREATE POLICY "appeal_insert" ON blood_appeals FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "appeal_update" ON blood_appeals FOR UPDATE
  USING (auth.uid() = to_donor_id OR auth.uid() = from_user_id);

-- ================================================
-- HOW TO SET YOUR ACCOUNT AS ADMIN:
-- 1. Create your account on the website
-- 2. Complete your profile
-- 3. Come back here and run:
--    UPDATE profiles SET is_admin = true WHERE id = auth.uid();
-- ================================================
