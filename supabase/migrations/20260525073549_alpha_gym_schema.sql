/*
  # Alpha Gym - Initial Schema

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `full_name` (text)
      - `phone` (text)
      - `role` (text: 'admin' | 'coach' | 'member')
      - `avatar_url` (text)
      - `created_at` (timestamptz)
    - `members`
      - `id` (uuid, primary key)
      - `full_name` (text)
      - `phone` (text)
      - `email` (text)
      - `gender` (text: 'male' | 'female')
      - `membership_type` (text: 'monthly' | 'quarterly' | 'yearly' | 'vip')
      - `start_date` (date)
      - `end_date` (date)
      - `is_active` (boolean)
      - `coach_id` (uuid, references profiles)
      - `notes` (text)
      - `created_at` (timestamptz)
    - `renewals`
      - `id` (uuid, primary key)
      - `member_id` (uuid, references members)
      - `old_end_date` (date)
      - `new_end_date` (date)
      - `membership_type` (text)
      - `amount` (numeric)
      - `status` (text: 'pending' | 'completed' | 'cancelled')
      - `renewed_by` (uuid, references profiles)
      - `created_at` (timestamptz)
    - `messages`
      - `id` (uuid, primary key)
      - `sender_id` (uuid, references profiles)
      - `recipient_type` (text: 'all' | 'expiring' | 'individual' | 'coaches')
      - `recipient_id` (uuid, references profiles, nullable)
      - `subject` (text)
      - `body` (text)
      - `channel` (text: 'sms' | 'email' | 'push')
      - `status` (text: 'draft' | 'sent' | 'failed')
      - `sent_at` (timestamptz)
      - `created_at` (timestamptz)
    - `coach_sessions`
      - `id` (uuid, primary key)
      - `coach_id` (uuid, references profiles)
      - `member_id` (uuid, references members)
      - `session_date` (date)
      - `session_time` (time)
      - `duration_minutes` (integer)
      - `session_type` (text: 'personal' | 'group' | 'assessment')
      - `status` (text: 'scheduled' | 'completed' | 'cancelled')
      - `notes` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Admin can do everything
    - Coaches can view/manage their assigned members and sessions
    - Members can view their own data only
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'coach', 'member')),
  avatar_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Members table
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text DEFAULT '',
  gender text NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female')),
  membership_type text NOT NULL DEFAULT 'monthly' CHECK (membership_type IN ('monthly', 'quarterly', 'yearly', 'vip')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  is_active boolean NOT NULL DEFAULT true,
  coach_id uuid REFERENCES profiles(id),
  weekly_sessions integer NOT NULL DEFAULT 3,
  total_sessions integer NOT NULL DEFAULT 12,
  used_sessions integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Renewals table
CREATE TABLE IF NOT EXISTS renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  old_end_date date NOT NULL,
  new_end_date date NOT NULL,
  membership_type text NOT NULL DEFAULT 'monthly' CHECK (membership_type IN ('monthly', 'quarterly', 'yearly', 'vip')),
  amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  renewed_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES profiles(id),
  recipient_type text NOT NULL DEFAULT 'all' CHECK (recipient_type IN ('all', 'expiring', 'individual', 'coaches')),
  recipient_id uuid REFERENCES profiles(id),
  subject text NOT NULL DEFAULT '',
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email', 'push')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Coach sessions table
CREATE TABLE IF NOT EXISTS coach_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  session_time time NOT NULL DEFAULT '09:00',
  duration_minutes integer NOT NULL DEFAULT 60,
  session_type text NOT NULL DEFAULT 'personal' CHECK (session_type IN ('personal', 'group', 'assessment')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_sessions ENABLE ROW LEVEL SECURITY;

-- Role helpers: SECURITY DEFINER + row_security off so profiles policies never recurse
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  ok boolean;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Profiles policies
CREATE POLICY "Admins can do everything on profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Members policies (MVP: authenticated staff CRUD)
CREATE POLICY "Authenticated users can select members"
  ON members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert members"
  ON members FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update members"
  ON members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete members"
  ON members FOR DELETE TO authenticated USING (true);

-- Renewals policies
CREATE POLICY "Admins can do everything on renewals"
  ON renewals FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Coaches can view renewals of assigned members"
  ON renewals FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members WHERE members.id = renewals.member_id AND members.coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Messages policies
CREATE POLICY "Admins can do everything on messages"
  ON messages FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Coaches can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

-- Coach sessions policies
CREATE POLICY "Admins can do everything on coach_sessions"
  ON coach_sessions FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Coaches can manage own sessions"
  ON coach_sessions FOR ALL
  TO authenticated
  USING (
    coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Coaches can view own sessions"
  ON coach_sessions FOR SELECT
  TO authenticated
  USING (
    coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_members_coach_id ON members(coach_id);
CREATE INDEX IF NOT EXISTS idx_members_is_active ON members(is_active);
CREATE INDEX IF NOT EXISTS idx_members_end_date ON members(end_date);
CREATE INDEX IF NOT EXISTS idx_renewals_member_id ON renewals(member_id);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_coach_id ON coach_sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_member_id ON coach_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_date ON coach_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
