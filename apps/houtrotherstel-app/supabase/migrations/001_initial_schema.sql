-- ============================================================
-- HOUTROTHERSTEL APP - INITIEEL DATABASE SCHEMA
-- Migratie 001: Schema aanmaken, enum types, tabellen, triggers, views
-- Alle objecten leven in het 'houtrotherstel' schema zodat dit project
-- kan draaien naast andere apps op hetzelfde Supabase-project.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS houtrotherstel;

GRANT USAGE ON SCHEMA houtrotherstel TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA houtrotherstel
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA houtrotherstel
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA houtrotherstel
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE houtrotherstel.user_role AS ENUM ('admin', 'projectleider', 'medewerker');

CREATE TYPE houtrotherstel.project_status AS ENUM (
  'concept', 'actief', 'afgerond', 'gepauzeerd', 'geannuleerd'
);

CREATE TYPE houtrotherstel.registratie_status AS ENUM (
  'open', 'ingepland', 'in_uitvoering', 'gereed',
  'gecontroleerd', 'afgekeurd', 'hersteld_na_afkeur'
);

CREATE TYPE houtrotherstel.control_status AS ENUM (
  'niet_gecontroleerd', 'goedgekeurd', 'afgekeurd'
);

CREATE TYPE houtrotherstel.foto_type AS ENUM ('voor', 'tijdens', 'na');

CREATE TYPE houtrotherstel.schade_severity AS ENUM ('licht', 'matig', 'ernstig', 'kritiek');

-- ============================================================
-- TABEL: profiles
-- ============================================================

CREATE TABLE houtrotherstel.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role houtrotherstel.user_role NOT NULL DEFAULT 'medewerker',
  active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_htr_profiles_email ON houtrotherstel.profiles(email);
CREATE INDEX idx_htr_profiles_role ON houtrotherstel.profiles(role);
CREATE INDEX idx_htr_profiles_active ON houtrotherstel.profiles(active);

-- ============================================================
-- TABEL: projects
-- ============================================================

CREATE TABLE houtrotherstel.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  address TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status houtrotherstel.project_status NOT NULL DEFAULT 'concept',
  description TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  photo_url TEXT,
  created_by UUID REFERENCES houtrotherstel.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_htr_projects_status ON houtrotherstel.projects(status);
CREATE INDEX idx_htr_projects_number ON houtrotherstel.projects(project_number);
CREATE INDEX idx_htr_projects_created_by ON houtrotherstel.projects(created_by);
CREATE INDEX idx_htr_projects_city ON houtrotherstel.projects(city);

-- ============================================================
-- TABEL: project_user_assignments
-- ============================================================

CREATE TABLE houtrotherstel.project_user_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES houtrotherstel.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES houtrotherstel.profiles(id) ON DELETE CASCADE,
  role_in_project TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_htr_pua_project_id ON houtrotherstel.project_user_assignments(project_id);
CREATE INDEX idx_htr_pua_user_id ON houtrotherstel.project_user_assignments(user_id);

-- ============================================================
-- TABEL: standard_repairs
-- ============================================================

CREATE TABLE houtrotherstel.standard_repairs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'st',
  labor_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  labor_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  labor_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  material_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  margin DECIMAL(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  price_date DATE,
  version TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_htr_sr_code ON houtrotherstel.standard_repairs(code);
CREATE INDEX idx_htr_sr_category ON houtrotherstel.standard_repairs(category);
CREATE INDEX idx_htr_sr_active ON houtrotherstel.standard_repairs(active);

-- ============================================================
-- TABEL: standard_repair_materials
-- ============================================================

CREATE TABLE houtrotherstel.standard_repair_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  standard_repair_id UUID NOT NULL REFERENCES houtrotherstel.standard_repairs(id) ON DELETE CASCADE,
  material_name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'st',
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_htr_srm_repair_id ON houtrotherstel.standard_repair_materials(standard_repair_id);

-- ============================================================
-- TABEL: repair_registrations
-- ============================================================

CREATE TABLE houtrotherstel.repair_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES houtrotherstel.projects(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES houtrotherstel.profiles(id) ON DELETE RESTRICT,
  registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location_block TEXT,
  floor TEXT,
  room_or_unit TEXT,
  facade_side TEXT,
  component_type TEXT,
  element_number TEXT,
  damage_description TEXT,
  damage_severity houtrotherstel.schade_severity,
  damage_cause TEXT,
  standard_repair_id UUID REFERENCES houtrotherstel.standard_repairs(id) ON DELETE SET NULL,
  custom_work_description TEXT,
  notes TEXT,
  status houtrotherstel.registratie_status NOT NULL DEFAULT 'open',
  control_status houtrotherstel.control_status NOT NULL DEFAULT 'niet_gecontroleerd',
  completed_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ,
  labor_hours_snapshot DECIMAL(8,2),
  labor_rate_snapshot DECIMAL(10,2),
  labor_cost_snapshot DECIMAL(10,2),
  material_cost_snapshot DECIMAL(10,2),
  cost_price_snapshot DECIMAL(10,2),
  sale_price_snapshot DECIMAL(10,2),
  repair_code_snapshot TEXT,
  repair_name_snapshot TEXT,
  repair_description_snapshot TEXT,
  actual_labor_hours DECIMAL(8,2),
  actual_material_cost DECIMAL(10,2),
  actual_cost_price DECIMAL(10,2),
  actual_sale_price DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_htr_rr_project_id ON houtrotherstel.repair_registrations(project_id);
CREATE INDEX idx_htr_rr_user_id ON houtrotherstel.repair_registrations(user_id);
CREATE INDEX idx_htr_rr_status ON houtrotherstel.repair_registrations(status);
CREATE INDEX idx_htr_rr_control_status ON houtrotherstel.repair_registrations(control_status);
CREATE INDEX idx_htr_rr_date ON houtrotherstel.repair_registrations(registration_date);
CREATE INDEX idx_htr_rr_component_type ON houtrotherstel.repair_registrations(component_type);
CREATE INDEX idx_htr_rr_sr_id ON houtrotherstel.repair_registrations(standard_repair_id);

-- ============================================================
-- TABEL: repair_photos
-- ============================================================

CREATE TABLE houtrotherstel.repair_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES houtrotherstel.repair_registrations(id) ON DELETE CASCADE,
  photo_type houtrotherstel.foto_type NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_htr_rp_registration_id ON houtrotherstel.repair_photos(registration_id);
CREATE INDEX idx_htr_rp_photo_type ON houtrotherstel.repair_photos(photo_type);

-- ============================================================
-- TABEL: activity_logs
-- ============================================================

CREATE TABLE houtrotherstel.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES houtrotherstel.profiles(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_htr_al_user_id ON houtrotherstel.activity_logs(user_id);
CREATE INDEX idx_htr_al_entity ON houtrotherstel.activity_logs(entity_type, entity_id);
CREATE INDEX idx_htr_al_created_at ON houtrotherstel.activity_logs(created_at);

-- ============================================================
-- TRIGGERS: updated_at automatisch bijwerken
-- ============================================================

CREATE OR REPLACE FUNCTION houtrotherstel.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_htr_profiles_updated_at
  BEFORE UPDATE ON houtrotherstel.profiles
  FOR EACH ROW EXECUTE FUNCTION houtrotherstel.update_updated_at_column();

CREATE TRIGGER update_htr_projects_updated_at
  BEFORE UPDATE ON houtrotherstel.projects
  FOR EACH ROW EXECUTE FUNCTION houtrotherstel.update_updated_at_column();

CREATE TRIGGER update_htr_standard_repairs_updated_at
  BEFORE UPDATE ON houtrotherstel.standard_repairs
  FOR EACH ROW EXECUTE FUNCTION houtrotherstel.update_updated_at_column();

CREATE TRIGGER update_htr_srm_updated_at
  BEFORE UPDATE ON houtrotherstel.standard_repair_materials
  FOR EACH ROW EXECUTE FUNCTION houtrotherstel.update_updated_at_column();

CREATE TRIGGER update_htr_rr_updated_at
  BEFORE UPDATE ON houtrotherstel.repair_registrations
  FOR EACH ROW EXECUTE FUNCTION houtrotherstel.update_updated_at_column();

-- ============================================================
-- TRIGGER: profiel aanmaken bij nieuwe gebruiker
-- Functie in public schema zodat de auth-trigger er bij kan.
-- Prefix 'htr_' voorkomt conflict met andere apps op dit project.
-- ============================================================

CREATE OR REPLACE FUNCTION public.htr_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO houtrotherstel.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::houtrotherstel.user_role, 'medewerker')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER htr_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.htr_handle_new_user();

-- ============================================================
-- TRIGGER: arbeidskosten automatisch berekenen
-- ============================================================

CREATE OR REPLACE FUNCTION houtrotherstel.calculate_repair_costs()
RETURNS TRIGGER AS $$
BEGIN
  NEW.labor_cost = NEW.labor_hours * NEW.labor_rate;
  NEW.cost_price = NEW.labor_cost + NEW.material_cost;
  IF NEW.sale_price > 0 THEN
    NEW.margin = ROUND(((NEW.sale_price - NEW.cost_price) / NEW.sale_price * 100)::numeric, 2);
  ELSE
    NEW.margin = 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER htr_calculate_standard_repair_costs
  BEFORE INSERT OR UPDATE ON houtrotherstel.standard_repairs
  FOR EACH ROW EXECUTE FUNCTION houtrotherstel.calculate_repair_costs();

-- ============================================================
-- VIEWS
-- ============================================================

CREATE VIEW houtrotherstel.registraties_met_details AS
SELECT
  rr.*,
  p.name AS project_name,
  p.project_number,
  p.client_name,
  prof.full_name AS medewerker_naam,
  prof.email AS medewerker_email,
  sr.name AS standaard_reparatie_naam,
  sr.category AS reparatie_categorie,
  COALESCE(rr.actual_sale_price, rr.sale_price_snapshot) AS effectieve_verkoopprijs,
  COALESCE(rr.actual_cost_price, rr.cost_price_snapshot) AS effectieve_kostprijs,
  COALESCE(rr.actual_labor_hours, rr.labor_hours_snapshot) AS effectieve_arbeidsuren
FROM houtrotherstel.repair_registrations rr
LEFT JOIN houtrotherstel.projects p ON rr.project_id = p.id
LEFT JOIN houtrotherstel.profiles prof ON rr.user_id = prof.id
LEFT JOIN houtrotherstel.standard_repairs sr ON rr.standard_repair_id = sr.id;

CREATE VIEW houtrotherstel.project_financieel_overzicht AS
SELECT
  p.id AS project_id,
  p.project_number,
  p.name AS project_name,
  p.client_name,
  p.status AS project_status,
  COUNT(rr.id) AS totaal_registraties,
  COUNT(CASE WHEN rr.status = 'open' THEN 1 END) AS open_registraties,
  COUNT(CASE WHEN rr.status = 'gereed' THEN 1 END) AS gereed_registraties,
  COUNT(CASE WHEN rr.status = 'gecontroleerd' THEN 1 END) AS gecontroleerd_registraties,
  COUNT(CASE WHEN rr.status = 'afgekeurd' THEN 1 END) AS afgekeurd_registraties,
  COALESCE(SUM(COALESCE(rr.actual_sale_price, rr.sale_price_snapshot)), 0) AS totaal_verkoopprijs,
  COALESCE(SUM(COALESCE(rr.actual_cost_price, rr.cost_price_snapshot)), 0) AS totaal_kostprijs,
  COALESCE(SUM(COALESCE(rr.actual_sale_price, rr.sale_price_snapshot)) -
    SUM(COALESCE(rr.actual_cost_price, rr.cost_price_snapshot)), 0) AS totaal_marge,
  COALESCE(SUM(COALESCE(rr.actual_labor_hours, rr.labor_hours_snapshot)), 0) AS totaal_arbeidsuren
FROM houtrotherstel.projects p
LEFT JOIN houtrotherstel.repair_registrations rr ON p.id = rr.project_id
GROUP BY p.id, p.project_number, p.name, p.client_name, p.status;
