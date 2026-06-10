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
      // ─── Platform core tables (from migrations/20260415 + 20260416) ──────────
      bedrijfsgegevens: {
        Row: {
          id: string
          naam: string
          kvk_nummer: string | null
          btw_nummer: string | null
          iban: string | null
          adres_straat: string | null
          adres_postcode: string | null
          adres_plaats: string | null
          adres_land: string | null
          telefoon: string | null
          email: string | null
          website: string | null
          logo_url: string | null
          kleur_primair: string | null
          kleur_accent: string | null
          created_at: string
          updated_at: string
          type: 'organisatie' | 'werkmaatschappij'
          parent_id: string | null
          code: string | null
          logo_primair_url: string | null
          logo_wit_url: string | null
          logo_icon_url: string | null
          logo_monochroom_url: string | null
          kleur_secundair: string | null
          kleur_succes: string | null
          kleur_waarschuwing: string | null
          kleur_fout: string | null
          kleur_tekst: string | null
          kleur_achtergrond: string | null
          font_primair: string | null
          font_secundair: string | null
          huisstijl_notities: string | null
        }
        Insert: {
          id?: string
          naam: string
          kvk_nummer?: string | null
          btw_nummer?: string | null
          iban?: string | null
          adres_straat?: string | null
          adres_postcode?: string | null
          adres_plaats?: string | null
          adres_land?: string | null
          telefoon?: string | null
          email?: string | null
          website?: string | null
          logo_url?: string | null
          kleur_primair?: string | null
          kleur_accent?: string | null
          created_at?: string
          updated_at?: string
          type?: 'organisatie' | 'werkmaatschappij'
          parent_id?: string | null
          code?: string | null
          logo_primair_url?: string | null
          logo_wit_url?: string | null
          logo_icon_url?: string | null
          logo_monochroom_url?: string | null
          kleur_secundair?: string | null
          kleur_succes?: string | null
          kleur_waarschuwing?: string | null
          kleur_fout?: string | null
          kleur_tekst?: string | null
          kleur_achtergrond?: string | null
          font_primair?: string | null
          font_secundair?: string | null
          huisstijl_notities?: string | null
        }
        Update: {
          id?: string
          naam?: string
          kvk_nummer?: string | null
          btw_nummer?: string | null
          iban?: string | null
          adres_straat?: string | null
          adres_postcode?: string | null
          adres_plaats?: string | null
          adres_land?: string | null
          telefoon?: string | null
          email?: string | null
          website?: string | null
          logo_url?: string | null
          kleur_primair?: string | null
          kleur_accent?: string | null
          created_at?: string
          updated_at?: string
          type?: 'organisatie' | 'werkmaatschappij'
          parent_id?: string | null
          code?: string | null
          logo_primair_url?: string | null
          logo_wit_url?: string | null
          logo_icon_url?: string | null
          logo_monochroom_url?: string | null
          kleur_secundair?: string | null
          kleur_succes?: string | null
          kleur_waarschuwing?: string | null
          kleur_fout?: string | null
          kleur_tekst?: string | null
          kleur_achtergrond?: string | null
          font_primair?: string | null
          font_secundair?: string | null
          huisstijl_notities?: string | null
        }
        Relationships: []
      }
      relaties: {
        Row: {
          id: string
          type: 'klant' | 'leverancier' | 'onderaannemer'
          naam: string
          kvk_nummer: string | null
          btw_nummer: string | null
          email: string | null
          telefoon: string | null
          website: string | null
          adres_straat: string | null
          adres_postcode: string | null
          adres_plaats: string | null
          adres_land: string | null
          opmerkingen: string | null
          actief: boolean
          kenmerken: Json
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_status: string | null
          bouw7_sync_fout: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          type: 'klant' | 'leverancier' | 'onderaannemer'
          naam: string
          kvk_nummer?: string | null
          btw_nummer?: string | null
          email?: string | null
          telefoon?: string | null
          website?: string | null
          adres_straat?: string | null
          adres_postcode?: string | null
          adres_plaats?: string | null
          adres_land?: string | null
          opmerkingen?: string | null
          actief?: boolean
          kenmerken?: Json
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_status?: string | null
          bouw7_sync_fout?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          type?: 'klant' | 'leverancier' | 'onderaannemer'
          naam?: string
          kvk_nummer?: string | null
          btw_nummer?: string | null
          email?: string | null
          telefoon?: string | null
          website?: string | null
          adres_straat?: string | null
          adres_postcode?: string | null
          adres_plaats?: string | null
          adres_land?: string | null
          opmerkingen?: string | null
          actief?: boolean
          kenmerken?: Json
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_status?: string | null
          bouw7_sync_fout?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      relatie_contacten: {
        Row: {
          id: string
          relatie_id: string
          naam: string
          functie: string | null
          email: string | null
          telefoon: string | null
          is_primair: boolean
          opmerkingen: string | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          relatie_id: string
          naam: string
          functie?: string | null
          email?: string | null
          telefoon?: string | null
          is_primair?: boolean
          opmerkingen?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          relatie_id?: string
          naam?: string
          functie?: string | null
          email?: string | null
          telefoon?: string | null
          is_primair?: boolean
          opmerkingen?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      medewerkers: {
        Row: {
          id: string
          voornaam: string
          tussenvoegsel: string | null
          achternaam: string
          email: string | null
          telefoon: string | null
          foto_url: string | null
          functie: string | null
          afdeling: string | null
          in_dienst_vanaf: string | null
          uit_dienst_per: string | null
          extern: boolean
          actief: boolean
          uurtarief_verkoop: number | null
          uurtarief_kostprijs: number | null
          cao_schaal: string | null
          auth_user_id: string | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_status: string | null
          bouw7_sync_fout: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          voornaam: string
          tussenvoegsel?: string | null
          achternaam: string
          email?: string | null
          telefoon?: string | null
          foto_url?: string | null
          functie?: string | null
          afdeling?: string | null
          in_dienst_vanaf?: string | null
          uit_dienst_per?: string | null
          extern?: boolean
          actief?: boolean
          uurtarief_verkoop?: number | null
          uurtarief_kostprijs?: number | null
          cao_schaal?: string | null
          auth_user_id?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_status?: string | null
          bouw7_sync_fout?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          voornaam?: string
          tussenvoegsel?: string | null
          achternaam?: string
          email?: string | null
          telefoon?: string | null
          foto_url?: string | null
          functie?: string | null
          afdeling?: string | null
          in_dienst_vanaf?: string | null
          uit_dienst_per?: string | null
          extern?: boolean
          actief?: boolean
          uurtarief_verkoop?: number | null
          uurtarief_kostprijs?: number | null
          cao_schaal?: string | null
          auth_user_id?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_status?: string | null
          bouw7_sync_fout?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      integraties: {
        Row: {
          id: string
          naam: string
          actief: boolean
          config: Json
          laatst_sync: string | null
          laatst_sync_status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          naam: string
          actief?: boolean
          config?: Json
          laatst_sync?: string | null
          laatst_sync_status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          naam?: string
          actief?: boolean
          config?: Json
          laatst_sync?: string | null
          laatst_sync_status?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          id: number
          integratie: string
          entiteit: string
          richting: string
          aantal_nieuw: number
          aantal_bijgewerkt: number
          aantal_fout: number
          duur_ms: number | null
          fout_melding: string | null
          uitgevoerd_op: string
        }
        Insert: {
          id?: number
          integratie: string
          entiteit: string
          richting: string
          aantal_nieuw?: number
          aantal_bijgewerkt?: number
          aantal_fout?: number
          duur_ms?: number | null
          fout_melding?: string | null
          uitgevoerd_op?: string
        }
        Update: {
          id?: number
          integratie?: string
          entiteit?: string
          richting?: string
          aantal_nieuw?: number
          aantal_bijgewerkt?: number
          aantal_fout?: number
          duur_ms?: number | null
          fout_melding?: string | null
          uitgevoerd_op?: string
        }
        Relationships: []
      }
      dossiers: {
        Row: {
          id: string
          dossiernummer: string | null
          titel: string
          klant_id: string | null
          hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht'
          aanvraag_substatus: 'nieuw' | 'inlezen_aanvraag' | 'werkopname' | 'uitwerken_begroting' | 'controle_begroting' | 'offerte_gereed' | 'verzonden' | 'afgewezen' | 'vervallen' | null
          offerte_substatus: 'concept' | 'verzonden' | 'nabellen' | 'in_behandeling' | 'mondelinge_toezegging' | 'gewonnen' | 'verloren' | 'vervallen' | null
          opdracht_substatus: 'nieuwe_opdracht' | 'werkvoorbereiding' | 'onderhanden' | 'uitvoering_gereed' | 'financieel_gereed' | 'financieel_afgesloten' | null
          bedrag_excl_btw: number | null
          verwacht_startdatum: string | null
          verwacht_einddatum: string | null
          project_manager_id: string | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_status: string | null
          bouw7_sync_fout: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          dossiernummer?: string | null
          titel: string
          klant_id?: string | null
          hoofdstatus?: 'aanvraag' | 'offerte' | 'opdracht'
          aanvraag_substatus?: 'nieuw' | 'inlezen_aanvraag' | 'werkopname' | 'uitwerken_begroting' | 'controle_begroting' | 'offerte_gereed' | 'verzonden' | 'afgewezen' | 'vervallen' | null
          offerte_substatus?: 'concept' | 'verzonden' | 'nabellen' | 'in_behandeling' | 'mondelinge_toezegging' | 'gewonnen' | 'verloren' | 'vervallen' | null
          opdracht_substatus?: 'nieuwe_opdracht' | 'werkvoorbereiding' | 'onderhanden' | 'uitvoering_gereed' | 'financieel_gereed' | 'financieel_afgesloten' | null
          bedrag_excl_btw?: number | null
          verwacht_startdatum?: string | null
          verwacht_einddatum?: string | null
          project_manager_id?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_status?: string | null
          bouw7_sync_fout?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          dossiernummer?: string | null
          titel?: string
          klant_id?: string | null
          hoofdstatus?: 'aanvraag' | 'offerte' | 'opdracht'
          aanvraag_substatus?: 'nieuw' | 'inlezen_aanvraag' | 'werkopname' | 'uitwerken_begroting' | 'controle_begroting' | 'offerte_gereed' | 'verzonden' | 'afgewezen' | 'vervallen' | null
          offerte_substatus?: 'concept' | 'verzonden' | 'nabellen' | 'in_behandeling' | 'mondelinge_toezegging' | 'gewonnen' | 'verloren' | 'vervallen' | null
          opdracht_substatus?: 'nieuwe_opdracht' | 'werkvoorbereiding' | 'onderhanden' | 'uitvoering_gereed' | 'financieel_gereed' | 'financieel_afgesloten' | null
          bedrag_excl_btw?: number | null
          verwacht_startdatum?: string | null
          verwacht_einddatum?: string | null
          project_manager_id?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_status?: string | null
          bouw7_sync_fout?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      dossier_status_historie: {
        Row: {
          id: number
          dossier_id: string
          van_hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht' | null
          van_aanvraag_substatus: string | null
          van_offerte_substatus: string | null
          van_opdracht_substatus: string | null
          naar_hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht'
          naar_aanvraag_substatus: string | null
          naar_offerte_substatus: string | null
          naar_opdracht_substatus: string | null
          reden: string | null
          door_user_id: string | null
          op: string
        }
        Insert: {
          id?: number
          dossier_id: string
          van_hoofdstatus?: 'aanvraag' | 'offerte' | 'opdracht' | null
          van_aanvraag_substatus?: string | null
          van_offerte_substatus?: string | null
          van_opdracht_substatus?: string | null
          naar_hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht'
          naar_aanvraag_substatus?: string | null
          naar_offerte_substatus?: string | null
          naar_opdracht_substatus?: string | null
          reden?: string | null
          door_user_id?: string | null
          op?: string
        }
        Update: {
          id?: number
          dossier_id?: string
          van_hoofdstatus?: 'aanvraag' | 'offerte' | 'opdracht' | null
          van_aanvraag_substatus?: string | null
          van_offerte_substatus?: string | null
          van_opdracht_substatus?: string | null
          naar_hoofdstatus?: 'aanvraag' | 'offerte' | 'opdracht'
          naar_aanvraag_substatus?: string | null
          naar_offerte_substatus?: string | null
          naar_opdracht_substatus?: string | null
          reden?: string | null
          door_user_id?: string | null
          op?: string
        }
        Relationships: []
      }
      // ─── Taken & Workflow tables (from apps/taken/supabase/taken-workflow-migration-v1.sql)
      user_roles: {
        Row: {
          id: string
          naam: string
          beschrijving: string | null
          created_at: string
        }
        Insert: {
          id?: string
          naam: string
          beschrijving?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          naam?: string
          beschrijving?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          user_id: string
          role_id: string
        }
        Insert: {
          user_id: string
          role_id: string
        }
        Update: {
          user_id?: string
          role_id?: string
        }
        Relationships: []
      }
      task_lists: {
        Row: {
          id: string
          naam: string
          beschrijving: string | null
          entity_type: 'project' | 'offerte' | 'calculatie' | null
          entity_id: string | null
          is_template: boolean
          template_naam: string | null
          owner_id: string | null
          volgorde: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          naam: string
          beschrijving?: string | null
          entity_type?: 'project' | 'offerte' | 'calculatie' | null
          entity_id?: string | null
          is_template?: boolean
          template_naam?: string | null
          owner_id?: string | null
          volgorde?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          naam?: string
          beschrijving?: string | null
          entity_type?: 'project' | 'offerte' | 'calculatie' | null
          entity_id?: string | null
          is_template?: boolean
          template_naam?: string | null
          owner_id?: string | null
          volgorde?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          lijst_id: string | null
          parent_task_id: string | null
          titel: string
          omschrijving: Json | null
          status: 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen'
          prioriteit: 'laag' | 'normaal' | 'hoog' | 'urgent'
          deadline: string | null
          geschatte_uren: number | null
          volgorde: number
          aangemaakt_door: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lijst_id?: string | null
          parent_task_id?: string | null
          titel: string
          omschrijving?: Json | null
          status?: 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen'
          prioriteit?: 'laag' | 'normaal' | 'hoog' | 'urgent'
          deadline?: string | null
          geschatte_uren?: number | null
          volgorde?: number
          aangemaakt_door?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lijst_id?: string | null
          parent_task_id?: string | null
          titel?: string
          omschrijving?: Json | null
          status?: 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen'
          prioriteit?: 'laag' | 'normaal' | 'hoog' | 'urgent'
          deadline?: string | null
          geschatte_uren?: number | null
          volgorde?: number
          aangemaakt_door?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_assignees: {
        Row: {
          task_id: string
          user_id: string
          rol: 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer'
        }
        Insert: {
          task_id: string
          user_id: string
          rol?: 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer'
        }
        Update: {
          task_id?: string
          user_id?: string
          rol?: 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer'
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          id: string
          task_id: string
          user_id: string | null
          inhoud: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id?: string | null
          inhoud: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string | null
          inhoud?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          id: string
          task_id: string
          naam: string
          url: string
          bestandstype: string | null
          grootte: number | null
          geupload_door: string | null
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          naam: string
          url: string
          bestandstype?: string | null
          grootte?: number | null
          geupload_door?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          naam?: string
          url?: string
          bestandstype?: string | null
          grootte?: number | null
          geupload_door?: string | null
          created_at?: string
        }
        Relationships: []
      }
      task_audit_log: {
        Row: {
          id: string
          task_id: string
          user_id: string | null
          actie: string
          oud_waarde: Json | null
          nieuwe_waarde: Json | null
          tijdstip: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id?: string | null
          actie: string
          oud_waarde?: Json | null
          nieuwe_waarde?: Json | null
          tijdstip?: string
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string | null
          actie?: string
          oud_waarde?: Json | null
          nieuwe_waarde?: Json | null
          tijdstip?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          id: string
          naam: string
          beschrijving: string | null
          is_template: boolean
          entity_type: 'project' | 'offerte' | 'calculatie' | 'intern' | null
          aangemaakt_door: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          naam: string
          beschrijving?: string | null
          is_template?: boolean
          entity_type?: 'project' | 'offerte' | 'calculatie' | 'intern' | null
          aangemaakt_door?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          naam?: string
          beschrijving?: string | null
          is_template?: boolean
          entity_type?: 'project' | 'offerte' | 'calculatie' | 'intern' | null
          aangemaakt_door?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          id: string
          workflow_id: string
          naam: string
          beschrijving: string | null
          step_type: 'task' | 'approval' | 'decision' | 'parallel_split' | 'parallel_join' | 'notification' | 'end'
          rol_id: string | null
          geschatte_doorlooptijd: number | null
          config: Json | null
          position_x: number
          position_y: number
        }
        Insert: {
          id?: string
          workflow_id: string
          naam: string
          beschrijving?: string | null
          step_type?: 'task' | 'approval' | 'decision' | 'parallel_split' | 'parallel_join' | 'notification' | 'end'
          rol_id?: string | null
          geschatte_doorlooptijd?: number | null
          config?: Json | null
          position_x?: number
          position_y?: number
        }
        Update: {
          id?: string
          workflow_id?: string
          naam?: string
          beschrijving?: string | null
          step_type?: 'task' | 'approval' | 'decision' | 'parallel_split' | 'parallel_join' | 'notification' | 'end'
          rol_id?: string | null
          geschatte_doorlooptijd?: number | null
          config?: Json | null
          position_x?: number
          position_y?: number
        }
        Relationships: []
      }
      workflow_transitions: {
        Row: {
          id: string
          workflow_id: string
          van_step_id: string
          naar_step_id: string
          conditie_type: 'always' | 'on_approval' | 'on_rejection' | 'on_condition' | 'manual'
          conditie_config: Json | null
          label: string | null
          prioriteit: number
        }
        Insert: {
          id?: string
          workflow_id: string
          van_step_id: string
          naar_step_id: string
          conditie_type?: 'always' | 'on_approval' | 'on_rejection' | 'on_condition' | 'manual'
          conditie_config?: Json | null
          label?: string | null
          prioriteit?: number
        }
        Update: {
          id?: string
          workflow_id?: string
          van_step_id?: string
          naar_step_id?: string
          conditie_type?: 'always' | 'on_approval' | 'on_rejection' | 'on_condition' | 'manual'
          conditie_config?: Json | null
          label?: string | null
          prioriteit?: number
        }
        Relationships: []
      }
      workflow_step_lists: {
        Row: {
          step_id: string
          lijst_id: string
        }
        Insert: {
          step_id: string
          lijst_id: string
        }
        Update: {
          step_id?: string
          lijst_id?: string
        }
        Relationships: []
      }
      workflow_instances: {
        Row: {
          id: string
          workflow_id: string | null
          entity_type: string | null
          entity_id: string | null
          status: 'actief' | 'gepauzeerd' | 'afgerond' | 'geannuleerd'
          gestart_door: string | null
          created_at: string
          afgerond_op: string | null
        }
        Insert: {
          id?: string
          workflow_id?: string | null
          entity_type?: string | null
          entity_id?: string | null
          status?: 'actief' | 'gepauzeerd' | 'afgerond' | 'geannuleerd'
          gestart_door?: string | null
          created_at?: string
          afgerond_op?: string | null
        }
        Update: {
          id?: string
          workflow_id?: string | null
          entity_type?: string | null
          entity_id?: string | null
          status?: 'actief' | 'gepauzeerd' | 'afgerond' | 'geannuleerd'
          gestart_door?: string | null
          created_at?: string
          afgerond_op?: string | null
        }
        Relationships: []
      }
      workflow_instance_steps: {
        Row: {
          id: string
          instance_id: string
          step_id: string
          status: 'wachtend' | 'actief' | 'afgerond' | 'overgeslagen'
          gestart_op: string | null
          afgerond_op: string | null
          afgerond_door: string | null
        }
        Insert: {
          id?: string
          instance_id: string
          step_id: string
          status?: 'wachtend' | 'actief' | 'afgerond' | 'overgeslagen'
          gestart_op?: string | null
          afgerond_op?: string | null
          afgerond_door?: string | null
        }
        Update: {
          id?: string
          instance_id?: string
          step_id?: string
          status?: 'wachtend' | 'actief' | 'afgerond' | 'overgeslagen'
          gestart_op?: string | null
          afgerond_op?: string | null
          afgerond_door?: string | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          id: string
          naam: string
          trigger_type: 'status_change' | 'deadline' | 'goedkeuring' | 'handmatig' | 'toewijzing'
          trigger_config: Json | null
          action_type: 'email' | 'taak_aanmaken' | 'status_wijzigen' | 'toewijzen' | 'notificatie'
          action_config: Json | null
          actief: boolean
          aangemaakt_door: string | null
          created_at: string
        }
        Insert: {
          id?: string
          naam: string
          trigger_type: 'status_change' | 'deadline' | 'goedkeuring' | 'handmatig' | 'toewijzing'
          trigger_config?: Json | null
          action_type: 'email' | 'taak_aanmaken' | 'status_wijzigen' | 'toewijzen' | 'notificatie'
          action_config?: Json | null
          actief?: boolean
          aangemaakt_door?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          naam?: string
          trigger_type?: 'status_change' | 'deadline' | 'goedkeuring' | 'handmatig' | 'toewijzing'
          trigger_config?: Json | null
          action_type?: 'email' | 'taak_aanmaken' | 'status_wijzigen' | 'toewijzen' | 'notificatie'
          action_config?: Json | null
          actief?: boolean
          aangemaakt_door?: string | null
          created_at?: string
        }
        Relationships: []
      }
      voertuigen: {
        Row: { id: string; kenteken: string; merk: string | null; model: string | null; type: 'werkbus' | 'bestelwagen' | 'station_mini_suv' | 'station_midi_suv' | 'personenauto' | 'aanhanger' | 'overig' | null; brandstof: 'diesel' | 'benzine' | 'elektrisch' | 'hybride' | 'lpg' | 'waterstof' | 'onbekend' | null; kleur: string | null; ingebruikname_datum: string | null; bouwjaar: number | null; bijtelling_betaald: boolean; prive_limiet_km_jaar: number | null; zakelijk_verwacht_km_jaar: number | null; status: 'actief' | 'in_onderhoud' | 'uit_dienst' | 'verkocht'; opmerkingen: string | null; carrosserietype: string | null; created_at: string; updated_at: string; created_by: string | null }
        Insert: { id?: string; kenteken: string; merk?: string | null; model?: string | null; type?: 'werkbus' | 'bestelwagen' | 'station_mini_suv' | 'station_midi_suv' | 'personenauto' | 'aanhanger' | 'overig' | null; brandstof?: 'diesel' | 'benzine' | 'elektrisch' | 'hybride' | 'lpg' | 'waterstof' | 'onbekend' | null; kleur?: string | null; ingebruikname_datum?: string | null; bouwjaar?: number | null; bijtelling_betaald?: boolean; prive_limiet_km_jaar?: number | null; zakelijk_verwacht_km_jaar?: number | null; status?: 'actief' | 'in_onderhoud' | 'uit_dienst' | 'verkocht'; opmerkingen?: string | null; carrosserietype?: string | null; created_at?: string; updated_at?: string; created_by?: string | null }
        Update: { id?: string; kenteken?: string; merk?: string | null; model?: string | null; type?: 'werkbus' | 'bestelwagen' | 'station_mini_suv' | 'station_midi_suv' | 'personenauto' | 'aanhanger' | 'overig' | null; brandstof?: 'diesel' | 'benzine' | 'elektrisch' | 'hybride' | 'lpg' | 'waterstof' | 'onbekend' | null; kleur?: string | null; ingebruikname_datum?: string | null; bouwjaar?: number | null; bijtelling_betaald?: boolean; prive_limiet_km_jaar?: number | null; zakelijk_verwacht_km_jaar?: number | null; status?: 'actief' | 'in_onderhoud' | 'uit_dienst' | 'verkocht'; opmerkingen?: string | null; carrosserietype?: string | null; created_at?: string; updated_at?: string; created_by?: string | null }
        Relationships: []
      }
      voertuig_bestuurders: {
        Row: { id: string; voertuig_id: string; medewerker_id: string | null; ulu_user_id: number | null; start_datum: string; eind_datum: string | null; is_primair: boolean; notities: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; voertuig_id: string; medewerker_id?: string | null; ulu_user_id?: number | null; start_datum: string; eind_datum?: string | null; is_primair?: boolean; notities?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; voertuig_id?: string; medewerker_id?: string | null; ulu_user_id?: number | null; start_datum?: string; eind_datum?: string | null; is_primair?: boolean; notities?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      ulu_users: {
        Row: { id: number; email: string | null; firstname: string | null; lastname: string | null; volledige_naam: string | null; medewerker_id: string | null; bijtelling_betaald: boolean; prive_limiet_km_jaar: number | null; zakelijk_verwacht_km_jaar: number | null; opmerkingen: string | null; actief: boolean; laatst_gezien: string | null; created_at: string; updated_at: string }
        Insert: { id: number; email?: string | null; firstname?: string | null; lastname?: string | null; volledige_naam?: string | null; medewerker_id?: string | null; bijtelling_betaald?: boolean; prive_limiet_km_jaar?: number | null; zakelijk_verwacht_km_jaar?: number | null; opmerkingen?: string | null; actief?: boolean; laatst_gezien?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: number; email?: string | null; firstname?: string | null; lastname?: string | null; volledige_naam?: string | null; medewerker_id?: string | null; bijtelling_betaald?: boolean; prive_limiet_km_jaar?: number | null; zakelijk_verwacht_km_jaar?: number | null; opmerkingen?: string | null; actief?: boolean; laatst_gezien?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      lease_contracten: {
        Row: { id: string; voertuig_id: string; leasemaatschappij_relatie_id: string | null; contractnummer: string | null; start_datum: string; eind_datum: string | null; maandtermijn_bedrag: number | null; km_bundel_per_jaar: number | null; meer_km_tarief: number | null; minder_km_tarief: number | null; bijtelling_percentage: number | null; contract_document_url: string | null; opmerkingen: string | null; actief: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; voertuig_id: string; leasemaatschappij_relatie_id?: string | null; contractnummer?: string | null; start_datum: string; eind_datum?: string | null; maandtermijn_bedrag?: number | null; km_bundel_per_jaar?: number | null; meer_km_tarief?: number | null; minder_km_tarief?: number | null; bijtelling_percentage?: number | null; contract_document_url?: string | null; opmerkingen?: string | null; actief?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; voertuig_id?: string; leasemaatschappij_relatie_id?: string | null; contractnummer?: string | null; start_datum?: string; eind_datum?: string | null; maandtermijn_bedrag?: number | null; km_bundel_per_jaar?: number | null; meer_km_tarief?: number | null; minder_km_tarief?: number | null; bijtelling_percentage?: number | null; contract_document_url?: string | null; opmerkingen?: string | null; actief?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
      rdw_data: {
        Row: { id: string; voertuig_id: string | null; kenteken: string; apk_vervaldatum: string | null; massa_ledig_voertuig: number | null; massa_rijklaar: number | null; toegestane_maximum_massa: number | null; aantal_zitplaatsen: number | null; aantal_cilinders: number | null; cilinderinhoud: number | null; brandstof_omschrijving: string | null; milieuclassificatie: string | null; wok_status: boolean | null; vervaldatum_tenaamstelling: string | null; eerste_toelating: string | null; datum_tenaamstelling: string | null; rdw_raw: Json | null; laatst_opgehaald: string | null; trekgewicht_geremd: number | null; trekgewicht_ongeremd: number | null; catalogusprijs: number | null; terugroepactie_status: string | null; terugroepactie_open: boolean | null; created_at: string; updated_at: string }
        Insert: { id?: string; voertuig_id?: string | null; kenteken: string; apk_vervaldatum?: string | null; massa_ledig_voertuig?: number | null; massa_rijklaar?: number | null; toegestane_maximum_massa?: number | null; aantal_zitplaatsen?: number | null; aantal_cilinders?: number | null; cilinderinhoud?: number | null; brandstof_omschrijving?: string | null; milieuclassificatie?: string | null; wok_status?: boolean | null; vervaldatum_tenaamstelling?: string | null; eerste_toelating?: string | null; datum_tenaamstelling?: string | null; rdw_raw?: Json | null; laatst_opgehaald?: string | null; trekgewicht_geremd?: number | null; trekgewicht_ongeremd?: number | null; catalogusprijs?: number | null; terugroepactie_status?: string | null; terugroepactie_open?: boolean | null; created_at?: string; updated_at?: string }
        Update: { id?: string; voertuig_id?: string | null; kenteken?: string; apk_vervaldatum?: string | null; massa_ledig_voertuig?: number | null; massa_rijklaar?: number | null; toegestane_maximum_massa?: number | null; aantal_zitplaatsen?: number | null; aantal_cilinders?: number | null; cilinderinhoud?: number | null; brandstof_omschrijving?: string | null; milieuclassificatie?: string | null; wok_status?: boolean | null; vervaldatum_tenaamstelling?: string | null; eerste_toelating?: string | null; datum_tenaamstelling?: string | null; rdw_raw?: Json | null; laatst_opgehaald?: string | null; trekgewicht_geremd?: number | null; trekgewicht_ongeremd?: number | null; catalogusprijs?: number | null; terugroepactie_status?: string | null; terugroepactie_open?: boolean | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      ulu_trips: {
        Row: { id: string; voertuig_id: string | null; medewerker_id: string | null; bestuurder_naam_raw: string | null; kenteken: string; start_datum: string; start_tijd: string; stop_tijd: string | null; adres_start: string | null; adres_stop: string | null; afstand_km: number | null; duur_seconden: number | null; km_stand_start: number | null; km_stand_stop: number | null; rit_type_ulu: string | null; rit_type_berekend: 'zakelijk' | 'prive' | null; score: number | null; import_batch_id: string | null; created_at: string }
        Insert: { id?: string; voertuig_id?: string | null; medewerker_id?: string | null; bestuurder_naam_raw?: string | null; kenteken: string; start_datum: string; start_tijd: string; stop_tijd?: string | null; adres_start?: string | null; adres_stop?: string | null; afstand_km?: number | null; duur_seconden?: number | null; km_stand_start?: number | null; km_stand_stop?: number | null; rit_type_ulu?: string | null; rit_type_berekend?: 'zakelijk' | 'prive' | null; score?: number | null; import_batch_id?: string | null; created_at?: string }
        Update: { id?: string; voertuig_id?: string | null; medewerker_id?: string | null; bestuurder_naam_raw?: string | null; kenteken?: string; start_datum?: string; start_tijd?: string; stop_tijd?: string | null; adres_start?: string | null; adres_stop?: string | null; afstand_km?: number | null; duur_seconden?: number | null; km_stand_start?: number | null; km_stand_stop?: number | null; rit_type_ulu?: string | null; rit_type_berekend?: 'zakelijk' | 'prive' | null; score?: number | null; import_batch_id?: string | null; created_at?: string }
        Relationships: []
      }
      compliance_bevindingen: {
        Row: { id: string; regel_code: string; voertuig_id: string | null; medewerker_id: string | null; trip_id: string | null; periode_start: string | null; periode_eind: string | null; ernst: 'info' | 'waarschuwing' | 'overtreding'; omschrijving: string; data: Json; status: 'open' | 'geaccepteerd_uitzondering' | 'opgelost' | 'afgewezen'; gegenereerd_op: string; fingerprint: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; regel_code: string; voertuig_id?: string | null; medewerker_id?: string | null; trip_id?: string | null; periode_start?: string | null; periode_eind?: string | null; ernst?: 'info' | 'waarschuwing' | 'overtreding'; omschrijving: string; data?: Json; status?: 'open' | 'geaccepteerd_uitzondering' | 'opgelost' | 'afgewezen'; gegenereerd_op?: string; fingerprint?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; regel_code?: string; voertuig_id?: string | null; medewerker_id?: string | null; trip_id?: string | null; periode_start?: string | null; periode_eind?: string | null; ernst?: 'info' | 'waarschuwing' | 'overtreding'; omschrijving?: string; data?: Json; status?: 'open' | 'geaccepteerd_uitzondering' | 'opgelost' | 'afgewezen'; gegenereerd_op?: string; fingerprint?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      management_projecten: {
        Row: {
          id: string
          projectnummer: string
          bouw7_id: string | null
          filiaal: string | null
          status: string | null
          opdrachtgever: string | null
          projectnaam: string
          categorie: string | null
          projectleider: string | null
          geboekte_kosten: number | null
          totale_opdracht: number | null
          pct_gereed: number | null
          totale_prognose: number | null
          verwacht_resultaat: number | null
          pct_marge: number | null
          omzet_obv_pct: number | null
          resultaat_obv_pct: number | null
          gefactureerd: number | null
          resultaat_gereed: number | null
          pct_marge_gereed: number | null
          verschil_pct_marge: number | null
          is_gereed: boolean
          bouw7_sync_hash: string | null
          bouw7_sync_status: string | null
          bouw7_sync_fout: string | null
          bouw7_laatst_sync: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          projectnummer: string
          bouw7_id?: string | null
          filiaal?: string | null
          status?: string | null
          opdrachtgever?: string | null
          projectnaam: string
          categorie?: string | null
          projectleider?: string | null
          geboekte_kosten?: number | null
          totale_opdracht?: number | null
          pct_gereed?: number | null
          totale_prognose?: number | null
          verwacht_resultaat?: number | null
          pct_marge?: number | null
          omzet_obv_pct?: number | null
          resultaat_obv_pct?: number | null
          gefactureerd?: number | null
          resultaat_gereed?: number | null
          pct_marge_gereed?: number | null
          verschil_pct_marge?: number | null
          is_gereed?: boolean
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bouw7_sync_fout?: string | null
          bouw7_laatst_sync?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          projectnummer?: string
          bouw7_id?: string | null
          filiaal?: string | null
          status?: string | null
          opdrachtgever?: string | null
          projectnaam?: string
          categorie?: string | null
          projectleider?: string | null
          geboekte_kosten?: number | null
          totale_opdracht?: number | null
          pct_gereed?: number | null
          totale_prognose?: number | null
          verwacht_resultaat?: number | null
          pct_marge?: number | null
          omzet_obv_pct?: number | null
          resultaat_obv_pct?: number | null
          gefactureerd?: number | null
          resultaat_gereed?: number | null
          pct_marge_gereed?: number | null
          verschil_pct_marge?: number | null
          is_gereed?: boolean
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bouw7_sync_fout?: string | null
          bouw7_laatst_sync?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      management_ak: {
        Row: {
          id: string
          jaar: number
          filiaal: string
          bedrag_ak: number
          opmerkingen: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          jaar: number
          filiaal: string
          bedrag_ak?: number
          opmerkingen?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          jaar?: number
          filiaal?: string
          bedrag_ak?: number
          opmerkingen?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      management_doelstellingen: {
        Row: {
          id: string
          jaar: number
          filiaal: string | null
          projectleider: string | null
          omzet_doelstelling: number | null
          resultaat_doelstelling: number | null
          opmerkingen: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          jaar: number
          filiaal?: string | null
          projectleider?: string | null
          omzet_doelstelling?: number | null
          resultaat_doelstelling?: number | null
          opmerkingen?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          jaar?: number
          filiaal?: string | null
          projectleider?: string | null
          omzet_doelstelling?: number | null
          resultaat_doelstelling?: number | null
          opmerkingen?: string | null
          created_at?: string
          updated_at?: string
        }
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

// ─── Taken & Workflow types ───────────────────────────────────────────────────

export type TaskStatus    = 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen'
export type TaskPrioriteit = 'laag' | 'normaal' | 'hoog' | 'urgent'
export type TaskAssigneeRol = 'verantwoordelijke' | 'mede-uitvoerder' | 'reviewer'
export type EntityType    = 'project' | 'offerte' | 'calculatie'
export type WorkflowStepType =
  | 'task' | 'approval' | 'decision'
  | 'parallel_split' | 'parallel_join'
  | 'notification' | 'end'
export type TransitieConditieType =
  | 'always' | 'on_approval' | 'on_rejection' | 'on_condition' | 'manual'
export type WorkflowInstanceStatus = 'actief' | 'gepauzeerd' | 'afgerond' | 'geannuleerd'
export type WorkflowInstanceStepStatus = 'wachtend' | 'actief' | 'afgerond' | 'overgeslagen'

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
  created_at: string
  updated_at: string
}

export interface DbTask {
  id: string
  lijst_id: string | null
  parent_task_id: string | null
  titel: string
  omschrijving: Record<string, unknown> | null  // Tiptap JSON
  status: TaskStatus
  prioriteit: TaskPrioriteit
  deadline: string | null
  geschatte_uren: number | null
  volgorde: number
  aangemaakt_door: string | null
  created_at: string
  updated_at: string
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

export interface DbWorkflow {
  id: string
  naam: string
  beschrijving: string | null
  is_template: boolean
  entity_type: EntityType | 'intern' | null
  aangemaakt_door: string | null
  created_at: string
  updated_at: string
}

export interface DbWorkflowStep {
  id: string
  workflow_id: string
  naam: string
  beschrijving: string | null
  step_type: WorkflowStepType
  rol_id: string | null
  geschatte_doorlooptijd: number | null
  config: Record<string, unknown> | null
  position_x: number
  position_y: number
}

export interface DbWorkflowTransition {
  id: string
  workflow_id: string
  van_step_id: string
  naar_step_id: string
  conditie_type: TransitieConditieType
  conditie_config: Record<string, unknown> | null
  label: string | null
  prioriteit: number
}

export interface DbWorkflowInstance {
  id: string
  workflow_id: string | null
  entity_type: string | null
  entity_id: string | null
  status: WorkflowInstanceStatus
  gestart_door: string | null
  created_at: string
  afgerond_op: string | null
}

export interface DbWorkflowInstanceStep {
  id: string
  instance_id: string
  step_id: string
  status: WorkflowInstanceStepStatus
  gestart_op: string | null
  afgerond_op: string | null
  afgerond_door: string | null
}

// Verrijkte types met joins (voor gebruik in UI)
export interface TaakMetDetails extends DbTask {
  assignees: (DbTaskAssignee & { display_name?: string; email?: string })[]
  subtaken: DbTask[]
  comments_count: number
  attachments_count: number
  lijst?: Pick<DbTaskList, 'id' | 'naam'>
}

export interface ActielijstMetTaken extends DbTaskList {
  taken: TaakMetDetails[]
  taken_count: number
  gereed_count: number
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
