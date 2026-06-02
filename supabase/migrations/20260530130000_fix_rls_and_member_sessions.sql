-- Fix infinite recursion: admin checks must not query profiles under RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_coach_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'coach')
  );
$$;

-- Session fields for members MVP form
ALTER TABLE members ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 12;
ALTER TABLE members ADD COLUMN IF NOT EXISTS used_sessions integer NOT NULL DEFAULT 0;

-- profiles
DROP POLICY IF EXISTS "Admins can do everything on profiles" ON profiles;
CREATE POLICY "Admins can do everything on profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- members
DROP POLICY IF EXISTS "Admins can do everything on members" ON members;
DROP POLICY IF EXISTS "Coaches can view assigned members" ON members;
DROP POLICY IF EXISTS "Coaches can update assigned members" ON members;

CREATE POLICY "Admins can do everything on members"
  ON members FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Coaches can view assigned members"
  ON members FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin());

CREATE POLICY "Coaches can update assigned members"
  ON members FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin())
  WITH CHECK (coach_id = auth.uid() OR public.is_admin());

-- Allow authenticated users to insert members (MVP: any logged-in user)
CREATE POLICY "Authenticated users can insert members"
  ON members FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can select members"
  ON members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update members"
  ON members FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete members"
  ON members FOR DELETE
  TO authenticated
  USING (true);

-- renewals
DROP POLICY IF EXISTS "Admins can do everything on renewals" ON renewals;
DROP POLICY IF EXISTS "Coaches can view renewals of assigned members" ON renewals;

CREATE POLICY "Admins can do everything on renewals"
  ON renewals FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Coaches can view renewals of assigned members"
  ON renewals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.id = renewals.member_id AND members.coach_id = auth.uid()
    )
    OR public.is_admin()
  );

-- messages
DROP POLICY IF EXISTS "Admins can do everything on messages" ON messages;
DROP POLICY IF EXISTS "Coaches can view messages" ON messages;

CREATE POLICY "Admins can do everything on messages"
  ON messages FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Coaches can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (public.is_coach_or_admin());

-- coach_sessions
DROP POLICY IF EXISTS "Admins can do everything on coach_sessions" ON coach_sessions;
DROP POLICY IF EXISTS "Coaches can manage own sessions" ON coach_sessions;
DROP POLICY IF EXISTS "Coaches can view own sessions" ON coach_sessions;

CREATE POLICY "Admins can do everything on coach_sessions"
  ON coach_sessions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Coaches can manage own sessions"
  ON coach_sessions FOR ALL
  TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin())
  WITH CHECK (coach_id = auth.uid() OR public.is_admin());

CREATE POLICY "Coaches can view own sessions"
  ON coach_sessions FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin());
