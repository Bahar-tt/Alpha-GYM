-- Session tracking on members (MVP form fields)
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS used_sessions integer NOT NULL DEFAULT 0;

ALTER TABLE members
  ADD CONSTRAINT members_used_sessions_check CHECK (used_sessions >= 0),
  ADD CONSTRAINT members_total_sessions_check CHECK (total_sessions >= 0),
  ADD CONSTRAINT members_sessions_usage_check CHECK (used_sessions <= total_sessions);

-- Security definer helpers avoid infinite recursion in profiles RLS policies
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

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'coach'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_coach()
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

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_coach() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_coach() TO authenticated;

-- Profiles
DROP POLICY IF EXISTS "Admins can do everything on profiles" ON profiles;
CREATE POLICY "Admins can do everything on profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Members
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

-- Renewals
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

-- Messages
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
  USING (public.is_admin_or_coach());

-- Coach sessions
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
