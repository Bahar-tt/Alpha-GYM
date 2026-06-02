-- MVP: staff role, members schema, non-recursive RLS, authenticated CRUD

-- profiles.role: admin | staff | coach (keep member for legacy rows)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'staff', 'coach', 'member'));

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'staff';

UPDATE public.profiles SET role = 'staff' WHERE role = 'member';

-- members: weekly_sessions + relaxed optional fields
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS weekly_sessions integer NOT NULL DEFAULT 3;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS used_sessions integer NOT NULL DEFAULT 0;

ALTER TABLE public.members ALTER COLUMN email SET DEFAULT '';
ALTER TABLE public.members ALTER COLUMN gender SET DEFAULT 'male';

-- Role helpers (row_security off — no profiles policy recursion)
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

CREATE OR REPLACE FUNCTION public.is_internal_user()
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
    WHERE id = auth.uid() AND role IN ('admin', 'staff', 'coach')
  ) INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_internal_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_user() TO authenticated;

-- profiles (fixed earlier; idempotent)
DROP POLICY IF EXISTS "Admins can do everything on profiles" ON public.profiles;
CREATE POLICY "Admins can do everything on profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- members: any authenticated internal staff (MVP)
DROP POLICY IF EXISTS "Admins can do everything on members" ON public.members;
DROP POLICY IF EXISTS "Coaches can view assigned members" ON public.members;
DROP POLICY IF EXISTS "Coaches can update assigned members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can insert members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can select members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can update members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can delete members" ON public.members;

CREATE POLICY "Authenticated users can select members"
  ON public.members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert members"
  ON public.members FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update members"
  ON public.members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete members"
  ON public.members FOR DELETE TO authenticated USING (true);

-- renewals & messages: internal users (non-recursive)
DROP POLICY IF EXISTS "Admins can do everything on renewals" ON public.renewals;
DROP POLICY IF EXISTS "Coaches can view renewals of assigned members" ON public.renewals;
CREATE POLICY "Internal users manage renewals"
  ON public.renewals FOR ALL TO authenticated
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "Admins can do everything on messages" ON public.messages;
DROP POLICY IF EXISTS "Coaches can view messages" ON public.messages;
CREATE POLICY "Internal users manage messages"
  ON public.messages FOR ALL TO authenticated
  USING (public.is_internal_user())
  WITH CHECK (public.is_internal_user());

-- coach_sessions: keep coach-scoped + admin
DROP POLICY IF EXISTS "Admins can do everything on coach_sessions" ON public.coach_sessions;
DROP POLICY IF EXISTS "Coaches can manage own sessions" ON public.coach_sessions;
DROP POLICY IF EXISTS "Coaches can view own sessions" ON public.coach_sessions;

CREATE POLICY "Admins can do everything on coach_sessions"
  ON public.coach_sessions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Coaches can manage own sessions"
  ON public.coach_sessions FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR public.is_admin())
  WITH CHECK (coach_id = auth.uid() OR public.is_admin());

NOTIFY pgrst, 'reload schema';
