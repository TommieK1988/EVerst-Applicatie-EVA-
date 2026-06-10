// ============================================================
// ENUMS & CONSTANTEN
// ============================================================

export type UserRole = 'admin' | 'platform_gebruiker' | 'app_gebruiker'

export type ProjectStatus = 'onderhanden' | 'afgerond'

export type RegistratieStatus =
  | 'geregistreerd' | 'open' | 'in_uitvoering' | 'ingepland'
  | 'onderhanden' | 'gereed' | 'gecontroleerd' | 'afgekeurd' | 'afgerond'

export type ControlStatus = 'niet_gecontroleerd' | 'goedgekeurd' | 'afgekeurd'

export type FotoType = 'voor' | 'tijdens' | 'na'

export type SchadeSeverity = 'licht' | 'matig' | 'ernstig' | 'kritiek'

export const PROJECT_STATUSSEN: Record<ProjectStatus, string> = {
  onderhanden: 'Onderhanden',
  afgerond: 'Afgerond',
}

export const REGISTRATIE_STATUSSEN: Record<RegistratieStatus, string> = {
  geregistreerd: 'Geregistreerd',
  open: 'Open',
  in_uitvoering: 'In uitvoering',
  ingepland: 'Ingepland',
  onderhanden: 'Onderhanden',
  gereed: 'Gereed',
  gecontroleerd: 'Gecontroleerd',
  afgekeurd: 'Afgekeurd',
  afgerond: 'Afgerond',
}

export const CONTROL_STATUSSEN: Record<ControlStatus, string> = {
  niet_gecontroleerd: 'Niet gecontroleerd',
  goedgekeurd: 'Goedgekeurd',
  afgekeurd: 'Afgekeurd',
}

export const SCHADE_SEVERITY: Record<SchadeSeverity, string> = {
  licht: 'Licht',
  matig: 'Matig',
  ernstig: 'Ernstig',
  kritiek: 'Kritiek',
}

export const ONDERDEEL_TYPEN = [
  'Kozijn',
  'Deur',
  'Goot',
  'Boeideel',
  'Stijl',
  'Dorpel',
  'Glaslat',
  'Neuslat',
  'Raamkozijn',
  'Onderdorpel',
  'Daklijst',
  'Windveer',
  'Rabatdeel',
  'Overig',
] as const

export type OnderdeelType = (typeof ONDERDEEL_TYPEN)[number]

export const GEVEL_ZIJDEN = [
  'Voorgevel',
  'Achtergevel',
  'Linkergevel',
  'Rechtergevel',
  'Dak',
  'Intern',
] as const

export type GevelZijde = (typeof GEVEL_ZIJDEN)[number]

export const REPARATIE_CATEGORIEEN = [
  'Epoxyherstel klein',
  'Epoxyherstel middel',
  'Epoxyherstel groot',
  'Deelvervanging dorpel',
  'Deelvervanging stijl',
  'Glaslat vervangen',
  'Neuslat vervangen',
  'Kit- en aansluitwerk',
  'Deelvervanging kozijnhout',
  'Onderdorpel herstel',
  'Verfwerk',
  'Overig',
] as const

export type ReparatieCategorie = (typeof REPARATIE_CATEGORIEEN)[number]

// ============================================================
// DATABASE TYPES (Supabase)
// ============================================================

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  active: boolean
  avatar_url?: string | null
  phone?: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  project_number: string
  name: string
  client_name: string
  address: string
  postal_code: string
  city: string
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  description: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  notes: string | null
  photo_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectWithStats extends Project {
  registratie_count?: number
  open_count?: number
  gereed_count?: number
  total_sale_price?: number
  assigned_users?: Profile[]
}

export interface ProjectUserAssignment {
  id: string
  project_id: string
  user_id: string
  role_in_project: string | null
  created_at: string
  profile?: Profile
  project?: Project
}

export interface StandardRepair {
  id: string
  code: string
  name: string
  extended_description: string | null
  category: string
  description: string | null
  unit: string
  labor_hours: number
  labor_rate: number
  labor_cost: number
  material_cost: number
  cost_price: number
  sale_price: number
  vat_percentage: number
  margin: number
  active: boolean
  price_date: string | null
  version: string | null
  notes: string | null
  created_at: string
  updated_at: string
  materials?: StandardRepairMaterial[]
}

export interface StandardRepairMaterial {
  id: string
  standard_repair_id: string
  material_name: string
  quantity: number
  unit: string
  unit_cost: number
  total_cost: number
  created_at: string
  updated_at: string
}

export interface RepairRegistration {
  id: string
  project_id: string
  user_id: string
  registration_date: string
  location_block: string | null
  floor: string | null
  room_or_unit: string | null
  facade_side: string | null
  component_type: string | null
  element_number: string | null
  damage_description: string | null
  damage_severity: SchadeSeverity | null
  damage_cause: string | null
  standard_repair_id: string | null
  custom_work_description: string | null
  notes: string | null
  status: RegistratieStatus
  control_status: ControlStatus
  completed_at: string | null
  checked_at: string | null
  // Snapshot velden
  labor_hours_snapshot: number | null
  labor_rate_snapshot: number | null
  labor_cost_snapshot: number | null
  material_cost_snapshot: number | null
  cost_price_snapshot: number | null
  sale_price_snapshot: number | null
  repair_code_snapshot: string | null
  repair_name_snapshot: string | null
  repair_description_snapshot: string | null
  // Werkelijke waarden
  actual_labor_hours: number | null
  actual_material_cost: number | null
  actual_cost_price: number | null
  actual_sale_price: number | null
  created_at: string
  updated_at: string
  // Relaties
  project?: Project
  profile?: Profile
  standard_repair?: StandardRepair
  photos?: RepairPhoto[]
}

export interface RepairPhoto {
  id: string
  registration_id: string
  photo_type: FotoType
  storage_path: string
  file_name: string
  public_url?: string
  created_at: string
}

export interface ActivityLog {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
  profile?: Profile
}

// ============================================================
// FORM TYPES
// ============================================================

export interface LoginForm {
  email: string
  password: string
}

export interface ResetPasswordForm {
  email: string
}

export interface UpdatePasswordForm {
  password: string
  confirmPassword: string
}

export interface ProfileForm {
  full_name: string
  email: string
  role: UserRole
  active: boolean
  phone?: string
}

export interface ProjectForm {
  project_number: string
  name: string
  client_name: string
  address: string
  postal_code: string
  city: string
  start_date?: string
  end_date?: string
  status: ProjectStatus
  description?: string
  contact_name?: string
  contact_phone?: string
  contact_email?: string
  notes?: string
}

export interface StandardRepairForm {
  code: string
  name: string
  category: string
  description?: string
  unit: string
  labor_hours: number
  labor_rate: number
  material_cost: number
  sale_price: number
  active: boolean
  price_date?: string
  version?: string
  notes?: string
  materials?: StandardRepairMaterialForm[]
  labor_cost?: number
  cost_price?: number
}

export interface StandardRepairMaterialForm {
  id?: string
  material_name: string
  quantity: number
  unit: string
  unit_cost: number
}

export interface RegistratieForm {
  project_id: string
  registration_date: string
  location_block?: string
  floor?: string
  room_or_unit?: string
  facade_side?: string
  component_type?: string
  element_number?: string
  damage_description?: string
  damage_severity?: SchadeSeverity
  damage_cause?: string
  standard_repair_id?: string
  custom_work_description?: string
  notes?: string
  status: RegistratieStatus
  control_status: ControlStatus
  completed_at?: string
  checked_at?: string
  // Snapshot / werkelijke waarden
  labor_hours_snapshot?: number
  labor_rate_snapshot?: number
  labor_cost_snapshot?: number
  material_cost_snapshot?: number
  cost_price_snapshot?: number
  sale_price_snapshot?: number
  repair_code_snapshot?: string
  repair_name_snapshot?: string
  repair_description_snapshot?: string
  actual_labor_hours?: number
  actual_material_cost?: number
  actual_cost_price?: number
  actual_sale_price?: number
}

// ============================================================
// FILTER / QUERY TYPES
// ============================================================

export interface RegistratieFilters {
  project_id?: string
  user_id?: string
  status?: RegistratieStatus
  control_status?: ControlStatus
  date_from?: string
  date_to?: string
  location_block?: string
  component_type?: string
  search?: string
}

export interface ProjectFilters {
  status?: ProjectStatus
  search?: string
}

// ============================================================
// RAPPORTAGE TYPES
// ============================================================

export interface ProjectFinancieel {
  project_id: string
  project_name: string
  project_number: string
  total_registraties: number
  total_sale_price: number
  total_cost_price: number
  total_margin: number
  margin_percentage: number
}

export interface ReparatieSamenvatting {
  category: string
  count: number
  total_sale_price: number
  total_cost_price: number
}

export interface MedewerkerSamenvatting {
  user_id: string
  full_name: string
  count: number
  total_sale_price: number
  total_labor_hours: number
}

// ============================================================
// PROJECTDEEL / LOCATIE / REGISTRATIE / REPARATIE
// ============================================================

export interface Projectdeel {
  id: string
  project_id: string
  naam: string
  omschrijving: string | null
  volgorde: number
  created_at: string
  updated_at: string
}

export interface Locatie {
  id: string
  projectdeel_id: string
  project_id: string
  naam: string
  omschrijving: string | null
  created_at: string
  updated_at: string
}

export interface Registratie {
  id: string
  locatie_id: string
  projectdeel_id: string
  project_id: string
  datum: string
  medewerker: string | null
  omschrijving: string | null
  voor_foto: string | null
  na_foto: string | null
  status: RegistratieStatus
  created_at: string
  updated_at: string
  // Extended fields (RepairRegistration schema)
  registration_date?: string
  actual_sale_price?: number | null
  sale_price_snapshot?: number | null
  repair_name_snapshot?: string | null
  project?: { name?: string; project_number?: string | null }
}

export interface Reparatie {
  id: string
  registratie_id: string
  locatie_id: string
  projectdeel_id: string
  project_id: string
  omschrijving: string
  standaard_reparatie_id: string | null
  reparatie_naam: string | null
  reparatie_code: string | null
  sale_price_snapshot: number | null
  created_at: string
  updated_at: string
  // Relations (in-memory)
  locatie?: Locatie
  registratie?: Registratie
  projectdeel?: Projectdeel
  standaard_reparatie?: StandardRepair
}

// ============================================================
// UI HELPER TYPES
// ============================================================

export interface TableColumn<T> {
  key: keyof T
  label: string
  sortable?: boolean
  render?: (value: unknown, row: T) => React.ReactNode
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
}

export interface SelectOption {
  value: string
  label: string
}
