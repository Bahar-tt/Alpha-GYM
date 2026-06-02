-- RUN THIS IN SUPABASE SQL EDITOR (required for app member creation)
-- Verified against live project: missing total_sessions/used_sessions + RLS blocks app inserts

-- 1) Add session columns expected by the frontend
ALTER TABLE members ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 12;
ALTER TABLE members ADD COLUMN IF NOT EXISTS used_sessions integer NOT NULL DEFAULT 0;

-- 2) Fix profiles RLS recursion (is_admin bypasses RLS)
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

DROP POLICY IF EXISTS "Admins can do everything on profiles" ON profiles;
CREATE POLICY "Admins can do everything on profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) Members RLS: allow any authenticated user (MVP)
DROP POLICY IF EXISTS "Admins can do everything on members" ON members;
DROP POLICY IF EXISTS "Coaches can view assigned members" ON members;
DROP POLICY IF EXISTS "Coaches can update assigned members" ON members;
DROP POLICY IF EXISTS "Authenticated users can insert members" ON members;
DROP POLICY IF EXISTS "Authenticated users can select members" ON members;
DROP POLICY IF EXISTS "Authenticated users can update members" ON members;
DROP POLICY IF EXISTS "Authenticated users can delete members" ON members;

CREATE POLICY "Authenticated users can select members"
  ON members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert members"
  ON members FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update members"
  ON members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete members"
  ON members FOR DELETE TO authenticated USING (true);

-- 4) Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
