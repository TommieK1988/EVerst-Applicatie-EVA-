export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          project_number: string | null
          name: string
          client_name: string | null
          description: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_number?: string | null
          name: string
          client_name?: string | null
          description?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_number?: string | null
          name?: string
          client_name?: string | null
          description?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      calculation_groups: {
        Row: {
          id: string
          project_id: string
          parent_group_id: string | null
          level: number
          group_number: string | null
          name: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          parent_group_id?: string | null
          level?: number
          group_number?: string | null
          name: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          parent_group_id?: string | null
          level?: number
          group_number?: string | null
          name?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "calculation_groups"
            referencedColumns: ["id"]
          }
        ]
      }
      calculation_lines: {
        Row: {
          id: string
          project_id: string
          group_id: string
          source_type: string | null
          source_aggregate_id: string | null
          description: string
          quantity: number
          unit: string
          labor_hours: number | null
          labor_rate: number | null
          labor_cost: number | null
          material_cost: number | null
          equipment_cost: number | null
          subcontract_cost: number | null
          total_cost: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          group_id: string
          source_type?: string | null
          source_aggregate_id?: string | null
          description: string
          quantity?: number
          unit?: string
          labor_hours?: number | null
          labor_rate?: number | null
          labor_cost?: number | null
          material_cost?: number | null
          equipment_cost?: number | null
          subcontract_cost?: number | null
          total_cost?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          group_id?: string
          source_type?: string | null
          source_aggregate_id?: string | null
          description?: string
          quantity?: number
          unit?: string
          labor_hours?: number | null
          labor_rate?: number | null
          labor_cost?: number | null
          material_cost?: number | null
          equipment_cost?: number | null
          subcontract_cost?: number | null
          total_cost?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_lines_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "calculation_groups"
            referencedColumns: ["id"]
          }
        ]
      }
      paint_measurements: {
        Row: {
          id: string
          project_id: string
          name: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paint_measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      paint_measurement_lines: {
        Row: {
          id: string
          measurement_id: string
          project_id: string
          group_id: string
          line_no: number
          item_id: string | null
          treatment_id: string | null
          onderdeel: string | null
          type: string | null
          behandeling: string | null
          description: string | null
          code: string | null
          type_code: string | null
          treatment_code: string | null
          width_mm: number | null
          height_mm: number | null
          length_mm: number | null
          count: number
          quantity: number | null
          unit: string
          specification: string | null
          remarks: string | null
          is_draft: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          measurement_id: string
          project_id: string
          group_id: string
          line_no?: number
          item_id?: string | null
          treatment_id?: string | null
          onderdeel?: string | null
          type?: string | null
          behandeling?: string | null
          description?: string | null
          code?: string | null
          type_code?: string | null
          treatment_code?: string | null
          width_mm?: number | null
          height_mm?: number | null
          length_mm?: number | null
          count?: number
          quantity?: number | null
          unit?: string
          specification?: string | null
          remarks?: string | null
          is_draft?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          measurement_id?: string
          project_id?: string
          group_id?: string
          line_no?: number
          item_id?: string | null
          treatment_id?: string | null
          onderdeel?: string | null
          type?: string | null
          behandeling?: string | null
          description?: string | null
          code?: string | null
          type_code?: string | null
          treatment_code?: string | null
          width_mm?: number | null
          height_mm?: number | null
          length_mm?: number | null
          count?: number
          quantity?: number | null
          unit?: string
          specification?: string | null
          remarks?: string | null
          is_draft?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paint_measurement_lines_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "paint_measurements"
            referencedColumns: ["id"]
          }
        ]
      }
      paint_measurement_aggregates: {
        Row: {
          id: string
          project_id: string
          measurement_id: string
          group_id: string
          treatment_id: string | null
          item_id: string | null
          onderdeel: string | null
          type: string | null
          behandeling: string | null
          aggregate_key: string
          quantity: number
          unit: string
          labor_hours: number | null
          labor_rate: number | null
          labor_cost: number | null
          material_cost: number | null
          equipment_cost: number | null
          subcontract_cost: number | null
          calculation_line_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          measurement_id: string
          group_id: string
          treatment_id?: string | null
          item_id?: string | null
          onderdeel?: string | null
          type?: string | null
          behandeling?: string | null
          aggregate_key: string
          quantity?: number
          unit?: string
          labor_hours?: number | null
          labor_rate?: number | null
          labor_cost?: number | null
          material_cost?: number | null
          equipment_cost?: number | null
          subcontract_cost?: number | null
          calculation_line_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          measurement_id?: string
          group_id?: string
          treatment_id?: string | null
          item_id?: string | null
          onderdeel?: string | null
          type?: string | null
          behandeling?: string | null
          aggregate_key?: string
          quantity?: number
          unit?: string
          labor_hours?: number | null
          labor_rate?: number | null
          labor_cost?: number | null
          material_cost?: number | null
          equipment_cost?: number | null
          subcontract_cost?: number | null
          calculation_line_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paint_measurement_aggregates_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "paint_measurements"
            referencedColumns: ["id"]
          }
        ]
      }
      paint_items: {
        Row: {
          id: string
          family_id: string | null
          treatment_id: string | null
          item_code: string | null
          onderdeel: string
          type: string | null
          full_name: string
          default_unit: string
          source: string | null
          active: boolean
          description: string | null
          btw_tarief: string
        }
        Insert: {
          id?: string
          family_id?: string | null
          treatment_id?: string | null
          item_code?: string | null
          onderdeel: string
          type?: string | null
          full_name: string
          default_unit?: string
          source?: string | null
          active?: boolean
          description?: string | null
          btw_tarief?: string
        }
        Update: {
          id?: string
          family_id?: string | null
          treatment_id?: string | null
          item_code?: string | null
          onderdeel?: string
          type?: string | null
          full_name?: string
          default_unit?: string
          source?: string | null
          active?: boolean
          description?: string | null
          btw_tarief?: string
        }
        Relationships: []
      }
      paint_labor_norms: {
        Row: {
          id: string
          item_id: string
          treatment_id: string
          source_code: string | null
          unit: string
          hours_per_unit: number
          hour_rate: number
          cost_per_unit: number
          active: boolean
          description: string | null
        }
        Insert: {
          id?: string
          item_id: string
          treatment_id: string
          source_code?: string | null
          unit?: string
          hours_per_unit: number
          hour_rate?: number
          cost_per_unit?: number
          active?: boolean
          description?: string | null
        }
        Update: {
          id?: string
          item_id?: string
          treatment_id?: string
          source_code?: string | null
          unit?: string
          hours_per_unit?: number
          hour_rate?: number
          cost_per_unit?: number
          active?: boolean
          description?: string | null
        }
        Relationships: []
      }
      paint_material_norms: {
        Row: {
          id: string
          item_id: string
          treatment_id: string
          source_code: string | null
          material_code: string | null
          material_name: string | null
          unit: string
          quantity_per_unit: number
          unit_price: number
          cost_per_unit: number
          active: boolean
          norm_type: string
        }
        Insert: {
          id?: string
          item_id: string
          treatment_id: string
          source_code?: string | null
          material_code?: string | null
          material_name?: string | null
          unit?: string
          quantity_per_unit: number
          unit_price?: number
          cost_per_unit?: number
          active?: boolean
          norm_type?: string
        }
        Update: {
          id?: string
          item_id?: string
          treatment_id?: string
          source_code?: string | null
          material_code?: string | null
          material_name?: string | null
          unit?: string
          quantity_per_unit?: number
          unit_price?: number
          cost_per_unit?: number
          active?: boolean
          norm_type?: string
        }
        Relationships: []
      }
      paint_system_families: {
        Row: {
          id: string
          family_code: string | null
          name: string
          source: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_code?: string | null
          name: string
          source?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_code?: string | null
          name?: string
          source?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      paint_treatments: {
        Row: {
          id: string
          family_id: string | null
          treatment_index_code: string | null
          treatment_code: string | null
          name: string
          source: string | null
          active: boolean
        }
        Insert: {
          id?: string
          family_id?: string | null
          treatment_index_code?: string | null
          treatment_code?: string | null
          name: string
          source?: string | null
          active?: boolean
        }
        Update: {
          id?: string
          family_id?: string | null
          treatment_index_code?: string | null
          treatment_code?: string | null
          name?: string
          source?: string | null
          active?: boolean
        }
        Relationships: []
      }
      task_lists: {
        Row: { id: string; naam: string; beschrijving: string | null; entity_type: 'project' | 'offerte' | 'calculatie' | null; entity_id: string | null; is_template: boolean; template_naam: string | null; owner_id: string | null; volgorde: number; dossier_id: string | null; medewerker_id: string | null; context: 'dossier' | 'medewerker'; trigger_hoofdstatus: string | null; trigger_substatus: string | null; template_id: string | null; streefdatum: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; naam: string; beschrijving?: string | null; entity_type?: 'project' | 'offerte' | 'calculatie' | null; entity_id?: string | null; is_template?: boolean; template_naam?: string | null; owner_id?: string | null; volgorde?: number; dossier_id?: string | null; medewerker_id?: string | null; context?: 'dossier' | 'medewerker'; trigger_hoofdstatus?: string | null; trigger_substatus?: string | null; template_id?: string | null; streefdatum?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; naam?: string; beschrijving?: string | null; entity_type?: 'project' | 'offerte' | 'calculatie' | null; entity_id?: string | null; is_template?: boolean; template_naam?: string | null; owner_id?: string | null; volgorde?: number; dossier_id?: string | null; medewerker_id?: string | null; context?: 'dossier' | 'medewerker'; trigger_hoofdstatus?: string | null; trigger_substatus?: string | null; template_id?: string | null; streefdatum?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      task_completion_acties: {
        Row: { id: string; task_id: string; volgorde: number; actie_type: string; config: Json; created_at: string }
        Insert: { id?: string; task_id: string; volgorde?: number; actie_type: string; config?: Json; created_at?: string }
        Update: { id?: string; task_id?: string; volgorde?: number; actie_type?: string; config?: Json; created_at?: string }
        Relationships: []
      }
      tasks: {
        Row: { id: string; lijst_id: string | null; dossier_id: string | null; parent_task_id: string | null; titel: string; omschrijving: Json | null; status: 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen'; prioriteit: 'laag' | 'normaal' | 'hoog' | 'urgent'; deadline: string | null; geschatte_uren: number | null; volgorde: number; aangemaakt_door: string | null; assignee_type: 'direct' | 'dossier_rol'; dossier_rol: string | null; max_doorlooptijd_dagen: number | null; deadline_offset_dagen: number | null; deadline_basis: string; deadline_dagen: number | null; deadline_handmatig: boolean; herhaling_interval: string; herhaling_bron_taak_id: string | null; herhaling_index: number | null; blocked_by_task_id: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; lijst_id?: string | null; dossier_id?: string | null; parent_task_id?: string | null; titel: string; omschrijving?: Json | null; status?: 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen'; prioriteit?: 'laag' | 'normaal' | 'hoog' | 'urgent'; deadline?: string | null; geschatte_uren?: number | null; volgorde?: number; aangemaakt_door?: string | null; assignee_type?: 'direct' | 'dossier_rol'; dossier_rol?: string | null; max_doorlooptijd_dagen?: number | null; deadline_offset_dagen?: number | null; deadline_basis?: string; deadline_dagen?: number | null; deadline_handmatig?: boolean; herhaling_interval?: string; herhaling_bron_taak_id?: string | null; herhaling_index?: number | null; blocked_by_task_id?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; lijst_id?: string | null; dossier_id?: string | null; parent_task_id?: string | null; titel?: string; omschrijving?: Json | null; status?: 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen'; prioriteit?: 'laag' | 'normaal' | 'hoog' | 'urgent'; deadline?: string | null; geschatte_uren?: number | null; volgorde?: number; aangemaakt_door?: string | null; assignee_type?: 'direct' | 'dossier_rol'; dossier_rol?: string | null; max_doorlooptijd_dagen?: number | null; deadline_offset_dagen?: number | null; deadline_basis?: string; deadline_dagen?: number | null; deadline_handmatig?: boolean; herhaling_interval?: string; herhaling_bron_taak_id?: string | null; herhaling_index?: number | null; blocked_by_task_id?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      task_assignees: {
        Row: { task_id: string; user_id: string; rol: 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer' }
        Insert: { task_id: string; user_id: string; rol?: 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer' }
        Update: { task_id?: string; user_id?: string; rol?: 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer' }
        Relationships: []
      }
      task_audit_log: {
        Row: { id: string; task_id: string; user_id: string | null; actie: string; oud_waarde: Json | null; nieuwe_waarde: Json | null; tijdstip: string }
        Insert: { id?: string; task_id: string; user_id?: string | null; actie: string; oud_waarde?: Json | null; nieuwe_waarde?: Json | null; tijdstip?: string }
        Update: { id?: string; task_id?: string; user_id?: string | null; actie?: string; oud_waarde?: Json | null; nieuwe_waarde?: Json | null; tijdstip?: string }
        Relationships: []
      }
      task_comments: {
        Row: { id: string; task_id: string; user_id: string | null; inhoud: string; created_at: string; updated_at: string }
        Insert: { id?: string; task_id: string; user_id?: string | null; inhoud: string; created_at?: string; updated_at?: string }
        Update: { id?: string; task_id?: string; user_id?: string | null; inhoud?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
      user_roles: {
        Row: { id: string; naam: string; beschrijving: string | null; created_at: string }
        Insert: { id?: string; naam: string; beschrijving?: string | null; created_at?: string }
        Update: { id?: string; naam?: string; beschrijving?: string | null; created_at?: string }
        Relationships: []
      }
    }
    Views: {
      vw_group_totals: {
        Row: {
          group_id: string | null
          project_id: string | null
          group_name: string | null
          total_cost: number | null
        }
        Relationships: []
      }
      vw_paint_measurement_aggregate_descriptions: {
        Row: {
          id: string | null
          project_id: string | null
          measurement_id: string | null
          group_id: string | null
          item_id: string | null
          treatment_id: string | null
          onderdeel: string | null
          type: string | null
          behandeling: string | null
          calculation_description: string | null
          quantity: number | null
          unit: string | null
          labor_hours: number | null
          labor_rate: number | null
          labor_cost: number | null
          material_cost: number | null
          equipment_cost: number | null
          subcontract_cost: number | null
          calculation_line_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {}
    Enums: {}
  }
}

// ─── Taken types ─────────────────────────────────────────────────────────────

export type TaskStatus    = 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen'
export type TaskPrioriteit = 'laag' | 'normaal' | 'hoog' | 'urgent'
export type TaskAssigneeRol = 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer'
export type EntityType    = 'project' | 'offerte' | 'calculatie'

/** 'medewerker_zelf' = de medewerker om wie de actielijst draait (medewerker-context). */
export type AssigneeType = 'direct' | 'dossier_rol' | 'medewerker_zelf'
export type CompletionActieType =
  | 'dossier_substatus_wijzigen'
  | 'dossier_rol_toewijzen'
  | 'notificatie_sturen'
  | 'sjabloon_activeren'

export interface DbTaskList {
  id: string
  naam: string
  beschrijving: string | null
  entity_type: EntityType | null
  entity_id: string | null
  is_template: boolean
  template_naam: string | null
  owner_id: string | null
  volgorde: number
  // Sjabloon-extensies
  dossier_id: string | null
  /** Geactiveerde lijst op een medewerker (medewerker-context). */
  medewerker_id: string | null
  /** Sjabloon: waar het sjabloon voor bedoeld is. Bepaalt triggers, toewijzing en ankers. */
  context: 'dossier' | 'medewerker'
  trigger_hoofdstatus: string | null
  trigger_substatus: string | null
  template_id: string | null
  /** Geactiveerde lijst: de streefdatum die bij het activeren is ingetypt. */
  streefdatum: string | null
  created_at: string
  updated_at: string
}

export interface DbTask {
  id: string
  lijst_id: string | null
  /** Directe dossier-koppeling voor losse taken zonder actielijst. */
  dossier_id: string | null
  /** Directe medewerker-koppeling voor losse taken zonder actielijst. */
  medewerker_id: string | null
  parent_task_id: string | null
  titel: string
  omschrijving: Record<string, unknown> | null  // Tiptap JSON
  status: TaskStatus
  prioriteit: TaskPrioriteit
  deadline: string | null
  geschatte_uren: number | null
  volgorde: number
  aangemaakt_door: string | null
  // Toewijzing-extensies
  assignee_type: AssigneeType
  dossier_rollen: string[]   // bv. ['project_manager_id', 'calculator_id']
  // Deadline-anker voor sjabloon-taken: waar de deadline aan hangt en hoeveel dagen
  // ervóór (negatief) of erná (positief). Zie lib/taken/deadlines.ts.
  deadline_basis:
    | 'geen' | 'activatie' | 'streefdatum' | 'planning_start' | 'planning_eind'
    | 'verwacht_startdatum' | 'verwacht_einddatum'
    | 'in_dienst_vanaf' | 'uit_dienst_per'
  deadline_dagen: number | null
  /** Deadline handmatig gezet → de automatische herberekening slaat deze taak over. */
  deadline_handmatig: boolean
  // Herhaling gedurende de uitvoering (het venster van de detailplanning)
  herhaling_interval: 'geen' | 'werkdagen' | 'wekelijks' | 'tweewekelijks' | 'maandelijks'
  /** Op een gegenereerde herhaal-taak: de sjabloontaak waaruit hij ontstond. */
  herhaling_bron_taak_id: string | null
  /** De hoeveelste keer (0-based) binnen de reeks. */
  herhaling_index: number | null
  // Afhankelijkheid
  blocked_by_task_id: string | null
  // Formulier-koppeling
  formulier_template_id: string | null
  /**
   * Deze actie start een kwaliteitsronde. Zelfde mechaniek als `formulier_template_id`: de taak
   * krijgt een startknop en gaat automatisch op gereed zodra de inspectie definitief is.
   */
  kwaliteit_ronde: boolean
  created_at: string
  updated_at: string
}

export interface DbTaskCompletionActie {
  id: string
  task_id: string
  volgorde: number
  actie_type: CompletionActieType
  config: Record<string, unknown>
  created_at: string
}

export interface DbTaskAssignee {
  task_id: string
  user_id: string
  rol: TaskAssigneeRol
}

export interface DbTaskComment {
  id: string
  task_id: string
  user_id: string | null
  inhoud: string
  created_at: string
  updated_at: string
}

export interface DbTaskAttachment {
  id: string
  task_id: string
  naam: string
  url: string
  bestandstype: string | null
  grootte: number | null
  geupload_door: string | null
  created_at: string
}

export interface DbTaskAuditLog {
  id: string
  task_id: string
  user_id: string | null
  actie: string
  oud_waarde: Record<string, unknown> | null
  nieuwe_waarde: Record<string, unknown> | null
  tijdstip: string
}

export interface DbUserRole {
  id: string
  naam: string
  beschrijving: string | null
  created_at: string
}

// Verrijkte types met joins (voor gebruik in UI)
export interface TaakMetDetails extends DbTask {
  assignees: (DbTaskAssignee & { display_name?: string; email?: string })[]
  subtaken: DbTask[]
  comments_count: number
  attachments_count: number
  lijst?: Pick<DbTaskList, 'id' | 'naam'>
  // dossier_id zit al op DbTask; hier alleen de afgeleide weergavevelden
  dossier_naam?: string | null
  dossier_sectie?: string | null
}

export interface ActielijstMetTaken extends DbTaskList {
  taken: TaakMetDetails[]
  taken_count: number
  gereed_count: number
  completion_acties?: DbTaskCompletionActie[]
  /** Gezet als deze lijst automatisch via een sjabloon-trigger is geactiveerd (ISO-datum). */
  auto_geactiveerd_op?: string | null
}

export interface UrgenteTaak {
  id: string
  titel: string
  deadline: string | null
  prioriteit: string
  status: string
  assignee_naam: string | null
}

// ─── Insert/Update helpers ────────────────────────────────────────────────────

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

// ─── Row helpers ──────────────────────────────────────────────────────────────

export type DbProject              = Database['public']['Tables']['projects']['Row']
export type DbCalculationGroup     = Database['public']['Tables']['calculation_groups']['Row']
export type DbCalculationLine      = Database['public']['Tables']['calculation_lines']['Row']
export type DbPaintMeasurement     = Database['public']['Tables']['paint_measurements']['Row']
export type DbMeasurementLine      = Database['public']['Tables']['paint_measurement_lines']['Row']
export type DbMeasurementAggregate = Database['public']['Tables']['paint_measurement_aggregates']['Row']
export type DbPaintItem            = Database['public']['Tables']['paint_items']['Row']
export type DbPaintTreatment       = Database['public']['Tables']['paint_treatments']['Row']
export type DbPaintLaborNorm       = Database['public']['Tables']['paint_labor_norms']['Row']
export type DbPaintMaterialNorm    = Database['public']['Tables']['paint_material_norms']['Row']
export type DbPaintSystemFamily    = Database['public']['Tables']['paint_system_families']['Row']
