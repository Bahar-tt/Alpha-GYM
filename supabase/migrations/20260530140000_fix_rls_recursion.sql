-- Fix infinite recursion: policies must not query profiles directly.
-- Use SECURITY DEFINER helpers that bypass RLS when reading the caller's role.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'coach')
  );
$$;

-- profiles
DROP POLICY IF EXISTS "Admins can do everything on profiles" ON profiles;
CREATE POLICY "Admins can do everything on profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- members
DROP POLICY IF EXISTS "Admins can do everything on members" ON members;
CREATE POLICY "Admins can do everything on members"
  ON members FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Coaches can view assigned members" ON members;
CREATE POLICY "Coaches can view assigned members"
  ON members FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Coaches can update assigned members" ON members;
CREATE POLICY "Coaches can update assigned members"
  ON members FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin())
  WITH CHECK (coach_id = auth.uid() OR public.is_admin());

-- renewals
DROP POLICY IF EXISTS "Admins can do everything on renewals" ON renewals;
CREATE POLICY "Admins can do everything on renewals"
  ON renewals FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Coaches can view renewals of assigned members" ON renewals;
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
CREATE POLICY "Admins can do everything on messages"
  ON messages FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Coaches can view messages" ON messages;
CREATE POLICY "Coaches can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (public.is_coach_or_admin());

-- coach_sessions
DROP POLICY IF EXISTS "Admins can do everything on coach_sessions" ON coach_sessions;
CREATE POLICY "Admins can do everything on coach_sessions"
  ON coach_sessions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Coaches can manage own sessions" ON coach_sessions;
CREATE POLICY "Coaches can manage own sessions"
  ON coach_sessions FOR ALL
  TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin())
  WITH CHECK (coach_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Coaches can view own sessions" ON coach_sessions;
CREATE POLICY "Coaches can view own sessions"
  ON coach_sessions FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin());
