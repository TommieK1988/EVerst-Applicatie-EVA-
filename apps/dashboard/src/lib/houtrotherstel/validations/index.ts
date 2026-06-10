import { z } from 'zod'

// ============================================================
// AUTH SCHEMAS
// ============================================================

export const loginSchema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in'),
  password: z.string().min(6, 'Wachtwoord moet minimaal 6 tekens bevatten'),
})

export const resetPasswordSchema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in'),
})

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, 'Wachtwoord moet minimaal 8 tekens bevatten'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Wachtwoorden komen niet overeen',
    path: ['confirmPassword'],
  })

// ============================================================
// PROFIEL SCHEMA
// ============================================================

export const profileSchema = z.object({
  full_name: z.string().min(2, 'Naam moet minimaal 2 tekens bevatten'),
  email: z.string().email('Voer een geldig e-mailadres in'),
  role: z.enum(['admin', 'platform_gebruiker', 'app_gebruiker']),
  active: z.boolean(),
  phone: z.string().optional(),
})

// ============================================================
// PROJECT SCHEMA
// ============================================================

export const projectSchema = z.object({
  project_number: z
    .string()
    .min(1, 'Projectnummer is verplicht')
    .max(50, 'Projectnummer mag maximaal 50 tekens bevatten'),
  name: z
    .string()
    .min(2, 'Projectnaam moet minimaal 2 tekens bevatten')
    .max(200, 'Projectnaam mag maximaal 200 tekens bevatten'),
  client_name: z.string().min(2, 'Opdrachtgever is verplicht'),
  address: z.string().min(2, 'Adres is verplicht'),
  postal_code: z
    .string()
    .regex(/^\d{4}\s?[A-Z]{2}$/i, 'Voer een geldige postcode in (bijv. 1234 AB)'),
  city: z.string().min(2, 'Plaats is verplicht'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: z.enum(['onderhanden', 'afgerond']),
  description: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email('Voer een geldig e-mailadres in').optional().or(z.literal('')),
  notes: z.string().optional(),
})

// ============================================================
// STANDAARD REPARATIE SCHEMA
// ============================================================

export const materialSchema = z.object({
  id: z.string().optional(),
  material_name: z.string().min(1, 'Materiaalnaam is verplicht'),
  quantity: z.number().min(0, 'Hoeveelheid moet 0 of meer zijn'),
  unit: z.string().min(1, 'Eenheid is verplicht'),
  unit_cost: z.number().min(0, 'Prijs moet 0 of meer zijn'),
})

export const standardRepairSchema = z.object({
  code: z
    .string()
    .min(1, 'Reparatiecode is verplicht')
    .max(50, 'Code mag maximaal 50 tekens bevatten'),
  name: z.string().min(2, 'Naam is verplicht'),
  category: z.string().min(1, 'Categorie is verplicht'),
  description: z.string().optional(),
  unit: z.string().min(1, 'Eenheid is verplicht'),
  labor_hours: z.number().min(0, 'Arbeidsuren moeten 0 of meer zijn'),
  labor_rate: z.number().min(0, 'Arbeidstarief moet 0 of meer zijn'),
  material_cost: z.number().min(0, 'Materiaalkosten moeten 0 of meer zijn'),
  sale_price: z.number().min(0, 'Verkoopprijs moet 0 of meer zijn'),
  active: z.boolean(),
  price_date: z.string().optional(),
  version: z.string().optional(),
  notes: z.string().optional(),
  materials: z.array(materialSchema).optional(),
})

// ============================================================
// REGISTRATIE SCHEMA
// ============================================================

export const registratieSchema = z.object({
  project_id: z.string().uuid('Selecteer een project'),
  registration_date: z.string().min(1, 'Datum is verplicht'),

  // Locatie
  location_block: z.string().optional(),
  floor: z.string().optional(),
  room_or_unit: z.string().optional(),
  facade_side: z.string().optional(),
  component_type: z.string().optional(),
  element_number: z.string().optional(),

  // Schade
  damage_description: z.string().optional(),
  damage_severity: z
    .enum(['licht', 'matig', 'ernstig', 'kritiek'])
    .optional(),
  damage_cause: z.string().optional(),

  // Reparatie
  standard_repair_id: z.string().uuid().optional().or(z.literal('')),
  custom_work_description: z.string().optional(),
  notes: z.string().optional(),

  // Status
  status: z.enum(['geregistreerd', 'open', 'in_uitvoering', 'ingepland', 'onderhanden', 'gereed', 'gecontroleerd', 'afgekeurd', 'afgerond']),
  control_status: z.enum(['niet_gecontroleerd', 'goedgekeurd', 'afgekeurd']),
  completed_at: z.string().optional(),
  checked_at: z.string().optional(),

  // Financieel snapshot
  labor_hours_snapshot: z.number().optional(),
  labor_rate_snapshot: z.number().optional(),
  labor_cost_snapshot: z.number().optional(),
  material_cost_snapshot: z.number().optional(),
  cost_price_snapshot: z.number().optional(),
  sale_price_snapshot: z.number().optional(),
  repair_code_snapshot: z.string().optional(),
  repair_name_snapshot: z.string().optional(),
  repair_description_snapshot: z.string().optional(),

  // Werkelijke waarden
  actual_labor_hours: z.number().optional(),
  actual_material_cost: z.number().optional(),
  actual_cost_price: z.number().optional(),
  actual_sale_price: z.number().optional(),
})

export type LoginFormValues = z.infer<typeof loginSchema>
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
export type UpdatePasswordFormValues = z.infer<typeof updatePasswordSchema>
export type ProfileFormValues = z.infer<typeof profileSchema>
export type ProjectFormValues = z.infer<typeof projectSchema>
export type StandardRepairFormValues = z.infer<typeof standardRepairSchema>
export type MaterialFormValues = z.infer<typeof materialSchema>
export type RegistratieFormValues = z.infer<typeof registratieSchema>
