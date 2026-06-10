-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- Alle helper-functies in houtrotherstel schema om conflicten
-- met andere apps op hetzelfde Supabase-project te voorkomen.
-- ============================================================

CREATE OR REPLACE FUNCTION houtrotherstel.get_user_role()
RETURNS houtrotherstel.user_role AS $$
  SELECT role FROM houtrotherstel.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION houtrotherstel.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM houtrotherstel.profiles
    WHERE id = auth.uid() AND role = 'admin' AND active = true
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION houtrotherstel.is_admin_or_projectleider()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM houtrotherstel.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'projectleider')
    AND active = true
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION houtrotherstel.has_project_access(project_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT
    houtrotherstel.is_admin()
    OR
    EXISTS (
      SELECT 1 FROM houtrotherstel.project_user_assignments
      WHERE project_id = project_uuid AND user_id = auth.uid()
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS INSCHAKELEN
-- ============================================================

ALTER TABLE houtrotherstel.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE houtrotherstel.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE houtrotherstel.project_user_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE houtrotherstel.standard_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE houtrotherstel.standard_repair_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE houtrotherstel.repair_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE houtrotherstel.repair_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE houtrotherstel.activity_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: profiles
-- ============================================================

CREATE POLICY "htr_profiles_select_own" ON houtrotherstel.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "htr_profiles_select_all" ON houtrotherstel.profiles
  FOR SELECT USING (houtrotherstel.is_admin_or_projectleider());

CREATE POLICY "htr_profiles_update_own" ON houtrotherstel.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "htr_profiles_update_admin" ON houtrotherstel.profiles
  FOR UPDATE USING (houtrotherstel.is_admin());

CREATE POLICY "htr_profiles_insert_admin" ON houtrotherstel.profiles
  FOR INSERT WITH CHECK (houtrotherstel.is_admin() OR auth.uid() = id);

CREATE POLICY "htr_profiles_delete_admin" ON houtrotherstel.profiles
  FOR DELETE USING (houtrotherstel.is_admin());

-- ============================================================
-- POLICIES: projects
-- ============================================================

CREATE POLICY "htr_projects_select_admin" ON houtrotherstel.projects
  FOR SELECT USING (houtrotherstel.is_admin());

CREATE POLICY "htr_projects_select_assigned" ON houtrotherstel.projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM houtrotherstel.project_user_assignments
      WHERE project_id = houtrotherstel.projects.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "htr_projects_insert" ON houtrotherstel.projects
  FOR INSERT WITH CHECK (houtrotherstel.is_admin_or_projectleider());

CREATE POLICY "htr_projects_update" ON houtrotherstel.projects
  FOR UPDATE USING (
    houtrotherstel.is_admin() OR (
      houtrotherstel.is_admin_or_projectleider()
      AND houtrotherstel.has_project_access(id)
    )
  );

CREATE POLICY "htr_projects_delete" ON houtrotherstel.projects
  FOR DELETE USING (houtrotherstel.is_admin());

-- ============================================================
-- POLICIES: project_user_assignments
-- ============================================================

CREATE POLICY "htr_pua_select" ON houtrotherstel.project_user_assignments
  FOR SELECT USING (
    houtrotherstel.is_admin_or_projectleider() OR user_id = auth.uid()
  );

CREATE POLICY "htr_pua_insert" ON houtrotherstel.project_user_assignments
  FOR INSERT WITH CHECK (houtrotherstel.is_admin_or_projectleider());

CREATE POLICY "htr_pua_update" ON houtrotherstel.project_user_assignments
  FOR UPDATE USING (houtrotherstel.is_admin_or_projectleider());

CREATE POLICY "htr_pua_delete" ON houtrotherstel.project_user_assignments
  FOR DELETE USING (houtrotherstel.is_admin_or_projectleider());

-- ============================================================
-- POLICIES: standard_repairs
-- ============================================================

CREATE POLICY "htr_sr_select" ON houtrotherstel.standard_repairs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "htr_sr_insert" ON houtrotherstel.standard_repairs
  FOR INSERT WITH CHECK (houtrotherstel.is_admin());

CREATE POLICY "htr_sr_update" ON houtrotherstel.standard_repairs
  FOR UPDATE USING (houtrotherstel.is_admin());

CREATE POLICY "htr_sr_delete" ON houtrotherstel.standard_repairs
  FOR DELETE USING (houtrotherstel.is_admin());

-- ============================================================
-- POLICIES: standard_repair_materials
-- ============================================================

CREATE POLICY "htr_srm_select" ON houtrotherstel.standard_repair_materials
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "htr_srm_insert" ON houtrotherstel.standard_repair_materials
  FOR INSERT WITH CHECK (houtrotherstel.is_admin());

CREATE POLICY "htr_srm_update" ON houtrotherstel.standard_repair_materials
  FOR UPDATE USING (houtrotherstel.is_admin());

CREATE POLICY "htr_srm_delete" ON houtrotherstel.standard_repair_materials
  FOR DELETE USING (houtrotherstel.is_admin());

-- ============================================================
-- POLICIES: repair_registrations
-- ============================================================

CREATE POLICY "htr_rr_select_admin" ON houtrotherstel.repair_registrations
  FOR SELECT USING (houtrotherstel.is_admin());

CREATE POLICY "htr_rr_select_projectleider" ON houtrotherstel.repair_registrations
  FOR SELECT USING (
    houtrotherstel.is_admin_or_projectleider()
    AND houtrotherstel.has_project_access(project_id)
  );

CREATE POLICY "htr_rr_select_medewerker" ON houtrotherstel.repair_registrations
  FOR SELECT USING (
    user_id = auth.uid() AND houtrotherstel.has_project_access(project_id)
  );

CREATE POLICY "htr_rr_insert" ON houtrotherstel.repair_registrations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND houtrotherstel.has_project_access(project_id)
  );

CREATE POLICY "htr_rr_update_admin_pl" ON houtrotherstel.repair_registrations
  FOR UPDATE USING (
    houtrotherstel.is_admin() OR (
      houtrotherstel.is_admin_or_projectleider()
      AND houtrotherstel.has_project_access(project_id)
    )
  );

CREATE POLICY "htr_rr_update_medewerker" ON houtrotherstel.repair_registrations
  FOR UPDATE USING (
    user_id = auth.uid()
    AND houtrotherstel.has_project_access(project_id)
    AND status NOT IN ('gecontroleerd', 'afgekeurd')
  );

CREATE POLICY "htr_rr_delete" ON houtrotherstel.repair_registrations
  FOR DELETE USING (houtrotherstel.is_admin());

-- ============================================================
-- POLICIES: repair_photos
-- ============================================================

CREATE POLICY "htr_rp_select" ON houtrotherstel.repair_photos
  FOR SELECT USING (
    houtrotherstel.is_admin() OR
    EXISTS (
      SELECT 1 FROM houtrotherstel.repair_registrations rr
      WHERE rr.id = houtrotherstel.repair_photos.registration_id
      AND (rr.user_id = auth.uid() OR houtrotherstel.is_admin_or_projectleider())
    )
  );

CREATE POLICY "htr_rp_insert" ON houtrotherstel.repair_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM houtrotherstel.repair_registrations rr
      WHERE rr.id = houtrotherstel.repair_photos.registration_id
      AND (rr.user_id = auth.uid() OR houtrotherstel.is_admin_or_projectleider())
    )
  );

CREATE POLICY "htr_rp_delete" ON houtrotherstel.repair_photos
  FOR DELETE USING (
    houtrotherstel.is_admin() OR
    EXISTS (
      SELECT 1 FROM houtrotherstel.repair_registrations rr
      WHERE rr.id = houtrotherstel.repair_photos.registration_id
      AND rr.user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: activity_logs
-- ============================================================

CREATE POLICY "htr_al_select" ON houtrotherstel.activity_logs
  FOR SELECT USING (houtrotherstel.is_admin_or_projectleider());

CREATE POLICY "htr_al_insert" ON houtrotherstel.activity_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
