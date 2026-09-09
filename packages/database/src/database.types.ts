export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      actielijst_activeringen: {
        Row: {
          bron: string
          created_at: string
          dossier_id: string | null
          foutmelding: string | null
          id: string
          lijst_id: string | null
          medewerker_id: string | null
          status: string
          template_id: string
          trigger_hoofdstatus: string | null
          trigger_substatus: string | null
          verwerkt_op: string | null
        }
        Insert: {
          bron?: string
          created_at?: string
          dossier_id?: string | null
          foutmelding?: string | null
          id?: string
          lijst_id?: string | null
          medewerker_id?: string | null
          status?: string
          template_id: string
          trigger_hoofdstatus?: string | null
          trigger_substatus?: string | null
          verwerkt_op?: string | null
        }
        Update: {
          bron?: string
          created_at?: string
          dossier_id?: string | null
          foutmelding?: string | null
          id?: string
          lijst_id?: string | null
          medewerker_id?: string | null
          status?: string
          template_id?: string
          trigger_hoofdstatus?: string | null
          trigger_substatus?: string | null
          verwerkt_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actielijst_activeringen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "actielijst_activeringen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actielijst_activeringen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actielijst_activeringen_lijst_id_fkey"
            columns: ["lijst_id"]
            isOneToOne: false
            referencedRelation: "task_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actielijst_activeringen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actielijst_activeringen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "actielijst_activeringen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "actielijst_activeringen_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      actielijst_triggers: {
        Row: {
          actief: boolean
          conditie_logica: string
          condities: Json
          created_at: string
          event_config: Json
          event_type: string
          id: string
          template_id: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          conditie_logica?: string
          condities?: Json
          created_at?: string
          event_config?: Json
          event_type: string
          id?: string
          template_id: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          conditie_logica?: string
          condities?: Json
          created_at?: string
          event_config?: Json
          event_type?: string
          id?: string
          template_id?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "actielijst_triggers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      algemene_voorwaarden: {
        Row: {
          bestand_url: string
          created_at: string | null
          id: string
          is_standaard: boolean | null
          naam: string
          versie: string | null
        }
        Insert: {
          bestand_url: string
          created_at?: string | null
          id?: string
          is_standaard?: boolean | null
          naam: string
          versie?: string | null
        }
        Update: {
          bestand_url?: string
          created_at?: string | null
          id?: string
          is_standaard?: boolean | null
          naam?: string
          versie?: string | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          aangemaakt_door: string | null
          actief: boolean | null
          action_config: Json | null
          action_type: string
          created_at: string | null
          id: string
          naam: string
          trigger_config: Json | null
          trigger_type: string
        }
        Insert: {
          aangemaakt_door?: string | null
          actief?: boolean | null
          action_config?: Json | null
          action_type: string
          created_at?: string | null
          id?: string
          naam: string
          trigger_config?: Json | null
          trigger_type: string
        }
        Update: {
          aangemaakt_door?: string | null
          actief?: boolean | null
          action_config?: Json | null
          action_type?: string
          created_at?: string | null
          id?: string
          naam?: string
          trigger_config?: Json | null
          trigger_type?: string
        }
        Relationships: []
      }
      bedrijfsagenda_doelgroep_afdelingen: {
        Row: {
          afdeling_naam: string
          agenda_item_id: string
          id: string
        }
        Insert: {
          afdeling_naam: string
          agenda_item_id: string
          id?: string
        }
        Update: {
          afdeling_naam?: string
          agenda_item_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bedrijfsagenda_doelgroep_afdelingen_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsagenda_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bedrijfsagenda_doelgroep_medewerkers: {
        Row: {
          agenda_item_id: string
          id: string
          medewerker_id: string
        }
        Insert: {
          agenda_item_id: string
          id?: string
          medewerker_id: string
        }
        Update: {
          agenda_item_id?: string
          id?: string
          medewerker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bedrijfsagenda_doelgroep_medewerkers_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsagenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bedrijfsagenda_doelgroep_medewerkers_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bedrijfsagenda_doelgroep_medewerkers_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "bedrijfsagenda_doelgroep_medewerkers_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      bedrijfsagenda_items: {
        Row: {
          aangemaakt_door: string | null
          created_at: string
          eind_datum: string
          eind_tijd: string | null
          hele_dag: boolean
          herhaling: Database["public"]["Enums"]["bedrijfsagenda_herhaling"]
          herhaling_aantal: number | null
          herhaling_einde: string | null
          herhaling_interval: number
          herhaling_maand_type: string
          herhaling_maand_weekordinal: number | null
          herhaling_uitzonderingen: string[]
          herhaling_weekdagen: number[] | null
          herinnering_dagen: number
          id: string
          in_agenda: boolean
          in_planning: boolean
          kleur: string | null
          locatie: string | null
          omschrijving: string | null
          start_datum: string
          start_tijd: string | null
          stuur_herinnering: boolean
          titel: string
          type: Database["public"]["Enums"]["bedrijfsagenda_type"]
          updated_at: string
        }
        Insert: {
          aangemaakt_door?: string | null
          created_at?: string
          eind_datum: string
          eind_tijd?: string | null
          hele_dag?: boolean
          herhaling?: Database["public"]["Enums"]["bedrijfsagenda_herhaling"]
          herhaling_aantal?: number | null
          herhaling_einde?: string | null
          herhaling_interval?: number
          herhaling_maand_type?: string
          herhaling_maand_weekordinal?: number | null
          herhaling_uitzonderingen?: string[]
          herhaling_weekdagen?: number[] | null
          herinnering_dagen?: number
          id?: string
          in_agenda?: boolean
          in_planning?: boolean
          kleur?: string | null
          locatie?: string | null
          omschrijving?: string | null
          start_datum: string
          start_tijd?: string | null
          stuur_herinnering?: boolean
          titel: string
          type?: Database["public"]["Enums"]["bedrijfsagenda_type"]
          updated_at?: string
        }
        Update: {
          aangemaakt_door?: string | null
          created_at?: string
          eind_datum?: string
          eind_tijd?: string | null
          hele_dag?: boolean
          herhaling?: Database["public"]["Enums"]["bedrijfsagenda_herhaling"]
          herhaling_aantal?: number | null
          herhaling_einde?: string | null
          herhaling_interval?: number
          herhaling_maand_type?: string
          herhaling_maand_weekordinal?: number | null
          herhaling_uitzonderingen?: string[]
          herhaling_weekdagen?: number[] | null
          herinnering_dagen?: number
          id?: string
          in_agenda?: boolean
          in_planning?: boolean
          kleur?: string | null
          locatie?: string | null
          omschrijving?: string | null
          start_datum?: string
          start_tijd?: string | null
          stuur_herinnering?: boolean
          titel?: string
          type?: Database["public"]["Enums"]["bedrijfsagenda_type"]
          updated_at?: string
        }
        Relationships: []
      }
      bedrijfsgegevens: {
        Row: {
          adres_land: string | null
          adres_lat: number | null
          adres_lng: number | null
          adres_plaats: string | null
          adres_postcode: string | null
          adres_straat: string | null
          bouw7_branch_id: number | null
          btw_nummer: string | null
          code: string | null
          created_at: string
          email: string | null
          font_primair: string | null
          font_secundair: string | null
          geocode_op: string | null
          geocode_status: string | null
          huisstijl_notities: string | null
          iban: string | null
          id: string
          indirect_uren_dossier_id: string | null
          kleur_accent: string | null
          kleur_achtergrond: string | null
          kleur_fout: string | null
          kleur_primair: string | null
          kleur_secundair: string | null
          kleur_succes: string | null
          kleur_tekst: string | null
          kleur_waarschuwing: string | null
          kvk_nummer: string | null
          logo_icon_url: string | null
          logo_monochroom_url: string | null
          logo_primair_url: string | null
          logo_url: string | null
          logo_wit_url: string | null
          naam: string
          parent_id: string | null
          telefoon: string | null
          type: Database["public"]["Enums"]["bedrijf_type"]
          updated_at: string
          website: string | null
        }
        Insert: {
          adres_land?: string | null
          adres_lat?: number | null
          adres_lng?: number | null
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          bouw7_branch_id?: number | null
          btw_nummer?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          font_primair?: string | null
          font_secundair?: string | null
          geocode_op?: string | null
          geocode_status?: string | null
          huisstijl_notities?: string | null
          iban?: string | null
          id?: string
          indirect_uren_dossier_id?: string | null
          kleur_accent?: string | null
          kleur_achtergrond?: string | null
          kleur_fout?: string | null
          kleur_primair?: string | null
          kleur_secundair?: string | null
          kleur_succes?: string | null
          kleur_tekst?: string | null
          kleur_waarschuwing?: string | null
          kvk_nummer?: string | null
          logo_icon_url?: string | null
          logo_monochroom_url?: string | null
          logo_primair_url?: string | null
          logo_url?: string | null
          logo_wit_url?: string | null
          naam: string
          parent_id?: string | null
          telefoon?: string | null
          type?: Database["public"]["Enums"]["bedrijf_type"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          adres_land?: string | null
          adres_lat?: number | null
          adres_lng?: number | null
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          bouw7_branch_id?: number | null
          btw_nummer?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          font_primair?: string | null
          font_secundair?: string | null
          geocode_op?: string | null
          geocode_status?: string | null
          huisstijl_notities?: string | null
          iban?: string | null
          id?: string
          indirect_uren_dossier_id?: string | null
          kleur_accent?: string | null
          kleur_achtergrond?: string | null
          kleur_fout?: string | null
          kleur_primair?: string | null
          kleur_secundair?: string | null
          kleur_succes?: string | null
          kleur_tekst?: string | null
          kleur_waarschuwing?: string | null
          kvk_nummer?: string | null
          logo_icon_url?: string | null
          logo_monochroom_url?: string | null
          logo_primair_url?: string | null
          logo_url?: string | null
          logo_wit_url?: string | null
          naam?: string
          parent_id?: string | null
          telefoon?: string | null
          type?: Database["public"]["Enums"]["bedrijf_type"]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bedrijfsgegevens_indirect_uren_dossier_id_fkey"
            columns: ["indirect_uren_dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "bedrijfsgegevens_indirect_uren_dossier_id_fkey"
            columns: ["indirect_uren_dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bedrijfsgegevens_indirect_uren_dossier_id_fkey"
            columns: ["indirect_uren_dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bedrijfsgegevens_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsgegevens"
            referencedColumns: ["id"]
          },
        ]
      }
      bedrijfsinstellingen: {
        Row: {
          btw_tarieven: Json
          eenheden: Json
          id: number
          overige: Json
          updated_at: string
          uurtarieven: Json
        }
        Insert: {
          btw_tarieven?: Json
          eenheden?: Json
          id?: number
          overige?: Json
          updated_at?: string
          uurtarieven?: Json
        }
        Update: {
          btw_tarieven?: Json
          eenheden?: Json
          id?: number
          overige?: Json
          updated_at?: string
          uurtarieven?: Json
        }
        Relationships: []
      }
      betalingscondities: {
        Row: {
          created_at: string | null
          id: string
          is_standaard: boolean | null
          naam: string
          tekst: string
          termijnen: Json
          volgorde: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_standaard?: boolean | null
          naam: string
          tekst?: string
          termijnen?: Json
          volgorde?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_standaard?: boolean | null
          naam?: string
          tekst?: string
          termijnen?: Json
          volgorde?: number | null
        }
        Relationships: []
      }
      bouw7_snapshots: {
        Row: {
          aangemaakt_op: string
          dossier_id: string | null
          duur_ms: number | null
          fout: string | null
          fout_op: string | null
          opgehaald_op: string | null
          payload: Json | null
          sleutel: string
          soort: string
        }
        Insert: {
          aangemaakt_op?: string
          dossier_id?: string | null
          duur_ms?: number | null
          fout?: string | null
          fout_op?: string | null
          opgehaald_op?: string | null
          payload?: Json | null
          sleutel: string
          soort: string
        }
        Update: {
          aangemaakt_op?: string
          dossier_id?: string | null
          duur_ms?: number | null
          fout?: string | null
          fout_op?: string | null
          opgehaald_op?: string | null
          payload?: Json | null
          sleutel?: string
          soort?: string
        }
        Relationships: [
          {
            foreignKeyName: "bouw7_snapshots_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "bouw7_snapshots_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouw7_snapshots_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      bouw7_vrije_dagen: {
        Row: {
          bouw7_id: string
          bouw7_laatst_sync: string | null
          created_at: string
          eind_datum: string
          herhaalt_jaarlijks: boolean
          id: string
          naam: string | null
          start_datum: string
          updated_at: string
        }
        Insert: {
          bouw7_id: string
          bouw7_laatst_sync?: string | null
          created_at?: string
          eind_datum: string
          herhaalt_jaarlijks?: boolean
          id?: string
          naam?: string | null
          start_datum: string
          updated_at?: string
        }
        Update: {
          bouw7_id?: string
          bouw7_laatst_sync?: string | null
          created_at?: string
          eind_datum?: string
          herhaalt_jaarlijks?: boolean
          id?: string
          naam?: string | null
          start_datum?: string
          updated_at?: string
        }
        Relationships: []
      }
      btw_tarieven: {
        Row: {
          actief: boolean
          bouw7_id: number | null
          bouw7_laatst_sync: string | null
          bron: string
          created_at: string
          id: string
          label: string
          percentage: number
          updated_at: string
          verlegd: boolean
        }
        Insert: {
          actief?: boolean
          bouw7_id?: number | null
          bouw7_laatst_sync?: string | null
          bron?: string
          created_at?: string
          id?: string
          label: string
          percentage: number
          updated_at?: string
          verlegd?: boolean
        }
        Update: {
          actief?: boolean
          bouw7_id?: number | null
          bouw7_laatst_sync?: string | null
          bron?: string
          created_at?: string
          id?: string
          label?: string
          percentage?: number
          updated_at?: string
          verlegd?: boolean
        }
        Relationships: []
      }
      calculatie_snapshots: {
        Row: {
          bijgewerkt_op: string
          data: Json
          project_id: string
        }
        Insert: {
          bijgewerkt_op?: string
          data: Json
          project_id: string
        }
        Update: {
          bijgewerkt_op?: string
          data?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculatie_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calculatie_versie_snapshots: {
        Row: {
          bevroren_op: string
          data: Json
          project_id: string
          quote_id: string
          scenario_id: string
        }
        Insert: {
          bevroren_op?: string
          data: Json
          project_id: string
          quote_id: string
          scenario_id: string
        }
        Update: {
          bevroren_op?: string
          data?: Json
          project_id?: string
          quote_id?: string
          scenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculatie_versie_snapshots_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_groups: {
        Row: {
          created_at: string
          group_number: string | null
          id: string
          level: number
          name: string
          parent_group_id: string | null
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_number?: string | null
          id?: string
          level: number
          name: string
          parent_group_id?: string | null
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_number?: string | null
          id?: string
          level?: number
          name?: string
          parent_group_id?: string | null
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "calculation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "vw_group_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "calculation_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_lines: {
        Row: {
          created_at: string
          description: string
          equipment_cost: number
          group_id: string
          id: string
          kostengroep: string | null
          labor_cost: number
          labor_hours: number
          labor_rate: number
          material_cost: number
          project_id: string
          quantity: number
          source_aggregate_id: string | null
          source_type: string
          subcontract_cost: number
          total_cost: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          equipment_cost?: number
          group_id: string
          id?: string
          kostengroep?: string | null
          labor_cost?: number
          labor_hours?: number
          labor_rate?: number
          material_cost?: number
          project_id: string
          quantity?: number
          source_aggregate_id?: string | null
          source_type: string
          subcontract_cost?: number
          total_cost?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          equipment_cost?: number
          group_id?: string
          id?: string
          kostengroep?: string | null
          labor_cost?: number
          labor_hours?: number
          labor_rate?: number
          material_cost?: number
          project_id?: string
          quantity?: number
          source_aggregate_id?: string | null
          source_type?: string
          subcontract_cost?: number
          total_cost?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_lines_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "calculation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_lines_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vw_group_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "calculation_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cao_documenten: {
        Row: {
          actief: boolean
          bestandsnaam: string | null
          created_at: string | null
          extractie_fout: string | null
          extractie_status: string | null
          id: string
          naam: string
          pdf_url: string | null
          updated_at: string | null
          werkmaatschappij_id: string | null
        }
        Insert: {
          actief?: boolean
          bestandsnaam?: string | null
          created_at?: string | null
          extractie_fout?: string | null
          extractie_status?: string | null
          id?: string
          naam: string
          pdf_url?: string | null
          updated_at?: string | null
          werkmaatschappij_id?: string | null
        }
        Update: {
          actief?: boolean
          bestandsnaam?: string | null
          created_at?: string | null
          extractie_fout?: string | null
          extractie_status?: string | null
          id?: string
          naam?: string
          pdf_url?: string | null
          updated_at?: string | null
          werkmaatschappij_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cao_documenten_werkmaatschappij_id_fkey"
            columns: ["werkmaatschappij_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsgegevens"
            referencedColumns: ["id"]
          },
        ]
      }
      cao_loonschalen: {
        Row: {
          bruto_maand: number | null
          cao_id: string
          created_at: string | null
          id: string
          schaal: string
          trede: string
          volgorde: number
        }
        Insert: {
          bruto_maand?: number | null
          cao_id: string
          created_at?: string | null
          id?: string
          schaal: string
          trede: string
          volgorde?: number
        }
        Update: {
          bruto_maand?: number | null
          cao_id?: string
          created_at?: string | null
          id?: string
          schaal?: string
          trede?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "cao_loonschalen_cao_id_fkey"
            columns: ["cao_id"]
            isOneToOne: false
            referencedRelation: "cao_documenten"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog: {
        Row: {
          aangemaakt_op: string
          categorie: string
          datum: string
          gepubliceerd: boolean
          id: string
          module: string | null
          omschrijving: string
          titel: string
        }
        Insert: {
          aangemaakt_op?: string
          categorie?: string
          datum: string
          gepubliceerd?: boolean
          id?: string
          module?: string | null
          omschrijving: string
          titel: string
        }
        Update: {
          aangemaakt_op?: string
          categorie?: string
          datum?: string
          gepubliceerd?: boolean
          id?: string
          module?: string | null
          omschrijving?: string
          titel?: string
        }
        Relationships: []
      }
      changelog_gezien: {
        Row: {
          gezien_op: string
          user_id: string
        }
        Insert: {
          gezien_op?: string
          user_id: string
        }
        Update: {
          gezien_op?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          actief: boolean | null
          adres: string | null
          bedrijfsnaam: string | null
          btw_nummer: string | null
          created_at: string | null
          email: string | null
          id: string
          kvk: string | null
          naam: string
          notities: string | null
          plaats: string | null
          postcode: string | null
          telefoon: string | null
          updated_at: string | null
        }
        Insert: {
          actief?: boolean | null
          adres?: string | null
          bedrijfsnaam?: string | null
          btw_nummer?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          kvk?: string | null
          naam: string
          notities?: string | null
          plaats?: string | null
          postcode?: string | null
          telefoon?: string | null
          updated_at?: string | null
        }
        Update: {
          actief?: boolean | null
          adres?: string | null
          bedrijfsnaam?: string | null
          btw_nummer?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          kvk?: string | null
          naam?: string
          notities?: string | null
          plaats?: string | null
          postcode?: string | null
          telefoon?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      compliance_allowances: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          actief: boolean
          categorie: string | null
          id: string
          ingetrokken_op: string | null
          reden: string | null
          regel_code: string
          ulu_user_id: number | null
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          actief?: boolean
          categorie?: string | null
          id?: string
          ingetrokken_op?: string | null
          reden?: string | null
          regel_code: string
          ulu_user_id?: number | null
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          actief?: boolean
          categorie?: string | null
          id?: string
          ingetrokken_op?: string | null
          reden?: string | null
          regel_code?: string
          ulu_user_id?: number | null
        }
        Relationships: []
      }
      compliance_bevindingen: {
        Row: {
          bron: string
          data: Json
          ernst: Database["public"]["Enums"]["bevinding_ernst"]
          fingerprint: string | null
          gegenereerd_op: string
          id: string
          medewerker_id: string | null
          omschrijving: string
          periode_eind: string | null
          periode_start: string | null
          regel_code: string
          status: Database["public"]["Enums"]["bevinding_status"]
          trip_id: string | null
          updated_at: string
          voertuig_id: string | null
        }
        Insert: {
          bron?: string
          data?: Json
          ernst?: Database["public"]["Enums"]["bevinding_ernst"]
          fingerprint?: string | null
          gegenereerd_op?: string
          id?: string
          medewerker_id?: string | null
          omschrijving: string
          periode_eind?: string | null
          periode_start?: string | null
          regel_code: string
          status?: Database["public"]["Enums"]["bevinding_status"]
          trip_id?: string | null
          updated_at?: string
          voertuig_id?: string | null
        }
        Update: {
          bron?: string
          data?: Json
          ernst?: Database["public"]["Enums"]["bevinding_ernst"]
          fingerprint?: string | null
          gegenereerd_op?: string
          id?: string
          medewerker_id?: string | null
          omschrijving?: string
          periode_eind?: string | null
          periode_start?: string | null
          regel_code?: string
          status?: Database["public"]["Enums"]["bevinding_status"]
          trip_id?: string | null
          updated_at?: string
          voertuig_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_bevindingen_regel_code_fkey"
            columns: ["regel_code"]
            isOneToOne: false
            referencedRelation: "handboek_regels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "compliance_bevindingen_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "ulu_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_bevindingen_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["voertuig_id"]
          },
          {
            foreignKeyName: "compliance_bevindingen_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "voertuigen"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_feedback: {
        Row: {
          aangemaakt_op: string
          actie: string
          bevinding_id: string
          gebruiker_id: string | null
          id: string
          toelichting: string | null
        }
        Insert: {
          aangemaakt_op?: string
          actie: string
          bevinding_id: string
          gebruiker_id?: string | null
          id?: string
          toelichting?: string | null
        }
        Update: {
          aangemaakt_op?: string
          actie?: string
          bevinding_id?: string
          gebruiker_id?: string | null
          id?: string
          toelichting?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_feedback_bevinding_id_fkey"
            columns: ["bevinding_id"]
            isOneToOne: false
            referencedRelation: "compliance_bevindingen"
            referencedColumns: ["id"]
          },
        ]
      }
      contactpersonen: {
        Row: {
          aanhef: string | null
          achternaam: string
          actief: boolean
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_hash: string | null
          bouw7_sync_status: string | null
          created_at: string
          created_by: string | null
          email: string | null
          geboortedatum: string | null
          geslacht: string | null
          handmatige_velden: string[]
          id: string
          linkedin_url: string | null
          mobiel: string | null
          opmerkingen: string | null
          prive_adres_land: string | null
          prive_adres_plaats: string | null
          prive_adres_postcode: string | null
          prive_adres_straat: string | null
          prive_email: string | null
          prive_telefoon: string | null
          sync_vergrendeld: boolean
          telefoon: string | null
          tussenvoegsel: string | null
          updated_at: string
          voorletter: string | null
          voornaam: string
        }
        Insert: {
          aanhef?: string | null
          achternaam: string
          actief?: boolean
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          geboortedatum?: string | null
          geslacht?: string | null
          handmatige_velden?: string[]
          id?: string
          linkedin_url?: string | null
          mobiel?: string | null
          opmerkingen?: string | null
          prive_adres_land?: string | null
          prive_adres_plaats?: string | null
          prive_adres_postcode?: string | null
          prive_adres_straat?: string | null
          prive_email?: string | null
          prive_telefoon?: string | null
          sync_vergrendeld?: boolean
          telefoon?: string | null
          tussenvoegsel?: string | null
          updated_at?: string
          voorletter?: string | null
          voornaam: string
        }
        Update: {
          aanhef?: string | null
          achternaam?: string
          actief?: boolean
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          geboortedatum?: string | null
          geslacht?: string | null
          handmatige_velden?: string[]
          id?: string
          linkedin_url?: string | null
          mobiel?: string | null
          opmerkingen?: string | null
          prive_adres_land?: string | null
          prive_adres_plaats?: string | null
          prive_adres_postcode?: string | null
          prive_adres_straat?: string | null
          prive_email?: string | null
          prive_telefoon?: string | null
          sync_vergrendeld?: boolean
          telefoon?: string | null
          tussenvoegsel?: string | null
          updated_at?: string
          voorletter?: string | null
          voornaam?: string
        }
        Relationships: []
      }
      contactpersoon_organisaties: {
        Row: {
          contactpersoon_id: string
          created_at: string
          functie: string | null
          functie_handmatig: boolean
          id: string
          is_primair: boolean
          opmerkingen: string | null
          organisatie_id: string
        }
        Insert: {
          contactpersoon_id: string
          created_at?: string
          functie?: string | null
          functie_handmatig?: boolean
          id?: string
          is_primair?: boolean
          opmerkingen?: string | null
          organisatie_id: string
        }
        Update: {
          contactpersoon_id?: string
          created_at?: string
          functie?: string | null
          functie_handmatig?: boolean
          id?: string
          is_primair?: boolean
          opmerkingen?: string | null
          organisatie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contactpersoon_organisaties_contactpersoon_id_fkey"
            columns: ["contactpersoon_id"]
            isOneToOne: false
            referencedRelation: "contactpersonen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactpersoon_organisaties_organisatie_id_fkey"
            columns: ["organisatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      debiteur_logboek: {
        Row: {
          aangemaakt_op: string
          debiteur_id: string
          id: string
          tekst: string
          user_id: string | null
        }
        Insert: {
          aangemaakt_op?: string
          debiteur_id: string
          id?: string
          tekst: string
          user_id?: string | null
        }
        Update: {
          aangemaakt_op?: string
          debiteur_id?: string
          id?: string
          tekst?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debiteur_logboek_debiteur_id_fkey"
            columns: ["debiteur_id"]
            isOneToOne: false
            referencedRelation: "debiteuren"
            referencedColumns: ["id"]
          },
        ]
      }
      debiteur_redencodes: {
        Row: {
          actief: boolean
          code: string
          created_at: string
          id: string
          label: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          code: string
          created_at?: string
          id?: string
          label: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string
          volgorde?: number
        }
        Relationships: []
      }
      debiteuren: {
        Row: {
          actie: string | null
          actiehouder_id: string | null
          bedrag: number | null
          bouw7_invoice_id: string
          bouw7_laatst_sync: string | null
          bouw7_project_id: string | null
          bouw7_status: number | null
          bouw7_sync_hash: string | null
          created_at: string
          datum_betaald: string | null
          dossier_id: string | null
          factuurdatum: string | null
          factuurnummer: string | null
          id: string
          interne_notitie: string | null
          is_credit: boolean
          klant_naam: string | null
          klant_relatie_id: string | null
          laatste_reminder_op: string | null
          opvolgdatum: string | null
          opvolgstatus: string
          project_titel: string | null
          projectleider_id: string | null
          reden_code_id: string | null
          status: string
          task_id: string | null
          updated_at: string
          vervaldatum: string | null
          verwachte_betaaldatum: string | null
        }
        Insert: {
          actie?: string | null
          actiehouder_id?: string | null
          bedrag?: number | null
          bouw7_invoice_id: string
          bouw7_laatst_sync?: string | null
          bouw7_project_id?: string | null
          bouw7_status?: number | null
          bouw7_sync_hash?: string | null
          created_at?: string
          datum_betaald?: string | null
          dossier_id?: string | null
          factuurdatum?: string | null
          factuurnummer?: string | null
          id?: string
          interne_notitie?: string | null
          is_credit?: boolean
          klant_naam?: string | null
          klant_relatie_id?: string | null
          laatste_reminder_op?: string | null
          opvolgdatum?: string | null
          opvolgstatus?: string
          project_titel?: string | null
          projectleider_id?: string | null
          reden_code_id?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          vervaldatum?: string | null
          verwachte_betaaldatum?: string | null
        }
        Update: {
          actie?: string | null
          actiehouder_id?: string | null
          bedrag?: number | null
          bouw7_invoice_id?: string
          bouw7_laatst_sync?: string | null
          bouw7_project_id?: string | null
          bouw7_status?: number | null
          bouw7_sync_hash?: string | null
          created_at?: string
          datum_betaald?: string | null
          dossier_id?: string | null
          factuurdatum?: string | null
          factuurnummer?: string | null
          id?: string
          interne_notitie?: string | null
          is_credit?: boolean
          klant_naam?: string | null
          klant_relatie_id?: string | null
          laatste_reminder_op?: string | null
          opvolgdatum?: string | null
          opvolgstatus?: string
          project_titel?: string | null
          projectleider_id?: string | null
          reden_code_id?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          vervaldatum?: string | null
          verwachte_betaaldatum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debiteuren_actiehouder_id_fkey"
            columns: ["actiehouder_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debiteuren_actiehouder_id_fkey"
            columns: ["actiehouder_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "debiteuren_actiehouder_id_fkey"
            columns: ["actiehouder_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "debiteuren_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "debiteuren_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debiteuren_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debiteuren_klant_relatie_id_fkey"
            columns: ["klant_relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debiteuren_projectleider_id_fkey"
            columns: ["projectleider_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debiteuren_projectleider_id_fkey"
            columns: ["projectleider_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "debiteuren_projectleider_id_fkey"
            columns: ["projectleider_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "debiteuren_reden_code_id_fkey"
            columns: ["reden_code_id"]
            isOneToOne: false
            referencedRelation: "debiteur_redencodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debiteuren_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dico_groep_mapping: {
        Row: {
          created_at: string
          id: string
          leverancier: string
          leverancier_productgroep: string
          materiaalgroep: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          leverancier: string
          leverancier_productgroep: string
          materiaalgroep?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          leverancier?: string
          leverancier_productgroep?: string
          materiaalgroep?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dico_integraties: {
        Row: {
          actief: boolean
          auth_gebruiker: string | null
          auth_geheim: string | null
          auth_type: string
          created_at: string
          endpoint_url: string | null
          id: string
          laatst_gesynct: string | null
          laatste_status: string | null
          leverancier: string
          updated_at: string
        }
        Insert: {
          actief?: boolean
          auth_gebruiker?: string | null
          auth_geheim?: string | null
          auth_type?: string
          created_at?: string
          endpoint_url?: string | null
          id?: string
          laatst_gesynct?: string | null
          laatste_status?: string | null
          leverancier: string
          updated_at?: string
        }
        Update: {
          actief?: boolean
          auth_gebruiker?: string | null
          auth_geheim?: string | null
          auth_type?: string
          created_at?: string
          endpoint_url?: string | null
          id?: string
          laatst_gesynct?: string | null
          laatste_status?: string | null
          leverancier?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_sjablonen: {
        Row: {
          actief: boolean
          beschrijving: string | null
          bestandsnaam_sjabloon: string | null
          briefpapier_pdf_url: string | null
          categorie_filter: string[] | null
          created_at: string
          documentsoort: string
          docx_template_bron: string | null
          docx_template_drive_id: string | null
          docx_template_item_id: string | null
          docx_template_url: string | null
          docx_template_web_url: string | null
          hoofdstatus_filter: string[] | null
          id: string
          mail_body_html: string | null
          mail_onderwerp: string | null
          naam: string
          updated_at: string
          velden: Json
          volgorde: number
          werkmaatschappij_id: string | null
        }
        Insert: {
          actief?: boolean
          beschrijving?: string | null
          bestandsnaam_sjabloon?: string | null
          briefpapier_pdf_url?: string | null
          categorie_filter?: string[] | null
          created_at?: string
          documentsoort?: string
          docx_template_bron?: string | null
          docx_template_drive_id?: string | null
          docx_template_item_id?: string | null
          docx_template_url?: string | null
          docx_template_web_url?: string | null
          hoofdstatus_filter?: string[] | null
          id?: string
          mail_body_html?: string | null
          mail_onderwerp?: string | null
          naam: string
          updated_at?: string
          velden?: Json
          volgorde?: number
          werkmaatschappij_id?: string | null
        }
        Update: {
          actief?: boolean
          beschrijving?: string | null
          bestandsnaam_sjabloon?: string | null
          briefpapier_pdf_url?: string | null
          categorie_filter?: string[] | null
          created_at?: string
          documentsoort?: string
          docx_template_bron?: string | null
          docx_template_drive_id?: string | null
          docx_template_item_id?: string | null
          docx_template_url?: string | null
          docx_template_web_url?: string | null
          hoofdstatus_filter?: string[] | null
          id?: string
          mail_body_html?: string | null
          mail_onderwerp?: string | null
          naam?: string
          updated_at?: string
          velden?: Json
          volgorde?: number
          werkmaatschappij_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_sjablonen_werkmaatschappij_id_fkey"
            columns: ["werkmaatschappij_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsgegevens"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_bestand_app_zichtbaar: {
        Row: {
          bouw7_bestand_id: number
          dossier_id: string
          gewijzigd_door: string | null
          gewijzigd_op: string
          zichtbaar: boolean
        }
        Insert: {
          bouw7_bestand_id: number
          dossier_id: string
          gewijzigd_door?: string | null
          gewijzigd_op?: string
          zichtbaar?: boolean
        }
        Update: {
          bouw7_bestand_id?: number
          dossier_id?: string
          gewijzigd_door?: string | null
          gewijzigd_op?: string
          zichtbaar?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dossier_bestand_app_zichtbaar_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_bestand_app_zichtbaar_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_bestand_app_zichtbaar_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_bestand_app_zichtbaar_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_bestand_app_zichtbaar_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossier_bestand_app_zichtbaar_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      dossier_bestanden: {
        Row: {
          bestandstype: string | null
          bron: string | null
          bron_id: string | null
          categorie: string
          created_at: string
          dossier_id: string
          geupload_door: string | null
          grootte: number | null
          id: string
          naam: string
          url: string
        }
        Insert: {
          bestandstype?: string | null
          bron?: string | null
          bron_id?: string | null
          categorie?: string
          created_at?: string
          dossier_id: string
          geupload_door?: string | null
          grootte?: number | null
          id?: string
          naam: string
          url: string
        }
        Update: {
          bestandstype?: string | null
          bron?: string | null
          bron_id?: string | null
          categorie?: string
          created_at?: string
          dossier_id?: string
          geupload_door?: string | null
          grootte?: number | null
          id?: string
          naam?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_bestanden_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_bestanden_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_bestanden_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_documenten: {
        Row: {
          bestandsnaam: string
          bestelling_id: string | null
          created_at: string
          documentsoort: string
          dossier_id: string
          gegenereerd_door: string | null
          gegenereerd_op: string
          gemaild_naar: string[] | null
          gemaild_op: string | null
          id: string
          invoer: Json
          sharepoint_drive_id: string | null
          sharepoint_item_id: string | null
          sharepoint_web_url: string | null
          sjabloon_id: string | null
        }
        Insert: {
          bestandsnaam: string
          bestelling_id?: string | null
          created_at?: string
          documentsoort?: string
          dossier_id: string
          gegenereerd_door?: string | null
          gegenereerd_op?: string
          gemaild_naar?: string[] | null
          gemaild_op?: string | null
          id?: string
          invoer?: Json
          sharepoint_drive_id?: string | null
          sharepoint_item_id?: string | null
          sharepoint_web_url?: string | null
          sjabloon_id?: string | null
        }
        Update: {
          bestandsnaam?: string
          bestelling_id?: string | null
          created_at?: string
          documentsoort?: string
          dossier_id?: string
          gegenereerd_door?: string | null
          gegenereerd_op?: string
          gemaild_naar?: string[] | null
          gemaild_op?: string | null
          id?: string
          invoer?: Json
          sharepoint_drive_id?: string | null
          sharepoint_item_id?: string | null
          sharepoint_web_url?: string | null
          sjabloon_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_documenten_bestelling_id_fkey"
            columns: ["bestelling_id"]
            isOneToOne: false
            referencedRelation: "werkbegroting_bestellingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_documenten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_documenten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_documenten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_documenten_gegenereerd_door_fkey"
            columns: ["gegenereerd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_documenten_gegenereerd_door_fkey"
            columns: ["gegenereerd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossier_documenten_gegenereerd_door_fkey"
            columns: ["gegenereerd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossier_documenten_sjabloon_id_fkey"
            columns: ["sjabloon_id"]
            isOneToOne: false
            referencedRelation: "document_sjablonen"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_notities: {
        Row: {
          bouw7_bron: string | null
          bouw7_ref: string | null
          created_at: string
          dossier_id: string
          id: string
          inhoud: string
          medewerker_id: string | null
        }
        Insert: {
          bouw7_bron?: string | null
          bouw7_ref?: string | null
          created_at?: string
          dossier_id: string
          id?: string
          inhoud: string
          medewerker_id?: string | null
        }
        Update: {
          bouw7_bron?: string | null
          bouw7_ref?: string | null
          created_at?: string
          dossier_id?: string
          id?: string
          inhoud?: string
          medewerker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_notities_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_notities_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_notities_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_notities_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_notities_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossier_notities_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      dossier_status_historie: {
        Row: {
          door_user_id: string | null
          dossier_id: string
          id: number
          naar_aanvraag_substatus:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          naar_hoofdstatus: Database["public"]["Enums"]["hoofdstatus"]
          naar_offerte_substatus:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          naar_opdracht_substatus:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          op: string
          reden: string | null
          van_aanvraag_substatus:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          van_hoofdstatus: Database["public"]["Enums"]["hoofdstatus"] | null
          van_offerte_substatus:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          van_opdracht_substatus:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
        }
        Insert: {
          door_user_id?: string | null
          dossier_id: string
          id?: number
          naar_aanvraag_substatus?:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          naar_hoofdstatus: Database["public"]["Enums"]["hoofdstatus"]
          naar_offerte_substatus?:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          naar_opdracht_substatus?:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          op?: string
          reden?: string | null
          van_aanvraag_substatus?:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          van_hoofdstatus?: Database["public"]["Enums"]["hoofdstatus"] | null
          van_offerte_substatus?:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          van_opdracht_substatus?:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
        }
        Update: {
          door_user_id?: string | null
          dossier_id?: string
          id?: number
          naar_aanvraag_substatus?:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          naar_hoofdstatus?: Database["public"]["Enums"]["hoofdstatus"]
          naar_offerte_substatus?:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          naar_opdracht_substatus?:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          op?: string
          reden?: string | null
          van_aanvraag_substatus?:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          van_hoofdstatus?: Database["public"]["Enums"]["hoofdstatus"] | null
          van_offerte_substatus?:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          van_opdracht_substatus?:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_status_historie_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_status_historie_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_status_historie_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_substatus_historie: {
        Row: {
          bron: string
          created_at: string
          dossier_id: string
          gewijzigd_door: string | null
          gewijzigd_op: string
          id: string
          substatus: string
        }
        Insert: {
          bron?: string
          created_at?: string
          dossier_id: string
          gewijzigd_door?: string | null
          gewijzigd_op?: string
          id?: string
          substatus: string
        }
        Update: {
          bron?: string
          created_at?: string
          dossier_id?: string
          gewijzigd_door?: string | null
          gewijzigd_op?: string
          id?: string
          substatus?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_substatus_historie_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_substatus_historie_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_substatus_historie_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_toggle_definities: {
        Row: {
          actief: boolean
          created_at: string
          id: string
          label: string
          sleutel: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string
          id?: string
          label: string
          sleutel: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string
          id?: string
          label?: string
          sleutel?: string
          volgorde?: number
        }
        Relationships: []
      }
      dossier_toggles: {
        Row: {
          aan: boolean
          definitie_id: string
          dossier_id: string
          gewijzigd_door: string | null
          gewijzigd_op: string
        }
        Insert: {
          aan?: boolean
          definitie_id: string
          dossier_id: string
          gewijzigd_door?: string | null
          gewijzigd_op?: string
        }
        Update: {
          aan?: boolean
          definitie_id?: string
          dossier_id?: string
          gewijzigd_door?: string | null
          gewijzigd_op?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_toggles_definitie_id_fkey"
            columns: ["definitie_id"]
            isOneToOne: false
            referencedRelation: "dossier_toggle_definities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_toggles_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_toggles_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_toggles_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_trigger_events: {
        Row: {
          created_at: string
          dossier_id: string
          foutmelding: string | null
          id: string
          payload: Json
          soort: string
          status: string
          verwerkt_op: string | null
        }
        Insert: {
          created_at?: string
          dossier_id: string
          foutmelding?: string | null
          id?: string
          payload?: Json
          soort: string
          status?: string
          verwerkt_op?: string | null
        }
        Update: {
          created_at?: string
          dossier_id?: string
          foutmelding?: string | null
          id?: string
          payload?: Json
          soort?: string
          status?: string
          verwerkt_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_trigger_events_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_trigger_events_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_trigger_events_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_uitvragen: {
        Row: {
          aangevraagd_op: string | null
          created_at: string
          created_by: string | null
          discipline: string
          dossier_id: string
          id: string
          laatst_gemaild_naar: string[] | null
          laatst_gerappelleerd_op: string | null
          ontvangen_op: string | null
          opmerking: string | null
          partij_naam: string
          rappels: number
          reactie_uiterlijk: string | null
          relatie_id: string | null
          soort: string
          status: string
          updated_at: string
          volgnummer: number
        }
        Insert: {
          aangevraagd_op?: string | null
          created_at?: string
          created_by?: string | null
          discipline: string
          dossier_id: string
          id?: string
          laatst_gemaild_naar?: string[] | null
          laatst_gerappelleerd_op?: string | null
          ontvangen_op?: string | null
          opmerking?: string | null
          partij_naam: string
          rappels?: number
          reactie_uiterlijk?: string | null
          relatie_id?: string | null
          soort?: string
          status?: string
          updated_at?: string
          volgnummer?: number
        }
        Update: {
          aangevraagd_op?: string | null
          created_at?: string
          created_by?: string | null
          discipline?: string
          dossier_id?: string
          id?: string
          laatst_gemaild_naar?: string[] | null
          laatst_gerappelleerd_op?: string | null
          ontvangen_op?: string | null
          opmerking?: string | null
          partij_naam?: string
          rappels?: number
          reactie_uiterlijk?: string | null
          relatie_id?: string | null
          soort?: string
          status?: string
          updated_at?: string
          volgnummer?: number
        }
        Relationships: [
          {
            foreignKeyName: "dossier_uitvragen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "dossier_uitvragen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_uitvragen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_uitvragen_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_voortgang: {
        Row: {
          bewakingscode: string | null
          bouw7_id: string
          bouw7_laatst_sync: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_status: string
          bron: string
          created_at: string
          dossier_id: string | null
          gewijzigd_door: string | null
          hoofdstuk_id: number | null
          id: string
          niveau: string
          pct_gereed: number
          updated_at: string
        }
        Insert: {
          bewakingscode?: string | null
          bouw7_id: string
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string
          bron?: string
          created_at?: string
          dossier_id?: string | null
          gewijzigd_door?: string | null
          hoofdstuk_id?: number | null
          id?: string
          niveau: string
          pct_gereed: number
          updated_at?: string
        }
        Update: {
          bewakingscode?: string | null
          bouw7_id?: string
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string
          bron?: string
          created_at?: string
          dossier_id?: string | null
          gewijzigd_door?: string | null
          hoofdstuk_id?: number | null
          id?: string
          niveau?: string
          pct_gereed?: number
          updated_at?: string
        }
        Relationships: []
      }
      dossiers: {
        Row: {
          aanvraag_substatus:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          aanvraagdatum: string | null
          adres_lat: number | null
          adres_lng: number | null
          bedrag_excl_btw: number | null
          bedrag_incl_btw: number | null
          bouw7_aanmaakdatum: string | null
          bouw7_bestelregels_afwijking: boolean
          bouw7_categorie: string | null
          bouw7_categorie_id: number | null
          bouw7_categorie_naam: string | null
          bouw7_filiaal: string | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_planning_hash: string | null
          bouw7_projectstatus_id: number | null
          bouw7_projectstatus_naam: string | null
          bouw7_quotation_status: string | null
          bouw7_stad: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_hash: string | null
          bouw7_sync_status: string | null
          bouw7_uren_overschrijding: boolean
          btw_splitsing: Json | null
          calculator_id: string | null
          categorie: string | null
          contactpersoon_id: string | null
          controller_id: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          dossiernummer: string | null
          everts_calc_project_id: string | null
          facturatiemethode: string
          facturatiemethode_handmatig: boolean
          factuuradres_id: string | null
          financieel_gereed_op: string | null
          gearchiveerd: boolean
          geocode_op: string | null
          geocode_status: string | null
          handmatige_velden: string[]
          hoofdstatus: Database["public"]["Enums"]["hoofdstatus"]
          id: string
          klant_id: string | null
          kostprijs_excl_btw: number | null
          mailintake_bericht_id: string | null
          mandaat_bedrag: number | null
          object_gekoppeld_op: string | null
          object_id: string | null
          object_koppel_bron: string | null
          offerte_pdf_naam: string | null
          offerte_pdf_pad: string | null
          offerte_substatus:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          offerte_verstuurd_aantal: number | null
          offerte_verstuurd_som_excl_btw: number | null
          opdracht_referentie: string | null
          opdracht_substatus:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          opdrachtdatum: string | null
          opmerkingen: string | null
          project_manager_id: string | null
          referentie: string | null
          servicedesk_substatus: string | null
          sharepoint_drive_id: string | null
          sharepoint_gematcht_op: string | null
          sharepoint_handmatig: boolean
          sharepoint_item_id: string | null
          sharepoint_match_status: string | null
          sharepoint_web_url: string | null
          teamleider_id: string | null
          titel: string
          uitvoerder_id: string | null
          updated_at: string
          verwacht_einddatum: string | null
          verwacht_startdatum: string | null
          verzonden_op: string | null
          voorlopige_eind: string | null
          voorlopige_start: string | null
          vve_code: string | null
          wb_ongeaccordeerde_wijzigingen: boolean
          werkadres_email: string | null
          werkadres_huisnummer: string | null
          werkadres_naam: string | null
          werkadres_postcode: string | null
          werkadres_stad: string | null
          werkadres_straat: string | null
          werkadres_telefoon: string | null
          werkmaatschappij_id: string | null
          werkvoorbereider_id: string | null
        }
        Insert: {
          aanvraag_substatus?:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          aanvraagdatum?: string | null
          adres_lat?: number | null
          adres_lng?: number | null
          bedrag_excl_btw?: number | null
          bedrag_incl_btw?: number | null
          bouw7_aanmaakdatum?: string | null
          bouw7_bestelregels_afwijking?: boolean
          bouw7_categorie?: string | null
          bouw7_categorie_id?: number | null
          bouw7_categorie_naam?: string | null
          bouw7_filiaal?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_planning_hash?: string | null
          bouw7_projectstatus_id?: number | null
          bouw7_projectstatus_naam?: string | null
          bouw7_quotation_status?: string | null
          bouw7_stad?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bouw7_uren_overschrijding?: boolean
          btw_splitsing?: Json | null
          calculator_id?: string | null
          categorie?: string | null
          contactpersoon_id?: string | null
          controller_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          dossiernummer?: string | null
          everts_calc_project_id?: string | null
          facturatiemethode?: string
          facturatiemethode_handmatig?: boolean
          factuuradres_id?: string | null
          financieel_gereed_op?: string | null
          gearchiveerd?: boolean
          geocode_op?: string | null
          geocode_status?: string | null
          handmatige_velden?: string[]
          hoofdstatus?: Database["public"]["Enums"]["hoofdstatus"]
          id?: string
          klant_id?: string | null
          kostprijs_excl_btw?: number | null
          mailintake_bericht_id?: string | null
          mandaat_bedrag?: number | null
          object_gekoppeld_op?: string | null
          object_id?: string | null
          object_koppel_bron?: string | null
          offerte_pdf_naam?: string | null
          offerte_pdf_pad?: string | null
          offerte_substatus?:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          offerte_verstuurd_aantal?: number | null
          offerte_verstuurd_som_excl_btw?: number | null
          opdracht_referentie?: string | null
          opdracht_substatus?:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          opdrachtdatum?: string | null
          opmerkingen?: string | null
          project_manager_id?: string | null
          referentie?: string | null
          servicedesk_substatus?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_gematcht_op?: string | null
          sharepoint_handmatig?: boolean
          sharepoint_item_id?: string | null
          sharepoint_match_status?: string | null
          sharepoint_web_url?: string | null
          teamleider_id?: string | null
          titel: string
          uitvoerder_id?: string | null
          updated_at?: string
          verwacht_einddatum?: string | null
          verwacht_startdatum?: string | null
          verzonden_op?: string | null
          voorlopige_eind?: string | null
          voorlopige_start?: string | null
          vve_code?: string | null
          wb_ongeaccordeerde_wijzigingen?: boolean
          werkadres_email?: string | null
          werkadres_huisnummer?: string | null
          werkadres_naam?: string | null
          werkadres_postcode?: string | null
          werkadres_stad?: string | null
          werkadres_straat?: string | null
          werkadres_telefoon?: string | null
          werkmaatschappij_id?: string | null
          werkvoorbereider_id?: string | null
        }
        Update: {
          aanvraag_substatus?:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          aanvraagdatum?: string | null
          adres_lat?: number | null
          adres_lng?: number | null
          bedrag_excl_btw?: number | null
          bedrag_incl_btw?: number | null
          bouw7_aanmaakdatum?: string | null
          bouw7_bestelregels_afwijking?: boolean
          bouw7_categorie?: string | null
          bouw7_categorie_id?: number | null
          bouw7_categorie_naam?: string | null
          bouw7_filiaal?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_planning_hash?: string | null
          bouw7_projectstatus_id?: number | null
          bouw7_projectstatus_naam?: string | null
          bouw7_quotation_status?: string | null
          bouw7_stad?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bouw7_uren_overschrijding?: boolean
          btw_splitsing?: Json | null
          calculator_id?: string | null
          categorie?: string | null
          contactpersoon_id?: string | null
          controller_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          dossiernummer?: string | null
          everts_calc_project_id?: string | null
          facturatiemethode?: string
          facturatiemethode_handmatig?: boolean
          factuuradres_id?: string | null
          financieel_gereed_op?: string | null
          gearchiveerd?: boolean
          geocode_op?: string | null
          geocode_status?: string | null
          handmatige_velden?: string[]
          hoofdstatus?: Database["public"]["Enums"]["hoofdstatus"]
          id?: string
          klant_id?: string | null
          kostprijs_excl_btw?: number | null
          mailintake_bericht_id?: string | null
          mandaat_bedrag?: number | null
          object_gekoppeld_op?: string | null
          object_id?: string | null
          object_koppel_bron?: string | null
          offerte_pdf_naam?: string | null
          offerte_pdf_pad?: string | null
          offerte_substatus?:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          offerte_verstuurd_aantal?: number | null
          offerte_verstuurd_som_excl_btw?: number | null
          opdracht_referentie?: string | null
          opdracht_substatus?:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          opdrachtdatum?: string | null
          opmerkingen?: string | null
          project_manager_id?: string | null
          referentie?: string | null
          servicedesk_substatus?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_gematcht_op?: string | null
          sharepoint_handmatig?: boolean
          sharepoint_item_id?: string | null
          sharepoint_match_status?: string | null
          sharepoint_web_url?: string | null
          teamleider_id?: string | null
          titel?: string
          uitvoerder_id?: string | null
          updated_at?: string
          verwacht_einddatum?: string | null
          verwacht_startdatum?: string | null
          verzonden_op?: string | null
          voorlopige_eind?: string | null
          voorlopige_start?: string | null
          vve_code?: string | null
          wb_ongeaccordeerde_wijzigingen?: boolean
          werkadres_email?: string | null
          werkadres_huisnummer?: string | null
          werkadres_naam?: string | null
          werkadres_postcode?: string | null
          werkadres_stad?: string | null
          werkadres_straat?: string | null
          werkadres_telefoon?: string | null
          werkmaatschappij_id?: string | null
          werkvoorbereider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_calculator_id_fkey"
            columns: ["calculator_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_calculator_id_fkey"
            columns: ["calculator_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_calculator_id_fkey"
            columns: ["calculator_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_contactpersoon_id_fkey"
            columns: ["contactpersoon_id"]
            isOneToOne: false
            referencedRelation: "contactpersonen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_controller_id_fkey"
            columns: ["controller_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_controller_id_fkey"
            columns: ["controller_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_controller_id_fkey"
            columns: ["controller_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_factuuradres_id_fkey"
            columns: ["factuuradres_id"]
            isOneToOne: false
            referencedRelation: "relatie_factuuradressen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_klant_id_fkey"
            columns: ["klant_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_mailintake_bericht_id_fkey"
            columns: ["mailintake_bericht_id"]
            isOneToOne: false
            referencedRelation: "mailintake_berichten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "vastgoed_objecten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_project_manager_id_fkey"
            columns: ["project_manager_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_project_manager_id_fkey"
            columns: ["project_manager_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_project_manager_id_fkey"
            columns: ["project_manager_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_uitvoerder_id_fkey"
            columns: ["uitvoerder_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_uitvoerder_id_fkey"
            columns: ["uitvoerder_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_uitvoerder_id_fkey"
            columns: ["uitvoerder_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_werkmaatschappij_id_fkey"
            columns: ["werkmaatschappij_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsgegevens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_werkvoorbereider_id_fkey"
            columns: ["werkvoorbereider_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_werkvoorbereider_id_fkey"
            columns: ["werkvoorbereider_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "dossiers_werkvoorbereider_id_fkey"
            columns: ["werkvoorbereider_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      evc_materiaalgroepen: {
        Row: {
          actief: boolean
          created_at: string
          id: string
          naam: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string
          id?: string
          naam: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string
          id?: string
          naam?: string
          volgorde?: number
        }
        Relationships: []
      }
      evc_materialen: {
        Row: {
          aangepast_op: string
          artikelnummer: string | null
          bron: string
          created_at: string
          eenheid: string
          etim_klasse: string | null
          externe_ref: string | null
          gesynct_op: string | null
          gtin: string | null
          id: string
          kostprijs: number
          leverancier: string | null
          leverancier_gln: string | null
          leverancier_productgroep: string | null
          materiaalgroep: string | null
          merk: string | null
          omschrijving: string
          status: string
        }
        Insert: {
          aangepast_op?: string
          artikelnummer?: string | null
          bron?: string
          created_at?: string
          eenheid?: string
          etim_klasse?: string | null
          externe_ref?: string | null
          gesynct_op?: string | null
          gtin?: string | null
          id?: string
          kostprijs?: number
          leverancier?: string | null
          leverancier_gln?: string | null
          leverancier_productgroep?: string | null
          materiaalgroep?: string | null
          merk?: string | null
          omschrijving: string
          status?: string
        }
        Update: {
          aangepast_op?: string
          artikelnummer?: string | null
          bron?: string
          created_at?: string
          eenheid?: string
          etim_klasse?: string | null
          externe_ref?: string | null
          gesynct_op?: string | null
          gtin?: string | null
          id?: string
          kostprijs?: number
          leverancier?: string | null
          leverancier_gln?: string | null
          leverancier_productgroep?: string | null
          materiaalgroep?: string | null
          merk?: string | null
          omschrijving?: string
          status?: string
        }
        Relationships: []
      }
      everts_calc_instellingen: {
        Row: {
          bijgewerkt_op: string
          data: Json
          id: string
        }
        Insert: {
          bijgewerkt_op?: string
          data?: Json
          id?: string
        }
        Update: {
          bijgewerkt_op?: string
          data?: Json
          id?: string
        }
        Relationships: []
      }
      factuur_regelgroepen: {
        Row: {
          bedrag_excl_btw: number | null
          bewakingscode: string
          bouw7_invoice_id: string | null
          btw_tarief_bouw7_id: number | null
          created_at: string
          dossier_id: string
          gefactureerd_op: string | null
          groep_sleutel: string
          id: string
          meefactureren: boolean
          omschrijving: string | null
          updated_at: string
          volgorde: number
        }
        Insert: {
          bedrag_excl_btw?: number | null
          bewakingscode: string
          bouw7_invoice_id?: string | null
          btw_tarief_bouw7_id?: number | null
          created_at?: string
          dossier_id: string
          gefactureerd_op?: string | null
          groep_sleutel: string
          id?: string
          meefactureren?: boolean
          omschrijving?: string | null
          updated_at?: string
          volgorde?: number
        }
        Update: {
          bedrag_excl_btw?: number | null
          bewakingscode?: string
          bouw7_invoice_id?: string | null
          btw_tarief_bouw7_id?: number | null
          created_at?: string
          dossier_id?: string
          gefactureerd_op?: string | null
          groep_sleutel?: string
          id?: string
          meefactureren?: boolean
          omschrijving?: string | null
          updated_at?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "factuur_regelgroepen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "factuur_regelgroepen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factuur_regelgroepen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      factuur_regelinstellingen: {
        Row: {
          bedrag_excl_btw: number | null
          bewakingscode: string
          btw_tarief_bouw7_id: number | null
          created_at: string
          dossier_id: string
          groepering: string
          id: string
          meefactureren: boolean
          omschrijving: string | null
          opslag_pct: number | null
          uitsplitsen: boolean
          updated_at: string
        }
        Insert: {
          bedrag_excl_btw?: number | null
          bewakingscode: string
          btw_tarief_bouw7_id?: number | null
          created_at?: string
          dossier_id: string
          groepering?: string
          id?: string
          meefactureren?: boolean
          omschrijving?: string | null
          opslag_pct?: number | null
          uitsplitsen?: boolean
          updated_at?: string
        }
        Update: {
          bedrag_excl_btw?: number | null
          bewakingscode?: string
          btw_tarief_bouw7_id?: number | null
          created_at?: string
          dossier_id?: string
          groepering?: string
          id?: string
          meefactureren?: boolean
          omschrijving?: string | null
          opslag_pct?: number | null
          uitsplitsen?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factuur_regelinstellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "factuur_regelinstellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factuur_regelinstellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      form_bestanden: {
        Row: {
          aangemaakt_op: string
          bestandsnaam: string
          grootte_bytes: number | null
          id: string
          inzending_id: string
          mime_type: string | null
          opslag_pad: string
          veld_naam: string
        }
        Insert: {
          aangemaakt_op?: string
          bestandsnaam: string
          grootte_bytes?: number | null
          id?: string
          inzending_id: string
          mime_type?: string | null
          opslag_pad: string
          veld_naam: string
        }
        Update: {
          aangemaakt_op?: string
          bestandsnaam?: string
          grootte_bytes?: number | null
          id?: string
          inzending_id?: string
          mime_type?: string | null
          opslag_pad?: string
          veld_naam?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_bestanden_inzending_id_fkey"
            columns: ["inzending_id"]
            isOneToOne: false
            referencedRelation: "form_inzendingen"
            referencedColumns: ["id"]
          },
        ]
      }
      form_inzendingen: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          bijgewerkt_op: string
          dossier_id: string | null
          id: string
          ingediend_door: string | null
          ingediend_op: string | null
          project_ref: string | null
          status: string
          submission_uuid: string | null
          task_id: string | null
          template_id: string
          versie_id: string
          waarden: Json
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          bijgewerkt_op?: string
          dossier_id?: string | null
          id?: string
          ingediend_door?: string | null
          ingediend_op?: string | null
          project_ref?: string | null
          status?: string
          submission_uuid?: string | null
          task_id?: string | null
          template_id: string
          versie_id: string
          waarden?: Json
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          bijgewerkt_op?: string
          dossier_id?: string | null
          id?: string
          ingediend_door?: string | null
          ingediend_op?: string | null
          project_ref?: string | null
          status?: string
          submission_uuid?: string | null
          task_id?: string | null
          template_id?: string
          versie_id?: string
          waarden?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_inzendingen_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_inzendingen_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_inzendingen_versie_id_fkey"
            columns: ["versie_id"]
            isOneToOne: false
            referencedRelation: "form_versies"
            referencedColumns: ["id"]
          },
        ]
      }
      form_rechten: {
        Row: {
          aangemaakt_op: string
          id: string
          rol: string
          subject_id: string
          subject_type: string
          template_id: string
        }
        Insert: {
          aangemaakt_op?: string
          id?: string
          rol: string
          subject_id: string
          subject_type: string
          template_id: string
        }
        Update: {
          aangemaakt_op?: string
          id?: string
          rol?: string
          subject_id?: string
          subject_type?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_rechten_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          bijgewerkt_op: string
          categorie: string | null
          huidige_versie: number
          id: string
          is_kam_vgm: boolean
          naam: string
          omschrijving: string | null
          portaal_zichtbaar: boolean
          status: string
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          bijgewerkt_op?: string
          categorie?: string | null
          huidige_versie?: number
          id?: string
          is_kam_vgm?: boolean
          naam: string
          omschrijving?: string | null
          portaal_zichtbaar?: boolean
          status?: string
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          bijgewerkt_op?: string
          categorie?: string | null
          huidige_versie?: number
          id?: string
          is_kam_vgm?: boolean
          naam?: string
          omschrijving?: string | null
          portaal_zichtbaar?: boolean
          status?: string
        }
        Relationships: []
      }
      form_versies: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          id: string
          schema: Json
          template_id: string
          versienummer: number
          wijzigingsnota: string | null
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          id?: string
          schema?: Json
          template_id: string
          versienummer: number
          wijzigingsnota?: string | null
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          id?: string
          schema?: Json
          template_id?: string
          versienummer?: number
          wijzigingsnota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_versies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      formulier_concepten: {
        Row: {
          bijgewerkt_op: string
          dossier_id: string | null
          id: string
          scope: string
          template_id: string | null
          user_id: string
          waarden: Json
        }
        Insert: {
          bijgewerkt_op?: string
          dossier_id?: string | null
          id?: string
          scope: string
          template_id?: string | null
          user_id: string
          waarden?: Json
        }
        Update: {
          bijgewerkt_op?: string
          dossier_id?: string | null
          id?: string
          scope?: string
          template_id?: string | null
          user_id?: string
          waarden?: Json
        }
        Relationships: []
      }
      formulier_pdf_config: {
        Row: {
          bijgewerkt_op: string
          briefpapier_marge_boven_mm: number
          briefpapier_marge_onder_mm: number
          id: string
          koptekst: string | null
          toon_invuller: boolean
          toon_logo: boolean
          toon_project_ref: boolean
          voettekst: string | null
        }
        Insert: {
          bijgewerkt_op?: string
          briefpapier_marge_boven_mm?: number
          briefpapier_marge_onder_mm?: number
          id?: string
          koptekst?: string | null
          toon_invuller?: boolean
          toon_logo?: boolean
          toon_project_ref?: boolean
          voettekst?: string | null
        }
        Update: {
          bijgewerkt_op?: string
          briefpapier_marge_boven_mm?: number
          briefpapier_marge_onder_mm?: number
          id?: string
          koptekst?: string | null
          toon_invuller?: boolean
          toon_logo?: boolean
          toon_project_ref?: boolean
          voettekst?: string | null
        }
        Relationships: []
      }
      fout_logboek: {
        Row: {
          aantal: number
          bron: string
          digest: string | null
          eerst_op: string
          extra: Json | null
          fingerprint: string
          fout_type: string | null
          id: string
          laatst_op: string
          medewerker_id: string | null
          melding: string
          module: string | null
          notitie: string | null
          omgeving: string
          opgelost: boolean
          opgelost_door: string | null
          opgelost_op: string | null
          soort: string | null
          stack: string | null
          url: string | null
        }
        Insert: {
          aantal?: number
          bron: string
          digest?: string | null
          eerst_op?: string
          extra?: Json | null
          fingerprint: string
          fout_type?: string | null
          id?: string
          laatst_op?: string
          medewerker_id?: string | null
          melding: string
          module?: string | null
          notitie?: string | null
          omgeving: string
          opgelost?: boolean
          opgelost_door?: string | null
          opgelost_op?: string | null
          soort?: string | null
          stack?: string | null
          url?: string | null
        }
        Update: {
          aantal?: number
          bron?: string
          digest?: string | null
          eerst_op?: string
          extra?: Json | null
          fingerprint?: string
          fout_type?: string | null
          id?: string
          laatst_op?: string
          medewerker_id?: string | null
          melding?: string
          module?: string | null
          notitie?: string | null
          omgeving?: string
          opgelost?: boolean
          opgelost_door?: string | null
          opgelost_op?: string | null
          soort?: string | null
          stack?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fout_logboek_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fout_logboek_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "fout_logboek_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "fout_logboek_opgelost_door_fkey"
            columns: ["opgelost_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fout_logboek_opgelost_door_fkey"
            columns: ["opgelost_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "fout_logboek_opgelost_door_fkey"
            columns: ["opgelost_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      gebruiker_layouts: {
        Row: {
          created_at: string | null
          id: string
          is_standaard: boolean
          kolommen: Json
          naam: string
          scherm: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_standaard?: boolean
          kolommen?: Json
          naam: string
          scherm: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_standaard?: boolean
          kolommen?: Json
          naam?: string
          scherm?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gebruiker_werkstand: {
        Row: {
          scherm: string
          staat: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          scherm: string
          staat?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          scherm?: string
          staat?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      geocode_cache: {
        Row: {
          aangemaakt_op: string
          bron: string | null
          lat: number | null
          lng: number | null
          query: string
        }
        Insert: {
          aangemaakt_op?: string
          bron?: string | null
          lat?: number | null
          lng?: number | null
          query: string
        }
        Update: {
          aangemaakt_op?: string
          bron?: string | null
          lat?: number | null
          lng?: number | null
          query?: string
        }
        Relationships: []
      }
      goedkeuring_gebeurtenissen: {
        Row: {
          actie: string
          created_at: string
          detail: Json
          goedkeuring_id: string
          id: string
          medewerker_id: string | null
        }
        Insert: {
          actie: string
          created_at?: string
          detail?: Json
          goedkeuring_id: string
          id?: string
          medewerker_id?: string | null
        }
        Update: {
          actie?: string
          created_at?: string
          detail?: Json
          goedkeuring_id?: string
          id?: string
          medewerker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goedkeuring_gebeurtenissen_goedkeuring_id_fkey"
            columns: ["goedkeuring_id"]
            isOneToOne: false
            referencedRelation: "goedkeuringen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuring_gebeurtenissen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuring_gebeurtenissen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuring_gebeurtenissen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      goedkeuring_opmerkingen: {
        Row: {
          created_at: string
          goedkeuring_id: string
          id: string
          medewerker_id: string | null
          tekst: string
        }
        Insert: {
          created_at?: string
          goedkeuring_id: string
          id?: string
          medewerker_id?: string | null
          tekst: string
        }
        Update: {
          created_at?: string
          goedkeuring_id?: string
          id?: string
          medewerker_id?: string | null
          tekst?: string
        }
        Relationships: [
          {
            foreignKeyName: "goedkeuring_opmerkingen_goedkeuring_id_fkey"
            columns: ["goedkeuring_id"]
            isOneToOne: false
            referencedRelation: "goedkeuringen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuring_opmerkingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuring_opmerkingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuring_opmerkingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      goedkeuringen: {
        Row: {
          aangevraagd_door: string | null
          aangevraagd_op: string
          beoordeeld_door: string | null
          beoordeeld_op: string | null
          beoordelaar_id: string | null
          created_at: string
          dossier_id: string | null
          gedelegeerd_aan: string | null
          id: string
          meekijkers: string[]
          object_hash: string | null
          object_id: string
          object_type: string
          ronde: number
          status: string
          toelichting: string | null
          updated_at: string
        }
        Insert: {
          aangevraagd_door?: string | null
          aangevraagd_op?: string
          beoordeeld_door?: string | null
          beoordeeld_op?: string | null
          beoordelaar_id?: string | null
          created_at?: string
          dossier_id?: string | null
          gedelegeerd_aan?: string | null
          id?: string
          meekijkers?: string[]
          object_hash?: string | null
          object_id: string
          object_type: string
          ronde?: number
          status?: string
          toelichting?: string | null
          updated_at?: string
        }
        Update: {
          aangevraagd_door?: string | null
          aangevraagd_op?: string
          beoordeeld_door?: string | null
          beoordeeld_op?: string | null
          beoordelaar_id?: string | null
          created_at?: string
          dossier_id?: string | null
          gedelegeerd_aan?: string | null
          id?: string
          meekijkers?: string[]
          object_hash?: string | null
          object_id?: string
          object_type?: string
          ronde?: number
          status?: string
          toelichting?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goedkeuringen_aangevraagd_door_fkey"
            columns: ["aangevraagd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuringen_aangevraagd_door_fkey"
            columns: ["aangevraagd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuringen_aangevraagd_door_fkey"
            columns: ["aangevraagd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuringen_beoordeeld_door_fkey"
            columns: ["beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuringen_beoordeeld_door_fkey"
            columns: ["beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuringen_beoordeeld_door_fkey"
            columns: ["beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuringen_beoordelaar_id_fkey"
            columns: ["beoordelaar_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuringen_beoordelaar_id_fkey"
            columns: ["beoordelaar_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuringen_beoordelaar_id_fkey"
            columns: ["beoordelaar_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuringen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "goedkeuringen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuringen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuringen_gedelegeerd_aan_fkey"
            columns: ["gedelegeerd_aan"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goedkeuringen_gedelegeerd_aan_fkey"
            columns: ["gedelegeerd_aan"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "goedkeuringen_gedelegeerd_aan_fkey"
            columns: ["gedelegeerd_aan"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      handboek_regels: {
        Row: {
          aangemaakt_op: string
          actief: boolean
          beschrijving: string | null
          code: string
          drempel_config: Json
          gewijzigd_op: string
          id: string
          titel: string
        }
        Insert: {
          aangemaakt_op?: string
          actief?: boolean
          beschrijving?: string | null
          code: string
          drempel_config?: Json
          gewijzigd_op?: string
          id?: string
          titel: string
        }
        Update: {
          aangemaakt_op?: string
          actief?: boolean
          beschrijving?: string | null
          code?: string
          drempel_config?: Json
          gewijzigd_op?: string
          id?: string
          titel?: string
        }
        Relationships: []
      }
      houtrot_dossier_config: {
        Row: {
          boom: Json
          dossier_id: string
          niveaus: Json
          updated_at: string
        }
        Insert: {
          boom?: Json
          dossier_id: string
          niveaus?: Json
          updated_at?: string
        }
        Update: {
          boom?: Json
          dossier_id?: string
          niveaus?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "houtrot_dossier_config_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "houtrot_dossier_config_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "houtrot_dossier_config_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      inkoop_correcties: {
        Row: {
          bewakingscode_naam_override: string | null
          bewakingscode_override: string | null
          bron_id: number
          bron_type: string
          created_at: string
          created_by: string | null
          dossier_id: string
          id: string
          opmerking: string | null
          toegewezen_contract_id: number | null
          toegewezen_order_id: number | null
          updated_at: string
        }
        Insert: {
          bewakingscode_naam_override?: string | null
          bewakingscode_override?: string | null
          bron_id: number
          bron_type?: string
          created_at?: string
          created_by?: string | null
          dossier_id: string
          id?: string
          opmerking?: string | null
          toegewezen_contract_id?: number | null
          toegewezen_order_id?: number | null
          updated_at?: string
        }
        Update: {
          bewakingscode_naam_override?: string | null
          bewakingscode_override?: string | null
          bron_id?: number
          bron_type?: string
          created_at?: string
          created_by?: string | null
          dossier_id?: string
          id?: string
          opmerking?: string | null
          toegewezen_contract_id?: number | null
          toegewezen_order_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inkoop_correcties_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "inkoop_correcties_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoop_correcties_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      inkoopfacturen: {
        Row: {
          approval_index: number | null
          approval_is_goedgekeurd: boolean | null
          approval_kan_accorderen: boolean | null
          approval_laatst_gelezen_op: string | null
          approval_laatste_actie_op: string | null
          approval_workflow_id: string | null
          bedrag_excl: number | null
          bedrag_incl: number | null
          betalen_door: string | null
          betalen_op: string | null
          betalingskenmerk: string | null
          bewakingscode: string | null
          bewakingscode_hoofdstuk: string | null
          bewakingscode_naam: string | null
          boekstuknummer: string | null
          bon_nummer: string | null
          bon_omschrijving: string | null
          bouw7_aangemaakt_op: string | null
          bouw7_approval_id: string | null
          bouw7_gewijzigd_op: string | null
          bouw7_invoice_id: string
          bouw7_laatst_sync: string | null
          bouw7_opmerking: string | null
          bouw7_project_id: string | null
          bouw7_status: number | null
          bouw7_sync_hash: string | null
          btw_bedrag: number | null
          created_at: string
          datum_betaald: string | null
          divisie_bouw7_id: number | null
          divisie_exact_id: string | null
          divisie_naam: string | null
          dossier_id: string | null
          exact_document_id: string | null
          exact_entry_id: string | null
          exact_laatst_sync: string | null
          exact_payment_id: string | null
          exact_status: string | null
          factuurdatum: string | null
          factuurnummer: string | null
          huidige_goedkeurder_bouw7_employee_id: string | null
          huidige_goedkeurder_id: string | null
          huidige_goedkeurder_naam: string | null
          id: string
          is_geboekt_in_exact: boolean | null
          is_geboekt_in_twinfield: boolean | null
          is_muteerbaar: boolean | null
          journaalcode_inkoop: string | null
          keten_verloopt_op: string | null
          laatste_vote_fout: string | null
          laatste_vote_op: string | null
          leverancier_bouw7_id: string | null
          leverancier_naam: string | null
          leverancier_relatie_id: string | null
          leverancier_type: string | null
          markering_betalen: boolean
          ordernummer: string | null
          project_naam: string | null
          project_nummer: string | null
          status: string
          uit_basecone: boolean | null
          updated_at: string
          vervaldatum: string | null
          vestiging_naam: string | null
        }
        Insert: {
          approval_index?: number | null
          approval_is_goedgekeurd?: boolean | null
          approval_kan_accorderen?: boolean | null
          approval_laatst_gelezen_op?: string | null
          approval_laatste_actie_op?: string | null
          approval_workflow_id?: string | null
          bedrag_excl?: number | null
          bedrag_incl?: number | null
          betalen_door?: string | null
          betalen_op?: string | null
          betalingskenmerk?: string | null
          bewakingscode?: string | null
          bewakingscode_hoofdstuk?: string | null
          bewakingscode_naam?: string | null
          boekstuknummer?: string | null
          bon_nummer?: string | null
          bon_omschrijving?: string | null
          bouw7_aangemaakt_op?: string | null
          bouw7_approval_id?: string | null
          bouw7_gewijzigd_op?: string | null
          bouw7_invoice_id: string
          bouw7_laatst_sync?: string | null
          bouw7_opmerking?: string | null
          bouw7_project_id?: string | null
          bouw7_status?: number | null
          bouw7_sync_hash?: string | null
          btw_bedrag?: number | null
          created_at?: string
          datum_betaald?: string | null
          divisie_bouw7_id?: number | null
          divisie_exact_id?: string | null
          divisie_naam?: string | null
          dossier_id?: string | null
          exact_document_id?: string | null
          exact_entry_id?: string | null
          exact_laatst_sync?: string | null
          exact_payment_id?: string | null
          exact_status?: string | null
          factuurdatum?: string | null
          factuurnummer?: string | null
          huidige_goedkeurder_bouw7_employee_id?: string | null
          huidige_goedkeurder_id?: string | null
          huidige_goedkeurder_naam?: string | null
          id?: string
          is_geboekt_in_exact?: boolean | null
          is_geboekt_in_twinfield?: boolean | null
          is_muteerbaar?: boolean | null
          journaalcode_inkoop?: string | null
          keten_verloopt_op?: string | null
          laatste_vote_fout?: string | null
          laatste_vote_op?: string | null
          leverancier_bouw7_id?: string | null
          leverancier_naam?: string | null
          leverancier_relatie_id?: string | null
          leverancier_type?: string | null
          markering_betalen?: boolean
          ordernummer?: string | null
          project_naam?: string | null
          project_nummer?: string | null
          status?: string
          uit_basecone?: boolean | null
          updated_at?: string
          vervaldatum?: string | null
          vestiging_naam?: string | null
        }
        Update: {
          approval_index?: number | null
          approval_is_goedgekeurd?: boolean | null
          approval_kan_accorderen?: boolean | null
          approval_laatst_gelezen_op?: string | null
          approval_laatste_actie_op?: string | null
          approval_workflow_id?: string | null
          bedrag_excl?: number | null
          bedrag_incl?: number | null
          betalen_door?: string | null
          betalen_op?: string | null
          betalingskenmerk?: string | null
          bewakingscode?: string | null
          bewakingscode_hoofdstuk?: string | null
          bewakingscode_naam?: string | null
          boekstuknummer?: string | null
          bon_nummer?: string | null
          bon_omschrijving?: string | null
          bouw7_aangemaakt_op?: string | null
          bouw7_approval_id?: string | null
          bouw7_gewijzigd_op?: string | null
          bouw7_invoice_id?: string
          bouw7_laatst_sync?: string | null
          bouw7_opmerking?: string | null
          bouw7_project_id?: string | null
          bouw7_status?: number | null
          bouw7_sync_hash?: string | null
          btw_bedrag?: number | null
          created_at?: string
          datum_betaald?: string | null
          divisie_bouw7_id?: number | null
          divisie_exact_id?: string | null
          divisie_naam?: string | null
          dossier_id?: string | null
          exact_document_id?: string | null
          exact_entry_id?: string | null
          exact_laatst_sync?: string | null
          exact_payment_id?: string | null
          exact_status?: string | null
          factuurdatum?: string | null
          factuurnummer?: string | null
          huidige_goedkeurder_bouw7_employee_id?: string | null
          huidige_goedkeurder_id?: string | null
          huidige_goedkeurder_naam?: string | null
          id?: string
          is_geboekt_in_exact?: boolean | null
          is_geboekt_in_twinfield?: boolean | null
          is_muteerbaar?: boolean | null
          journaalcode_inkoop?: string | null
          keten_verloopt_op?: string | null
          laatste_vote_fout?: string | null
          laatste_vote_op?: string | null
          leverancier_bouw7_id?: string | null
          leverancier_naam?: string | null
          leverancier_relatie_id?: string | null
          leverancier_type?: string | null
          markering_betalen?: boolean
          ordernummer?: string | null
          project_naam?: string | null
          project_nummer?: string | null
          status?: string
          uit_basecone?: boolean | null
          updated_at?: string
          vervaldatum?: string | null
          vestiging_naam?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inkoopfacturen_betalen_door_fkey"
            columns: ["betalen_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfacturen_betalen_door_fkey"
            columns: ["betalen_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "inkoopfacturen_betalen_door_fkey"
            columns: ["betalen_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "inkoopfacturen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "inkoopfacturen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfacturen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfacturen_huidige_goedkeurder_id_fkey"
            columns: ["huidige_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfacturen_huidige_goedkeurder_id_fkey"
            columns: ["huidige_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "inkoopfacturen_huidige_goedkeurder_id_fkey"
            columns: ["huidige_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "inkoopfacturen_leverancier_relatie_id_fkey"
            columns: ["leverancier_relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      inkoopfactuur_gebeurtenissen: {
        Row: {
          actie: string
          created_at: string
          detail: Json
          id: string
          inkoopfactuur_id: string
          medewerker_id: string | null
        }
        Insert: {
          actie: string
          created_at?: string
          detail?: Json
          id?: string
          inkoopfactuur_id: string
          medewerker_id?: string | null
        }
        Update: {
          actie?: string
          created_at?: string
          detail?: Json
          id?: string
          inkoopfactuur_id?: string
          medewerker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inkoopfactuur_gebeurtenissen_inkoopfactuur_id_fkey"
            columns: ["inkoopfactuur_id"]
            isOneToOne: false
            referencedRelation: "inkoopfacturen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfactuur_gebeurtenissen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfactuur_gebeurtenissen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "inkoopfactuur_gebeurtenissen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      inkoopfactuur_goedkeurders: {
        Row: {
          besloten_op: string | null
          bouw7_approver_id: string
          bouw7_employee_id: string | null
          created_at: string
          id: string
          inkoopfactuur_id: string
          medewerker_id: string | null
          naam: string | null
          opmerking: string | null
          status: number | null
          updated_at: string
          volgorde: number | null
        }
        Insert: {
          besloten_op?: string | null
          bouw7_approver_id: string
          bouw7_employee_id?: string | null
          created_at?: string
          id?: string
          inkoopfactuur_id: string
          medewerker_id?: string | null
          naam?: string | null
          opmerking?: string | null
          status?: number | null
          updated_at?: string
          volgorde?: number | null
        }
        Update: {
          besloten_op?: string | null
          bouw7_approver_id?: string
          bouw7_employee_id?: string | null
          created_at?: string
          id?: string
          inkoopfactuur_id?: string
          medewerker_id?: string | null
          naam?: string | null
          opmerking?: string | null
          status?: number | null
          updated_at?: string
          volgorde?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inkoopfactuur_goedkeurders_inkoopfactuur_id_fkey"
            columns: ["inkoopfactuur_id"]
            isOneToOne: false
            referencedRelation: "inkoopfacturen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfactuur_goedkeurders_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfactuur_goedkeurders_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "inkoopfactuur_goedkeurders_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      inkoopfactuur_opmerkingen: {
        Row: {
          created_at: string
          id: string
          inkoopfactuur_id: string
          medewerker_id: string | null
          naar_bouw7: boolean
          tekst: string
        }
        Insert: {
          created_at?: string
          id?: string
          inkoopfactuur_id: string
          medewerker_id?: string | null
          naar_bouw7?: boolean
          tekst: string
        }
        Update: {
          created_at?: string
          id?: string
          inkoopfactuur_id?: string
          medewerker_id?: string | null
          naar_bouw7?: boolean
          tekst?: string
        }
        Relationships: [
          {
            foreignKeyName: "inkoopfactuur_opmerkingen_inkoopfactuur_id_fkey"
            columns: ["inkoopfactuur_id"]
            isOneToOne: false
            referencedRelation: "inkoopfacturen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfactuur_opmerkingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkoopfactuur_opmerkingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "inkoopfactuur_opmerkingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      integraties: {
        Row: {
          actief: boolean
          config: Json
          created_at: string
          id: string
          laatst_sync: string | null
          laatst_sync_status: string | null
          naam: string
          updated_at: string
        }
        Insert: {
          actief?: boolean
          config?: Json
          created_at?: string
          id?: string
          laatst_sync?: string | null
          laatst_sync_status?: string | null
          naam: string
          updated_at?: string
        }
        Update: {
          actief?: boolean
          config?: Json
          created_at?: string
          id?: string
          laatst_sync?: string | null
          laatst_sync_status?: string | null
          naam?: string
          updated_at?: string
        }
        Relationships: []
      }
      kwaliteit_afwijking_historie: {
        Row: {
          afwijking_id: string
          door: string | null
          id: string
          naar_status: string
          op: string
          opmerking: string | null
          van_status: string | null
        }
        Insert: {
          afwijking_id: string
          door?: string | null
          id?: string
          naar_status: string
          op?: string
          opmerking?: string | null
          van_status?: string | null
        }
        Update: {
          afwijking_id?: string
          door?: string | null
          id?: string
          naar_status?: string
          op?: string
          opmerking?: string | null
          van_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_afwijking_historie_afwijking_id_fkey"
            columns: ["afwijking_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_afwijkingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijking_historie_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijking_historie_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijking_historie_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      kwaliteit_afwijkingen: {
        Row: {
          afwijkingsnummer: string
          controlepunt_code: string | null
          controlepunt_id: string | null
          created_at: string
          created_by: string | null
          datum_constatering: string
          discipline_code: string | null
          dossier_id: string
          eenheid: string | null
          eis_tekst: string | null
          ernst: string
          gemeten_waarde: number | null
          gewenste_hersteldatum: string | null
          hercontrole_datum: string | null
          hercontrole_inspectie_id: string | null
          hercontroleur_id: string | null
          herstelopmerking: string | null
          id: string
          inspecteur_id: string | null
          inspectie_id: string
          locatie: string | null
          omschrijving: string | null
          resultaat_id: string | null
          status: string
          updated_at: string
          verantwoordelijke_medewerker_id: string | null
          verantwoordelijke_relatie_id: string | null
          verantwoordelijke_type: string | null
          vergrendeld: boolean
          voorgestelde_actie: string | null
        }
        Insert: {
          afwijkingsnummer?: string
          controlepunt_code?: string | null
          controlepunt_id?: string | null
          created_at?: string
          created_by?: string | null
          datum_constatering?: string
          discipline_code?: string | null
          dossier_id: string
          eenheid?: string | null
          eis_tekst?: string | null
          ernst?: string
          gemeten_waarde?: number | null
          gewenste_hersteldatum?: string | null
          hercontrole_datum?: string | null
          hercontrole_inspectie_id?: string | null
          hercontroleur_id?: string | null
          herstelopmerking?: string | null
          id?: string
          inspecteur_id?: string | null
          inspectie_id: string
          locatie?: string | null
          omschrijving?: string | null
          resultaat_id?: string | null
          status?: string
          updated_at?: string
          verantwoordelijke_medewerker_id?: string | null
          verantwoordelijke_relatie_id?: string | null
          verantwoordelijke_type?: string | null
          vergrendeld?: boolean
          voorgestelde_actie?: string | null
        }
        Update: {
          afwijkingsnummer?: string
          controlepunt_code?: string | null
          controlepunt_id?: string | null
          created_at?: string
          created_by?: string | null
          datum_constatering?: string
          discipline_code?: string | null
          dossier_id?: string
          eenheid?: string | null
          eis_tekst?: string | null
          ernst?: string
          gemeten_waarde?: number | null
          gewenste_hersteldatum?: string | null
          hercontrole_datum?: string | null
          hercontrole_inspectie_id?: string | null
          hercontroleur_id?: string | null
          herstelopmerking?: string | null
          id?: string
          inspecteur_id?: string | null
          inspectie_id?: string
          locatie?: string | null
          omschrijving?: string | null
          resultaat_id?: string | null
          status?: string
          updated_at?: string
          verantwoordelijke_medewerker_id?: string | null
          verantwoordelijke_relatie_id?: string | null
          verantwoordelijke_type?: string | null
          vergrendeld?: boolean
          voorgestelde_actie?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_afwijkingen_controlepunt_id_fkey"
            columns: ["controlepunt_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_controlepunten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_hercontrole_inspectie_id_fkey"
            columns: ["hercontrole_inspectie_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_inspecties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_hercontroleur_id_fkey"
            columns: ["hercontroleur_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_hercontroleur_id_fkey"
            columns: ["hercontroleur_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_hercontroleur_id_fkey"
            columns: ["hercontroleur_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_inspecteur_id_fkey"
            columns: ["inspecteur_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_inspecteur_id_fkey"
            columns: ["inspecteur_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_inspecteur_id_fkey"
            columns: ["inspecteur_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_inspectie_id_fkey"
            columns: ["inspectie_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_inspecties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_resultaat_id_fkey"
            columns: ["resultaat_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_resultaten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_verantwoordelijke_medewerker_id_fkey"
            columns: ["verantwoordelijke_medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_verantwoordelijke_medewerker_id_fkey"
            columns: ["verantwoordelijke_medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_verantwoordelijke_medewerker_id_fkey"
            columns: ["verantwoordelijke_medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_afwijkingen_verantwoordelijke_relatie_id_fkey"
            columns: ["verantwoordelijke_relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      kwaliteit_controlepunten: {
        Row: {
          acceptatie_regel: string | null
          actief: boolean
          afkeur_regel: string | null
          binair_voldoet_bij: string | null
          bron_document: string | null
          bron_omschrijving: string | null
          bron_paragraaf: string | null
          bron_type: string
          bron_versie: string | null
          code: string
          component: string | null
          created_at: string
          discipline_code: string
          doel_waarde: number | null
          eenheid: string | null
          eis_tekst: string | null
          foto_altijd_verplicht: boolean
          foto_verplicht_bij_afkeur: boolean
          id: string
          inspectie_type: string
          korte_vraag: string
          kwaliteitsaspect: string
          max_waarde: number | null
          meetmethode: string | null
          meetmiddel: string | null
          meting_optioneel: boolean
          meting_verplicht: boolean
          min_waarde: number | null
          project_eis_sleutel: string | null
          rapport_tekst_voldoet: string | null
          rapport_tekst_voldoet_niet: string | null
          sta_nader_onderzoek: boolean
          sta_niet_beoordeeld: boolean
          sta_nvt: boolean
          standaard_ernst: string
          standaard_herstelactie: string | null
          subcomponent: string | null
          titel: string
          toelichting: string | null
          tolerantie_min: number | null
          tolerantie_plus: number | null
          updated_at: string
          volgorde: number
        }
        Insert: {
          acceptatie_regel?: string | null
          actief?: boolean
          afkeur_regel?: string | null
          binair_voldoet_bij?: string | null
          bron_document?: string | null
          bron_omschrijving?: string | null
          bron_paragraaf?: string | null
          bron_type?: string
          bron_versie?: string | null
          code: string
          component?: string | null
          created_at?: string
          discipline_code: string
          doel_waarde?: number | null
          eenheid?: string | null
          eis_tekst?: string | null
          foto_altijd_verplicht?: boolean
          foto_verplicht_bij_afkeur?: boolean
          id?: string
          inspectie_type?: string
          korte_vraag: string
          kwaliteitsaspect?: string
          max_waarde?: number | null
          meetmethode?: string | null
          meetmiddel?: string | null
          meting_optioneel?: boolean
          meting_verplicht?: boolean
          min_waarde?: number | null
          project_eis_sleutel?: string | null
          rapport_tekst_voldoet?: string | null
          rapport_tekst_voldoet_niet?: string | null
          sta_nader_onderzoek?: boolean
          sta_niet_beoordeeld?: boolean
          sta_nvt?: boolean
          standaard_ernst?: string
          standaard_herstelactie?: string | null
          subcomponent?: string | null
          titel: string
          toelichting?: string | null
          tolerantie_min?: number | null
          tolerantie_plus?: number | null
          updated_at?: string
          volgorde?: number
        }
        Update: {
          acceptatie_regel?: string | null
          actief?: boolean
          afkeur_regel?: string | null
          binair_voldoet_bij?: string | null
          bron_document?: string | null
          bron_omschrijving?: string | null
          bron_paragraaf?: string | null
          bron_type?: string
          bron_versie?: string | null
          code?: string
          component?: string | null
          created_at?: string
          discipline_code?: string
          doel_waarde?: number | null
          eenheid?: string | null
          eis_tekst?: string | null
          foto_altijd_verplicht?: boolean
          foto_verplicht_bij_afkeur?: boolean
          id?: string
          inspectie_type?: string
          korte_vraag?: string
          kwaliteitsaspect?: string
          max_waarde?: number | null
          meetmethode?: string | null
          meetmiddel?: string | null
          meting_optioneel?: boolean
          meting_verplicht?: boolean
          min_waarde?: number | null
          project_eis_sleutel?: string | null
          rapport_tekst_voldoet?: string | null
          rapport_tekst_voldoet_niet?: string | null
          sta_nader_onderzoek?: boolean
          sta_niet_beoordeeld?: boolean
          sta_nvt?: boolean
          standaard_ernst?: string
          standaard_herstelactie?: string | null
          subcomponent?: string | null
          titel?: string
          toelichting?: string | null
          tolerantie_min?: number | null
          tolerantie_plus?: number | null
          updated_at?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_controlepunten_discipline_code_fkey"
            columns: ["discipline_code"]
            isOneToOne: false
            referencedRelation: "kwaliteit_disciplines"
            referencedColumns: ["code"]
          },
        ]
      }
      kwaliteit_disciplines: {
        Row: {
          actief: boolean
          altijd_aan: boolean
          code: string
          created_at: string
          groep: string
          naam: string
          updated_at: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          altijd_aan?: boolean
          code: string
          created_at?: string
          groep?: string
          naam: string
          updated_at?: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          altijd_aan?: boolean
          code?: string
          created_at?: string
          groep?: string
          naam?: string
          updated_at?: string
          volgorde?: number
        }
        Relationships: []
      }
      kwaliteit_fotos: {
        Row: {
          afwijking_id: string | null
          created_at: string
          created_by: string | null
          id: string
          inspectie_id: string | null
          omschrijving: string | null
          resultaat_id: string | null
          soort: string
          url: string
          waarneming_id: string | null
        }
        Insert: {
          afwijking_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inspectie_id?: string | null
          omschrijving?: string | null
          resultaat_id?: string | null
          soort?: string
          url: string
          waarneming_id?: string | null
        }
        Update: {
          afwijking_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inspectie_id?: string | null
          omschrijving?: string | null
          resultaat_id?: string | null
          soort?: string
          url?: string
          waarneming_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_fotos_afwijking_id_fkey"
            columns: ["afwijking_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_afwijkingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_fotos_inspectie_id_fkey"
            columns: ["inspectie_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_inspecties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_fotos_resultaat_id_fkey"
            columns: ["resultaat_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_resultaten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_fotos_waarneming_id_fkey"
            columns: ["waarneming_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_waarnemingen"
            referencedColumns: ["id"]
          },
        ]
      }
      kwaliteit_inspecties: {
        Row: {
          algemene_opmerkingen: string | null
          created_at: string
          created_by: string | null
          datum: string
          definitief_door: string | null
          definitief_op: string | null
          discipline_codes: string[]
          dossier_id: string
          gebied_omschrijving: string | null
          heropen_reden: string | null
          heropend_door: string | null
          heropend_op: string | null
          id: string
          inspecteur_id: string | null
          inspectienummer: string
          status: string
          steekproef_afwijkend: number | null
          steekproef_bekeken: number | null
          task_id: string | null
          tijd: string | null
          updated_at: string
          weer: string | null
          werkzaamheden_omschrijving: string | null
        }
        Insert: {
          algemene_opmerkingen?: string | null
          created_at?: string
          created_by?: string | null
          datum?: string
          definitief_door?: string | null
          definitief_op?: string | null
          discipline_codes?: string[]
          dossier_id: string
          gebied_omschrijving?: string | null
          heropen_reden?: string | null
          heropend_door?: string | null
          heropend_op?: string | null
          id?: string
          inspecteur_id?: string | null
          inspectienummer?: string
          status?: string
          steekproef_afwijkend?: number | null
          steekproef_bekeken?: number | null
          task_id?: string | null
          tijd?: string | null
          updated_at?: string
          weer?: string | null
          werkzaamheden_omschrijving?: string | null
        }
        Update: {
          algemene_opmerkingen?: string | null
          created_at?: string
          created_by?: string | null
          datum?: string
          definitief_door?: string | null
          definitief_op?: string | null
          discipline_codes?: string[]
          dossier_id?: string
          gebied_omschrijving?: string | null
          heropen_reden?: string | null
          heropend_door?: string | null
          heropend_op?: string | null
          id?: string
          inspecteur_id?: string | null
          inspectienummer?: string
          status?: string
          steekproef_afwijkend?: number | null
          steekproef_bekeken?: number | null
          task_id?: string | null
          tijd?: string | null
          updated_at?: string
          weer?: string | null
          werkzaamheden_omschrijving?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_inspecties_definitief_door_fkey"
            columns: ["definitief_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_definitief_door_fkey"
            columns: ["definitief_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_definitief_door_fkey"
            columns: ["definitief_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_heropend_door_fkey"
            columns: ["heropend_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_heropend_door_fkey"
            columns: ["heropend_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_heropend_door_fkey"
            columns: ["heropend_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_inspecteur_id_fkey"
            columns: ["inspecteur_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_inspecteur_id_fkey"
            columns: ["inspecteur_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_inspecteur_id_fkey"
            columns: ["inspecteur_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "kwaliteit_inspecties_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      kwaliteit_project_eisen: {
        Row: {
          bron_document: string | null
          bron_type: string
          created_at: string
          doel_waarde: number | null
          dossier_id: string
          eenheid: string | null
          eis_tekst: string | null
          id: string
          label: string
          max_waarde: number | null
          min_waarde: number | null
          notitie: string | null
          sleutel: string
          tolerantie_min: number | null
          tolerantie_plus: number | null
          updated_at: string
          waarde_tekst: string | null
        }
        Insert: {
          bron_document?: string | null
          bron_type?: string
          created_at?: string
          doel_waarde?: number | null
          dossier_id: string
          eenheid?: string | null
          eis_tekst?: string | null
          id?: string
          label: string
          max_waarde?: number | null
          min_waarde?: number | null
          notitie?: string | null
          sleutel: string
          tolerantie_min?: number | null
          tolerantie_plus?: number | null
          updated_at?: string
          waarde_tekst?: string | null
        }
        Update: {
          bron_document?: string | null
          bron_type?: string
          created_at?: string
          doel_waarde?: number | null
          dossier_id?: string
          eenheid?: string | null
          eis_tekst?: string | null
          id?: string
          label?: string
          max_waarde?: number | null
          min_waarde?: number | null
          notitie?: string | null
          sleutel?: string
          tolerantie_min?: number | null
          tolerantie_plus?: number | null
          updated_at?: string
          waarde_tekst?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_project_eisen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "kwaliteit_project_eisen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_project_eisen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      kwaliteit_referentievlakken: {
        Row: {
          created_at: string
          created_by: string | null
          datum: string
          discipline_code: string | null
          dossier_id: string
          foto_urls: string[]
          goedgekeurd_door: string | null
          id: string
          kleur: string | null
          locatie: string | null
          meetwaarden: Json
          omschrijving: string
          structuur: string | null
          updated_at: string
          voegprofiel: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          datum?: string
          discipline_code?: string | null
          dossier_id: string
          foto_urls?: string[]
          goedgekeurd_door?: string | null
          id?: string
          kleur?: string | null
          locatie?: string | null
          meetwaarden?: Json
          omschrijving: string
          structuur?: string | null
          updated_at?: string
          voegprofiel?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          datum?: string
          discipline_code?: string | null
          dossier_id?: string
          foto_urls?: string[]
          goedgekeurd_door?: string | null
          id?: string
          kleur?: string | null
          locatie?: string | null
          meetwaarden?: Json
          omschrijving?: string
          structuur?: string | null
          updated_at?: string
          voegprofiel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_referentievlakken_discipline_code_fkey"
            columns: ["discipline_code"]
            isOneToOne: false
            referencedRelation: "kwaliteit_disciplines"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "kwaliteit_referentievlakken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "kwaliteit_referentievlakken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_referentievlakken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      kwaliteit_resultaten: {
        Row: {
          antwoord: string | null
          berekend_voldoet: boolean | null
          controlepunt_id: string
          created_at: string
          created_by: string | null
          gemeten_waarde: number | null
          gemeten_waarde_2: number | null
          gemeten_waarde_3: number | null
          id: string
          inspectie_id: string
          meetlocatie: string | null
          meetmiddel: string | null
          opmerking: string | null
          status: string
          toegepaste_eis: Json
          updated_at: string
        }
        Insert: {
          antwoord?: string | null
          berekend_voldoet?: boolean | null
          controlepunt_id: string
          created_at?: string
          created_by?: string | null
          gemeten_waarde?: number | null
          gemeten_waarde_2?: number | null
          gemeten_waarde_3?: number | null
          id?: string
          inspectie_id: string
          meetlocatie?: string | null
          meetmiddel?: string | null
          opmerking?: string | null
          status: string
          toegepaste_eis?: Json
          updated_at?: string
        }
        Update: {
          antwoord?: string | null
          berekend_voldoet?: boolean | null
          controlepunt_id?: string
          created_at?: string
          created_by?: string | null
          gemeten_waarde?: number | null
          gemeten_waarde_2?: number | null
          gemeten_waarde_3?: number | null
          id?: string
          inspectie_id?: string
          meetlocatie?: string | null
          meetmiddel?: string | null
          opmerking?: string | null
          status?: string
          toegepaste_eis?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_resultaten_controlepunt_id_fkey"
            columns: ["controlepunt_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_controlepunten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kwaliteit_resultaten_inspectie_id_fkey"
            columns: ["inspectie_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_inspecties"
            referencedColumns: ["id"]
          },
        ]
      }
      kwaliteit_waarnemingen: {
        Row: {
          created_at: string
          created_by: string | null
          discipline_code: string | null
          id: string
          inspectie_id: string
          locatie: string | null
          omschrijving: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discipline_code?: string | null
          id?: string
          inspectie_id: string
          locatie?: string | null
          omschrijving: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discipline_code?: string | null
          id?: string
          inspectie_id?: string
          locatie?: string | null
          omschrijving?: string
        }
        Relationships: [
          {
            foreignKeyName: "kwaliteit_waarnemingen_discipline_code_fkey"
            columns: ["discipline_code"]
            isOneToOne: false
            referencedRelation: "kwaliteit_disciplines"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "kwaliteit_waarnemingen_inspectie_id_fkey"
            columns: ["inspectie_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_inspecties"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_contracten: {
        Row: {
          actief: boolean
          bijtelling_percentage: number | null
          contract_document_url: string | null
          contractnummer: string | null
          created_at: string
          eind_datum: string | null
          id: string
          km_bundel_per_jaar: number | null
          leasemaatschappij_relatie_id: string | null
          maandtermijn_bedrag: number | null
          meer_km_tarief: number | null
          minder_km_tarief: number | null
          opmerkingen: string | null
          start_datum: string
          updated_at: string
          voertuig_id: string
        }
        Insert: {
          actief?: boolean
          bijtelling_percentage?: number | null
          contract_document_url?: string | null
          contractnummer?: string | null
          created_at?: string
          eind_datum?: string | null
          id?: string
          km_bundel_per_jaar?: number | null
          leasemaatschappij_relatie_id?: string | null
          maandtermijn_bedrag?: number | null
          meer_km_tarief?: number | null
          minder_km_tarief?: number | null
          opmerkingen?: string | null
          start_datum: string
          updated_at?: string
          voertuig_id: string
        }
        Update: {
          actief?: boolean
          bijtelling_percentage?: number | null
          contract_document_url?: string | null
          contractnummer?: string | null
          created_at?: string
          eind_datum?: string | null
          id?: string
          km_bundel_per_jaar?: number | null
          leasemaatschappij_relatie_id?: string | null
          maandtermijn_bedrag?: number | null
          meer_km_tarief?: number | null
          minder_km_tarief?: number | null
          opmerkingen?: string | null
          start_datum?: string
          updated_at?: string
          voertuig_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_contracten_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["voertuig_id"]
          },
          {
            foreignKeyName: "lease_contracten_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "voertuigen"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_sjablonen: {
        Row: {
          actief: boolean
          created_at: string
          id: string
          naam: string
          onderwerp: string
          soort: string
          tekst: string
          updated_at: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string
          id?: string
          naam?: string
          onderwerp?: string
          soort: string
          tekst?: string
          updated_at?: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string
          id?: string
          naam?: string
          onderwerp?: string
          soort?: string
          tekst?: string
          updated_at?: string
          volgorde?: number
        }
        Relationships: []
      }
      mailintake_aliassen: {
        Row: {
          aangemaakt_door: string | null
          contactpersoon_id: string | null
          created_at: string
          id: string
          laatst_gebruikt_op: string | null
          patroon: string
          relatie_id: string | null
          soort: string
        }
        Insert: {
          aangemaakt_door?: string | null
          contactpersoon_id?: string | null
          created_at?: string
          id?: string
          laatst_gebruikt_op?: string | null
          patroon: string
          relatie_id?: string | null
          soort: string
        }
        Update: {
          aangemaakt_door?: string | null
          contactpersoon_id?: string | null
          created_at?: string
          id?: string
          laatst_gebruikt_op?: string | null
          patroon?: string
          relatie_id?: string | null
          soort?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailintake_aliassen_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_aliassen_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "mailintake_aliassen_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "mailintake_aliassen_contactpersoon_id_fkey"
            columns: ["contactpersoon_id"]
            isOneToOne: false
            referencedRelation: "contactpersonen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_aliassen_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      mailintake_berichten: {
        Row: {
          aan: string[]
          behandeld_door: string | null
          behandeld_op: string | null
          besluit: string | null
          body_preview: string | null
          body_tekst: string | null
          bouw7_gereed: boolean | null
          bouw7_ontbreekt: string[]
          cc: string[]
          contactpersoon_id: string | null
          conversation_id: string | null
          created_at: string
          dossier_id: string | null
          duplicaat_topscore: number | null
          graph_message_id: string | null
          heeft_bijlagen: boolean
          herkend_via: string | null
          herkenning_score: number | null
          id: string
          internet_message_id: string
          is_antwoord: boolean
          is_automatisch_antwoord: boolean
          laatste_fout: string | null
          object_id: string | null
          object_score: number | null
          object_via: string | null
          onderwerp: string | null
          ontvangen_op: string
          outlook_fout: string | null
          outlook_nabehandeling: string
          outlook_nabehandeling_op: string | null
          outlook_pogingen: number
          pogingen: number
          postbus_id: string
          relatie_id: string | null
          samenvatting: string | null
          soort: string | null
          soort_vertrouwen: number | null
          status: string
          toegewezen_medewerker_id: string | null
          updated_at: string
          van_adres: string | null
          van_naam: string | null
        }
        Insert: {
          aan?: string[]
          behandeld_door?: string | null
          behandeld_op?: string | null
          besluit?: string | null
          body_preview?: string | null
          body_tekst?: string | null
          bouw7_gereed?: boolean | null
          bouw7_ontbreekt?: string[]
          cc?: string[]
          contactpersoon_id?: string | null
          conversation_id?: string | null
          created_at?: string
          dossier_id?: string | null
          duplicaat_topscore?: number | null
          graph_message_id?: string | null
          heeft_bijlagen?: boolean
          herkend_via?: string | null
          herkenning_score?: number | null
          id?: string
          internet_message_id: string
          is_antwoord?: boolean
          is_automatisch_antwoord?: boolean
          laatste_fout?: string | null
          object_id?: string | null
          object_score?: number | null
          object_via?: string | null
          onderwerp?: string | null
          ontvangen_op: string
          outlook_fout?: string | null
          outlook_nabehandeling?: string
          outlook_nabehandeling_op?: string | null
          outlook_pogingen?: number
          pogingen?: number
          postbus_id: string
          relatie_id?: string | null
          samenvatting?: string | null
          soort?: string | null
          soort_vertrouwen?: number | null
          status?: string
          toegewezen_medewerker_id?: string | null
          updated_at?: string
          van_adres?: string | null
          van_naam?: string | null
        }
        Update: {
          aan?: string[]
          behandeld_door?: string | null
          behandeld_op?: string | null
          besluit?: string | null
          body_preview?: string | null
          body_tekst?: string | null
          bouw7_gereed?: boolean | null
          bouw7_ontbreekt?: string[]
          cc?: string[]
          contactpersoon_id?: string | null
          conversation_id?: string | null
          created_at?: string
          dossier_id?: string | null
          duplicaat_topscore?: number | null
          graph_message_id?: string | null
          heeft_bijlagen?: boolean
          herkend_via?: string | null
          herkenning_score?: number | null
          id?: string
          internet_message_id?: string
          is_antwoord?: boolean
          is_automatisch_antwoord?: boolean
          laatste_fout?: string | null
          object_id?: string | null
          object_score?: number | null
          object_via?: string | null
          onderwerp?: string | null
          ontvangen_op?: string
          outlook_fout?: string | null
          outlook_nabehandeling?: string
          outlook_nabehandeling_op?: string | null
          outlook_pogingen?: number
          pogingen?: number
          postbus_id?: string
          relatie_id?: string | null
          samenvatting?: string | null
          soort?: string | null
          soort_vertrouwen?: number | null
          status?: string
          toegewezen_medewerker_id?: string | null
          updated_at?: string
          van_adres?: string | null
          van_naam?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mailintake_berichten_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_berichten_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "mailintake_berichten_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "mailintake_berichten_contactpersoon_id_fkey"
            columns: ["contactpersoon_id"]
            isOneToOne: false
            referencedRelation: "contactpersonen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_berichten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "mailintake_berichten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_berichten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_berichten_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "vastgoed_objecten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_berichten_postbus_id_fkey"
            columns: ["postbus_id"]
            isOneToOne: false
            referencedRelation: "mailintake_postbussen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_berichten_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_berichten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_berichten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "mailintake_berichten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      mailintake_besluiten: {
        Row: {
          actie: string
          actor: string
          bericht_id: string
          details: Json
          id: string
          medewerker_id: string | null
          moment: string
        }
        Insert: {
          actie: string
          actor: string
          bericht_id: string
          details?: Json
          id?: string
          medewerker_id?: string | null
          moment?: string
        }
        Update: {
          actie?: string
          actor?: string
          bericht_id?: string
          details?: Json
          id?: string
          medewerker_id?: string | null
          moment?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailintake_besluiten_bericht_id_fkey"
            columns: ["bericht_id"]
            isOneToOne: false
            referencedRelation: "mailintake_berichten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_besluiten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_besluiten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "mailintake_besluiten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      mailintake_bijlagen: {
        Row: {
          aan_ai_gegeven: boolean
          bericht_id: string
          bestandsnaam: string
          content_type: string | null
          created_at: string
          graph_attachment_id: string | null
          grootte_bytes: number | null
          id: string
          is_inline: boolean
          naar_sharepoint_op: string | null
          opslag_pad: string | null
          rol: string | null
          sha256: string | null
          sharepoint_item_id: string | null
          te_groot: boolean
        }
        Insert: {
          aan_ai_gegeven?: boolean
          bericht_id: string
          bestandsnaam: string
          content_type?: string | null
          created_at?: string
          graph_attachment_id?: string | null
          grootte_bytes?: number | null
          id?: string
          is_inline?: boolean
          naar_sharepoint_op?: string | null
          opslag_pad?: string | null
          rol?: string | null
          sha256?: string | null
          sharepoint_item_id?: string | null
          te_groot?: boolean
        }
        Update: {
          aan_ai_gegeven?: boolean
          bericht_id?: string
          bestandsnaam?: string
          content_type?: string | null
          created_at?: string
          graph_attachment_id?: string | null
          grootte_bytes?: number | null
          id?: string
          is_inline?: boolean
          naar_sharepoint_op?: string | null
          opslag_pad?: string | null
          rol?: string | null
          sha256?: string | null
          sharepoint_item_id?: string | null
          te_groot?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mailintake_bijlagen_bericht_id_fkey"
            columns: ["bericht_id"]
            isOneToOne: false
            referencedRelation: "mailintake_berichten"
            referencedColumns: ["id"]
          },
        ]
      }
      mailintake_duplicaat_kandidaten: {
        Row: {
          bericht_id: string
          created_at: string
          dossier_id: string
          gekozen: boolean
          id: string
          redenen: string[]
          score: number
          soort: string
        }
        Insert: {
          bericht_id: string
          created_at?: string
          dossier_id: string
          gekozen?: boolean
          id?: string
          redenen?: string[]
          score: number
          soort?: string
        }
        Update: {
          bericht_id?: string
          created_at?: string
          dossier_id?: string
          gekozen?: boolean
          id?: string
          redenen?: string[]
          score?: number
          soort?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailintake_duplicaat_kandidaten_bericht_id_fkey"
            columns: ["bericht_id"]
            isOneToOne: false
            referencedRelation: "mailintake_berichten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_duplicaat_kandidaten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "mailintake_duplicaat_kandidaten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailintake_duplicaat_kandidaten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      mailintake_extracties: {
        Row: {
          bericht_id: string
          created_at: string
          fout: string | null
          id: string
          invoer_tokens: number | null
          kosten_cent: number | null
          model: string
          prompt_versie: string
          ruwe_uitvoer: string | null
          soort: string | null
          status: string
          toelichting: string | null
          uitvoer_tokens: number | null
          velden: Json
          versie: number
          vertrouwen: Json
          vertrouwen_totaal: number | null
        }
        Insert: {
          bericht_id: string
          created_at?: string
          fout?: string | null
          id?: string
          invoer_tokens?: number | null
          kosten_cent?: number | null
          model: string
          prompt_versie: string
          ruwe_uitvoer?: string | null
          soort?: string | null
          status?: string
          toelichting?: string | null
          uitvoer_tokens?: number | null
          velden?: Json
          versie?: number
          vertrouwen?: Json
          vertrouwen_totaal?: number | null
        }
        Update: {
          bericht_id?: string
          created_at?: string
          fout?: string | null
          id?: string
          invoer_tokens?: number | null
          kosten_cent?: number | null
          model?: string
          prompt_versie?: string
          ruwe_uitvoer?: string | null
          soort?: string | null
          status?: string
          toelichting?: string | null
          uitvoer_tokens?: number | null
          velden?: Json
          versie?: number
          vertrouwen?: Json
          vertrouwen_totaal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mailintake_extracties_bericht_id_fkey"
            columns: ["bericht_id"]
            isOneToOne: false
            referencedRelation: "mailintake_berichten"
            referencedColumns: ["id"]
          },
        ]
      }
      mailintake_postbussen: {
        Row: {
          actief: boolean
          adres: string
          automatisch_aanmaken: boolean
          created_at: string
          dagbudget_cent: number
          id: string
          laatste_fout: string | null
          laatste_ophaal_gelukt_op: string | null
          laatste_ophaal_op: string | null
          map_id: string
          map_verwerkt_id: string | null
          map_verwerkt_naam: string
          naam: string
          notificatie_medewerkers: string[]
          sleutel: string
          soort: string
          standaard_bouw7_categorie_id: number | null
          standaard_categorie: string | null
          standaard_werkmaatschappij_id: string | null
          updated_at: string
        }
        Insert: {
          actief?: boolean
          adres: string
          automatisch_aanmaken?: boolean
          created_at?: string
          dagbudget_cent?: number
          id?: string
          laatste_fout?: string | null
          laatste_ophaal_gelukt_op?: string | null
          laatste_ophaal_op?: string | null
          map_id?: string
          map_verwerkt_id?: string | null
          map_verwerkt_naam?: string
          naam: string
          notificatie_medewerkers?: string[]
          sleutel: string
          soort: string
          standaard_bouw7_categorie_id?: number | null
          standaard_categorie?: string | null
          standaard_werkmaatschappij_id?: string | null
          updated_at?: string
        }
        Update: {
          actief?: boolean
          adres?: string
          automatisch_aanmaken?: boolean
          created_at?: string
          dagbudget_cent?: number
          id?: string
          laatste_fout?: string | null
          laatste_ophaal_gelukt_op?: string | null
          laatste_ophaal_op?: string | null
          map_id?: string
          map_verwerkt_id?: string | null
          map_verwerkt_naam?: string
          naam?: string
          notificatie_medewerkers?: string[]
          sleutel?: string
          soort?: string
          standaard_bouw7_categorie_id?: number | null
          standaard_categorie?: string | null
          standaard_werkmaatschappij_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailintake_postbussen_standaard_werkmaatschappij_id_fkey"
            columns: ["standaard_werkmaatschappij_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsgegevens"
            referencedColumns: ["id"]
          },
        ]
      }
      management_ak: {
        Row: {
          bedrag_ak: number
          created_at: string
          filiaal: string
          id: string
          jaar: number
          opmerkingen: string | null
          updated_at: string
        }
        Insert: {
          bedrag_ak?: number
          created_at?: string
          filiaal: string
          id?: string
          jaar: number
          opmerkingen?: string | null
          updated_at?: string
        }
        Update: {
          bedrag_ak?: number
          created_at?: string
          filiaal?: string
          id?: string
          jaar?: number
          opmerkingen?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      management_doelstellingen: {
        Row: {
          created_at: string
          filiaal: string | null
          id: string
          jaar: number
          omzet_doelstelling: number | null
          opmerkingen: string | null
          projectleider: string | null
          resultaat_doelstelling: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          filiaal?: string | null
          id?: string
          jaar: number
          omzet_doelstelling?: number | null
          opmerkingen?: string | null
          projectleider?: string | null
          resultaat_doelstelling?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          filiaal?: string | null
          id?: string
          jaar?: number
          omzet_doelstelling?: number | null
          opmerkingen?: string | null
          projectleider?: string | null
          resultaat_doelstelling?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      management_maand_snapshot: {
        Row: {
          calculators: Json | null
          created_at: string
          funnel: Json | null
          id: string
          kpi: Json
          opmerking: string | null
          periode: string
          vastgesteld_door_id: string | null
          vastgesteld_door_naam: string | null
          vastgesteld_op: string
        }
        Insert: {
          calculators?: Json | null
          created_at?: string
          funnel?: Json | null
          id?: string
          kpi: Json
          opmerking?: string | null
          periode: string
          vastgesteld_door_id?: string | null
          vastgesteld_door_naam?: string | null
          vastgesteld_op?: string
        }
        Update: {
          calculators?: Json | null
          created_at?: string
          funnel?: Json | null
          id?: string
          kpi?: Json
          opmerking?: string | null
          periode?: string
          vastgesteld_door_id?: string | null
          vastgesteld_door_naam?: string | null
          vastgesteld_op?: string
        }
        Relationships: [
          {
            foreignKeyName: "management_maand_snapshot_vastgesteld_door_id_fkey"
            columns: ["vastgesteld_door_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "management_maand_snapshot_vastgesteld_door_id_fkey"
            columns: ["vastgesteld_door_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "management_maand_snapshot_vastgesteld_door_id_fkey"
            columns: ["vastgesteld_door_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      management_maand_snapshot_regel: {
        Row: {
          bouw7_id: string | null
          categorie: string | null
          dossier_id: string | null
          dossier_sectie: string | null
          filiaal: string | null
          geboekte_kosten: number | null
          gefactureerd: number | null
          id: string
          is_gereed: boolean
          kosten_split: Json | null
          omzet_obv_pct: number | null
          opdrachtgever: string | null
          pct_gereed: number | null
          pct_marge: number | null
          pct_marge_gereed: number | null
          projectleider: string | null
          projectnaam: string | null
          projectnummer: string
          resultaat_gereed: number | null
          resultaat_obv_pct: number | null
          snapshot_id: string
          status: string | null
          totale_opdracht: number | null
          totale_prognose: number | null
          verschil_pct_marge: number | null
          verwacht_resultaat: number | null
        }
        Insert: {
          bouw7_id?: string | null
          categorie?: string | null
          dossier_id?: string | null
          dossier_sectie?: string | null
          filiaal?: string | null
          geboekte_kosten?: number | null
          gefactureerd?: number | null
          id?: string
          is_gereed?: boolean
          kosten_split?: Json | null
          omzet_obv_pct?: number | null
          opdrachtgever?: string | null
          pct_gereed?: number | null
          pct_marge?: number | null
          pct_marge_gereed?: number | null
          projectleider?: string | null
          projectnaam?: string | null
          projectnummer: string
          resultaat_gereed?: number | null
          resultaat_obv_pct?: number | null
          snapshot_id: string
          status?: string | null
          totale_opdracht?: number | null
          totale_prognose?: number | null
          verschil_pct_marge?: number | null
          verwacht_resultaat?: number | null
        }
        Update: {
          bouw7_id?: string | null
          categorie?: string | null
          dossier_id?: string | null
          dossier_sectie?: string | null
          filiaal?: string | null
          geboekte_kosten?: number | null
          gefactureerd?: number | null
          id?: string
          is_gereed?: boolean
          kosten_split?: Json | null
          omzet_obv_pct?: number | null
          opdrachtgever?: string | null
          pct_gereed?: number | null
          pct_marge?: number | null
          pct_marge_gereed?: number | null
          projectleider?: string | null
          projectnaam?: string | null
          projectnummer?: string
          resultaat_gereed?: number | null
          resultaat_obv_pct?: number | null
          snapshot_id?: string
          status?: string | null
          totale_opdracht?: number | null
          totale_prognose?: number | null
          verschil_pct_marge?: number | null
          verwacht_resultaat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "management_maand_snapshot_regel_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "management_maand_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      management_ohw: {
        Row: {
          boekjaar: number
          bouw7_id: string
          created_at: string
          filiaal: string | null
          id: string
          omzet_vorig_boekjaar: number
          opmerkingen: string | null
          projectnaam: string | null
          projectnummer: string | null
          resultaat_vorig_boekjaar: number
          updated_at: string
        }
        Insert: {
          boekjaar: number
          bouw7_id: string
          created_at?: string
          filiaal?: string | null
          id?: string
          omzet_vorig_boekjaar?: number
          opmerkingen?: string | null
          projectnaam?: string | null
          projectnummer?: string | null
          resultaat_vorig_boekjaar?: number
          updated_at?: string
        }
        Update: {
          boekjaar?: number
          bouw7_id?: string
          created_at?: string
          filiaal?: string | null
          id?: string
          omzet_vorig_boekjaar?: number
          opmerkingen?: string | null
          projectnaam?: string | null
          projectnummer?: string | null
          resultaat_vorig_boekjaar?: number
          updated_at?: string
        }
        Relationships: []
      }
      management_projecten: {
        Row: {
          arbeid_geboekte_uren: number | null
          arbeid_prognose_uren: number | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_status: string | null
          categorie: string | null
          created_at: string
          dossier_id: string | null
          dossier_sectie: string | null
          filiaal: string | null
          geboekte_kosten: number | null
          gefactureerd: number | null
          id: string
          is_gereed: boolean
          kosten_split: Json | null
          omzet_obv_pct: number | null
          opdrachtgever: string | null
          pct_gereed: number | null
          pct_marge: number | null
          pct_marge_gereed: number | null
          projectleider: string | null
          projectnaam: string
          projectnummer: string
          resultaat_gereed: number | null
          resultaat_obv_pct: number | null
          status: string | null
          totale_opdracht: number | null
          totale_prognose: number | null
          updated_at: string
          verschil_pct_marge: number | null
          verwacht_resultaat: number | null
        }
        Insert: {
          arbeid_geboekte_uren?: number | null
          arbeid_prognose_uren?: number | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string | null
          categorie?: string | null
          created_at?: string
          dossier_id?: string | null
          dossier_sectie?: string | null
          filiaal?: string | null
          geboekte_kosten?: number | null
          gefactureerd?: number | null
          id?: string
          is_gereed?: boolean
          kosten_split?: Json | null
          omzet_obv_pct?: number | null
          opdrachtgever?: string | null
          pct_gereed?: number | null
          pct_marge?: number | null
          pct_marge_gereed?: number | null
          projectleider?: string | null
          projectnaam: string
          projectnummer: string
          resultaat_gereed?: number | null
          resultaat_obv_pct?: number | null
          status?: string | null
          totale_opdracht?: number | null
          totale_prognose?: number | null
          updated_at?: string
          verschil_pct_marge?: number | null
          verwacht_resultaat?: number | null
        }
        Update: {
          arbeid_geboekte_uren?: number | null
          arbeid_prognose_uren?: number | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string | null
          categorie?: string | null
          created_at?: string
          dossier_id?: string | null
          dossier_sectie?: string | null
          filiaal?: string | null
          geboekte_kosten?: number | null
          gefactureerd?: number | null
          id?: string
          is_gereed?: boolean
          kosten_split?: Json | null
          omzet_obv_pct?: number | null
          opdrachtgever?: string | null
          pct_gereed?: number | null
          pct_marge?: number | null
          pct_marge_gereed?: number | null
          projectleider?: string | null
          projectnaam?: string
          projectnummer?: string
          resultaat_gereed?: number | null
          resultaat_obv_pct?: number | null
          status?: string | null
          totale_opdracht?: number | null
          totale_prognose?: number | null
          updated_at?: string
          verschil_pct_marge?: number | null
          verwacht_resultaat?: number | null
        }
        Relationships: []
      }
      materieel_controles: {
        Row: {
          aanwezig: boolean | null
          controle_datum: string
          created_at: string
          foto_url: string | null
          id: string
          object_id: string
          opmerking: string | null
          status: string | null
          uitgevoerd_door: string | null
          werkt_goed: boolean | null
        }
        Insert: {
          aanwezig?: boolean | null
          controle_datum?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          object_id: string
          opmerking?: string | null
          status?: string | null
          uitgevoerd_door?: string | null
          werkt_goed?: boolean | null
        }
        Update: {
          aanwezig?: boolean | null
          controle_datum?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          object_id?: string
          opmerking?: string | null
          status?: string | null
          uitgevoerd_door?: string | null
          werkt_goed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "materieel_controles_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "materieel_objecten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_controles_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_controles_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_controles_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      materieel_documenten: {
        Row: {
          bestandsnaam: string | null
          geupload_at: string
          geupload_door: string | null
          grootte: number | null
          id: string
          mimetype: string | null
          object_id: string
          storage_path: string
          type: Database["public"]["Enums"]["materieel_document_type"]
        }
        Insert: {
          bestandsnaam?: string | null
          geupload_at?: string
          geupload_door?: string | null
          grootte?: number | null
          id?: string
          mimetype?: string | null
          object_id: string
          storage_path: string
          type?: Database["public"]["Enums"]["materieel_document_type"]
        }
        Update: {
          bestandsnaam?: string | null
          geupload_at?: string
          geupload_door?: string | null
          grootte?: number | null
          id?: string
          mimetype?: string | null
          object_id?: string
          storage_path?: string
          type?: Database["public"]["Enums"]["materieel_document_type"]
        }
        Relationships: [
          {
            foreignKeyName: "materieel_documenten_geupload_door_fkey"
            columns: ["geupload_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_documenten_geupload_door_fkey"
            columns: ["geupload_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_documenten_geupload_door_fkey"
            columns: ["geupload_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_documenten_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "materieel_objecten"
            referencedColumns: ["id"]
          },
        ]
      }
      materieel_gebeurtenissen: {
        Row: {
          created_at: string
          door: string | null
          id: string
          naar: string | null
          object_id: string
          omschrijving: string | null
          soort: string
          van: string | null
        }
        Insert: {
          created_at?: string
          door?: string | null
          id?: string
          naar?: string | null
          object_id: string
          omschrijving?: string | null
          soort?: string
          van?: string | null
        }
        Update: {
          created_at?: string
          door?: string | null
          id?: string
          naar?: string | null
          object_id?: string
          omschrijving?: string | null
          soort?: string
          van?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materieel_gebeurtenissen_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_gebeurtenissen_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_gebeurtenissen_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_gebeurtenissen_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "materieel_objecten"
            referencedColumns: ["id"]
          },
        ]
      }
      materieel_instellingen: {
        Row: {
          apk_waarschuwing_dagen: number
          controle_frequentie: string
          controle_moment: string
          garantie_waarschuwing_dagen: number
          id: number
          keuring_soorten: Json
          keuring_waarschuwing_dagen: number
          updated_at: string
        }
        Insert: {
          apk_waarschuwing_dagen?: number
          controle_frequentie?: string
          controle_moment?: string
          garantie_waarschuwing_dagen?: number
          id?: number
          keuring_soorten?: Json
          keuring_waarschuwing_dagen?: number
          updated_at?: string
        }
        Update: {
          apk_waarschuwing_dagen?: number
          controle_frequentie?: string
          controle_moment?: string
          garantie_waarschuwing_dagen?: number
          id?: number
          keuring_soorten?: Json
          keuring_waarschuwing_dagen?: number
          updated_at?: string
        }
        Relationships: []
      }
      materieel_keuringen: {
        Row: {
          bevindingen: string | null
          created_at: string
          document_url: string | null
          geldig_tot: string | null
          geldig_van: string | null
          id: string
          object_id: string
          opmerking: string | null
          soort: string
          uitgevoerd_door: string | null
          uitkomst: string | null
        }
        Insert: {
          bevindingen?: string | null
          created_at?: string
          document_url?: string | null
          geldig_tot?: string | null
          geldig_van?: string | null
          id?: string
          object_id: string
          opmerking?: string | null
          soort: string
          uitgevoerd_door?: string | null
          uitkomst?: string | null
        }
        Update: {
          bevindingen?: string | null
          created_at?: string
          document_url?: string | null
          geldig_tot?: string | null
          geldig_van?: string | null
          id?: string
          object_id?: string
          opmerking?: string | null
          soort?: string
          uitgevoerd_door?: string | null
          uitkomst?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materieel_keuringen_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "materieel_objecten"
            referencedColumns: ["id"]
          },
        ]
      }
      materieel_objecten: {
        Row: {
          aankoopdatum: string | null
          aanschafwaarde: number | null
          actief: boolean
          boekwaarde: number | null
          categorie: Database["public"]["Enums"]["materieel_categorie"]
          created_at: string
          created_by: string | null
          details: Json
          garantie_tot: string | null
          hoofdfoto_path: string | null
          hoort_bij_object_id: string | null
          id: string
          inventarisnummer: string | null
          laatst_gescand_at: string | null
          laatst_gescand_door: string | null
          leverancier: string | null
          merk: string | null
          omschrijving: string
          opmerkingen: string | null
          qr_code: string | null
          serienummer: string | null
          status: Database["public"]["Enums"]["materieel_status"]
          toegewezen_medewerker_id: string | null
          toegewezen_team_id: string | null
          toewijzing_niveau:
            | Database["public"]["Enums"]["materieel_toewijzing_niveau"]
            | null
          type: string | null
          updated_at: string
          vervangingswaarde: number | null
        }
        Insert: {
          aankoopdatum?: string | null
          aanschafwaarde?: number | null
          actief?: boolean
          boekwaarde?: number | null
          categorie: Database["public"]["Enums"]["materieel_categorie"]
          created_at?: string
          created_by?: string | null
          details?: Json
          garantie_tot?: string | null
          hoofdfoto_path?: string | null
          hoort_bij_object_id?: string | null
          id?: string
          inventarisnummer?: string | null
          laatst_gescand_at?: string | null
          laatst_gescand_door?: string | null
          leverancier?: string | null
          merk?: string | null
          omschrijving: string
          opmerkingen?: string | null
          qr_code?: string | null
          serienummer?: string | null
          status?: Database["public"]["Enums"]["materieel_status"]
          toegewezen_medewerker_id?: string | null
          toegewezen_team_id?: string | null
          toewijzing_niveau?:
            | Database["public"]["Enums"]["materieel_toewijzing_niveau"]
            | null
          type?: string | null
          updated_at?: string
          vervangingswaarde?: number | null
        }
        Update: {
          aankoopdatum?: string | null
          aanschafwaarde?: number | null
          actief?: boolean
          boekwaarde?: number | null
          categorie?: Database["public"]["Enums"]["materieel_categorie"]
          created_at?: string
          created_by?: string | null
          details?: Json
          garantie_tot?: string | null
          hoofdfoto_path?: string | null
          hoort_bij_object_id?: string | null
          id?: string
          inventarisnummer?: string | null
          laatst_gescand_at?: string | null
          laatst_gescand_door?: string | null
          leverancier?: string | null
          merk?: string | null
          omschrijving?: string
          opmerkingen?: string | null
          qr_code?: string | null
          serienummer?: string | null
          status?: Database["public"]["Enums"]["materieel_status"]
          toegewezen_medewerker_id?: string | null
          toegewezen_team_id?: string | null
          toewijzing_niveau?:
            | Database["public"]["Enums"]["materieel_toewijzing_niveau"]
            | null
          type?: string | null
          updated_at?: string
          vervangingswaarde?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materieel_objecten_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_objecten_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_objecten_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_objecten_hoort_bij_object_id_fkey"
            columns: ["hoort_bij_object_id"]
            isOneToOne: false
            referencedRelation: "materieel_objecten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_objecten_laatst_gescand_door_fkey"
            columns: ["laatst_gescand_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_objecten_laatst_gescand_door_fkey"
            columns: ["laatst_gescand_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_objecten_laatst_gescand_door_fkey"
            columns: ["laatst_gescand_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_objecten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_objecten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_objecten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_objecten_toegewezen_team_id_fkey"
            columns: ["toegewezen_team_id"]
            isOneToOne: false
            referencedRelation: "materieel_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      materieel_onderhoud: {
        Row: {
          created_at: string
          datum: string
          gemeld_door: string | null
          id: string
          kosten: number | null
          object_id: string
          omschrijving: string | null
          status: string
          type: string
          uitgevoerd_door: string | null
        }
        Insert: {
          created_at?: string
          datum?: string
          gemeld_door?: string | null
          id?: string
          kosten?: number | null
          object_id: string
          omschrijving?: string | null
          status?: string
          type?: string
          uitgevoerd_door?: string | null
        }
        Update: {
          created_at?: string
          datum?: string
          gemeld_door?: string | null
          id?: string
          kosten?: number | null
          object_id?: string
          omschrijving?: string | null
          status?: string
          type?: string
          uitgevoerd_door?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materieel_onderhoud_gemeld_door_fkey"
            columns: ["gemeld_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_onderhoud_gemeld_door_fkey"
            columns: ["gemeld_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_onderhoud_gemeld_door_fkey"
            columns: ["gemeld_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_onderhoud_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "materieel_objecten"
            referencedColumns: ["id"]
          },
        ]
      }
      materieel_scans: {
        Row: {
          context: string | null
          gescand_at: string
          gescand_door: string | null
          id: string
          locatie: string | null
          object_id: string
        }
        Insert: {
          context?: string | null
          gescand_at?: string
          gescand_door?: string | null
          id?: string
          locatie?: string | null
          object_id: string
        }
        Update: {
          context?: string | null
          gescand_at?: string
          gescand_door?: string | null
          id?: string
          locatie?: string | null
          object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materieel_scans_gescand_door_fkey"
            columns: ["gescand_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_scans_gescand_door_fkey"
            columns: ["gescand_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_scans_gescand_door_fkey"
            columns: ["gescand_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_scans_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "materieel_objecten"
            referencedColumns: ["id"]
          },
        ]
      }
      materieel_teams: {
        Row: {
          actief: boolean
          created_at: string
          id: string
          kenteken: string | null
          naam: string
          omschrijving: string | null
          teamleider_id: string | null
          type: Database["public"]["Enums"]["materieel_team_type"]
          updated_at: string
        }
        Insert: {
          actief?: boolean
          created_at?: string
          id?: string
          kenteken?: string | null
          naam: string
          omschrijving?: string | null
          teamleider_id?: string | null
          type?: Database["public"]["Enums"]["materieel_team_type"]
          updated_at?: string
        }
        Update: {
          actief?: boolean
          created_at?: string
          id?: string
          kenteken?: string | null
          naam?: string
          omschrijving?: string | null
          teamleider_id?: string | null
          type?: Database["public"]["Enums"]["materieel_team_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materieel_teams_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_teams_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_teams_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      materieel_toewijzingen: {
        Row: {
          created_at: string
          door: string | null
          id: string
          medewerker_id: string | null
          niveau: Database["public"]["Enums"]["materieel_toewijzing_niveau"]
          object_id: string
          opmerking: string | null
          team_id: string | null
          tot: string | null
          van: string
        }
        Insert: {
          created_at?: string
          door?: string | null
          id?: string
          medewerker_id?: string | null
          niveau: Database["public"]["Enums"]["materieel_toewijzing_niveau"]
          object_id: string
          opmerking?: string | null
          team_id?: string | null
          tot?: string | null
          van?: string
        }
        Update: {
          created_at?: string
          door?: string | null
          id?: string
          medewerker_id?: string | null
          niveau?: Database["public"]["Enums"]["materieel_toewijzing_niveau"]
          object_id?: string
          opmerking?: string | null
          team_id?: string | null
          tot?: string | null
          van?: string
        }
        Relationships: [
          {
            foreignKeyName: "materieel_toewijzingen_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_toewijzingen_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_toewijzingen_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "materieel_toewijzingen_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "materieel_objecten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materieel_toewijzingen_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "materieel_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      medewerker_afdelingen: {
        Row: {
          actief: boolean
          created_at: string | null
          id: string
          naam: string
          standaard_rechten: Json
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string | null
          id?: string
          naam: string
          standaard_rechten?: Json
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string | null
          id?: string
          naam?: string
          standaard_rechten?: Json
          volgorde?: number
        }
        Relationships: []
      }
      medewerker_afwezigheid: {
        Row: {
          bouw7_id: string | null
          bouw7_status: number | null
          bron: string
          created_at: string
          eind_datum: string
          eind_tijd: string | null
          id: string
          medewerker_id: string
          opmerking: string | null
          start_datum: string
          start_tijd: string | null
          type: Database["public"]["Enums"]["medewerker_afwezigheid_type"]
          updated_at: string
        }
        Insert: {
          bouw7_id?: string | null
          bouw7_status?: number | null
          bron?: string
          created_at?: string
          eind_datum: string
          eind_tijd?: string | null
          id?: string
          medewerker_id: string
          opmerking?: string | null
          start_datum: string
          start_tijd?: string | null
          type: Database["public"]["Enums"]["medewerker_afwezigheid_type"]
          updated_at?: string
        }
        Update: {
          bouw7_id?: string | null
          bouw7_status?: number | null
          bron?: string
          created_at?: string
          eind_datum?: string
          eind_tijd?: string | null
          id?: string
          medewerker_id?: string
          opmerking?: string | null
          start_datum?: string
          start_tijd?: string | null
          type?: Database["public"]["Enums"]["medewerker_afwezigheid_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_afwezigheid_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_afwezigheid_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_afwezigheid_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerker_attribuut_definities: {
        Row: {
          actief: boolean
          created_at: string | null
          id: string
          naam: string
          updated_at: string | null
          veldtype: Database["public"]["Enums"]["attribuut_veldtype"]
          verplicht: boolean
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string | null
          id?: string
          naam: string
          updated_at?: string | null
          veldtype?: Database["public"]["Enums"]["attribuut_veldtype"]
          verplicht?: boolean
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string | null
          id?: string
          naam?: string
          updated_at?: string | null
          veldtype?: Database["public"]["Enums"]["attribuut_veldtype"]
          verplicht?: boolean
          volgorde?: number
        }
        Relationships: []
      }
      medewerker_attribuut_waarden: {
        Row: {
          created_at: string | null
          definitie_id: string
          id: string
          medewerker_id: string
          updated_at: string | null
          waarde: string | null
        }
        Insert: {
          created_at?: string | null
          definitie_id: string
          id?: string
          medewerker_id: string
          updated_at?: string | null
          waarde?: string | null
        }
        Update: {
          created_at?: string | null
          definitie_id?: string
          id?: string
          medewerker_id?: string
          updated_at?: string | null
          waarde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_attribuut_waarden_definitie_id_fkey"
            columns: ["definitie_id"]
            isOneToOne: false
            referencedRelation: "medewerker_attribuut_definities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_attribuut_waarden_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_attribuut_waarden_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_attribuut_waarden_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerker_bedrijfsmiddelen: {
        Row: {
          actief: boolean
          created_at: string | null
          id: string
          kenmerken: Json
          medewerker_id: string
          omschrijving: string | null
          retour_op: string | null
          type: Database["public"]["Enums"]["bedrijfsmiddel_type"]
          uitgegeven_op: string | null
          updated_at: string | null
        }
        Insert: {
          actief?: boolean
          created_at?: string | null
          id?: string
          kenmerken?: Json
          medewerker_id: string
          omschrijving?: string | null
          retour_op?: string | null
          type: Database["public"]["Enums"]["bedrijfsmiddel_type"]
          uitgegeven_op?: string | null
          updated_at?: string | null
        }
        Update: {
          actief?: boolean
          created_at?: string | null
          id?: string
          kenmerken?: Json
          medewerker_id?: string
          omschrijving?: string | null
          retour_op?: string | null
          type?: Database["public"]["Enums"]["bedrijfsmiddel_type"]
          uitgegeven_op?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_bedrijfsmiddelen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_bedrijfsmiddelen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_bedrijfsmiddelen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerker_bestanden: {
        Row: {
          bestandstype: string | null
          categorie: Database["public"]["Enums"]["bestand_categorie"]
          created_at: string | null
          geupload_door: string | null
          grootte: number | null
          id: string
          medewerker_id: string
          naam: string
          url: string
        }
        Insert: {
          bestandstype?: string | null
          categorie?: Database["public"]["Enums"]["bestand_categorie"]
          created_at?: string | null
          geupload_door?: string | null
          grootte?: number | null
          id?: string
          medewerker_id: string
          naam: string
          url: string
        }
        Update: {
          bestandstype?: string | null
          categorie?: Database["public"]["Enums"]["bestand_categorie"]
          created_at?: string | null
          geupload_door?: string | null
          grootte?: number | null
          id?: string
          medewerker_id?: string
          naam?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_bestanden_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_bestanden_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_bestanden_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerker_deadline_herberekeningen: {
        Row: {
          aangemaakt_op: string
          foutmelding: string | null
          medewerker_id: string
          status: string
          verwerkt_op: string | null
        }
        Insert: {
          aangemaakt_op?: string
          foutmelding?: string | null
          medewerker_id: string
          status?: string
          verwerkt_op?: string | null
        }
        Update: {
          aangemaakt_op?: string
          foutmelding?: string | null
          medewerker_id?: string
          status?: string
          verwerkt_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_deadline_herberekeningen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: true
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_deadline_herberekeningen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: true
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_deadline_herberekeningen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: true
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerker_functies: {
        Row: {
          actief: boolean
          created_at: string | null
          id: string
          naam: string
          standaard_afdeling_id: string | null
          standaard_rooster: Json | null
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string | null
          id?: string
          naam: string
          standaard_afdeling_id?: string | null
          standaard_rooster?: Json | null
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string | null
          id?: string
          naam?: string
          standaard_afdeling_id?: string | null
          standaard_rooster?: Json | null
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_functies_standaard_afdeling_id_fkey"
            columns: ["standaard_afdeling_id"]
            isOneToOne: false
            referencedRelation: "medewerker_afdelingen"
            referencedColumns: ["id"]
          },
        ]
      }
      medewerker_o365_tokens: {
        Row: {
          access_token: string
          created_at: string
          medewerker_id: string
          refresh_token: string | null
          scopes: string[] | null
          todo_delta_link: string | null
          todo_list_id: string | null
          todo_sync_actief: boolean
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          medewerker_id: string
          refresh_token?: string | null
          scopes?: string[] | null
          todo_delta_link?: string | null
          todo_list_id?: string | null
          todo_sync_actief?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          medewerker_id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          todo_delta_link?: string | null
          todo_list_id?: string | null
          todo_sync_actief?: boolean
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_o365_tokens_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: true
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_o365_tokens_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: true
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_o365_tokens_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: true
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerker_rooster_pauzes: {
        Row: {
          created_at: string | null
          id: string
          pauze_eind: string
          pauze_start: string
          rooster_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          pauze_eind: string
          pauze_start: string
          rooster_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          pauze_eind?: string
          pauze_start?: string
          rooster_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_rooster_pauzes_rooster_id_fkey"
            columns: ["rooster_id"]
            isOneToOne: false
            referencedRelation: "medewerker_roosters"
            referencedColumns: ["id"]
          },
        ]
      }
      medewerker_roosters: {
        Row: {
          contracturen_per_week: number
          created_at: string
          dageind: string
          dagstart: string
          geldig_tot: string | null
          geldig_vanaf: string
          id: string
          medewerker_id: string
          updated_at: string
          werkdagen: number[]
        }
        Insert: {
          contracturen_per_week: number
          created_at?: string
          dageind?: string
          dagstart?: string
          geldig_tot?: string | null
          geldig_vanaf: string
          id?: string
          medewerker_id: string
          updated_at?: string
          werkdagen: number[]
        }
        Update: {
          contracturen_per_week?: number
          created_at?: string
          dageind?: string
          dagstart?: string
          geldig_tot?: string | null
          geldig_vanaf?: string
          id?: string
          medewerker_id?: string
          updated_at?: string
          werkdagen?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_roosters_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_roosters_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_roosters_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerker_skills: {
        Row: {
          created_at: string
          id: string
          medewerker_id: string
          skill_naam: string
        }
        Insert: {
          created_at?: string
          id?: string
          medewerker_id: string
          skill_naam: string
        }
        Update: {
          created_at?: string
          id?: string
          medewerker_id?: string
          skill_naam?: string
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_skills_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_skills_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_skills_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerker_trigger_events: {
        Row: {
          created_at: string
          foutmelding: string | null
          id: string
          medewerker_id: string
          payload: Json
          soort: string
          status: string
          verwerkt_op: string | null
        }
        Insert: {
          created_at?: string
          foutmelding?: string | null
          id?: string
          medewerker_id: string
          payload?: Json
          soort: string
          status?: string
          verwerkt_op?: string | null
        }
        Update: {
          created_at?: string
          foutmelding?: string | null
          id?: string
          medewerker_id?: string
          payload?: Json
          soort?: string
          status?: string
          verwerkt_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medewerker_trigger_events_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerker_trigger_events_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "medewerker_trigger_events_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerkers: {
        Row: {
          achternaam: string
          actief: boolean
          adres_lat: number | null
          adres_lng: number | null
          adres_plaats: string | null
          adres_postcode: string | null
          adres_straat: string | null
          afdeling: string | null
          auth_user_id: string | null
          bouw7_afdeling_voor_inactief_id: number | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_hash: string | null
          bouw7_sync_status: string | null
          bsn: string | null
          cao_document_id: string | null
          cao_schaal: string | null
          cao_trede: string | null
          created_at: string
          email: string | null
          extern: boolean
          foto_url: string | null
          functie: string | null
          geboortedatum: string | null
          gebruiker_type: string
          geocode_op: string | null
          geocode_status: string | null
          handmatige_velden: string[]
          handtekening_url: string | null
          id: string
          in_dienst_vanaf: string | null
          kleur: string | null
          mobiel: string | null
          notificatie_voorkeuren: Json
          o365_email: string | null
          o365_tenant_id: string | null
          o365_user_id: string | null
          ploeg_id: string | null
          rechten_override: Json
          relatie_id: string | null
          standaard_uursoort_id: string | null
          telefoon: string | null
          tussenvoegsel: string | null
          uit_dienst_per: string | null
          updated_at: string
          uurtarief_kostprijs: number | null
          uurtarief_verkoop: number | null
          voorkeuren: Json
          voornaam: string
          werkmaatschappij_id: string | null
        }
        Insert: {
          achternaam: string
          actief?: boolean
          adres_lat?: number | null
          adres_lng?: number | null
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          afdeling?: string | null
          auth_user_id?: string | null
          bouw7_afdeling_voor_inactief_id?: number | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bsn?: string | null
          cao_document_id?: string | null
          cao_schaal?: string | null
          cao_trede?: string | null
          created_at?: string
          email?: string | null
          extern?: boolean
          foto_url?: string | null
          functie?: string | null
          geboortedatum?: string | null
          gebruiker_type?: string
          geocode_op?: string | null
          geocode_status?: string | null
          handmatige_velden?: string[]
          handtekening_url?: string | null
          id?: string
          in_dienst_vanaf?: string | null
          kleur?: string | null
          mobiel?: string | null
          notificatie_voorkeuren?: Json
          o365_email?: string | null
          o365_tenant_id?: string | null
          o365_user_id?: string | null
          ploeg_id?: string | null
          rechten_override?: Json
          relatie_id?: string | null
          standaard_uursoort_id?: string | null
          telefoon?: string | null
          tussenvoegsel?: string | null
          uit_dienst_per?: string | null
          updated_at?: string
          uurtarief_kostprijs?: number | null
          uurtarief_verkoop?: number | null
          voorkeuren?: Json
          voornaam: string
          werkmaatschappij_id?: string | null
        }
        Update: {
          achternaam?: string
          actief?: boolean
          adres_lat?: number | null
          adres_lng?: number | null
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          afdeling?: string | null
          auth_user_id?: string | null
          bouw7_afdeling_voor_inactief_id?: number | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bsn?: string | null
          cao_document_id?: string | null
          cao_schaal?: string | null
          cao_trede?: string | null
          created_at?: string
          email?: string | null
          extern?: boolean
          foto_url?: string | null
          functie?: string | null
          geboortedatum?: string | null
          gebruiker_type?: string
          geocode_op?: string | null
          geocode_status?: string | null
          handmatige_velden?: string[]
          handtekening_url?: string | null
          id?: string
          in_dienst_vanaf?: string | null
          kleur?: string | null
          mobiel?: string | null
          notificatie_voorkeuren?: Json
          o365_email?: string | null
          o365_tenant_id?: string | null
          o365_user_id?: string | null
          ploeg_id?: string | null
          rechten_override?: Json
          relatie_id?: string | null
          standaard_uursoort_id?: string | null
          telefoon?: string | null
          tussenvoegsel?: string | null
          uit_dienst_per?: string | null
          updated_at?: string
          uurtarief_kostprijs?: number | null
          uurtarief_verkoop?: number | null
          voorkeuren?: Json
          voornaam?: string
          werkmaatschappij_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medewerkers_cao_document_id_fkey"
            columns: ["cao_document_id"]
            isOneToOne: false
            referencedRelation: "cao_documenten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerkers_ploeg_id_fkey"
            columns: ["ploeg_id"]
            isOneToOne: false
            referencedRelation: "ploegen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerkers_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerkers_standaard_uursoort_id_fkey"
            columns: ["standaard_uursoort_id"]
            isOneToOne: false
            referencedRelation: "planning_uursoorten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medewerkers_werkmaatschappij_id_fkey"
            columns: ["werkmaatschappij_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsgegevens"
            referencedColumns: ["id"]
          },
        ]
      }
      meerwerk_regels: {
        Row: {
          afgewezen_reden: string | null
          afrekenwijze: string
          bedrag_excl_btw: number | null
          begroot_bedrag: number | null
          besluit_door_id: string | null
          besluit_door_naam: string | null
          besluit_door_soort: string | null
          besluit_ip: string | null
          besluit_op: string | null
          besluit_opmerking: string | null
          bewakingscode: string | null
          bouw7_bron_sleutel: string | null
          bouw7_chapter_id: number | null
          bouw7_line_id: number | null
          bouw7_nummer: string | null
          bouw7_security_code_id: number | null
          bouw7_term_id: number | null
          bouw7_term_pending: boolean
          bron: string
          btw_pct: number | null
          created_at: string
          created_by: string | null
          dossier_id: string
          eenheid: string | null
          eenheidsprijs: number | null
          factuurreferentie: string | null
          hoeveelheid_werkelijk: number | null
          id: string
          in_termijnstaat: boolean
          is_stelpost: boolean
          omschrijving: string
          opdracht_onderdeel_id: string | null
          quote_id: string | null
          status: string
          stelpost_grondslag: string | null
          termijn_wijze: string | null
          updated_at: string
          volgnummer: number
        }
        Insert: {
          afgewezen_reden?: string | null
          afrekenwijze?: string
          bedrag_excl_btw?: number | null
          begroot_bedrag?: number | null
          besluit_door_id?: string | null
          besluit_door_naam?: string | null
          besluit_door_soort?: string | null
          besluit_ip?: string | null
          besluit_op?: string | null
          besluit_opmerking?: string | null
          bewakingscode?: string | null
          bouw7_bron_sleutel?: string | null
          bouw7_chapter_id?: number | null
          bouw7_line_id?: number | null
          bouw7_nummer?: string | null
          bouw7_security_code_id?: number | null
          bouw7_term_id?: number | null
          bouw7_term_pending?: boolean
          bron?: string
          btw_pct?: number | null
          created_at?: string
          created_by?: string | null
          dossier_id: string
          eenheid?: string | null
          eenheidsprijs?: number | null
          factuurreferentie?: string | null
          hoeveelheid_werkelijk?: number | null
          id?: string
          in_termijnstaat?: boolean
          is_stelpost?: boolean
          omschrijving: string
          opdracht_onderdeel_id?: string | null
          quote_id?: string | null
          status?: string
          stelpost_grondslag?: string | null
          termijn_wijze?: string | null
          updated_at?: string
          volgnummer?: number
        }
        Update: {
          afgewezen_reden?: string | null
          afrekenwijze?: string
          bedrag_excl_btw?: number | null
          begroot_bedrag?: number | null
          besluit_door_id?: string | null
          besluit_door_naam?: string | null
          besluit_door_soort?: string | null
          besluit_ip?: string | null
          besluit_op?: string | null
          besluit_opmerking?: string | null
          bewakingscode?: string | null
          bouw7_bron_sleutel?: string | null
          bouw7_chapter_id?: number | null
          bouw7_line_id?: number | null
          bouw7_nummer?: string | null
          bouw7_security_code_id?: number | null
          bouw7_term_id?: number | null
          bouw7_term_pending?: boolean
          bron?: string
          btw_pct?: number | null
          created_at?: string
          created_by?: string | null
          dossier_id?: string
          eenheid?: string | null
          eenheidsprijs?: number | null
          factuurreferentie?: string | null
          hoeveelheid_werkelijk?: number | null
          id?: string
          in_termijnstaat?: boolean
          is_stelpost?: boolean
          omschrijving?: string
          opdracht_onderdeel_id?: string | null
          quote_id?: string | null
          status?: string
          stelpost_grondslag?: string | null
          termijn_wijze?: string | null
          updated_at?: string
          volgnummer?: number
        }
        Relationships: [
          {
            foreignKeyName: "meerwerk_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "meerwerk_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meerwerk_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meerwerk_regels_opdracht_onderdeel_id_fkey"
            columns: ["opdracht_onderdeel_id"]
            isOneToOne: false
            referencedRelation: "opdracht_onderdelen"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaties: {
        Row: {
          aangemaakt_op: string
          body: string | null
          dossier_id: string | null
          dossier_naam: string | null
          gelezen: boolean
          id: string
          titel: string
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          aangemaakt_op?: string
          body?: string | null
          dossier_id?: string | null
          dossier_naam?: string | null
          gelezen?: boolean
          id?: string
          titel: string
          type: string
          url?: string | null
          user_id: string
        }
        Update: {
          aangemaakt_op?: string
          body?: string | null
          dossier_id?: string | null
          dossier_naam?: string | null
          gelezen?: boolean
          id?: string
          titel?: string
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      opdracht_onderdelen: {
        Row: {
          aanneemsom_snapshot: number | null
          bedrag_excl_btw: number | null
          begroot_excl_btw: number | null
          bewakingscode: string | null
          bouw7_chapter_id: number | null
          bouw7_security_code_id: number | null
          bron: string
          btw_pct: number | null
          created_at: string
          created_by: string | null
          dossier_id: string
          eenheid: string | null
          eenheidsprijs: number | null
          grondslag: string | null
          hoeveelheid_werkelijk: number | null
          id: string
          in_aanneemsom: boolean
          in_opdracht: boolean
          omschrijving: string
          opslag_pct: number | null
          quote_id: string | null
          quote_line_id: string | null
          quote_section_id: string | null
          soort: string
          status: string
          updated_at: string
          volgnummer: number
        }
        Insert: {
          aanneemsom_snapshot?: number | null
          bedrag_excl_btw?: number | null
          begroot_excl_btw?: number | null
          bewakingscode?: string | null
          bouw7_chapter_id?: number | null
          bouw7_security_code_id?: number | null
          bron?: string
          btw_pct?: number | null
          created_at?: string
          created_by?: string | null
          dossier_id: string
          eenheid?: string | null
          eenheidsprijs?: number | null
          grondslag?: string | null
          hoeveelheid_werkelijk?: number | null
          id?: string
          in_aanneemsom?: boolean
          in_opdracht?: boolean
          omschrijving: string
          opslag_pct?: number | null
          quote_id?: string | null
          quote_line_id?: string | null
          quote_section_id?: string | null
          soort: string
          status?: string
          updated_at?: string
          volgnummer?: number
        }
        Update: {
          aanneemsom_snapshot?: number | null
          bedrag_excl_btw?: number | null
          begroot_excl_btw?: number | null
          bewakingscode?: string | null
          bouw7_chapter_id?: number | null
          bouw7_security_code_id?: number | null
          bron?: string
          btw_pct?: number | null
          created_at?: string
          created_by?: string | null
          dossier_id?: string
          eenheid?: string | null
          eenheidsprijs?: number | null
          grondslag?: string | null
          hoeveelheid_werkelijk?: number | null
          id?: string
          in_aanneemsom?: boolean
          in_opdracht?: boolean
          omschrijving?: string
          opslag_pct?: number | null
          quote_id?: string | null
          quote_line_id?: string | null
          quote_section_id?: string | null
          soort?: string
          status?: string
          updated_at?: string
          volgnummer?: number
        }
        Relationships: [
          {
            foreignKeyName: "opdracht_onderdelen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "opdracht_onderdelen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opdracht_onderdelen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      oplever_fotos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          punt_id: string
          soort: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          punt_id: string
          soort?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          punt_id?: string
          soort?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "oplever_fotos_punt_id_fkey"
            columns: ["punt_id"]
            isOneToOne: false
            referencedRelation: "oplever_punten"
            referencedColumns: ["id"]
          },
        ]
      }
      oplever_handtekeningen: {
        Row: {
          akkoord_op: string
          created_at: string
          handtekening_url: string | null
          id: string
          ip: string | null
          methode: string
          moment_id: string
          naam: string | null
          rol: string
        }
        Insert: {
          akkoord_op?: string
          created_at?: string
          handtekening_url?: string | null
          id?: string
          ip?: string | null
          methode?: string
          moment_id: string
          naam?: string | null
          rol: string
        }
        Update: {
          akkoord_op?: string
          created_at?: string
          handtekening_url?: string | null
          id?: string
          ip?: string | null
          methode?: string
          moment_id?: string
          naam?: string | null
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "oplever_handtekeningen_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "oplever_momenten"
            referencedColumns: ["id"]
          },
        ]
      }
      oplever_mail_wachtrij: {
        Row: {
          body_html: string
          cc: string[]
          created_at: string
          dossier_id: string
          id: string
          laatste_fout: string | null
          moment_id: string | null
          onderwerp: string
          ontvangers: string[]
          pogingen: number
          relatie_id: string | null
          sleutel: string | null
          soort: string
          status: string
          verzonden_door: string | null
          verzonden_op: string | null
        }
        Insert: {
          body_html: string
          cc?: string[]
          created_at?: string
          dossier_id: string
          id?: string
          laatste_fout?: string | null
          moment_id?: string | null
          onderwerp: string
          ontvangers?: string[]
          pogingen?: number
          relatie_id?: string | null
          sleutel?: string | null
          soort: string
          status?: string
          verzonden_door?: string | null
          verzonden_op?: string | null
        }
        Update: {
          body_html?: string
          cc?: string[]
          created_at?: string
          dossier_id?: string
          id?: string
          laatste_fout?: string | null
          moment_id?: string | null
          onderwerp?: string
          ontvangers?: string[]
          pogingen?: number
          relatie_id?: string | null
          sleutel?: string | null
          soort?: string
          status?: string
          verzonden_door?: string | null
          verzonden_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oplever_mail_wachtrij_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "oplever_mail_wachtrij_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_mail_wachtrij_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_mail_wachtrij_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "oplever_momenten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_mail_wachtrij_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_mail_wachtrij_verzonden_door_fkey"
            columns: ["verzonden_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_mail_wachtrij_verzonden_door_fkey"
            columns: ["verzonden_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "oplever_mail_wachtrij_verzonden_door_fkey"
            columns: ["verzonden_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      oplever_momenten: {
        Row: {
          created_at: string
          created_by: string | null
          dossier_id: string
          id: string
          opgeleverd_op: string | null
          opmerking: string | null
          status: string
          titel: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dossier_id: string
          id?: string
          opgeleverd_op?: string | null
          opmerking?: string | null
          status?: string
          titel: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dossier_id?: string
          id?: string
          opgeleverd_op?: string | null
          opmerking?: string | null
          status?: string
          titel?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oplever_momenten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "oplever_momenten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_momenten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      oplever_punt_reacties: {
        Row: {
          auteur_medewerker_id: string | null
          auteur_naam: string | null
          auteur_type: string
          created_at: string
          foto_urls: string[]
          id: string
          opmerking: string | null
          punt_id: string
          soort: string
        }
        Insert: {
          auteur_medewerker_id?: string | null
          auteur_naam?: string | null
          auteur_type?: string
          created_at?: string
          foto_urls?: string[]
          id?: string
          opmerking?: string | null
          punt_id: string
          soort?: string
        }
        Update: {
          auteur_medewerker_id?: string | null
          auteur_naam?: string | null
          auteur_type?: string
          created_at?: string
          foto_urls?: string[]
          id?: string
          opmerking?: string | null
          punt_id?: string
          soort?: string
        }
        Relationships: [
          {
            foreignKeyName: "oplever_punt_reacties_auteur_medewerker_id_fkey"
            columns: ["auteur_medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_punt_reacties_auteur_medewerker_id_fkey"
            columns: ["auteur_medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "oplever_punt_reacties_auteur_medewerker_id_fkey"
            columns: ["auteur_medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "oplever_punt_reacties_punt_id_fkey"
            columns: ["punt_id"]
            isOneToOne: false
            referencedRelation: "oplever_punten"
            referencedColumns: ["id"]
          },
        ]
      }
      oplever_punten: {
        Row: {
          afgemeld_op: string | null
          bezoek_id: string | null
          bron: string
          bron_index: number | null
          bron_veld_id: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          dossier_id: string
          form_inzending_id: string | null
          geaccepteerd_op: string | null
          geweigerd_reden: string | null
          id: string
          is_extra_werk: boolean
          meerwerk_regel_id: string | null
          melder_naam: string | null
          moment_id: string | null
          omschrijving: string
          ruimte: string | null
          soort: string
          status: string
          toegewezen_medewerker_id: string | null
          toegewezen_relatie_id: string | null
          toegewezen_type: string | null
          updated_at: string
          volgnummer: number
        }
        Insert: {
          afgemeld_op?: string | null
          bezoek_id?: string | null
          bron?: string
          bron_index?: number | null
          bron_veld_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          dossier_id: string
          form_inzending_id?: string | null
          geaccepteerd_op?: string | null
          geweigerd_reden?: string | null
          id?: string
          is_extra_werk?: boolean
          meerwerk_regel_id?: string | null
          melder_naam?: string | null
          moment_id?: string | null
          omschrijving: string
          ruimte?: string | null
          soort?: string
          status?: string
          toegewezen_medewerker_id?: string | null
          toegewezen_relatie_id?: string | null
          toegewezen_type?: string | null
          updated_at?: string
          volgnummer?: number
        }
        Update: {
          afgemeld_op?: string | null
          bezoek_id?: string | null
          bron?: string
          bron_index?: number | null
          bron_veld_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          dossier_id?: string
          form_inzending_id?: string | null
          geaccepteerd_op?: string | null
          geweigerd_reden?: string | null
          id?: string
          is_extra_werk?: boolean
          meerwerk_regel_id?: string | null
          melder_naam?: string | null
          moment_id?: string | null
          omschrijving?: string
          ruimte?: string | null
          soort?: string
          status?: string
          toegewezen_medewerker_id?: string | null
          toegewezen_relatie_id?: string | null
          toegewezen_type?: string | null
          updated_at?: string
          volgnummer?: number
        }
        Relationships: [
          {
            foreignKeyName: "oplever_punten_bezoek_id_fkey"
            columns: ["bezoek_id"]
            isOneToOne: false
            referencedRelation: "projectbezoeken"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_punten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "oplever_punten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_punten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_punten_form_inzending_id_fkey"
            columns: ["form_inzending_id"]
            isOneToOne: false
            referencedRelation: "form_inzendingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_punten_meerwerk_regel_id_fkey"
            columns: ["meerwerk_regel_id"]
            isOneToOne: false
            referencedRelation: "meerwerk_regels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_punten_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "oplever_momenten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_punten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_punten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "oplever_punten_toegewezen_medewerker_id_fkey"
            columns: ["toegewezen_medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "oplever_punten_toegewezen_relatie_id_fkey"
            columns: ["toegewezen_relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      oplever_toegang_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          dossier_id: string
          form_template_id: string | null
          gebruikt_op: string | null
          id: string
          moment_id: string | null
          omschrijving: string | null
          relatie_id: string | null
          scope: string
          token_hash: string
          token_raw: string | null
          verloopt_op: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dossier_id: string
          form_template_id?: string | null
          gebruikt_op?: string | null
          id?: string
          moment_id?: string | null
          omschrijving?: string | null
          relatie_id?: string | null
          scope: string
          token_hash: string
          token_raw?: string | null
          verloopt_op?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dossier_id?: string
          form_template_id?: string | null
          gebruikt_op?: string | null
          id?: string
          moment_id?: string | null
          omschrijving?: string | null
          relatie_id?: string | null
          scope?: string
          token_hash?: string
          token_raw?: string | null
          verloopt_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oplever_toegang_tokens_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "oplever_toegang_tokens_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_toegang_tokens_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_toegang_tokens_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "oplever_momenten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oplever_toegang_tokens_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      opname_fotos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_hoofdfoto: boolean
          omschrijving: string | null
          opname_id: string
          pad: string
          regel_id: string | null
          soort: string
          url: string
          volgorde: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_hoofdfoto?: boolean
          omschrijving?: string | null
          opname_id: string
          pad: string
          regel_id?: string | null
          soort?: string
          url: string
          volgorde?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_hoofdfoto?: boolean
          omschrijving?: string | null
          opname_id?: string
          pad?: string
          regel_id?: string | null
          soort?: string
          url?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "opname_fotos_opname_id_fkey"
            columns: ["opname_id"]
            isOneToOne: false
            referencedRelation: "opnames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opname_fotos_regel_id_fkey"
            columns: ["regel_id"]
            isOneToOne: false
            referencedRelation: "opname_regels"
            referencedColumns: ["id"]
          },
        ]
      }
      opname_onderdelen: {
        Row: {
          aantal_stap: number
          actief: boolean
          btw_pct: number | null
          btw_tarief_id: string | null
          code: string
          created_at: string
          eenheid: string
          foto_verplicht: boolean
          hoofdgroep: string | null
          id: string
          kostengroep: string | null
          kostprijs_pe: number | null
          omschrijving: string
          opslag_pct: number | null
          paint_item_id: string | null
          prijs_soort: string
          prijslijst_id: string
          standaard_aantal: number
          subgroep: string | null
          toelichting: string | null
          toelichting_verplicht: boolean
          updated_at: string
          uren_pe: number | null
          verkoop_pe: number | null
          volgorde: number
        }
        Insert: {
          aantal_stap?: number
          actief?: boolean
          btw_pct?: number | null
          btw_tarief_id?: string | null
          code: string
          created_at?: string
          eenheid?: string
          foto_verplicht?: boolean
          hoofdgroep?: string | null
          id?: string
          kostengroep?: string | null
          kostprijs_pe?: number | null
          omschrijving: string
          opslag_pct?: number | null
          paint_item_id?: string | null
          prijs_soort: string
          prijslijst_id: string
          standaard_aantal?: number
          subgroep?: string | null
          toelichting?: string | null
          toelichting_verplicht?: boolean
          updated_at?: string
          uren_pe?: number | null
          verkoop_pe?: number | null
          volgorde?: number
        }
        Update: {
          aantal_stap?: number
          actief?: boolean
          btw_pct?: number | null
          btw_tarief_id?: string | null
          code?: string
          created_at?: string
          eenheid?: string
          foto_verplicht?: boolean
          hoofdgroep?: string | null
          id?: string
          kostengroep?: string | null
          kostprijs_pe?: number | null
          omschrijving?: string
          opslag_pct?: number | null
          paint_item_id?: string | null
          prijs_soort?: string
          prijslijst_id?: string
          standaard_aantal?: number
          subgroep?: string | null
          toelichting?: string | null
          toelichting_verplicht?: boolean
          updated_at?: string
          uren_pe?: number | null
          verkoop_pe?: number | null
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "opname_onderdelen_btw_tarief_id_fkey"
            columns: ["btw_tarief_id"]
            isOneToOne: false
            referencedRelation: "btw_tarieven"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opname_onderdelen_paint_item_id_fkey"
            columns: ["paint_item_id"]
            isOneToOne: false
            referencedRelation: "paint_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opname_onderdelen_prijslijst_id_fkey"
            columns: ["prijslijst_id"]
            isOneToOne: false
            referencedRelation: "opname_prijslijsten"
            referencedColumns: ["id"]
          },
        ]
      }
      opname_prijslijsten: {
        Row: {
          bron_bestand: string | null
          btw_tarief_id: string | null
          created_at: string
          created_by: string | null
          geldig_tot: string | null
          geldig_vanaf: string | null
          id: string
          jaargang: string | null
          naam: string
          relatie_id: string
          standaard_opslag_pct: number
          status: string
          updated_at: string
          uurtarief_kostprijs: number | null
        }
        Insert: {
          bron_bestand?: string | null
          btw_tarief_id?: string | null
          created_at?: string
          created_by?: string | null
          geldig_tot?: string | null
          geldig_vanaf?: string | null
          id?: string
          jaargang?: string | null
          naam: string
          relatie_id: string
          standaard_opslag_pct?: number
          status?: string
          updated_at?: string
          uurtarief_kostprijs?: number | null
        }
        Update: {
          bron_bestand?: string | null
          btw_tarief_id?: string | null
          created_at?: string
          created_by?: string | null
          geldig_tot?: string | null
          geldig_vanaf?: string | null
          id?: string
          jaargang?: string | null
          naam?: string
          relatie_id?: string
          standaard_opslag_pct?: number
          status?: string
          updated_at?: string
          uurtarief_kostprijs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opname_prijslijsten_btw_tarief_id_fkey"
            columns: ["btw_tarief_id"]
            isOneToOne: false
            referencedRelation: "btw_tarieven"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opname_prijslijsten_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      opname_regels: {
        Row: {
          aantal: number
          btw_pct: number | null
          btw_tarief_id: string | null
          client_bijgewerkt_op: string | null
          created_at: string
          created_by: string | null
          eenheid: string
          id: string
          kostengroep: string | null
          kostprijs_pe: number | null
          normen: Json
          omschrijving: string
          onderdeel_code: string | null
          onderdeel_id: string | null
          opname_id: string
          opslag_pct: number | null
          prijs_soort: string
          regel_kostprijs_totaal: number | null
          regel_verkoop_totaal: number | null
          ruimte: string | null
          ruimte_id: string | null
          toelichting_opnemer: string | null
          updated_at: string
          uren_pe: number | null
          verkoop_pe: number | null
          volgorde: number
        }
        Insert: {
          aantal?: number
          btw_pct?: number | null
          btw_tarief_id?: string | null
          client_bijgewerkt_op?: string | null
          created_at?: string
          created_by?: string | null
          eenheid?: string
          id: string
          kostengroep?: string | null
          kostprijs_pe?: number | null
          normen?: Json
          omschrijving: string
          onderdeel_code?: string | null
          onderdeel_id?: string | null
          opname_id: string
          opslag_pct?: number | null
          prijs_soort?: string
          regel_kostprijs_totaal?: number | null
          regel_verkoop_totaal?: number | null
          ruimte?: string | null
          ruimte_id?: string | null
          toelichting_opnemer?: string | null
          updated_at?: string
          uren_pe?: number | null
          verkoop_pe?: number | null
          volgorde?: number
        }
        Update: {
          aantal?: number
          btw_pct?: number | null
          btw_tarief_id?: string | null
          client_bijgewerkt_op?: string | null
          created_at?: string
          created_by?: string | null
          eenheid?: string
          id?: string
          kostengroep?: string | null
          kostprijs_pe?: number | null
          normen?: Json
          omschrijving?: string
          onderdeel_code?: string | null
          onderdeel_id?: string | null
          opname_id?: string
          opslag_pct?: number | null
          prijs_soort?: string
          regel_kostprijs_totaal?: number | null
          regel_verkoop_totaal?: number | null
          ruimte?: string | null
          ruimte_id?: string | null
          toelichting_opnemer?: string | null
          updated_at?: string
          uren_pe?: number | null
          verkoop_pe?: number | null
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "opname_regels_btw_tarief_id_fkey"
            columns: ["btw_tarief_id"]
            isOneToOne: false
            referencedRelation: "btw_tarieven"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opname_regels_onderdeel_id_fkey"
            columns: ["onderdeel_id"]
            isOneToOne: false
            referencedRelation: "opname_onderdelen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opname_regels_opname_id_fkey"
            columns: ["opname_id"]
            isOneToOne: false
            referencedRelation: "opnames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opname_regels_ruimte_id_fkey"
            columns: ["ruimte_id"]
            isOneToOne: false
            referencedRelation: "opname_ruimtes"
            referencedColumns: ["id"]
          },
        ]
      }
      opname_ruimtes: {
        Row: {
          actief: boolean
          created_at: string
          id: string
          naam: string
          prijslijst_id: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string
          id?: string
          naam: string
          prijslijst_id: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string
          id?: string
          naam?: string
          prijslijst_id?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "opname_ruimtes_prijslijst_id_fkey"
            columns: ["prijslijst_id"]
            isOneToOne: false
            referencedRelation: "opname_prijslijsten"
            referencedColumns: ["id"]
          },
        ]
      }
      opnames: {
        Row: {
          adres_vrij: string | null
          calculatie_groep_id: string | null
          calculatie_project_id: string | null
          calculatie_scenario_id: string | null
          created_at: string
          created_by: string | null
          datum: string
          dossier_id: string
          gereed_door: string | null
          gereed_op: string | null
          id: string
          omgezet_door: string | null
          omgezet_op: string | null
          opmerking: string | null
          opnamenummer: string
          opnemer_id: string | null
          prijslijst_id: string | null
          relatie_id: string | null
          soort: string
          status: string
          task_id: string | null
          updated_at: string
          vhe_aanduiding: string | null
        }
        Insert: {
          adres_vrij?: string | null
          calculatie_groep_id?: string | null
          calculatie_project_id?: string | null
          calculatie_scenario_id?: string | null
          created_at?: string
          created_by?: string | null
          datum?: string
          dossier_id: string
          gereed_door?: string | null
          gereed_op?: string | null
          id?: string
          omgezet_door?: string | null
          omgezet_op?: string | null
          opmerking?: string | null
          opnamenummer?: string
          opnemer_id?: string | null
          prijslijst_id?: string | null
          relatie_id?: string | null
          soort?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          vhe_aanduiding?: string | null
        }
        Update: {
          adres_vrij?: string | null
          calculatie_groep_id?: string | null
          calculatie_project_id?: string | null
          calculatie_scenario_id?: string | null
          created_at?: string
          created_by?: string | null
          datum?: string
          dossier_id?: string
          gereed_door?: string | null
          gereed_op?: string | null
          id?: string
          omgezet_door?: string | null
          omgezet_op?: string | null
          opmerking?: string | null
          opnamenummer?: string
          opnemer_id?: string | null
          prijslijst_id?: string | null
          relatie_id?: string | null
          soort?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          vhe_aanduiding?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opnames_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "opnames_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opnames_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opnames_gereed_door_fkey"
            columns: ["gereed_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opnames_gereed_door_fkey"
            columns: ["gereed_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "opnames_gereed_door_fkey"
            columns: ["gereed_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "opnames_omgezet_door_fkey"
            columns: ["omgezet_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opnames_omgezet_door_fkey"
            columns: ["omgezet_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "opnames_omgezet_door_fkey"
            columns: ["omgezet_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "opnames_opnemer_id_fkey"
            columns: ["opnemer_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opnames_opnemer_id_fkey"
            columns: ["opnemer_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "opnames_opnemer_id_fkey"
            columns: ["opnemer_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "opnames_prijslijst_id_fkey"
            columns: ["prijslijst_id"]
            isOneToOne: false
            referencedRelation: "opname_prijslijsten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opnames_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opnames_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      paint_items: {
        Row: {
          active: boolean
          behandeling_code: string | null
          btw_tarief: string
          default_unit: string | null
          description: string | null
          family_id: string
          full_name: string
          groep: string | null
          id: string
          item_code: string
          marge_pct: number | null
          onderdeel: string
          schilder_behandeling_id: string | null
          schilder_combinatie_id: string | null
          source: string | null
          treatment_id: string
          type: string
          vergrendeld: boolean
        }
        Insert: {
          active?: boolean
          behandeling_code?: string | null
          btw_tarief?: string
          default_unit?: string | null
          description?: string | null
          family_id: string
          full_name: string
          groep?: string | null
          id?: string
          item_code: string
          marge_pct?: number | null
          onderdeel: string
          schilder_behandeling_id?: string | null
          schilder_combinatie_id?: string | null
          source?: string | null
          treatment_id: string
          type: string
          vergrendeld?: boolean
        }
        Update: {
          active?: boolean
          behandeling_code?: string | null
          btw_tarief?: string
          default_unit?: string | null
          description?: string | null
          family_id?: string
          full_name?: string
          groep?: string | null
          id?: string
          item_code?: string
          marge_pct?: number | null
          onderdeel?: string
          schilder_behandeling_id?: string | null
          schilder_combinatie_id?: string | null
          source?: string | null
          treatment_id?: string
          type?: string
          vergrendeld?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "paint_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "paint_system_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_items_schilder_behandeling_id_fkey"
            columns: ["schilder_behandeling_id"]
            isOneToOne: false
            referencedRelation: "schilder_behandelingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_items_schilder_combinatie_id_fkey"
            columns: ["schilder_combinatie_id"]
            isOneToOne: false
            referencedRelation: "schilder_combinaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "paint_treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      paint_labor_norms: {
        Row: {
          active: boolean
          cost_per_unit: number | null
          description: string | null
          hour_rate: number | null
          hours_per_unit: number | null
          id: string
          item_id: string
          source_code: string
          treatment_id: string
          unit: string | null
          uurtarief_label: string | null
        }
        Insert: {
          active?: boolean
          cost_per_unit?: number | null
          description?: string | null
          hour_rate?: number | null
          hours_per_unit?: number | null
          id?: string
          item_id: string
          source_code: string
          treatment_id: string
          unit?: string | null
          uurtarief_label?: string | null
        }
        Update: {
          active?: boolean
          cost_per_unit?: number | null
          description?: string | null
          hour_rate?: number | null
          hours_per_unit?: number | null
          id?: string
          item_id?: string
          source_code?: string
          treatment_id?: string
          unit?: string | null
          uurtarief_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paint_labor_norms_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "paint_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_labor_norms_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "paint_treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      paint_material_norms: {
        Row: {
          active: boolean
          cost_per_unit: number | null
          id: string
          item_id: string
          material_code: string | null
          material_name: string
          norm_type: string
          quantity_per_unit: number | null
          source_code: string
          treatment_id: string
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          active?: boolean
          cost_per_unit?: number | null
          id?: string
          item_id: string
          material_code?: string | null
          material_name: string
          norm_type?: string
          quantity_per_unit?: number | null
          source_code: string
          treatment_id: string
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          active?: boolean
          cost_per_unit?: number | null
          id?: string
          item_id?: string
          material_code?: string | null
          material_name?: string
          norm_type?: string
          quantity_per_unit?: number | null
          source_code?: string
          treatment_id?: string
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "paint_material_norms_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "paint_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_material_norms_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "paint_treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      paint_measurement_aggregates: {
        Row: {
          aggregate_key: string
          behandeling: string
          calculation_line_id: string | null
          created_at: string
          equipment_cost: number
          group_id: string
          id: string
          item_id: string | null
          labor_cost: number
          labor_hours: number
          labor_rate: number
          material_cost: number
          measurement_id: string
          onderdeel: string
          project_id: string
          quantity: number
          subcontract_cost: number
          treatment_id: string | null
          type: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          aggregate_key: string
          behandeling: string
          calculation_line_id?: string | null
          created_at?: string
          equipment_cost?: number
          group_id: string
          id?: string
          item_id?: string | null
          labor_cost?: number
          labor_hours?: number
          labor_rate?: number
          material_cost?: number
          measurement_id: string
          onderdeel: string
          project_id: string
          quantity?: number
          subcontract_cost?: number
          treatment_id?: string | null
          type: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          aggregate_key?: string
          behandeling?: string
          calculation_line_id?: string | null
          created_at?: string
          equipment_cost?: number
          group_id?: string
          id?: string
          item_id?: string | null
          labor_cost?: number
          labor_hours?: number
          labor_rate?: number
          material_cost?: number
          measurement_id?: string
          onderdeel?: string
          project_id?: string
          quantity?: number
          subcontract_cost?: number
          treatment_id?: string | null
          type?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paint_measurement_aggregates_calculation_line_id_fkey"
            columns: ["calculation_line_id"]
            isOneToOne: false
            referencedRelation: "calculation_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "calculation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vw_group_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "paint_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "paint_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "paint_treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      paint_measurement_lines: {
        Row: {
          behandeling: string
          code: string | null
          count: number
          created_at: string
          description: string | null
          group_id: string
          height_mm: number | null
          id: string
          is_draft: boolean
          item_id: string | null
          length_mm: number | null
          line_no: number
          measurement_id: string
          onderdeel: string
          project_id: string
          quantity: number
          remarks: string | null
          specification: string | null
          treatment_code: string | null
          treatment_id: string | null
          type: string
          type_code: string | null
          unit: string
          updated_at: string
          width_mm: number | null
        }
        Insert: {
          behandeling: string
          code?: string | null
          count?: number
          created_at?: string
          description?: string | null
          group_id: string
          height_mm?: number | null
          id?: string
          is_draft?: boolean
          item_id?: string | null
          length_mm?: number | null
          line_no?: number
          measurement_id: string
          onderdeel: string
          project_id: string
          quantity?: number
          remarks?: string | null
          specification?: string | null
          treatment_code?: string | null
          treatment_id?: string | null
          type: string
          type_code?: string | null
          unit: string
          updated_at?: string
          width_mm?: number | null
        }
        Update: {
          behandeling?: string
          code?: string | null
          count?: number
          created_at?: string
          description?: string | null
          group_id?: string
          height_mm?: number | null
          id?: string
          is_draft?: boolean
          item_id?: string | null
          length_mm?: number | null
          line_no?: number
          measurement_id?: string
          onderdeel?: string
          project_id?: string
          quantity?: number
          remarks?: string | null
          specification?: string | null
          treatment_code?: string | null
          treatment_id?: string | null
          type?: string
          type_code?: string | null
          unit?: string
          updated_at?: string
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "paint_measurement_lines_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "calculation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_lines_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vw_group_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "paint_measurement_lines_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "paint_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      paint_measurements: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paint_measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      paint_system_families: {
        Row: {
          active: boolean
          created_at: string
          family_code: string
          id: string
          name: string
          source: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          family_code: string
          id?: string
          name: string
          source?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          family_code?: string
          id?: string
          name?: string
          source?: string | null
        }
        Relationships: []
      }
      paint_treatments: {
        Row: {
          active: boolean
          family_id: string
          id: string
          name: string
          source: string | null
          treatment_code: string
          treatment_index_code: string
        }
        Insert: {
          active?: boolean
          family_id: string
          id?: string
          name: string
          source?: string | null
          treatment_code: string
          treatment_index_code: string
        }
        Update: {
          active?: boolean
          family_id?: string
          id?: string
          name?: string
          source?: string | null
          treatment_code?: string
          treatment_index_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "paint_treatments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "paint_system_families"
            referencedColumns: ["id"]
          },
        ]
      }
      parkeer_toewijzing_instellingen: {
        Row: {
          created_at: string
          id: boolean
          min_bedrag: number
          min_marge_zeker: number
          min_score_zeker: number
          rit_venster_na_min: number
          rit_venster_voor_min: number
          startdatum: string
          straal_dichtbij_m: number
          straal_nabij_m: number
          straal_ruim_m: number
          updated_at: string
          venster_dagen: number
        }
        Insert: {
          created_at?: string
          id?: boolean
          min_bedrag?: number
          min_marge_zeker?: number
          min_score_zeker?: number
          rit_venster_na_min?: number
          rit_venster_voor_min?: number
          startdatum?: string
          straal_dichtbij_m?: number
          straal_nabij_m?: number
          straal_ruim_m?: number
          updated_at?: string
          venster_dagen?: number
        }
        Update: {
          created_at?: string
          id?: boolean
          min_bedrag?: number
          min_marge_zeker?: number
          min_score_zeker?: number
          rit_venster_na_min?: number
          rit_venster_voor_min?: number
          startdatum?: string
          straal_dichtbij_m?: number
          straal_nabij_m?: number
          straal_ruim_m?: number
          updated_at?: string
          venster_dagen?: number
        }
        Relationships: []
      }
      parkeer_toewijzingen: {
        Row: {
          aandeel: number
          bedrag: number
          bevestigd_door: string | null
          bevestigd_op: string | null
          bevestiging_bron: string | null
          bewakingscode: string | null
          bouw7_fout: string | null
          bouw7_psl_id: number | null
          bouw7_status: string
          bouw7_ticket_id: number | null
          created_at: string
          datum: string
          dossier_id: string | null
          id: string
          laatste_run_op: string
          medewerker_id: string | null
          parking_id: string
          score: number
          signalen: Json
          status: string
          toelichting: string | null
          trip_id: string | null
          ulu_user_id: number | null
          updated_at: string
          zekerheid: string
        }
        Insert: {
          aandeel?: number
          bedrag?: number
          bevestigd_door?: string | null
          bevestigd_op?: string | null
          bevestiging_bron?: string | null
          bewakingscode?: string | null
          bouw7_fout?: string | null
          bouw7_psl_id?: number | null
          bouw7_status?: string
          bouw7_ticket_id?: number | null
          created_at?: string
          datum: string
          dossier_id?: string | null
          id?: string
          laatste_run_op?: string
          medewerker_id?: string | null
          parking_id: string
          score?: number
          signalen?: Json
          status?: string
          toelichting?: string | null
          trip_id?: string | null
          ulu_user_id?: number | null
          updated_at?: string
          zekerheid?: string
        }
        Update: {
          aandeel?: number
          bedrag?: number
          bevestigd_door?: string | null
          bevestigd_op?: string | null
          bevestiging_bron?: string | null
          bewakingscode?: string | null
          bouw7_fout?: string | null
          bouw7_psl_id?: number | null
          bouw7_status?: string
          bouw7_ticket_id?: number | null
          created_at?: string
          datum?: string
          dossier_id?: string | null
          id?: string
          laatste_run_op?: string
          medewerker_id?: string | null
          parking_id?: string
          score?: number
          signalen?: Json
          status?: string
          toelichting?: string | null
          trip_id?: string | null
          ulu_user_id?: number | null
          updated_at?: string
          zekerheid?: string
        }
        Relationships: [
          {
            foreignKeyName: "parkeer_toewijzingen_bevestigd_door_fkey"
            columns: ["bevestigd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_bevestigd_door_fkey"
            columns: ["bevestigd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_bevestigd_door_fkey"
            columns: ["bevestigd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_parking_id_fkey"
            columns: ["parking_id"]
            isOneToOne: false
            referencedRelation: "ulu_parking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_parking_id_fkey"
            columns: ["parking_id"]
            isOneToOne: false
            referencedRelation: "v_parkeer_toewijzing_controle"
            referencedColumns: ["parking_id"]
          },
          {
            foreignKeyName: "parkeer_toewijzingen_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "ulu_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      particulieren: {
        Row: {
          achternaam: string
          actief: boolean
          adres_land: string | null
          adres_plaats: string | null
          adres_postcode: string | null
          adres_straat: string | null
          bouw7_id: string | null
          bouw7_sync_status: string | null
          created_at: string
          created_by: string | null
          email: string | null
          geboortedatum: string | null
          id: string
          mobiel: string | null
          opmerkingen: string | null
          telefoon: string | null
          tussenvoegsel: string | null
          updated_at: string
          voornaam: string
        }
        Insert: {
          achternaam: string
          actief?: boolean
          adres_land?: string | null
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          bouw7_id?: string | null
          bouw7_sync_status?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          geboortedatum?: string | null
          id?: string
          mobiel?: string | null
          opmerkingen?: string | null
          telefoon?: string | null
          tussenvoegsel?: string | null
          updated_at?: string
          voornaam: string
        }
        Update: {
          achternaam?: string
          actief?: boolean
          adres_land?: string | null
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          bouw7_id?: string | null
          bouw7_sync_status?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          geboortedatum?: string | null
          id?: string
          mobiel?: string | null
          opmerkingen?: string | null
          telefoon?: string | null
          tussenvoegsel?: string | null
          updated_at?: string
          voornaam?: string
        }
        Relationships: []
      }
      planning_activiteit_afhankelijkheden: {
        Row: {
          created_at: string
          id: string
          naar_activiteit_id: string
          type: Database["public"]["Enums"]["afhankelijkheids_type"]
          van_activiteit_id: string
          vertraging_dagen: number
        }
        Insert: {
          created_at?: string
          id?: string
          naar_activiteit_id: string
          type?: Database["public"]["Enums"]["afhankelijkheids_type"]
          van_activiteit_id: string
          vertraging_dagen?: number
        }
        Update: {
          created_at?: string
          id?: string
          naar_activiteit_id?: string
          type?: Database["public"]["Enums"]["afhankelijkheids_type"]
          van_activiteit_id?: string
          vertraging_dagen?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_activiteit_afhankelijkheden_naar_activiteit_id_fkey"
            columns: ["naar_activiteit_id"]
            isOneToOne: false
            referencedRelation: "planning_activiteiten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_activiteit_afhankelijkheden_van_activiteit_id_fkey"
            columns: ["van_activiteit_id"]
            isOneToOne: false
            referencedRelation: "planning_activiteiten"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_activiteiten: {
        Row: {
          benodigde_skills: string[]
          bewakingscode: string | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_security_code_id: number | null
          bron: string
          created_at: string
          deadline: string | null
          dossier_id: string
          fase_id: string | null
          geschatte_uren: number | null
          gewenste_start: string | null
          id: string
          locatie_adres: string | null
          omschrijving: string | null
          onderaannemer_id: string | null
          status: Database["public"]["Enums"]["planning_activiteit_status"]
          titel: string
          updated_at: string
          uursoort_id: string | null
          volgorde: number
        }
        Insert: {
          benodigde_skills?: string[]
          bewakingscode?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_security_code_id?: number | null
          bron?: string
          created_at?: string
          deadline?: string | null
          dossier_id: string
          fase_id?: string | null
          geschatte_uren?: number | null
          gewenste_start?: string | null
          id?: string
          locatie_adres?: string | null
          omschrijving?: string | null
          onderaannemer_id?: string | null
          status?: Database["public"]["Enums"]["planning_activiteit_status"]
          titel: string
          updated_at?: string
          uursoort_id?: string | null
          volgorde?: number
        }
        Update: {
          benodigde_skills?: string[]
          bewakingscode?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_security_code_id?: number | null
          bron?: string
          created_at?: string
          deadline?: string | null
          dossier_id?: string
          fase_id?: string | null
          geschatte_uren?: number | null
          gewenste_start?: string | null
          id?: string
          locatie_adres?: string | null
          omschrijving?: string | null
          onderaannemer_id?: string | null
          status?: Database["public"]["Enums"]["planning_activiteit_status"]
          titel?: string
          updated_at?: string
          uursoort_id?: string | null
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_activiteiten_fase_id_fkey"
            columns: ["fase_id"]
            isOneToOne: false
            referencedRelation: "planning_fasen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_activiteiten_onderaannemer_id_fkey"
            columns: ["onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_taken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "planning_taken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_taken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_taken_uursoort_id_fkey"
            columns: ["uursoort_id"]
            isOneToOne: false
            referencedRelation: "planning_uursoorten"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_fasen: {
        Row: {
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bron: string
          created_at: string
          dossier_id: string
          id: string
          naam: string
          updated_at: string
          volgorde: number
        }
        Insert: {
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bron?: string
          created_at?: string
          dossier_id: string
          id?: string
          naam: string
          updated_at?: string
          volgorde?: number
        }
        Update: {
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bron?: string
          created_at?: string
          dossier_id?: string
          id?: string
          naam?: string
          updated_at?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_fasen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "planning_fasen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_fasen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_items: {
        Row: {
          activiteit_id: string
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_write_pending: boolean
          bron: string
          created_at: string
          eind_dt: string
          id: string
          medewerker_id: string
          overrule: boolean
          overrule_door: string | null
          overrule_reden: string | null
          start_dt: string
          updated_at: string
          uren: number
        }
        Insert: {
          activiteit_id: string
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_write_pending?: boolean
          bron?: string
          created_at?: string
          eind_dt: string
          id?: string
          medewerker_id: string
          overrule?: boolean
          overrule_door?: string | null
          overrule_reden?: string | null
          start_dt: string
          updated_at?: string
          uren: number
        }
        Update: {
          activiteit_id?: string
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_write_pending?: boolean
          bron?: string
          created_at?: string
          eind_dt?: string
          id?: string
          medewerker_id?: string
          overrule?: boolean
          overrule_door?: string | null
          overrule_reden?: string | null
          start_dt?: string
          updated_at?: string
          uren?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_entries_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_entries_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "planning_entries_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "planning_entries_taak_id_fkey"
            columns: ["activiteit_id"]
            isOneToOne: false
            referencedRelation: "planning_activiteiten"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_uursoorten: {
        Row: {
          actief: boolean
          bouw7_id: string | null
          bouw7_naam: string | null
          bron: string
          code: string
          created_at: string
          everts_calc_omschrijvingen: string[]
          id: string
          kleur: string
          naam: string
          tarief_kostprijs: number | null
          tarief_verkoop: number | null
          updated_at: string
          uren_categorie: string | null
          volgorde: number
        }
        Insert: {
          actief?: boolean
          bouw7_id?: string | null
          bouw7_naam?: string | null
          bron?: string
          code: string
          created_at?: string
          everts_calc_omschrijvingen?: string[]
          id?: string
          kleur?: string
          naam: string
          tarief_kostprijs?: number | null
          tarief_verkoop?: number | null
          updated_at?: string
          uren_categorie?: string | null
          volgorde?: number
        }
        Update: {
          actief?: boolean
          bouw7_id?: string | null
          bouw7_naam?: string | null
          bron?: string
          code?: string
          created_at?: string
          everts_calc_omschrijvingen?: string[]
          id?: string
          kleur?: string
          naam?: string
          tarief_kostprijs?: number | null
          tarief_verkoop?: number | null
          updated_at?: string
          uren_categorie?: string | null
          volgorde?: number
        }
        Relationships: []
      }
      planning_werkbegroting_regels: {
        Row: {
          begrote_uren: number
          created_at: string
          dossier_id: string
          id: string
          updated_at: string
          uursoort_id: string
        }
        Insert: {
          begrote_uren?: number
          created_at?: string
          dossier_id: string
          id?: string
          updated_at?: string
          uursoort_id: string
        }
        Update: {
          begrote_uren?: number
          created_at?: string
          dossier_id?: string
          id?: string
          updated_at?: string
          uursoort_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_werkbegroting_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "planning_werkbegroting_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_werkbegroting_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_werkbegroting_regels_uursoort_id_fkey"
            columns: ["uursoort_id"]
            isOneToOne: false
            referencedRelation: "planning_uursoorten"
            referencedColumns: ["id"]
          },
        ]
      }
      ploegen: {
        Row: {
          actief: boolean
          created_at: string
          goedkeuring_modus: string | null
          id: string
          naam: string
          teamleider_id: string | null
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string
          goedkeuring_modus?: string | null
          id?: string
          naam: string
          teamleider_id?: string | null
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string
          goedkeuring_modus?: string | null
          id?: string
          naam?: string
          teamleider_id?: string | null
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "ploegen_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ploegen_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "ploegen_teamleider_id_fkey"
            columns: ["teamleider_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      portaal_bericht_gelezen: {
        Row: {
          dossier_id: string
          gelezen_tot: string
          lezer_id: string
          lezer_type: string
        }
        Insert: {
          dossier_id: string
          gelezen_tot?: string
          lezer_id: string
          lezer_type: string
        }
        Update: {
          dossier_id?: string
          gelezen_tot?: string
          lezer_id?: string
          lezer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "portaal_bericht_gelezen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "portaal_bericht_gelezen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_bericht_gelezen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      portaal_berichten: {
        Row: {
          auteur_type: string
          bericht: string
          bijlagen: Json
          created_at: string
          dossier_id: string
          id: string
          intern: boolean
          medewerker_id: string | null
          portaal_gebruiker_id: string | null
        }
        Insert: {
          auteur_type: string
          bericht: string
          bijlagen?: Json
          created_at?: string
          dossier_id: string
          id?: string
          intern?: boolean
          medewerker_id?: string | null
          portaal_gebruiker_id?: string | null
        }
        Update: {
          auteur_type?: string
          bericht?: string
          bijlagen?: Json
          created_at?: string
          dossier_id?: string
          id?: string
          intern?: boolean
          medewerker_id?: string | null
          portaal_gebruiker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portaal_berichten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "portaal_berichten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_berichten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_berichten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_berichten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "portaal_berichten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "portaal_berichten_portaal_gebruiker_id_fkey"
            columns: ["portaal_gebruiker_id"]
            isOneToOne: false
            referencedRelation: "portaal_gebruikers"
            referencedColumns: ["id"]
          },
        ]
      }
      portaal_bestanden: {
        Row: {
          bron: string
          bron_query: string
          datum: string | null
          dossier_id: string
          extensie: string | null
          gewijzigd_door: string | null
          gewijzigd_op: string
          grootte: number | null
          naam: string | null
          sleutel: string
          soort: string
          zichtbaar: boolean
        }
        Insert: {
          bron: string
          bron_query: string
          datum?: string | null
          dossier_id: string
          extensie?: string | null
          gewijzigd_door?: string | null
          gewijzigd_op?: string
          grootte?: number | null
          naam?: string | null
          sleutel: string
          soort: string
          zichtbaar?: boolean
        }
        Update: {
          bron?: string
          bron_query?: string
          datum?: string | null
          dossier_id?: string
          extensie?: string | null
          gewijzigd_door?: string | null
          gewijzigd_op?: string
          grootte?: number | null
          naam?: string | null
          sleutel?: string
          soort?: string
          zichtbaar?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "portaal_bestanden_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "portaal_bestanden_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_bestanden_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_bestanden_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_bestanden_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "portaal_bestanden_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      portaal_dossier_instellingen: {
        Row: {
          actief: boolean
          dossier_id: string
          gewijzigd_door: string | null
          gewijzigd_op: string
          planning_detail: boolean
          toon_aandachtspunten: boolean
          toon_afspraken: boolean
          toon_bestanden: boolean
          toon_chat: boolean
          toon_facturen: boolean
          toon_formulieren: boolean
          toon_fotos: boolean
          toon_meerwerk: boolean
          toon_meerwerk_handmatig: boolean
          toon_planning: boolean
        }
        Insert: {
          actief?: boolean
          dossier_id: string
          gewijzigd_door?: string | null
          gewijzigd_op?: string
          planning_detail?: boolean
          toon_aandachtspunten?: boolean
          toon_afspraken?: boolean
          toon_bestanden?: boolean
          toon_chat?: boolean
          toon_facturen?: boolean
          toon_formulieren?: boolean
          toon_fotos?: boolean
          toon_meerwerk?: boolean
          toon_meerwerk_handmatig?: boolean
          toon_planning?: boolean
        }
        Update: {
          actief?: boolean
          dossier_id?: string
          gewijzigd_door?: string | null
          gewijzigd_op?: string
          planning_detail?: boolean
          toon_aandachtspunten?: boolean
          toon_afspraken?: boolean
          toon_bestanden?: boolean
          toon_chat?: boolean
          toon_facturen?: boolean
          toon_formulieren?: boolean
          toon_fotos?: boolean
          toon_meerwerk?: boolean
          toon_meerwerk_handmatig?: boolean
          toon_planning?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "portaal_dossier_instellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "portaal_dossier_instellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_dossier_instellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_dossier_instellingen_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_dossier_instellingen_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "portaal_dossier_instellingen_gewijzigd_door_fkey"
            columns: ["gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      portaal_gebruiker_dossiers: {
        Row: {
          dossier_id: string
          portaal_gebruiker_id: string
          rol: string | null
          toegevoegd_door: string | null
          toegevoegd_op: string
        }
        Insert: {
          dossier_id: string
          portaal_gebruiker_id: string
          rol?: string | null
          toegevoegd_door?: string | null
          toegevoegd_op?: string
        }
        Update: {
          dossier_id?: string
          portaal_gebruiker_id?: string
          rol?: string | null
          toegevoegd_door?: string | null
          toegevoegd_op?: string
        }
        Relationships: [
          {
            foreignKeyName: "portaal_gebruiker_dossiers_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "portaal_gebruiker_dossiers_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_gebruiker_dossiers_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_gebruiker_dossiers_portaal_gebruiker_id_fkey"
            columns: ["portaal_gebruiker_id"]
            isOneToOne: false
            referencedRelation: "portaal_gebruikers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_gebruiker_dossiers_toegevoegd_door_fkey"
            columns: ["toegevoegd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_gebruiker_dossiers_toegevoegd_door_fkey"
            columns: ["toegevoegd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "portaal_gebruiker_dossiers_toegevoegd_door_fkey"
            columns: ["toegevoegd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      portaal_gebruikers: {
        Row: {
          actief: boolean
          auth_user_id: string | null
          contactpersoon_id: string | null
          created_at: string
          email: string
          id: string
          laatst_ingelogd_op: string | null
          laatste_link_op: string | null
          particulier_id: string | null
          relatie_id: string | null
          scope: string
          uitgenodigd_door: string | null
          uitgenodigd_op: string | null
          updated_at: string
        }
        Insert: {
          actief?: boolean
          auth_user_id?: string | null
          contactpersoon_id?: string | null
          created_at?: string
          email: string
          id?: string
          laatst_ingelogd_op?: string | null
          laatste_link_op?: string | null
          particulier_id?: string | null
          relatie_id?: string | null
          scope?: string
          uitgenodigd_door?: string | null
          uitgenodigd_op?: string | null
          updated_at?: string
        }
        Update: {
          actief?: boolean
          auth_user_id?: string | null
          contactpersoon_id?: string | null
          created_at?: string
          email?: string
          id?: string
          laatst_ingelogd_op?: string | null
          laatste_link_op?: string | null
          particulier_id?: string | null
          relatie_id?: string | null
          scope?: string
          uitgenodigd_door?: string | null
          uitgenodigd_op?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portaal_gebruikers_contactpersoon_id_fkey"
            columns: ["contactpersoon_id"]
            isOneToOne: false
            referencedRelation: "contactpersonen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_gebruikers_particulier_id_fkey"
            columns: ["particulier_id"]
            isOneToOne: false
            referencedRelation: "particulieren"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_gebruikers_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_gebruikers_uitgenodigd_door_fkey"
            columns: ["uitgenodigd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_gebruikers_uitgenodigd_door_fkey"
            columns: ["uitgenodigd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "portaal_gebruikers_uitgenodigd_door_fkey"
            columns: ["uitgenodigd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      portaal_mail_wachtrij: {
        Row: {
          body_html: string | null
          cc: string[]
          created_at: string
          dossier_id: string | null
          id: string
          laatste_fout: string | null
          onderwerp: string
          ontvangers: string[]
          pogingen: number
          portaal_gebruiker_id: string | null
          sleutel: string | null
          soort: string
          status: string
          verzonden_op: string | null
        }
        Insert: {
          body_html?: string | null
          cc?: string[]
          created_at?: string
          dossier_id?: string | null
          id?: string
          laatste_fout?: string | null
          onderwerp: string
          ontvangers: string[]
          pogingen?: number
          portaal_gebruiker_id?: string | null
          sleutel?: string | null
          soort: string
          status?: string
          verzonden_op?: string | null
        }
        Update: {
          body_html?: string | null
          cc?: string[]
          created_at?: string
          dossier_id?: string | null
          id?: string
          laatste_fout?: string | null
          onderwerp?: string
          ontvangers?: string[]
          pogingen?: number
          portaal_gebruiker_id?: string | null
          sleutel?: string | null
          soort?: string
          status?: string
          verzonden_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portaal_mail_wachtrij_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "portaal_mail_wachtrij_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_mail_wachtrij_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portaal_mail_wachtrij_portaal_gebruiker_id_fkey"
            columns: ["portaal_gebruiker_id"]
            isOneToOne: false
            referencedRelation: "portaal_gebruikers"
            referencedColumns: ["id"]
          },
        ]
      }
      portaal_toegang_log: {
        Row: {
          created_at: string
          dossier_id: string | null
          id: number
          ip: string | null
          onderdeel: string | null
          portaal_gebruiker_id: string | null
          sleutel: string | null
        }
        Insert: {
          created_at?: string
          dossier_id?: string | null
          id?: number
          ip?: string | null
          onderdeel?: string | null
          portaal_gebruiker_id?: string | null
          sleutel?: string | null
        }
        Update: {
          created_at?: string
          dossier_id?: string | null
          id?: number
          ip?: string | null
          onderdeel?: string | null
          portaal_gebruiker_id?: string | null
          sleutel?: string | null
        }
        Relationships: []
      }
      projectbezoek_fotos: {
        Row: {
          bezoek_id: string
          created_at: string
          created_by: string | null
          id: string
          soort: string
          storage_path: string | null
          toelichting: string | null
          url: string
          volgorde: number
        }
        Insert: {
          bezoek_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          soort?: string
          storage_path?: string | null
          toelichting?: string | null
          url: string
          volgorde?: number
        }
        Update: {
          bezoek_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          soort?: string
          storage_path?: string | null
          toelichting?: string | null
          url?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "projectbezoek_fotos_bezoek_id_fkey"
            columns: ["bezoek_id"]
            isOneToOne: false
            referencedRelation: "projectbezoeken"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projectbezoek_fotos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projectbezoek_fotos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "projectbezoek_fotos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      projectbezoeken: {
        Row: {
          afgerond_op: string | null
          algemene_opmerkingen: string | null
          created_at: string
          created_by: string | null
          datum: string
          doet_algemeen: boolean
          doet_kwaliteit: boolean
          doet_veiligheid: boolean
          doet_voortgang: boolean
          dossier_id: string
          heropend_reden: string | null
          id: string
          kwaliteit_inspectie_id: string | null
          locatie: string | null
          status: string
          task_id: string | null
          tijd: string | null
          uitgevoerd_door: string | null
          updated_at: string
          volgnummer: number
          voortgang_tekst: string | null
          weer: string | null
          werkzaamheden: string | null
        }
        Insert: {
          afgerond_op?: string | null
          algemene_opmerkingen?: string | null
          created_at?: string
          created_by?: string | null
          datum?: string
          doet_algemeen?: boolean
          doet_kwaliteit?: boolean
          doet_veiligheid?: boolean
          doet_voortgang?: boolean
          dossier_id: string
          heropend_reden?: string | null
          id?: string
          kwaliteit_inspectie_id?: string | null
          locatie?: string | null
          status?: string
          task_id?: string | null
          tijd?: string | null
          uitgevoerd_door?: string | null
          updated_at?: string
          volgnummer: number
          voortgang_tekst?: string | null
          weer?: string | null
          werkzaamheden?: string | null
        }
        Update: {
          afgerond_op?: string | null
          algemene_opmerkingen?: string | null
          created_at?: string
          created_by?: string | null
          datum?: string
          doet_algemeen?: boolean
          doet_kwaliteit?: boolean
          doet_veiligheid?: boolean
          doet_voortgang?: boolean
          dossier_id?: string
          heropend_reden?: string | null
          id?: string
          kwaliteit_inspectie_id?: string | null
          locatie?: string | null
          status?: string
          task_id?: string | null
          tijd?: string | null
          uitgevoerd_door?: string | null
          updated_at?: string
          volgnummer?: number
          voortgang_tekst?: string | null
          weer?: string | null
          werkzaamheden?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projectbezoeken_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projectbezoeken_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "projectbezoeken_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "projectbezoeken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "projectbezoeken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projectbezoeken_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projectbezoeken_kwaliteit_inspectie_id_fkey"
            columns: ["kwaliteit_inspectie_id"]
            isOneToOne: false
            referencedRelation: "kwaliteit_inspecties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projectbezoeken_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projectbezoeken_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projectbezoeken_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "projectbezoeken_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          project_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_abonnementen: {
        Row: {
          aangemaakt_op: string
          auth: string
          endpoint: string
          id: string
          laatst_gebruikt: string | null
          mobiel: boolean | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aangemaakt_op?: string
          auth: string
          endpoint: string
          id?: string
          laatst_gebruikt?: string | null
          mobiel?: boolean | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aangemaakt_op?: string
          auth?: string
          endpoint?: string
          id?: string
          laatst_gebruikt?: string | null
          mobiel?: boolean | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quote_layouts: {
        Row: {
          accent_kleur: string | null
          beschrijving: string | null
          briefpapier_pdf_url: string | null
          created_at: string | null
          docx_template_bron: string | null
          docx_template_drive_id: string | null
          docx_template_item_id: string | null
          docx_template_url: string | null
          docx_template_web_url: string | null
          footer_html: string | null
          html_template: string | null
          id: string
          is_standaard: boolean | null
          kleur_niveau_2: string | null
          kleur_niveau_3: string | null
          koptekst: string | null
          lettergrootte: number | null
          lettertype: string | null
          logo_url: string | null
          marge_boven: number | null
          marge_links: number | null
          marge_onder: number | null
          marge_rechts: number | null
          naam: string
          papier_formaat: string | null
          papier_orientatie: string | null
          preview_token: string | null
          primaire_kleur: string | null
          secundaire_kleur: string | null
          toon_paginanummer: boolean | null
          toon_specificatie: boolean | null
          toon_voorblad: boolean | null
          toon_voorwaarden: boolean | null
          updated_at: string | null
          voettekst: string | null
          wysiwyg_body: string | null
        }
        Insert: {
          accent_kleur?: string | null
          beschrijving?: string | null
          briefpapier_pdf_url?: string | null
          created_at?: string | null
          docx_template_bron?: string | null
          docx_template_drive_id?: string | null
          docx_template_item_id?: string | null
          docx_template_url?: string | null
          docx_template_web_url?: string | null
          footer_html?: string | null
          html_template?: string | null
          id?: string
          is_standaard?: boolean | null
          kleur_niveau_2?: string | null
          kleur_niveau_3?: string | null
          koptekst?: string | null
          lettergrootte?: number | null
          lettertype?: string | null
          logo_url?: string | null
          marge_boven?: number | null
          marge_links?: number | null
          marge_onder?: number | null
          marge_rechts?: number | null
          naam: string
          papier_formaat?: string | null
          papier_orientatie?: string | null
          preview_token?: string | null
          primaire_kleur?: string | null
          secundaire_kleur?: string | null
          toon_paginanummer?: boolean | null
          toon_specificatie?: boolean | null
          toon_voorblad?: boolean | null
          toon_voorwaarden?: boolean | null
          updated_at?: string | null
          voettekst?: string | null
          wysiwyg_body?: string | null
        }
        Update: {
          accent_kleur?: string | null
          beschrijving?: string | null
          briefpapier_pdf_url?: string | null
          created_at?: string | null
          docx_template_bron?: string | null
          docx_template_drive_id?: string | null
          docx_template_item_id?: string | null
          docx_template_url?: string | null
          docx_template_web_url?: string | null
          footer_html?: string | null
          html_template?: string | null
          id?: string
          is_standaard?: boolean | null
          kleur_niveau_2?: string | null
          kleur_niveau_3?: string | null
          koptekst?: string | null
          lettergrootte?: number | null
          lettertype?: string | null
          logo_url?: string | null
          marge_boven?: number | null
          marge_links?: number | null
          marge_onder?: number | null
          marge_rechts?: number | null
          naam?: string
          papier_formaat?: string | null
          papier_orientatie?: string | null
          preview_token?: string | null
          primaire_kleur?: string | null
          secundaire_kleur?: string | null
          toon_paginanummer?: boolean | null
          toon_specificatie?: boolean | null
          toon_voorblad?: boolean | null
          toon_voorwaarden?: boolean | null
          updated_at?: string | null
          voettekst?: string | null
          wysiwyg_body?: string | null
        }
        Relationships: []
      }
      quote_lines: {
        Row: {
          btw_pct: number
          btw_tarief_id: string | null
          calculatieregel_id: string | null
          created_at: string | null
          eenheid: string
          eenheidsprijs: number
          groep_id: string | null
          hoeveelheid: number
          id: string
          is_stelpost: boolean
          kostprijs_pe: number | null
          line_total: number
          omschrijving: string
          opmerking: string | null
          quote_id: string
          schilderbehandeling: string | null
          schilderbehandeling_naam: string | null
          section_id: string | null
          soort: string | null
          updated_at: string | null
          uren_pe: number | null
          volgorde: number
          werkomschrijving_afbeeldingen: Json | null
        }
        Insert: {
          btw_pct?: number
          btw_tarief_id?: string | null
          calculatieregel_id?: string | null
          created_at?: string | null
          eenheid?: string
          eenheidsprijs?: number
          groep_id?: string | null
          hoeveelheid?: number
          id?: string
          is_stelpost?: boolean
          kostprijs_pe?: number | null
          line_total?: number
          omschrijving?: string
          opmerking?: string | null
          quote_id: string
          schilderbehandeling?: string | null
          schilderbehandeling_naam?: string | null
          section_id?: string | null
          soort?: string | null
          updated_at?: string | null
          uren_pe?: number | null
          volgorde?: number
          werkomschrijving_afbeeldingen?: Json | null
        }
        Update: {
          btw_pct?: number
          btw_tarief_id?: string | null
          calculatieregel_id?: string | null
          created_at?: string | null
          eenheid?: string
          eenheidsprijs?: number
          groep_id?: string | null
          hoeveelheid?: number
          id?: string
          is_stelpost?: boolean
          kostprijs_pe?: number | null
          line_total?: number
          omschrijving?: string
          opmerking?: string | null
          quote_id?: string
          schilderbehandeling?: string | null
          schilderbehandeling_naam?: string | null
          section_id?: string | null
          soort?: string | null
          updated_at?: string | null
          uren_pe?: number | null
          volgorde?: number
          werkomschrijving_afbeeldingen?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_btw_tarief_id_fkey"
            columns: ["btw_tarief_id"]
            isOneToOne: false
            referencedRelation: "btw_tarieven"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "quote_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_sections: {
        Row: {
          created_at: string | null
          discipline: string | null
          id: string
          is_optioneel: boolean
          naam: string
          niveau: number
          nummer: string | null
          quote_id: string
          subtotaal: number
          toon_detail: boolean
          volgorde: number
        }
        Insert: {
          created_at?: string | null
          discipline?: string | null
          id?: string
          is_optioneel?: boolean
          naam: string
          niveau?: number
          nummer?: string | null
          quote_id: string
          subtotaal?: number
          toon_detail?: boolean
          volgorde?: number
        }
        Update: {
          created_at?: string | null
          discipline?: string | null
          id?: string
          is_optioneel?: boolean
          naam?: string
          niveau?: number
          nummer?: string | null
          quote_id?: string
          subtotaal?: number
          toon_detail?: boolean
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_sections_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          beschrijving: string | null
          created_at: string | null
          geldigheid_dagen: number | null
          id: string
          is_standaard: boolean | null
          naam: string
          standaard_aanhef: string | null
          standaard_inleiding: string | null
          standaard_opmerkingen: string | null
          standaard_slottekst: string | null
          standaard_uitsluitingen: string | null
          standaard_voorwaarden: string | null
        }
        Insert: {
          beschrijving?: string | null
          created_at?: string | null
          geldigheid_dagen?: number | null
          id?: string
          is_standaard?: boolean | null
          naam: string
          standaard_aanhef?: string | null
          standaard_inleiding?: string | null
          standaard_opmerkingen?: string | null
          standaard_slottekst?: string | null
          standaard_uitsluitingen?: string | null
          standaard_voorwaarden?: string | null
        }
        Update: {
          beschrijving?: string | null
          created_at?: string | null
          geldigheid_dagen?: number | null
          id?: string
          is_standaard?: boolean | null
          naam?: string
          standaard_aanhef?: string | null
          standaard_inleiding?: string | null
          standaard_opmerkingen?: string | null
          standaard_slottekst?: string | null
          standaard_uitsluitingen?: string | null
          standaard_voorwaarden?: string | null
        }
        Relationships: []
      }
      quote_terms: {
        Row: {
          created_at: string | null
          id: string
          inhoud: string
          quote_id: string
          type: string
          volgorde: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          inhoud?: string
          quote_id: string
          type: string
          volgorde?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          inhoud?: string
          quote_id?: string
          type?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_terms_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          aanhef: string | null
          betalingsconditie_id: string | null
          bouw7_quotation_id: string | null
          bouw7_quotation_nummer: string | null
          bouw7_synced_at: string | null
          btw_bedrag: number
          btw_pct: number
          btw_tarief_id: string | null
          client_id: string | null
          contactpersoon: string | null
          created_at: string | null
          datum: string
          detailregels_tonen: boolean
          dossier_id: string | null
          geldig_tot: string | null
          id: string
          inleiding: string | null
          layout_id: string | null
          meerwerk_regel_id: string | null
          opties_subtotaal: number
          parent_quote_id: string | null
          project_id: string | null
          quote_nummer: string
          referentie: string | null
          scenario_id: string | null
          slottekst: string | null
          status: string
          stelposten_in_totaal: boolean
          stelposten_subtotaal: number
          subtotaal_ex_btw: number
          template_id: string | null
          titel: string
          totaal_inc_btw: number
          type: string
          updated_at: string | null
          versie: number
          verzonden_at: string | null
          verzonden_door: string | null
          verzonden_naar: string | null
          voorwaarden_id: string | null
          word_bestandsnaam: string | null
          word_drive_id: string | null
          word_etag: string | null
          word_gemaakt_door: string | null
          word_gemaakt_op: string | null
          word_gesynct_op: string | null
          word_inhoud_hash: string | null
          word_item_id: string | null
          word_web_url: string | null
        }
        Insert: {
          aanhef?: string | null
          betalingsconditie_id?: string | null
          bouw7_quotation_id?: string | null
          bouw7_quotation_nummer?: string | null
          bouw7_synced_at?: string | null
          btw_bedrag?: number
          btw_pct?: number
          btw_tarief_id?: string | null
          client_id?: string | null
          contactpersoon?: string | null
          created_at?: string | null
          datum?: string
          detailregels_tonen?: boolean
          dossier_id?: string | null
          geldig_tot?: string | null
          id?: string
          inleiding?: string | null
          layout_id?: string | null
          meerwerk_regel_id?: string | null
          opties_subtotaal?: number
          parent_quote_id?: string | null
          project_id?: string | null
          quote_nummer?: string
          referentie?: string | null
          scenario_id?: string | null
          slottekst?: string | null
          status?: string
          stelposten_in_totaal?: boolean
          stelposten_subtotaal?: number
          subtotaal_ex_btw?: number
          template_id?: string | null
          titel?: string
          totaal_inc_btw?: number
          type?: string
          updated_at?: string | null
          versie?: number
          verzonden_at?: string | null
          verzonden_door?: string | null
          verzonden_naar?: string | null
          voorwaarden_id?: string | null
          word_bestandsnaam?: string | null
          word_drive_id?: string | null
          word_etag?: string | null
          word_gemaakt_door?: string | null
          word_gemaakt_op?: string | null
          word_gesynct_op?: string | null
          word_inhoud_hash?: string | null
          word_item_id?: string | null
          word_web_url?: string | null
        }
        Update: {
          aanhef?: string | null
          betalingsconditie_id?: string | null
          bouw7_quotation_id?: string | null
          bouw7_quotation_nummer?: string | null
          bouw7_synced_at?: string | null
          btw_bedrag?: number
          btw_pct?: number
          btw_tarief_id?: string | null
          client_id?: string | null
          contactpersoon?: string | null
          created_at?: string | null
          datum?: string
          detailregels_tonen?: boolean
          dossier_id?: string | null
          geldig_tot?: string | null
          id?: string
          inleiding?: string | null
          layout_id?: string | null
          meerwerk_regel_id?: string | null
          opties_subtotaal?: number
          parent_quote_id?: string | null
          project_id?: string | null
          quote_nummer?: string
          referentie?: string | null
          scenario_id?: string | null
          slottekst?: string | null
          status?: string
          stelposten_in_totaal?: boolean
          stelposten_subtotaal?: number
          subtotaal_ex_btw?: number
          template_id?: string | null
          titel?: string
          totaal_inc_btw?: number
          type?: string
          updated_at?: string | null
          versie?: number
          verzonden_at?: string | null
          verzonden_door?: string | null
          verzonden_naar?: string | null
          voorwaarden_id?: string | null
          word_bestandsnaam?: string | null
          word_drive_id?: string | null
          word_etag?: string | null
          word_gemaakt_door?: string | null
          word_gemaakt_op?: string | null
          word_gesynct_op?: string | null
          word_inhoud_hash?: string | null
          word_item_id?: string | null
          word_web_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_betalingsconditie_id_fkey"
            columns: ["betalingsconditie_id"]
            isOneToOne: false
            referencedRelation: "betalingscondities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_btw_tarief_id_fkey"
            columns: ["btw_tarief_id"]
            isOneToOne: false
            referencedRelation: "btw_tarieven"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "quote_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_voorwaarden_id_fkey"
            columns: ["voorwaarden_id"]
            isOneToOne: false
            referencedRelation: "algemene_voorwaarden"
            referencedColumns: ["id"]
          },
        ]
      }
      rdw_data: {
        Row: {
          aantal_cilinders: number | null
          aantal_zitplaatsen: number | null
          apk_vervaldatum: string | null
          brandstof_omschrijving: string | null
          catalogusprijs: number | null
          cilinderinhoud: number | null
          created_at: string
          datum_tenaamstelling: string | null
          eerste_toelating: string | null
          id: string
          kenteken: string
          laatst_opgehaald: string | null
          massa_ledig_voertuig: number | null
          massa_rijklaar: number | null
          milieuclassificatie: string | null
          rdw_raw: Json | null
          terugroepactie_open: boolean | null
          terugroepactie_status: string | null
          toegestane_maximum_massa: number | null
          trekgewicht_geremd: number | null
          trekgewicht_ongeremd: number | null
          updated_at: string
          vervaldatum_tenaamstelling: string | null
          voertuig_id: string | null
          wok_status: boolean | null
        }
        Insert: {
          aantal_cilinders?: number | null
          aantal_zitplaatsen?: number | null
          apk_vervaldatum?: string | null
          brandstof_omschrijving?: string | null
          catalogusprijs?: number | null
          cilinderinhoud?: number | null
          created_at?: string
          datum_tenaamstelling?: string | null
          eerste_toelating?: string | null
          id?: string
          kenteken: string
          laatst_opgehaald?: string | null
          massa_ledig_voertuig?: number | null
          massa_rijklaar?: number | null
          milieuclassificatie?: string | null
          rdw_raw?: Json | null
          terugroepactie_open?: boolean | null
          terugroepactie_status?: string | null
          toegestane_maximum_massa?: number | null
          trekgewicht_geremd?: number | null
          trekgewicht_ongeremd?: number | null
          updated_at?: string
          vervaldatum_tenaamstelling?: string | null
          voertuig_id?: string | null
          wok_status?: boolean | null
        }
        Update: {
          aantal_cilinders?: number | null
          aantal_zitplaatsen?: number | null
          apk_vervaldatum?: string | null
          brandstof_omschrijving?: string | null
          catalogusprijs?: number | null
          cilinderinhoud?: number | null
          created_at?: string
          datum_tenaamstelling?: string | null
          eerste_toelating?: string | null
          id?: string
          kenteken?: string
          laatst_opgehaald?: string | null
          massa_ledig_voertuig?: number | null
          massa_rijklaar?: number | null
          milieuclassificatie?: string | null
          rdw_raw?: Json | null
          terugroepactie_open?: boolean | null
          terugroepactie_status?: string | null
          toegestane_maximum_massa?: number | null
          trekgewicht_geremd?: number | null
          trekgewicht_ongeremd?: number | null
          updated_at?: string
          vervaldatum_tenaamstelling?: string | null
          voertuig_id?: string | null
          wok_status?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "rdw_data_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: true
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["voertuig_id"]
          },
          {
            foreignKeyName: "rdw_data_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: true
            referencedRelation: "voertuigen"
            referencedColumns: ["id"]
          },
        ]
      }
      regie_factuurregels: {
        Row: {
          aantal: number | null
          bewakingscode: string | null
          bouw7_invoice_id: string | null
          bron_bouw7_id: string | null
          bron_type: string
          btw_pct: number | null
          created_at: string
          created_by: string | null
          dossier_id: string
          eenheid: string | null
          groep_sleutel: string | null
          id: string
          inkoop_bedrag: number | null
          omschrijving: string | null
          opslag_pct: number | null
          status: string
          uitgesloten: boolean
          updated_at: string
          verkoop_bedrag: number | null
          verkoop_tarief: number | null
        }
        Insert: {
          aantal?: number | null
          bewakingscode?: string | null
          bouw7_invoice_id?: string | null
          bron_bouw7_id?: string | null
          bron_type: string
          btw_pct?: number | null
          created_at?: string
          created_by?: string | null
          dossier_id: string
          eenheid?: string | null
          groep_sleutel?: string | null
          id?: string
          inkoop_bedrag?: number | null
          omschrijving?: string | null
          opslag_pct?: number | null
          status?: string
          uitgesloten?: boolean
          updated_at?: string
          verkoop_bedrag?: number | null
          verkoop_tarief?: number | null
        }
        Update: {
          aantal?: number | null
          bewakingscode?: string | null
          bouw7_invoice_id?: string | null
          bron_bouw7_id?: string | null
          bron_type?: string
          btw_pct?: number | null
          created_at?: string
          created_by?: string | null
          dossier_id?: string
          eenheid?: string | null
          groep_sleutel?: string | null
          id?: string
          inkoop_bedrag?: number | null
          omschrijving?: string | null
          opslag_pct?: number | null
          status?: string
          uitgesloten?: boolean
          updated_at?: string
          verkoop_bedrag?: number | null
          verkoop_tarief?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regie_factuurregels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "regie_factuurregels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regie_factuurregels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_bankgegevens: {
        Row: {
          bic: string | null
          created_at: string
          handmatige_velden: string[]
          iban: string | null
          id: string
          opmerkingen: string | null
          relatie_id: string
          tenaamstelling: string | null
          updated_at: string
        }
        Insert: {
          bic?: string | null
          created_at?: string
          handmatige_velden?: string[]
          iban?: string | null
          id?: string
          opmerkingen?: string | null
          relatie_id: string
          tenaamstelling?: string | null
          updated_at?: string
        }
        Update: {
          bic?: string | null
          created_at?: string
          handmatige_velden?: string[]
          iban?: string | null
          id?: string
          opmerkingen?: string | null
          relatie_id?: string
          tenaamstelling?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_bankgegevens_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: true
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_contacten: {
        Row: {
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          created_at: string
          email: string | null
          functie: string | null
          id: string
          is_primair: boolean
          naam: string
          opmerkingen: string | null
          relatie_id: string
          telefoon: string | null
          updated_at: string
        }
        Insert: {
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          created_at?: string
          email?: string | null
          functie?: string | null
          id?: string
          is_primair?: boolean
          naam: string
          opmerkingen?: string | null
          relatie_id: string
          telefoon?: string | null
          updated_at?: string
        }
        Update: {
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          created_at?: string
          email?: string | null
          functie?: string | null
          id?: string
          is_primair?: boolean
          naam?: string
          opmerkingen?: string | null
          relatie_id?: string
          telefoon?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_contacten_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_facturatie: {
        Row: {
          betaaltermijn_dagen: number | null
          created_at: string
          facturatie_email: string | null
          g_rekening_percentage: number | null
          g_rekening_tekst: string | null
          id: string
          inkoopnummer_verplicht: boolean
          kredietlimiet: number | null
          loonkostenbestanddeel_pct: number | null
          n_rekening_tekst: string | null
          opmerkingen: string | null
          relatie_id: string
          updated_at: string
        }
        Insert: {
          betaaltermijn_dagen?: number | null
          created_at?: string
          facturatie_email?: string | null
          g_rekening_percentage?: number | null
          g_rekening_tekst?: string | null
          id?: string
          inkoopnummer_verplicht?: boolean
          kredietlimiet?: number | null
          loonkostenbestanddeel_pct?: number | null
          n_rekening_tekst?: string | null
          opmerkingen?: string | null
          relatie_id: string
          updated_at?: string
        }
        Update: {
          betaaltermijn_dagen?: number | null
          created_at?: string
          facturatie_email?: string | null
          g_rekening_percentage?: number | null
          g_rekening_tekst?: string | null
          id?: string
          inkoopnummer_verplicht?: boolean
          kredietlimiet?: number | null
          loonkostenbestanddeel_pct?: number | null
          n_rekening_tekst?: string | null
          opmerkingen?: string | null
          relatie_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_facturatie_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: true
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_factuuradressen: {
        Row: {
          created_at: string
          id: string
          label: string
          land: string | null
          opmerkingen: string | null
          plaats: string | null
          postcode: string | null
          relatie_id: string
          straat: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          land?: string | null
          opmerkingen?: string | null
          plaats?: string | null
          postcode?: string | null
          relatie_id: string
          straat?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          land?: string | null
          opmerkingen?: string | null
          plaats?: string | null
          postcode?: string | null
          relatie_id?: string
          straat?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_factuuradressen_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_inkoop: {
        Row: {
          created_at: string
          id: string
          leveranciernummer: string | null
          minimumbestelling: number | null
          opmerkingen: string | null
          relatie_id: string
          standaard_levertijd_dagen: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          leveranciernummer?: string | null
          minimumbestelling?: number | null
          opmerkingen?: string | null
          relatie_id: string
          standaard_levertijd_dagen?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          leveranciernummer?: string | null
          minimumbestelling?: number | null
          opmerkingen?: string | null
          relatie_id?: string
          standaard_levertijd_dagen?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_inkoop_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: true
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_inkoop_kortingsafspraken: {
        Row: {
          categorie: string | null
          created_at: string
          geldig_tot: string | null
          geldig_vanaf: string | null
          id: string
          korting_pct: number | null
          opmerkingen: string | null
          relatie_id: string
          updated_at: string
        }
        Insert: {
          categorie?: string | null
          created_at?: string
          geldig_tot?: string | null
          geldig_vanaf?: string | null
          id?: string
          korting_pct?: number | null
          opmerkingen?: string | null
          relatie_id: string
          updated_at?: string
        }
        Update: {
          categorie?: string | null
          created_at?: string
          geldig_tot?: string | null
          geldig_vanaf?: string | null
          id?: string
          korting_pct?: number | null
          opmerkingen?: string | null
          relatie_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_inkoop_kortingsafspraken_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_inkoop_prijsafspraken: {
        Row: {
          created_at: string
          eenheid: string | null
          geldig_tot: string | null
          geldig_vanaf: string | null
          id: string
          omschrijving: string
          opmerkingen: string | null
          prijs: number | null
          relatie_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          eenheid?: string | null
          geldig_tot?: string | null
          geldig_vanaf?: string | null
          id?: string
          omschrijving: string
          opmerkingen?: string | null
          prijs?: number | null
          relatie_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          eenheid?: string | null
          geldig_tot?: string | null
          geldig_vanaf?: string | null
          id?: string
          omschrijving?: string
          opmerkingen?: string | null
          prijs?: number | null
          relatie_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_inkoop_prijsafspraken_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_uurtarieven: {
        Row: {
          bouw7_hourtype_id: string | null
          bron: string
          created_at: string
          id: string
          relatie_id: string
          tarief_kostprijs: number | null
          tarief_verkoop: number | null
          updated_at: string
          uursoort_id: string
        }
        Insert: {
          bouw7_hourtype_id?: string | null
          bron?: string
          created_at?: string
          id?: string
          relatie_id: string
          tarief_kostprijs?: number | null
          tarief_verkoop?: number | null
          updated_at?: string
          uursoort_id: string
        }
        Update: {
          bouw7_hourtype_id?: string | null
          bron?: string
          created_at?: string
          id?: string
          relatie_id?: string
          tarief_kostprijs?: number | null
          tarief_verkoop?: number | null
          updated_at?: string
          uursoort_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_uurtarieven_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relatie_uurtarieven_uursoort_id_fkey"
            columns: ["uursoort_id"]
            isOneToOne: false
            referencedRelation: "planning_uursoorten"
            referencedColumns: ["id"]
          },
        ]
      }
      relatie_verkoop_prijsafspraken: {
        Row: {
          created_at: string
          eenheid: string | null
          geldig_tot: string | null
          geldig_vanaf: string | null
          id: string
          omschrijving: string
          opmerkingen: string | null
          prijs: number | null
          relatie_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          eenheid?: string | null
          geldig_tot?: string | null
          geldig_vanaf?: string | null
          id?: string
          omschrijving: string
          opmerkingen?: string | null
          prijs?: number | null
          relatie_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          eenheid?: string | null
          geldig_tot?: string | null
          geldig_vanaf?: string | null
          id?: string
          omschrijving?: string
          opmerkingen?: string | null
          prijs?: number | null
          relatie_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatie_verkoop_prijsafspraken_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      relaties: {
        Row: {
          actief: boolean
          adres_land: string | null
          adres_plaats: string | null
          adres_postcode: string | null
          adres_straat: string | null
          betalingstermijn_dagen: number | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_hash: string | null
          bouw7_sync_status: string | null
          bouw7_type: string | null
          btw_nummer: string | null
          created_at: string
          created_by: string | null
          email: string | null
          handmatige_velden: string[]
          id: string
          kenmerken: Json
          kvk_nummer: string | null
          mobiel: string | null
          naam: string
          opmerkingen: string | null
          sync_vergrendeld: boolean
          telefoon: string | null
          types: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          actief?: boolean
          adres_land?: string | null
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          betalingstermijn_dagen?: number | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bouw7_type?: string | null
          btw_nummer?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          handmatige_velden?: string[]
          id?: string
          kenmerken?: Json
          kvk_nummer?: string | null
          mobiel?: string | null
          naam: string
          opmerkingen?: string | null
          sync_vergrendeld?: boolean
          telefoon?: string | null
          types?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          actief?: boolean
          adres_land?: string | null
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          betalingstermijn_dagen?: number | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bouw7_type?: string | null
          btw_nummer?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          handmatige_velden?: string[]
          id?: string
          kenmerken?: Json
          kvk_nummer?: string | null
          mobiel?: string | null
          naam?: string
          opmerkingen?: string | null
          sync_vergrendeld?: boolean
          telefoon?: string | null
          types?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      schilder_arbeid_normen: {
        Row: {
          actief: boolean
          combinatie_id: string
          cost_per_unit: number
          created_at: string
          hour_rate: number
          id: string
          minutes_per_unit: number
          omschrijving: string | null
          unit: string
          uurtarief_label: string | null
          volgorde: number
        }
        Insert: {
          actief?: boolean
          combinatie_id: string
          cost_per_unit?: number
          created_at?: string
          hour_rate?: number
          id?: string
          minutes_per_unit?: number
          omschrijving?: string | null
          unit?: string
          uurtarief_label?: string | null
          volgorde?: number
        }
        Update: {
          actief?: boolean
          combinatie_id?: string
          cost_per_unit?: number
          created_at?: string
          hour_rate?: number
          id?: string
          minutes_per_unit?: number
          omschrijving?: string | null
          unit?: string
          uurtarief_label?: string | null
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "schilder_arbeid_normen_combinatie_id_fkey"
            columns: ["combinatie_id"]
            isOneToOne: false
            referencedRelation: "schilder_combinaties"
            referencedColumns: ["id"]
          },
        ]
      }
      schilder_behandelingen: {
        Row: {
          actief: boolean
          bron: string | null
          code: string | null
          created_at: string
          id: string
          korte_omschrijving: string | null
          naam: string
          ondergrond: string | null
          toepassing: string | null
          uitgebreide_werkomschrijving: string | null
          updated_at: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          bron?: string | null
          code?: string | null
          created_at?: string
          id?: string
          korte_omschrijving?: string | null
          naam: string
          ondergrond?: string | null
          toepassing?: string | null
          uitgebreide_werkomschrijving?: string | null
          updated_at?: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          bron?: string | null
          code?: string | null
          created_at?: string
          id?: string
          korte_omschrijving?: string | null
          naam?: string
          ondergrond?: string | null
          toepassing?: string | null
          uitgebreide_werkomschrijving?: string | null
          updated_at?: string
          volgorde?: number
        }
        Relationships: []
      }
      schilder_combinaties: {
        Row: {
          actief: boolean
          behandeling_id: string
          bron_code: string | null
          created_at: string
          id: string
          onderdeel_id: string
          type_id: string
          updated_at: string
        }
        Insert: {
          actief?: boolean
          behandeling_id: string
          bron_code?: string | null
          created_at?: string
          id?: string
          onderdeel_id: string
          type_id: string
          updated_at?: string
        }
        Update: {
          actief?: boolean
          behandeling_id?: string
          bron_code?: string | null
          created_at?: string
          id?: string
          onderdeel_id?: string
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schilder_combinaties_behandeling_id_fkey"
            columns: ["behandeling_id"]
            isOneToOne: false
            referencedRelation: "schilder_behandelingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schilder_combinaties_onderdeel_id_fkey"
            columns: ["onderdeel_id"]
            isOneToOne: false
            referencedRelation: "schilder_onderdelen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schilder_combinaties_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "schilder_types"
            referencedColumns: ["id"]
          },
        ]
      }
      schilder_materiaal_normen: {
        Row: {
          actief: boolean
          combinatie_id: string
          cost_per_unit: number
          created_at: string
          eenheid: string | null
          id: string
          naam: string | null
          norm_type: string
          quantity_per_unit: number
          unit_price: number
          volgorde: number
        }
        Insert: {
          actief?: boolean
          combinatie_id: string
          cost_per_unit?: number
          created_at?: string
          eenheid?: string | null
          id?: string
          naam?: string | null
          norm_type?: string
          quantity_per_unit?: number
          unit_price?: number
          volgorde?: number
        }
        Update: {
          actief?: boolean
          combinatie_id?: string
          cost_per_unit?: number
          created_at?: string
          eenheid?: string | null
          id?: string
          naam?: string | null
          norm_type?: string
          quantity_per_unit?: number
          unit_price?: number
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "schilder_materiaal_normen_combinatie_id_fkey"
            columns: ["combinatie_id"]
            isOneToOne: false
            referencedRelation: "schilder_combinaties"
            referencedColumns: ["id"]
          },
        ]
      }
      schilder_onderdelen: {
        Row: {
          actief: boolean
          code: string | null
          created_at: string
          id: string
          naam: string
          ondergrond: string | null
          updated_at: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          code?: string | null
          created_at?: string
          id?: string
          naam: string
          ondergrond?: string | null
          updated_at?: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          code?: string | null
          created_at?: string
          id?: string
          naam?: string
          ondergrond?: string | null
          updated_at?: string
          volgorde?: number
        }
        Relationships: []
      }
      schilder_types: {
        Row: {
          actief: boolean
          bron_code: string | null
          code: string | null
          created_at: string
          eenheid: string
          formule: string | null
          id: string
          naam: string
          onderdeel_id: string
          updated_at: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          bron_code?: string | null
          code?: string | null
          created_at?: string
          eenheid?: string
          formule?: string | null
          id?: string
          naam: string
          onderdeel_id: string
          updated_at?: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          bron_code?: string | null
          code?: string | null
          created_at?: string
          eenheid?: string
          formule?: string | null
          id?: string
          naam?: string
          onderdeel_id?: string
          updated_at?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "schilder_types_onderdeel_id_fkey"
            columns: ["onderdeel_id"]
            isOneToOne: false
            referencedRelation: "schilder_onderdelen"
            referencedColumns: ["id"]
          },
        ]
      }
      sjabloonteksten: {
        Row: {
          categorie: string | null
          created_at: string | null
          id: string
          inhoud_html: string
          naam: string
          updated_at: string | null
          volgorde: number | null
        }
        Insert: {
          categorie?: string | null
          created_at?: string | null
          id?: string
          inhoud_html?: string
          naam: string
          updated_at?: string | null
          volgorde?: number | null
        }
        Update: {
          categorie?: string | null
          created_at?: string | null
          id?: string
          inhoud_html?: string
          naam?: string
          updated_at?: string | null
          volgorde?: number | null
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          aantal_bijgewerkt: number
          aantal_fout: number
          aantal_nieuw: number
          duur_ms: number | null
          entiteit: string
          fout_melding: string | null
          id: number
          integratie: string
          richting: string
          uitgevoerd_op: string
        }
        Insert: {
          aantal_bijgewerkt?: number
          aantal_fout?: number
          aantal_nieuw?: number
          duur_ms?: number | null
          entiteit: string
          fout_melding?: string | null
          id?: number
          integratie: string
          richting: string
          uitgevoerd_op?: string
        }
        Update: {
          aantal_bijgewerkt?: number
          aantal_fout?: number
          aantal_nieuw?: number
          duur_ms?: number | null
          entiteit?: string
          fout_melding?: string | null
          id?: number
          integratie?: string
          richting?: string
          uitgevoerd_op?: string
        }
        Relationships: []
      }
      taak_deadline_herberekeningen: {
        Row: {
          aangemaakt_op: string
          dossier_id: string
          foutmelding: string | null
          status: string
          verwerkt_op: string | null
        }
        Insert: {
          aangemaakt_op?: string
          dossier_id: string
          foutmelding?: string | null
          status?: string
          verwerkt_op?: string | null
        }
        Update: {
          aangemaakt_op?: string
          dossier_id?: string
          foutmelding?: string | null
          status?: string
          verwerkt_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taak_deadline_herberekeningen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "taak_deadline_herberekeningen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taak_deadline_herberekeningen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          rol: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          rol?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          rol?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          bestandstype: string | null
          created_at: string | null
          geupload_door: string | null
          grootte: number | null
          id: string
          naam: string
          task_id: string | null
          url: string
        }
        Insert: {
          bestandstype?: string | null
          created_at?: string | null
          geupload_door?: string | null
          grootte?: number | null
          id?: string
          naam: string
          task_id?: string | null
          url: string
        }
        Update: {
          bestandstype?: string | null
          created_at?: string | null
          geupload_door?: string | null
          grootte?: number | null
          id?: string
          naam?: string
          task_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_audit_log: {
        Row: {
          actie: string
          id: string
          nieuwe_waarde: Json | null
          oud_waarde: Json | null
          task_id: string | null
          tijdstip: string | null
          user_id: string | null
        }
        Insert: {
          actie: string
          id?: string
          nieuwe_waarde?: Json | null
          oud_waarde?: Json | null
          task_id?: string | null
          tijdstip?: string | null
          user_id?: string | null
        }
        Update: {
          actie?: string
          id?: string
          nieuwe_waarde?: Json | null
          oud_waarde?: Json | null
          task_id?: string | null
          tijdstip?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_audit_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          created_at: string | null
          id: string
          inhoud: string
          task_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inhoud: string
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inhoud?: string
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_completion_acties: {
        Row: {
          actie_type: string
          config: Json
          created_at: string
          id: string
          task_id: string
          volgorde: number
        }
        Insert: {
          actie_type: string
          config?: Json
          created_at?: string
          id?: string
          task_id: string
          volgorde?: number
        }
        Update: {
          actie_type?: string
          config?: Json
          created_at?: string
          id?: string
          task_id?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_completion_acties_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_lists: {
        Row: {
          beschrijving: string | null
          context: string
          created_at: string | null
          dossier_id: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_template: boolean | null
          medewerker_id: string | null
          naam: string
          owner_id: string | null
          streefdatum: string | null
          template_id: string | null
          template_naam: string | null
          trigger_hoofdstatus: string | null
          trigger_substatus: string | null
          updated_at: string | null
          volgorde: number | null
        }
        Insert: {
          beschrijving?: string | null
          context?: string
          created_at?: string | null
          dossier_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_template?: boolean | null
          medewerker_id?: string | null
          naam: string
          owner_id?: string | null
          streefdatum?: string | null
          template_id?: string | null
          template_naam?: string | null
          trigger_hoofdstatus?: string | null
          trigger_substatus?: string | null
          updated_at?: string | null
          volgorde?: number | null
        }
        Update: {
          beschrijving?: string | null
          context?: string
          created_at?: string | null
          dossier_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_template?: boolean | null
          medewerker_id?: string | null
          naam?: string
          owner_id?: string | null
          streefdatum?: string | null
          template_id?: string | null
          template_naam?: string | null
          trigger_hoofdstatus?: string | null
          trigger_substatus?: string | null
          updated_at?: string | null
          volgorde?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_lists_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "task_lists_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_lists_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_lists_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_lists_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "task_lists_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "task_lists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      task_todo_sync: {
        Row: {
          eva_status: string | null
          id: string
          laatst_gesynct: string | null
          medewerker_id: string
          task_id: string
          todo_completed: boolean | null
          todo_list_id: string
          todo_task_id: string
        }
        Insert: {
          eva_status?: string | null
          id?: string
          laatst_gesynct?: string | null
          medewerker_id: string
          task_id: string
          todo_completed?: boolean | null
          todo_list_id: string
          todo_task_id: string
        }
        Update: {
          eva_status?: string | null
          id?: string
          laatst_gesynct?: string | null
          medewerker_id?: string
          task_id?: string
          todo_completed?: boolean | null
          todo_list_id?: string
          todo_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_todo_sync_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_todo_sync_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "task_todo_sync_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "task_todo_sync_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          aangemaakt_door: string | null
          assignee_type: string
          bezoek_ronde: boolean
          blocked_by_task_id: string | null
          bouw7_todo_done: boolean
          bouw7_todo_id: number | null
          created_at: string | null
          deadline: string | null
          deadline_basis: string
          deadline_dagen: number | null
          deadline_handmatig: boolean
          deadline_offset_dagen: number | null
          dossier_id: string | null
          dossier_rollen: string[]
          formulier_template_id: string | null
          geschatte_uren: number | null
          herhaling_bron_taak_id: string | null
          herhaling_index: number | null
          herhaling_interval: string
          id: string
          kwaliteit_ronde: boolean
          lijst_id: string | null
          max_doorlooptijd_dagen: number | null
          medewerker_id: string | null
          omschrijving: Json | null
          opname_ronde: boolean
          parent_task_id: string | null
          prioriteit: string
          status: string
          titel: string
          updated_at: string | null
          volgorde: number | null
        }
        Insert: {
          aangemaakt_door?: string | null
          assignee_type?: string
          bezoek_ronde?: boolean
          blocked_by_task_id?: string | null
          bouw7_todo_done?: boolean
          bouw7_todo_id?: number | null
          created_at?: string | null
          deadline?: string | null
          deadline_basis?: string
          deadline_dagen?: number | null
          deadline_handmatig?: boolean
          deadline_offset_dagen?: number | null
          dossier_id?: string | null
          dossier_rollen?: string[]
          formulier_template_id?: string | null
          geschatte_uren?: number | null
          herhaling_bron_taak_id?: string | null
          herhaling_index?: number | null
          herhaling_interval?: string
          id?: string
          kwaliteit_ronde?: boolean
          lijst_id?: string | null
          max_doorlooptijd_dagen?: number | null
          medewerker_id?: string | null
          omschrijving?: Json | null
          opname_ronde?: boolean
          parent_task_id?: string | null
          prioriteit?: string
          status?: string
          titel: string
          updated_at?: string | null
          volgorde?: number | null
        }
        Update: {
          aangemaakt_door?: string | null
          assignee_type?: string
          bezoek_ronde?: boolean
          blocked_by_task_id?: string | null
          bouw7_todo_done?: boolean
          bouw7_todo_id?: number | null
          created_at?: string | null
          deadline?: string | null
          deadline_basis?: string
          deadline_dagen?: number | null
          deadline_handmatig?: boolean
          deadline_offset_dagen?: number | null
          dossier_id?: string | null
          dossier_rollen?: string[]
          formulier_template_id?: string | null
          geschatte_uren?: number | null
          herhaling_bron_taak_id?: string | null
          herhaling_index?: number | null
          herhaling_interval?: string
          id?: string
          kwaliteit_ronde?: boolean
          lijst_id?: string | null
          max_doorlooptijd_dagen?: number | null
          medewerker_id?: string | null
          omschrijving?: Json | null
          opname_ronde?: boolean
          parent_task_id?: string | null
          prioriteit?: string
          status?: string
          titel?: string
          updated_at?: string | null
          volgorde?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_blocked_by_task_id_fkey"
            columns: ["blocked_by_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "tasks_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_formulier_template_id_fkey"
            columns: ["formulier_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_herhaling_bron_taak_id_fkey"
            columns: ["herhaling_bron_taak_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lijst_id_fkey"
            columns: ["lijst_id"]
            isOneToOne: false
            referencedRelation: "task_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "tasks_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      toolbox_antwoorden: {
        Row: {
          beantwoord_op: string
          correct: boolean
          gekozen_optie: string
          id: string
          poging_nummer: number
          toewijzing_id: string
          vraag_id: string
        }
        Insert: {
          beantwoord_op?: string
          correct: boolean
          gekozen_optie: string
          id?: string
          poging_nummer: number
          toewijzing_id: string
          vraag_id: string
        }
        Update: {
          beantwoord_op?: string
          correct?: boolean
          gekozen_optie?: string
          id?: string
          poging_nummer?: number
          toewijzing_id?: string
          vraag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_antwoorden_toewijzing_id_fkey"
            columns: ["toewijzing_id"]
            isOneToOne: false
            referencedRelation: "toolbox_toewijzingen"
            referencedColumns: ["id"]
          },
        ]
      }
      toolbox_momenten: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          agenda_item_id: string
          bijgewerkt_op: string
          datum: string
          id: string
          klaargezet_op: string | null
          status: string
          toolbox_id: string
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          agenda_item_id: string
          bijgewerkt_op?: string
          datum: string
          id?: string
          klaargezet_op?: string | null
          status?: string
          toolbox_id: string
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          agenda_item_id?: string
          bijgewerkt_op?: string
          datum?: string
          id?: string
          klaargezet_op?: string | null
          status?: string
          toolbox_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_momenten_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsagenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_momenten_toolbox_id_fkey"
            columns: ["toolbox_id"]
            isOneToOne: false
            referencedRelation: "toolboxen"
            referencedColumns: ["id"]
          },
        ]
      }
      toolbox_toewijzingen: {
        Row: {
          aangemaakt_op: string
          afgerond_op: string | null
          bijgewerkt_op: string
          gestart_op: string | null
          handtekening_naam: string | null
          handtekening_pad: string | null
          id: string
          laatste_slide: number
          medewerker_id: string
          moment_id: string | null
          shuffle_seed: number
          status: string
          task_id: string | null
          toegewezen_door: string | null
          toolbox_id: string
          versie_id: string
        }
        Insert: {
          aangemaakt_op?: string
          afgerond_op?: string | null
          bijgewerkt_op?: string
          gestart_op?: string | null
          handtekening_naam?: string | null
          handtekening_pad?: string | null
          id?: string
          laatste_slide?: number
          medewerker_id: string
          moment_id?: string | null
          shuffle_seed: number
          status?: string
          task_id?: string | null
          toegewezen_door?: string | null
          toolbox_id: string
          versie_id: string
        }
        Update: {
          aangemaakt_op?: string
          afgerond_op?: string | null
          bijgewerkt_op?: string
          gestart_op?: string | null
          handtekening_naam?: string | null
          handtekening_pad?: string | null
          id?: string
          laatste_slide?: number
          medewerker_id?: string
          moment_id?: string | null
          shuffle_seed?: number
          status?: string
          task_id?: string | null
          toegewezen_door?: string | null
          toolbox_id?: string
          versie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "toolbox_toewijzingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "toolbox_toewijzingen_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "toolbox_momenten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_toewijzingen_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_toewijzingen_toolbox_id_fkey"
            columns: ["toolbox_id"]
            isOneToOne: false
            referencedRelation: "toolboxen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_toewijzingen_versie_id_fkey"
            columns: ["versie_id"]
            isOneToOne: false
            referencedRelation: "toolbox_versies"
            referencedColumns: ["id"]
          },
        ]
      }
      toolbox_versies: {
        Row: {
          gepubliceerd_door: string | null
          gepubliceerd_op: string
          id: string
          schema: Json
          toolbox_id: string
          versienummer: number
        }
        Insert: {
          gepubliceerd_door?: string | null
          gepubliceerd_op?: string
          id?: string
          schema: Json
          toolbox_id: string
          versienummer: number
        }
        Update: {
          gepubliceerd_door?: string | null
          gepubliceerd_op?: string
          id?: string
          schema?: Json
          toolbox_id?: string
          versienummer?: number
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_versies_toolbox_id_fkey"
            columns: ["toolbox_id"]
            isOneToOne: false
            referencedRelation: "toolboxen"
            referencedColumns: ["id"]
          },
        ]
      }
      toolboxen: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          bijgewerkt_op: string
          concept_schema: Json
          huidige_versie: number
          id: string
          omschrijving: string | null
          status: string
          titel: string
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          bijgewerkt_op?: string
          concept_schema?: Json
          huidige_versie?: number
          id?: string
          omschrijving?: string | null
          status?: string
          titel: string
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          bijgewerkt_op?: string
          concept_schema?: Json
          huidige_versie?: number
          id?: string
          omschrijving?: string | null
          status?: string
          titel?: string
        }
        Relationships: []
      }
      ulu_imports: {
        Row: {
          aangemaakt_op: string
          aantal_rijen: number | null
          bestandsnaam: string | null
          bron: string
          id: string
          periode_eind: string | null
          periode_start: string | null
          type: string
          upload_door: string | null
        }
        Insert: {
          aangemaakt_op?: string
          aantal_rijen?: number | null
          bestandsnaam?: string | null
          bron?: string
          id?: string
          periode_eind?: string | null
          periode_start?: string | null
          type: string
          upload_door?: string | null
        }
        Update: {
          aangemaakt_op?: string
          aantal_rijen?: number | null
          bestandsnaam?: string | null
          bron?: string
          id?: string
          periode_eind?: string | null
          periode_start?: string | null
          type?: string
          upload_door?: string | null
        }
        Relationships: []
      }
      ulu_parking: {
        Row: {
          created_at: string
          duur_seconden: number | null
          id: string
          import_batch_id: string | null
          kenteken: string
          parkeer_starttijd: string
          parkeerkosten: number | null
          parkeerlocatie: string | null
          voertuig_id: string | null
        }
        Insert: {
          created_at?: string
          duur_seconden?: number | null
          id?: string
          import_batch_id?: string | null
          kenteken: string
          parkeer_starttijd: string
          parkeerkosten?: number | null
          parkeerlocatie?: string | null
          voertuig_id?: string | null
        }
        Update: {
          created_at?: string
          duur_seconden?: number | null
          id?: string
          import_batch_id?: string | null
          kenteken?: string
          parkeer_starttijd?: string
          parkeerkosten?: number | null
          parkeerlocatie?: string | null
          voertuig_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ulu_parking_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "ulu_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ulu_parking_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["voertuig_id"]
          },
          {
            foreignKeyName: "ulu_parking_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "voertuigen"
            referencedColumns: ["id"]
          },
        ]
      }
      ulu_trips: {
        Row: {
          adres_start: string | null
          adres_stop: string | null
          afstand_km: number | null
          bestuurder_naam_raw: string | null
          created_at: string
          duur_seconden: number | null
          id: string
          import_batch_id: string | null
          kenteken: string
          km_stand_start: number | null
          km_stand_stop: number | null
          medewerker_id: string | null
          rit_type_berekend:
            | Database["public"]["Enums"]["rit_type_berekend"]
            | null
          rit_type_handmatig: boolean
          rit_type_override:
            | Database["public"]["Enums"]["rit_type_berekend"]
            | null
          rit_type_ulu: string | null
          score: number | null
          start_datum: string
          start_lat: number | null
          start_lng: number | null
          start_tijd: string
          stop_lat: number | null
          stop_lng: number | null
          stop_tijd: string | null
          user_id_ulu: number | null
          voertuig_id: string | null
        }
        Insert: {
          adres_start?: string | null
          adres_stop?: string | null
          afstand_km?: number | null
          bestuurder_naam_raw?: string | null
          created_at?: string
          duur_seconden?: number | null
          id?: string
          import_batch_id?: string | null
          kenteken: string
          km_stand_start?: number | null
          km_stand_stop?: number | null
          medewerker_id?: string | null
          rit_type_berekend?:
            | Database["public"]["Enums"]["rit_type_berekend"]
            | null
          rit_type_handmatig?: boolean
          rit_type_override?:
            | Database["public"]["Enums"]["rit_type_berekend"]
            | null
          rit_type_ulu?: string | null
          score?: number | null
          start_datum: string
          start_lat?: number | null
          start_lng?: number | null
          start_tijd: string
          stop_lat?: number | null
          stop_lng?: number | null
          stop_tijd?: string | null
          user_id_ulu?: number | null
          voertuig_id?: string | null
        }
        Update: {
          adres_start?: string | null
          adres_stop?: string | null
          afstand_km?: number | null
          bestuurder_naam_raw?: string | null
          created_at?: string
          duur_seconden?: number | null
          id?: string
          import_batch_id?: string | null
          kenteken?: string
          km_stand_start?: number | null
          km_stand_stop?: number | null
          medewerker_id?: string | null
          rit_type_berekend?:
            | Database["public"]["Enums"]["rit_type_berekend"]
            | null
          rit_type_handmatig?: boolean
          rit_type_override?:
            | Database["public"]["Enums"]["rit_type_berekend"]
            | null
          rit_type_ulu?: string | null
          score?: number | null
          start_datum?: string
          start_lat?: number | null
          start_lng?: number | null
          start_tijd?: string
          stop_lat?: number | null
          stop_lng?: number | null
          stop_tijd?: string | null
          user_id_ulu?: number | null
          voertuig_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ulu_trips_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "ulu_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ulu_trips_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["voertuig_id"]
          },
          {
            foreignKeyName: "ulu_trips_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "voertuigen"
            referencedColumns: ["id"]
          },
        ]
      }
      ulu_users: {
        Row: {
          actief: boolean
          bijtelling_betaald: boolean
          created_at: string
          email: string | null
          firstname: string | null
          id: number
          laatst_gezien: string | null
          lastname: string | null
          medewerker_id: string | null
          opmerkingen: string | null
          prive_limiet_km_jaar: number | null
          updated_at: string
          volledige_naam: string | null
          werktijd_eind: string | null
          werktijd_start: string | null
          zakelijk_verwacht_km_jaar: number | null
        }
        Insert: {
          actief?: boolean
          bijtelling_betaald?: boolean
          created_at?: string
          email?: string | null
          firstname?: string | null
          id: number
          laatst_gezien?: string | null
          lastname?: string | null
          medewerker_id?: string | null
          opmerkingen?: string | null
          prive_limiet_km_jaar?: number | null
          updated_at?: string
          volledige_naam?: string | null
          werktijd_eind?: string | null
          werktijd_start?: string | null
          zakelijk_verwacht_km_jaar?: number | null
        }
        Update: {
          actief?: boolean
          bijtelling_betaald?: boolean
          created_at?: string
          email?: string | null
          firstname?: string | null
          id?: number
          laatst_gezien?: string | null
          lastname?: string | null
          medewerker_id?: string | null
          opmerkingen?: string | null
          prive_limiet_km_jaar?: number | null
          updated_at?: string
          volledige_naam?: string | null
          werktijd_eind?: string | null
          werktijd_start?: string | null
          zakelijk_verwacht_km_jaar?: number | null
        }
        Relationships: []
      }
      uren_bouw7_beoordeling: {
        Row: {
          bouw7_fout: string | null
          bouw7_hour_log_id: number
          bouw7_status: string
          created_at: string
          dossier_id: string | null
          gecorrigeerd_door: string | null
          gecorrigeerd_op: string | null
          ingetrokken_door: string | null
          ingetrokken_op: string | null
          ingetrokken_reden: string | null
          log_datum: string | null
          medewerker_id: string | null
          oorspronkelijke_waarden: Json | null
          pl_akkoord_door: string | null
          pl_akkoord_op: string | null
          tl_akkoord_door: string | null
          tl_akkoord_op: string | null
          updated_at: string
        }
        Insert: {
          bouw7_fout?: string | null
          bouw7_hour_log_id: number
          bouw7_status?: string
          created_at?: string
          dossier_id?: string | null
          gecorrigeerd_door?: string | null
          gecorrigeerd_op?: string | null
          ingetrokken_door?: string | null
          ingetrokken_op?: string | null
          ingetrokken_reden?: string | null
          log_datum?: string | null
          medewerker_id?: string | null
          oorspronkelijke_waarden?: Json | null
          pl_akkoord_door?: string | null
          pl_akkoord_op?: string | null
          tl_akkoord_door?: string | null
          tl_akkoord_op?: string | null
          updated_at?: string
        }
        Update: {
          bouw7_fout?: string | null
          bouw7_hour_log_id?: number
          bouw7_status?: string
          created_at?: string
          dossier_id?: string | null
          gecorrigeerd_door?: string | null
          gecorrigeerd_op?: string | null
          ingetrokken_door?: string | null
          ingetrokken_op?: string | null
          ingetrokken_reden?: string | null
          log_datum?: string | null
          medewerker_id?: string | null
          oorspronkelijke_waarden?: Json | null
          pl_akkoord_door?: string | null
          pl_akkoord_op?: string | null
          tl_akkoord_door?: string | null
          tl_akkoord_op?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uren_bouw7_beoordeling_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_gecorrigeerd_door_fkey"
            columns: ["gecorrigeerd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_gecorrigeerd_door_fkey"
            columns: ["gecorrigeerd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_gecorrigeerd_door_fkey"
            columns: ["gecorrigeerd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_ingetrokken_door_fkey"
            columns: ["ingetrokken_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_ingetrokken_door_fkey"
            columns: ["ingetrokken_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_ingetrokken_door_fkey"
            columns: ["ingetrokken_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_pl_akkoord_door_fkey"
            columns: ["pl_akkoord_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_pl_akkoord_door_fkey"
            columns: ["pl_akkoord_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_pl_akkoord_door_fkey"
            columns: ["pl_akkoord_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_tl_akkoord_door_fkey"
            columns: ["tl_akkoord_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_tl_akkoord_door_fkey"
            columns: ["tl_akkoord_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_bouw7_beoordeling_tl_akkoord_door_fkey"
            columns: ["tl_akkoord_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      uren_instellingen: {
        Row: {
          created_at: string
          goedkeur_deadline_dag: number
          goedkeur_deadline_tijd: string
          goedkeuring_modus: string
          id: boolean
          indien_deadline_dag: number
          indien_deadline_tijd: string
          terugval_goedkeurder_id: string | null
          tolerantie_uren: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          goedkeur_deadline_dag?: number
          goedkeur_deadline_tijd?: string
          goedkeuring_modus?: string
          id?: boolean
          indien_deadline_dag?: number
          indien_deadline_tijd?: string
          terugval_goedkeurder_id?: string | null
          tolerantie_uren?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          goedkeur_deadline_dag?: number
          goedkeur_deadline_tijd?: string
          goedkeuring_modus?: string
          id?: boolean
          indien_deadline_dag?: number
          indien_deadline_tijd?: string
          terugval_goedkeurder_id?: string | null
          tolerantie_uren?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uren_instellingen_terugval_goedkeurder_id_fkey"
            columns: ["terugval_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_instellingen_terugval_goedkeurder_id_fkey"
            columns: ["terugval_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_instellingen_terugval_goedkeurder_id_fkey"
            columns: ["terugval_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      uren_onkosten: {
        Row: {
          bedrag: number
          bon_url: string | null
          created_at: string
          datum: string
          dossier_id: string | null
          id: string
          km: number | null
          medewerker_id: string
          omschrijving: string | null
          soort: string
          updated_at: string
          week_id: string
        }
        Insert: {
          bedrag: number
          bon_url?: string | null
          created_at?: string
          datum: string
          dossier_id?: string | null
          id?: string
          km?: number | null
          medewerker_id: string
          omschrijving?: string | null
          soort: string
          updated_at?: string
          week_id: string
        }
        Update: {
          bedrag?: number
          bon_url?: string | null
          created_at?: string
          datum?: string
          dossier_id?: string | null
          id?: string
          km?: number | null
          medewerker_id?: string
          omschrijving?: string | null
          soort?: string
          updated_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uren_onkosten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "uren_onkosten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_onkosten_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_onkosten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_onkosten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_onkosten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_onkosten_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "uren_week_saldo"
            referencedColumns: ["week_id"]
          },
          {
            foreignKeyName: "uren_onkosten_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "uren_weken"
            referencedColumns: ["id"]
          },
        ]
      }
      uren_regels: {
        Row: {
          afgeweken_van_bron: boolean
          bewakingscode: string | null
          bouw7_fout: string | null
          bouw7_goedgekeurd: boolean
          bouw7_goedgekeurd_door: string | null
          bouw7_goedgekeurd_op: string | null
          bouw7_hour_log_id: number | null
          bouw7_psl_id: number | null
          bouw7_status: string
          bron: string
          created_at: string
          datum: string
          dossier_id: string | null
          gewijzigd_door_goedkeurder_id: string | null
          gewijzigd_op: string | null
          id: string
          medewerker_id: string
          oorspronkelijke_waarden: Json | null
          opmerking: string | null
          pl_beoordeeld_door: string | null
          pl_beoordeeld_op: string | null
          pl_opmerking: string | null
          pl_status: string
          planning_item_id: string | null
          updated_at: string
          uren: number
          uursoort_id: string
          week_id: string
        }
        Insert: {
          afgeweken_van_bron?: boolean
          bewakingscode?: string | null
          bouw7_fout?: string | null
          bouw7_goedgekeurd?: boolean
          bouw7_goedgekeurd_door?: string | null
          bouw7_goedgekeurd_op?: string | null
          bouw7_hour_log_id?: number | null
          bouw7_psl_id?: number | null
          bouw7_status?: string
          bron?: string
          created_at?: string
          datum: string
          dossier_id?: string | null
          gewijzigd_door_goedkeurder_id?: string | null
          gewijzigd_op?: string | null
          id?: string
          medewerker_id: string
          oorspronkelijke_waarden?: Json | null
          opmerking?: string | null
          pl_beoordeeld_door?: string | null
          pl_beoordeeld_op?: string | null
          pl_opmerking?: string | null
          pl_status?: string
          planning_item_id?: string | null
          updated_at?: string
          uren: number
          uursoort_id: string
          week_id: string
        }
        Update: {
          afgeweken_van_bron?: boolean
          bewakingscode?: string | null
          bouw7_fout?: string | null
          bouw7_goedgekeurd?: boolean
          bouw7_goedgekeurd_door?: string | null
          bouw7_goedgekeurd_op?: string | null
          bouw7_hour_log_id?: number | null
          bouw7_psl_id?: number | null
          bouw7_status?: string
          bron?: string
          created_at?: string
          datum?: string
          dossier_id?: string | null
          gewijzigd_door_goedkeurder_id?: string | null
          gewijzigd_op?: string | null
          id?: string
          medewerker_id?: string
          oorspronkelijke_waarden?: Json | null
          opmerking?: string | null
          pl_beoordeeld_door?: string | null
          pl_beoordeeld_op?: string | null
          pl_opmerking?: string | null
          pl_status?: string
          planning_item_id?: string | null
          updated_at?: string
          uren?: number
          uursoort_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uren_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "uren_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_regels_gewijzigd_door_goedkeurder_id_fkey"
            columns: ["gewijzigd_door_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_regels_gewijzigd_door_goedkeurder_id_fkey"
            columns: ["gewijzigd_door_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_regels_gewijzigd_door_goedkeurder_id_fkey"
            columns: ["gewijzigd_door_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_regels_pl_beoordeeld_door_fkey"
            columns: ["pl_beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_regels_pl_beoordeeld_door_fkey"
            columns: ["pl_beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_regels_pl_beoordeeld_door_fkey"
            columns: ["pl_beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_regels_planning_item_id_fkey"
            columns: ["planning_item_id"]
            isOneToOne: false
            referencedRelation: "planning_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_regels_uursoort_id_fkey"
            columns: ["uursoort_id"]
            isOneToOne: false
            referencedRelation: "planning_uursoorten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_regels_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "uren_week_saldo"
            referencedColumns: ["week_id"]
          },
          {
            foreignKeyName: "uren_regels_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "uren_weken"
            referencedColumns: ["id"]
          },
        ]
      }
      uren_saldo_correcties: {
        Row: {
          created_at: string
          datum: string
          door: string | null
          id: string
          medewerker_id: string
          reden: string
          uren: number
        }
        Insert: {
          created_at?: string
          datum: string
          door?: string | null
          id?: string
          medewerker_id: string
          reden: string
          uren: number
        }
        Update: {
          created_at?: string
          datum?: string
          door?: string | null
          id?: string
          medewerker_id?: string
          reden?: string
          uren?: number
        }
        Relationships: [
          {
            foreignKeyName: "uren_saldo_correcties_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_saldo_correcties_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_saldo_correcties_door_fkey"
            columns: ["door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_saldo_correcties_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_saldo_correcties_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_saldo_correcties_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      uren_weken: {
        Row: {
          afkeur_reden: string | null
          bouw7_fouten: Json | null
          bouw7_verstuurd_op: string | null
          contracturen: number
          created_at: string
          goedkeuring_modus: string | null
          id: string
          ingediend_door: string | null
          ingediend_op: string | null
          jaar: number
          medewerker_id: string
          status: string
          tl_beoordeeld_door: string | null
          tl_beoordeeld_op: string | null
          tl_goedkeurder_id: string | null
          updated_at: string
          week_nr: number
          week_start: string
        }
        Insert: {
          afkeur_reden?: string | null
          bouw7_fouten?: Json | null
          bouw7_verstuurd_op?: string | null
          contracturen?: number
          created_at?: string
          goedkeuring_modus?: string | null
          id?: string
          ingediend_door?: string | null
          ingediend_op?: string | null
          jaar: number
          medewerker_id: string
          status?: string
          tl_beoordeeld_door?: string | null
          tl_beoordeeld_op?: string | null
          tl_goedkeurder_id?: string | null
          updated_at?: string
          week_nr: number
          week_start: string
        }
        Update: {
          afkeur_reden?: string | null
          bouw7_fouten?: Json | null
          bouw7_verstuurd_op?: string | null
          contracturen?: number
          created_at?: string
          goedkeuring_modus?: string | null
          id?: string
          ingediend_door?: string | null
          ingediend_op?: string | null
          jaar?: number
          medewerker_id?: string
          status?: string
          tl_beoordeeld_door?: string | null
          tl_beoordeeld_op?: string | null
          tl_goedkeurder_id?: string | null
          updated_at?: string
          week_nr?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "uren_weken_ingediend_door_fkey"
            columns: ["ingediend_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_weken_ingediend_door_fkey"
            columns: ["ingediend_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_weken_ingediend_door_fkey"
            columns: ["ingediend_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_weken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_weken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_weken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_weken_tl_beoordeeld_door_fkey"
            columns: ["tl_beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_weken_tl_beoordeeld_door_fkey"
            columns: ["tl_beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_weken_tl_beoordeeld_door_fkey"
            columns: ["tl_beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_weken_tl_goedkeurder_id_fkey"
            columns: ["tl_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_weken_tl_goedkeurder_id_fkey"
            columns: ["tl_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_weken_tl_goedkeurder_id_fkey"
            columns: ["tl_goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      user_role_assignments: {
        Row: {
          role_id: string
          user_id: string
        }
        Insert: {
          role_id: string
          user_id: string
        }
        Update: {
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          beschrijving: string | null
          created_at: string | null
          id: string
          naam: string
        }
        Insert: {
          beschrijving?: string | null
          created_at?: string | null
          id?: string
          naam: string
        }
        Update: {
          beschrijving?: string | null
          created_at?: string | null
          id?: string
          naam?: string
        }
        Relationships: []
      }
      uursoort_tarief_overrides: {
        Row: {
          created_at: string
          id: string
          tarief_kostprijs: number | null
          tarief_verkoop: number | null
          updated_at: string
          uursoort_id: string
          werkmaatschappij_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tarief_kostprijs?: number | null
          tarief_verkoop?: number | null
          updated_at?: string
          uursoort_id: string
          werkmaatschappij_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tarief_kostprijs?: number | null
          tarief_verkoop?: number | null
          updated_at?: string
          uursoort_id?: string
          werkmaatschappij_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uursoort_tarief_overrides_uursoort_id_fkey"
            columns: ["uursoort_id"]
            isOneToOne: false
            referencedRelation: "planning_uursoorten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uursoort_tarief_overrides_werkmaatschappij_id_fkey"
            columns: ["werkmaatschappij_id"]
            isOneToOne: false
            referencedRelation: "bedrijfsgegevens"
            referencedColumns: ["id"]
          },
        ]
      }
      vastgoed_object_relaties: {
        Row: {
          created_at: string
          id: string
          object_id: string
          opmerking: string | null
          primair: boolean
          relatie_id: string
          rol: Database["public"]["Enums"]["vastgoed_object_rol"]
        }
        Insert: {
          created_at?: string
          id?: string
          object_id: string
          opmerking?: string | null
          primair?: boolean
          relatie_id: string
          rol: Database["public"]["Enums"]["vastgoed_object_rol"]
        }
        Update: {
          created_at?: string
          id?: string
          object_id?: string
          opmerking?: string | null
          primair?: boolean
          relatie_id?: string
          rol?: Database["public"]["Enums"]["vastgoed_object_rol"]
        }
        Relationships: [
          {
            foreignKeyName: "vastgoed_object_relaties_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "vastgoed_objecten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vastgoed_object_relaties_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      vastgoed_objecten: {
        Row: {
          actief: boolean
          adres_huisnummer: string | null
          adres_land: string
          adres_plaats: string | null
          adres_postcode: string | null
          adres_sleutel: string | null
          adres_straat: string | null
          backfill_run_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_property_asset_id: number | null
          bouw7_sync_fout: string | null
          bouw7_sync_hash: string | null
          bouw7_sync_status: string | null
          bron: string
          contact_email: string | null
          contact_naam: string | null
          contact_telefoon: string | null
          created_at: string
          created_by: string | null
          details: Json
          eerste_opleverdatum: string | null
          geocode_bron: string | null
          hoort_bij_object_id: string | null
          id: string
          lat: number | null
          lng: number | null
          naam: string
          notities: string | null
          objectnummer: string
          omschrijving: string | null
          soort: Database["public"]["Enums"]["vastgoed_object_soort"]
          standaard_contactpersoon_id: string | null
          standaard_opdrachtgever_id: string | null
          tweede_opleverdatum: string | null
          updated_at: string
          vve_code: string | null
        }
        Insert: {
          actief?: boolean
          adres_huisnummer?: string | null
          adres_land?: string
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_sleutel?: string | null
          adres_straat?: string | null
          backfill_run_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_property_asset_id?: number | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bron?: string
          contact_email?: string | null
          contact_naam?: string | null
          contact_telefoon?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          eerste_opleverdatum?: string | null
          geocode_bron?: string | null
          hoort_bij_object_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          naam: string
          notities?: string | null
          objectnummer: string
          omschrijving?: string | null
          soort?: Database["public"]["Enums"]["vastgoed_object_soort"]
          standaard_contactpersoon_id?: string | null
          standaard_opdrachtgever_id?: string | null
          tweede_opleverdatum?: string | null
          updated_at?: string
          vve_code?: string | null
        }
        Update: {
          actief?: boolean
          adres_huisnummer?: string | null
          adres_land?: string
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_sleutel?: string | null
          adres_straat?: string | null
          backfill_run_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_property_asset_id?: number | null
          bouw7_sync_fout?: string | null
          bouw7_sync_hash?: string | null
          bouw7_sync_status?: string | null
          bron?: string
          contact_email?: string | null
          contact_naam?: string | null
          contact_telefoon?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          eerste_opleverdatum?: string | null
          geocode_bron?: string | null
          hoort_bij_object_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          naam?: string
          notities?: string | null
          objectnummer?: string
          omschrijving?: string | null
          soort?: Database["public"]["Enums"]["vastgoed_object_soort"]
          standaard_contactpersoon_id?: string | null
          standaard_opdrachtgever_id?: string | null
          tweede_opleverdatum?: string | null
          updated_at?: string
          vve_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vastgoed_objecten_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vastgoed_objecten_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "vastgoed_objecten_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "vastgoed_objecten_hoort_bij_object_id_fkey"
            columns: ["hoort_bij_object_id"]
            isOneToOne: false
            referencedRelation: "vastgoed_objecten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vastgoed_objecten_standaard_contactpersoon_id_fkey"
            columns: ["standaard_contactpersoon_id"]
            isOneToOne: false
            referencedRelation: "contactpersonen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vastgoed_objecten_standaard_opdrachtgever_id_fkey"
            columns: ["standaard_opdrachtgever_id"]
            isOneToOne: false
            referencedRelation: "relaties"
            referencedColumns: ["id"]
          },
        ]
      }
      vca_diplomas: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          behaald_op: string | null
          bestand_id: string | null
          bijgewerkt_op: string
          diplomanummer: string | null
          geldig_tot: string | null
          id: string
          medewerker_id: string
          opmerking: string | null
          soort: string
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          behaald_op?: string | null
          bestand_id?: string | null
          bijgewerkt_op?: string
          diplomanummer?: string | null
          geldig_tot?: string | null
          id?: string
          medewerker_id: string
          opmerking?: string | null
          soort?: string
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          behaald_op?: string | null
          bestand_id?: string | null
          bijgewerkt_op?: string
          diplomanummer?: string | null
          geldig_tot?: string | null
          id?: string
          medewerker_id?: string
          opmerking?: string | null
          soort?: string
        }
        Relationships: [
          {
            foreignKeyName: "vca_diplomas_bestand_id_fkey"
            columns: ["bestand_id"]
            isOneToOne: false
            referencedRelation: "medewerker_bestanden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vca_diplomas_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vca_diplomas_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "vca_diplomas_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      verlof_aanvragen: {
        Row: {
          afwezigheid_id: string | null
          afwijzing_reden: string | null
          beoordeeld_door: string | null
          beoordeeld_op: string | null
          bouw7_day_off_id: string | null
          bouw7_fout: string | null
          bouw7_status: string
          created_at: string
          eind_datum: string
          eind_tijd: string | null
          goedkeurder_id: string | null
          hele_dagen: boolean
          id: string
          medewerker_id: string
          start_datum: string
          start_tijd: string | null
          status: string
          toelichting: string | null
          updated_at: string
          uren_totaal: number
          uursoort_id: string
        }
        Insert: {
          afwezigheid_id?: string | null
          afwijzing_reden?: string | null
          beoordeeld_door?: string | null
          beoordeeld_op?: string | null
          bouw7_day_off_id?: string | null
          bouw7_fout?: string | null
          bouw7_status?: string
          created_at?: string
          eind_datum: string
          eind_tijd?: string | null
          goedkeurder_id?: string | null
          hele_dagen?: boolean
          id?: string
          medewerker_id: string
          start_datum: string
          start_tijd?: string | null
          status?: string
          toelichting?: string | null
          updated_at?: string
          uren_totaal?: number
          uursoort_id: string
        }
        Update: {
          afwezigheid_id?: string | null
          afwijzing_reden?: string | null
          beoordeeld_door?: string | null
          beoordeeld_op?: string | null
          bouw7_day_off_id?: string | null
          bouw7_fout?: string | null
          bouw7_status?: string
          created_at?: string
          eind_datum?: string
          eind_tijd?: string | null
          goedkeurder_id?: string | null
          hele_dagen?: boolean
          id?: string
          medewerker_id?: string
          start_datum?: string
          start_tijd?: string | null
          status?: string
          toelichting?: string | null
          updated_at?: string
          uren_totaal?: number
          uursoort_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verlof_aanvragen_afwezigheid_id_fkey"
            columns: ["afwezigheid_id"]
            isOneToOne: false
            referencedRelation: "medewerker_afwezigheid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_beoordeeld_door_fkey"
            columns: ["beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_beoordeeld_door_fkey"
            columns: ["beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_beoordeeld_door_fkey"
            columns: ["beoordeeld_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_goedkeurder_id_fkey"
            columns: ["goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_goedkeurder_id_fkey"
            columns: ["goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_goedkeurder_id_fkey"
            columns: ["goedkeurder_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "verlof_aanvragen_uursoort_id_fkey"
            columns: ["uursoort_id"]
            isOneToOne: false
            referencedRelation: "planning_uursoorten"
            referencedColumns: ["id"]
          },
        ]
      }
      voertuig_bestuurders: {
        Row: {
          created_at: string
          eind_datum: string | null
          id: string
          is_primair: boolean
          medewerker_id: string | null
          notities: string | null
          start_datum: string
          ulu_user_id: number | null
          updated_at: string
          voertuig_id: string
        }
        Insert: {
          created_at?: string
          eind_datum?: string | null
          id?: string
          is_primair?: boolean
          medewerker_id?: string | null
          notities?: string | null
          start_datum: string
          ulu_user_id?: number | null
          updated_at?: string
          voertuig_id: string
        }
        Update: {
          created_at?: string
          eind_datum?: string | null
          id?: string
          is_primair?: boolean
          medewerker_id?: string | null
          notities?: string | null
          start_datum?: string
          ulu_user_id?: number | null
          updated_at?: string
          voertuig_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voertuig_bestuurders_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["voertuig_id"]
          },
          {
            foreignKeyName: "voertuig_bestuurders_voertuig_id_fkey"
            columns: ["voertuig_id"]
            isOneToOne: false
            referencedRelation: "voertuigen"
            referencedColumns: ["id"]
          },
        ]
      }
      voertuigen: {
        Row: {
          bijtelling_betaald: boolean
          bouwjaar: number | null
          brandstof: Database["public"]["Enums"]["brandstof_type"] | null
          carrosserietype: string | null
          created_at: string
          created_by: string | null
          id: string
          ingebruikname_datum: string | null
          kenteken: string
          kleur: string | null
          merk: string | null
          model: string | null
          opmerkingen: string | null
          prive_limiet_km_jaar: number | null
          status: Database["public"]["Enums"]["voertuig_status"]
          type: Database["public"]["Enums"]["voertuig_type"] | null
          updated_at: string
          zakelijk_verwacht_km_jaar: number | null
        }
        Insert: {
          bijtelling_betaald?: boolean
          bouwjaar?: number | null
          brandstof?: Database["public"]["Enums"]["brandstof_type"] | null
          carrosserietype?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ingebruikname_datum?: string | null
          kenteken: string
          kleur?: string | null
          merk?: string | null
          model?: string | null
          opmerkingen?: string | null
          prive_limiet_km_jaar?: number | null
          status?: Database["public"]["Enums"]["voertuig_status"]
          type?: Database["public"]["Enums"]["voertuig_type"] | null
          updated_at?: string
          zakelijk_verwacht_km_jaar?: number | null
        }
        Update: {
          bijtelling_betaald?: boolean
          bouwjaar?: number | null
          brandstof?: Database["public"]["Enums"]["brandstof_type"] | null
          carrosserietype?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ingebruikname_datum?: string | null
          kenteken?: string
          kleur?: string | null
          merk?: string | null
          model?: string | null
          opmerkingen?: string | null
          prive_limiet_km_jaar?: number | null
          status?: Database["public"]["Enums"]["voertuig_status"]
          type?: Database["public"]["Enums"]["voertuig_type"] | null
          updated_at?: string
          zakelijk_verwacht_km_jaar?: number | null
        }
        Relationships: []
      }
      wagenpark_werktijd_maandrapport: {
        Row: {
          aangemaakt_op: string
          id: string
          jaar: number
          maand: number
          samenvatting: Json
          user_id_ulu: number
        }
        Insert: {
          aangemaakt_op?: string
          id?: string
          jaar: number
          maand: number
          samenvatting: Json
          user_id_ulu: number
        }
        Update: {
          aangemaakt_op?: string
          id?: string
          jaar?: number
          maand?: number
          samenvatting?: Json
          user_id_ulu?: number
        }
        Relationships: [
          {
            foreignKeyName: "wagenpark_werktijd_maandrapport_user_id_ulu_fkey"
            columns: ["user_id_ulu"]
            isOneToOne: false
            referencedRelation: "ulu_users"
            referencedColumns: ["id"]
          },
        ]
      }
      wb_prognose_instellingen: {
        Row: {
          bijgewerkt_op: string
          doel_hoofdstuk_id: number | null
          dossier_id: string
        }
        Insert: {
          bijgewerkt_op?: string
          doel_hoofdstuk_id?: number | null
          dossier_id: string
        }
        Update: {
          bijgewerkt_op?: string
          doel_hoofdstuk_id?: number | null
          dossier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wb_prognose_instellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "wb_prognose_instellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wb_prognose_instellingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: true
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbegroting_bestelling_regels: {
        Row: {
          bestelling_id: string
          component_id: string
        }
        Insert: {
          bestelling_id: string
          component_id: string
        }
        Update: {
          bestelling_id?: string
          component_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbegroting_bestelling_regels_bestelling_id_fkey"
            columns: ["bestelling_id"]
            isOneToOne: false
            referencedRelation: "werkbegroting_bestellingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkbegroting_bestelling_regels_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "werkbegroting_componenten"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbegroting_bestellingen: {
        Row: {
          aangemaakt_op: string
          afspraken: string | null
          betaalafspraak: string | null
          bijgewerkt_op: string
          boete_tekst: string | null
          bouw7_afroep_op: string | null
          bouw7_bonnummer: string | null
          bouw7_contract_id: number | null
          bouw7_gesynct_op: string | null
          bouw7_leverbon_id: number | null
          bouw7_nummer: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_status: string | null
          bouw7_verwijderd_op: string | null
          componenten_hash: string | null
          id: string
          inhouding_pct: number | null
          interne_notitie: string | null
          is_reservering: boolean
          klaargezet_op: string | null
          levering_datum: string | null
          levering_tekst: string | null
          omschrijving: string
          oplever_datum: string | null
          relatie_id: string | null
          sjabloon_id: string | null
          soort: string | null
          status: string
          termijnschema: Json | null
          verstuurd_door: string | null
          verstuurd_naar: string | null
          verstuurd_op: string | null
          verzonden_op: string | null
          werkadres: string | null
          werkbegroting_id: string
        }
        Insert: {
          aangemaakt_op?: string
          afspraken?: string | null
          betaalafspraak?: string | null
          bijgewerkt_op?: string
          boete_tekst?: string | null
          bouw7_afroep_op?: string | null
          bouw7_bonnummer?: string | null
          bouw7_contract_id?: number | null
          bouw7_gesynct_op?: string | null
          bouw7_leverbon_id?: number | null
          bouw7_nummer?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string | null
          bouw7_verwijderd_op?: string | null
          componenten_hash?: string | null
          id?: string
          inhouding_pct?: number | null
          interne_notitie?: string | null
          is_reservering?: boolean
          klaargezet_op?: string | null
          levering_datum?: string | null
          levering_tekst?: string | null
          omschrijving: string
          oplever_datum?: string | null
          relatie_id?: string | null
          sjabloon_id?: string | null
          soort?: string | null
          status?: string
          termijnschema?: Json | null
          verstuurd_door?: string | null
          verstuurd_naar?: string | null
          verstuurd_op?: string | null
          verzonden_op?: string | null
          werkadres?: string | null
          werkbegroting_id: string
        }
        Update: {
          aangemaakt_op?: string
          afspraken?: string | null
          betaalafspraak?: string | null
          bijgewerkt_op?: string
          boete_tekst?: string | null
          bouw7_afroep_op?: string | null
          bouw7_bonnummer?: string | null
          bouw7_contract_id?: number | null
          bouw7_gesynct_op?: string | null
          bouw7_leverbon_id?: number | null
          bouw7_nummer?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string | null
          bouw7_verwijderd_op?: string | null
          componenten_hash?: string | null
          id?: string
          inhouding_pct?: number | null
          interne_notitie?: string | null
          is_reservering?: boolean
          klaargezet_op?: string | null
          levering_datum?: string | null
          levering_tekst?: string | null
          omschrijving?: string
          oplever_datum?: string | null
          relatie_id?: string | null
          sjabloon_id?: string | null
          soort?: string | null
          status?: string
          termijnschema?: Json | null
          verstuurd_door?: string | null
          verstuurd_naar?: string | null
          verstuurd_op?: string | null
          verzonden_op?: string | null
          werkadres?: string | null
          werkbegroting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbegroting_bestellingen_sjabloon_id_fkey"
            columns: ["sjabloon_id"]
            isOneToOne: false
            referencedRelation: "document_sjablonen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkbegroting_bestellingen_verstuurd_door_fkey"
            columns: ["verstuurd_door"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkbegroting_bestellingen_verstuurd_door_fkey"
            columns: ["verstuurd_door"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "werkbegroting_bestellingen_verstuurd_door_fkey"
            columns: ["verstuurd_door"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "werkbegroting_bestellingen_werkbegroting_id_fkey"
            columns: ["werkbegroting_id"]
            isOneToOne: false
            referencedRelation: "werkbegrotingen"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbegroting_componenten: {
        Row: {
          aangemaakt_op: string
          aannemersnaam: string | null
          artikelnummer: string | null
          bijgewerkt_op: string
          bouw7_line_id: number | null
          eenheid: string | null
          id: string
          is_reservering: boolean
          is_verwijderd: boolean
          leverancier_naam: string | null
          norm_hoeveelheid: number
          offertenummer: string | null
          omschrijving: string | null
          opslag_pct: number | null
          relatie_id: string | null
          source_component_id: string | null
          tarief: number
          type: string
          uurtype: string | null
          werkbegroting_regel_id: string
        }
        Insert: {
          aangemaakt_op?: string
          aannemersnaam?: string | null
          artikelnummer?: string | null
          bijgewerkt_op?: string
          bouw7_line_id?: number | null
          eenheid?: string | null
          id?: string
          is_reservering?: boolean
          is_verwijderd?: boolean
          leverancier_naam?: string | null
          norm_hoeveelheid?: number
          offertenummer?: string | null
          omschrijving?: string | null
          opslag_pct?: number | null
          relatie_id?: string | null
          source_component_id?: string | null
          tarief?: number
          type: string
          uurtype?: string | null
          werkbegroting_regel_id: string
        }
        Update: {
          aangemaakt_op?: string
          aannemersnaam?: string | null
          artikelnummer?: string | null
          bijgewerkt_op?: string
          bouw7_line_id?: number | null
          eenheid?: string | null
          id?: string
          is_reservering?: boolean
          is_verwijderd?: boolean
          leverancier_naam?: string | null
          norm_hoeveelheid?: number
          offertenummer?: string | null
          omschrijving?: string | null
          opslag_pct?: number | null
          relatie_id?: string | null
          source_component_id?: string | null
          tarief?: number
          type?: string
          uurtype?: string | null
          werkbegroting_regel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbegroting_componenten_werkbegroting_regel_id_fkey"
            columns: ["werkbegroting_regel_id"]
            isOneToOne: false
            referencedRelation: "werkbegroting_regels"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbegroting_goedkeuring_regels: {
        Row: {
          goedkeuring_id: string
          kosten_centen: number | null
          regel_hash: string
          regel_id: string
        }
        Insert: {
          goedkeuring_id: string
          kosten_centen?: number | null
          regel_hash: string
          regel_id: string
        }
        Update: {
          goedkeuring_id?: string
          kosten_centen?: number | null
          regel_hash?: string
          regel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbegroting_goedkeuring_regels_goedkeuring_id_fkey"
            columns: ["goedkeuring_id"]
            isOneToOne: false
            referencedRelation: "goedkeuringen"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbegroting_regels: {
        Row: {
          aangemaakt_op: string
          bijgewerkt_op: string
          btw_pct: number | null
          btw_tarief_id: string | null
          eenheid: string
          groep_id: string | null
          hoeveelheid: number
          id: string
          is_stelpost: boolean
          is_verwijderd: boolean
          kostengroep: string | null
          omschrijving: string
          opmerking: string | null
          opslag_pct: number | null
          source_calculatieregel_id: string | null
          volgorde: number
          werkbegroting_id: string
        }
        Insert: {
          aangemaakt_op?: string
          bijgewerkt_op?: string
          btw_pct?: number | null
          btw_tarief_id?: string | null
          eenheid?: string
          groep_id?: string | null
          hoeveelheid?: number
          id?: string
          is_stelpost?: boolean
          is_verwijderd?: boolean
          kostengroep?: string | null
          omschrijving?: string
          opmerking?: string | null
          opslag_pct?: number | null
          source_calculatieregel_id?: string | null
          volgorde?: number
          werkbegroting_id: string
        }
        Update: {
          aangemaakt_op?: string
          bijgewerkt_op?: string
          btw_pct?: number | null
          btw_tarief_id?: string | null
          eenheid?: string
          groep_id?: string | null
          hoeveelheid?: number
          id?: string
          is_stelpost?: boolean
          is_verwijderd?: boolean
          kostengroep?: string | null
          omschrijving?: string
          opmerking?: string | null
          opslag_pct?: number | null
          source_calculatieregel_id?: string | null
          volgorde?: number
          werkbegroting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbegroting_regels_btw_tarief_id_fkey"
            columns: ["btw_tarief_id"]
            isOneToOne: false
            referencedRelation: "btw_tarieven"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkbegroting_regels_werkbegroting_id_fkey"
            columns: ["werkbegroting_id"]
            isOneToOne: false
            referencedRelation: "werkbegrotingen"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbegroting_wijzigingen: {
        Row: {
          aangemaakt_op: string
          component_id: string | null
          id: string
          nieuwe_waarde: string | null
          oude_waarde: string | null
          user_id: string | null
          veld: string
          werkbegroting_id: string
          werkbegroting_regel_id: string | null
        }
        Insert: {
          aangemaakt_op?: string
          component_id?: string | null
          id?: string
          nieuwe_waarde?: string | null
          oude_waarde?: string | null
          user_id?: string | null
          veld: string
          werkbegroting_id: string
          werkbegroting_regel_id?: string | null
        }
        Update: {
          aangemaakt_op?: string
          component_id?: string | null
          id?: string
          nieuwe_waarde?: string | null
          oude_waarde?: string | null
          user_id?: string | null
          veld?: string
          werkbegroting_id?: string
          werkbegroting_regel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "werkbegroting_wijzigingen_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "werkbegroting_componenten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkbegroting_wijzigingen_werkbegroting_id_fkey"
            columns: ["werkbegroting_id"]
            isOneToOne: false
            referencedRelation: "werkbegrotingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkbegroting_wijzigingen_werkbegroting_regel_id_fkey"
            columns: ["werkbegroting_regel_id"]
            isOneToOne: false
            referencedRelation: "werkbegroting_regels"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbegrotingen: {
        Row: {
          aangemaakt_op: string
          bijgewerkt_op: string
          dossier_id: string | null
          id: string
          naam: string
          project_id: string | null
          scenario_id: string
          status: string
        }
        Insert: {
          aangemaakt_op?: string
          bijgewerkt_op?: string
          dossier_id?: string | null
          id?: string
          naam?: string
          project_id?: string | null
          scenario_id: string
          status?: string
        }
        Update: {
          aangemaakt_op?: string
          bijgewerkt_op?: string
          dossier_id?: string | null
          id?: string
          naam?: string
          project_id?: string | null
          scenario_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbegrotingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossier_lijst_verrijking"
            referencedColumns: ["dossier_id"]
          },
          {
            foreignKeyName: "werkbegrotingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkbegrotingen_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "v_dossier_actief"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbon_fotos: {
        Row: {
          gemaakt_op: string
          id: string
          storage_url: string
          werkbon_id: string
        }
        Insert: {
          gemaakt_op?: string
          id?: string
          storage_url: string
          werkbon_id: string
        }
        Update: {
          gemaakt_op?: string
          id?: string
          storage_url?: string
          werkbon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbon_fotos_werkbon_id_fkey"
            columns: ["werkbon_id"]
            isOneToOne: false
            referencedRelation: "werkbonnen"
            referencedColumns: ["id"]
          },
        ]
      }
      werkbonnen: {
        Row: {
          created_at: string
          eind_dt: string
          gewerkte_uren: number
          handtekening_url: string | null
          id: string
          klaar_gemeld_op: string | null
          opmerking: string | null
          planning_item_id: string
          start_dt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          eind_dt: string
          gewerkte_uren: number
          handtekening_url?: string | null
          id?: string
          klaar_gemeld_op?: string | null
          opmerking?: string | null
          planning_item_id: string
          start_dt: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          eind_dt?: string
          gewerkte_uren?: number
          handtekening_url?: string | null
          id?: string
          klaar_gemeld_op?: string | null
          opmerking?: string | null
          planning_item_id?: string
          start_dt?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbonnen_planning_entry_id_fkey"
            columns: ["planning_item_id"]
            isOneToOne: false
            referencedRelation: "planning_items"
            referencedColumns: ["id"]
          },
        ]
      }
      werktijd_anker_keuzes: {
        Row: {
          aangemaakt_op: string
          datum: string
          gebruiker_id: string | null
          id: string
          regel_code: string
          toelichting: string | null
          trip_id: string
          updated_at: string
          user_id_ulu: number
        }
        Insert: {
          aangemaakt_op?: string
          datum: string
          gebruiker_id?: string | null
          id?: string
          regel_code: string
          toelichting?: string | null
          trip_id: string
          updated_at?: string
          user_id_ulu: number
        }
        Update: {
          aangemaakt_op?: string
          datum?: string
          gebruiker_id?: string | null
          id?: string
          regel_code?: string
          toelichting?: string | null
          trip_id?: string
          updated_at?: string
          user_id_ulu?: number
        }
        Relationships: [
          {
            foreignKeyName: "werktijd_anker_keuzes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "ulu_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werktijd_anker_keuzes_user_id_ulu_fkey"
            columns: ["user_id_ulu"]
            isOneToOne: false
            referencedRelation: "ulu_users"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instance_steps: {
        Row: {
          afgerond_door: string | null
          afgerond_op: string | null
          gestart_op: string | null
          id: string
          instance_id: string | null
          status: string
          step_id: string | null
        }
        Insert: {
          afgerond_door?: string | null
          afgerond_op?: string | null
          gestart_op?: string | null
          id?: string
          instance_id?: string | null
          status?: string
          step_id?: string | null
        }
        Update: {
          afgerond_door?: string | null
          afgerond_op?: string | null
          gestart_op?: string | null
          id?: string
          instance_id?: string | null
          status?: string
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instance_steps_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instance_steps_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instances: {
        Row: {
          afgerond_op: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          gestart_door: string | null
          id: string
          status: string
          workflow_id: string | null
        }
        Insert: {
          afgerond_op?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          gestart_door?: string | null
          id?: string
          status?: string
          workflow_id?: string | null
        }
        Update: {
          afgerond_op?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          gestart_door?: string | null
          id?: string
          status?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_step_lists: {
        Row: {
          lijst_id: string
          step_id: string
        }
        Insert: {
          lijst_id: string
          step_id: string
        }
        Update: {
          lijst_id?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_step_lists_lijst_id_fkey"
            columns: ["lijst_id"]
            isOneToOne: false
            referencedRelation: "task_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_step_lists_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          beschrijving: string | null
          config: Json | null
          geschatte_doorlooptijd: number | null
          id: string
          naam: string
          position_x: number | null
          position_y: number | null
          rol_id: string | null
          step_type: string
          workflow_id: string | null
        }
        Insert: {
          beschrijving?: string | null
          config?: Json | null
          geschatte_doorlooptijd?: number | null
          id?: string
          naam: string
          position_x?: number | null
          position_y?: number | null
          rol_id?: string | null
          step_type?: string
          workflow_id?: string | null
        }
        Update: {
          beschrijving?: string | null
          config?: Json | null
          geschatte_doorlooptijd?: number | null
          id?: string
          naam?: string
          position_x?: number | null
          position_y?: number | null
          rol_id?: string | null
          step_type?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_transitions: {
        Row: {
          conditie_config: Json | null
          conditie_type: string
          id: string
          label: string | null
          naar_step_id: string | null
          prioriteit: number | null
          van_step_id: string | null
          workflow_id: string | null
        }
        Insert: {
          conditie_config?: Json | null
          conditie_type?: string
          id?: string
          label?: string | null
          naar_step_id?: string | null
          prioriteit?: number | null
          van_step_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          conditie_config?: Json | null
          conditie_type?: string
          id?: string
          label?: string | null
          naar_step_id?: string | null
          prioriteit?: number | null
          van_step_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_transitions_naar_step_id_fkey"
            columns: ["naar_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transitions_van_step_id_fkey"
            columns: ["van_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transitions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          aangemaakt_door: string | null
          beschrijving: string | null
          created_at: string | null
          entity_type: string | null
          id: string
          is_template: boolean | null
          naam: string
          updated_at: string | null
        }
        Insert: {
          aangemaakt_door?: string | null
          beschrijving?: string | null
          created_at?: string | null
          entity_type?: string | null
          id?: string
          is_template?: boolean | null
          naam: string
          updated_at?: string | null
        }
        Update: {
          aangemaakt_door?: string | null
          beschrijving?: string | null
          created_at?: string | null
          entity_type?: string | null
          id?: string
          is_template?: boolean | null
          naam?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      dossier_lijst_verrijking: {
        Row: {
          dossier_id: string | null
          intern: boolean | null
          notitie_aantal: number | null
          notitie_laatste_auteur: string | null
          notitie_laatste_inhoud: string | null
          notitie_laatste_op: string | null
          taken_open: number | null
          taken_totaal: number | null
        }
        Relationships: []
      }
      uren_saldo_per_medewerker: {
        Row: {
          medewerker_id: string | null
          saldo_uren: number | null
        }
        Insert: {
          medewerker_id?: string | null
          saldo_uren?: never
        }
        Update: {
          medewerker_id?: string | null
          saldo_uren?: never
        }
        Relationships: []
      }
      uren_week_saldo: {
        Row: {
          contracturen: number | null
          jaar: number | null
          medewerker_id: string | null
          saldo_mutatie: number | null
          totaal_uren: number | null
          week_id: string | null
          week_nr: number | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uren_weken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "medewerkers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_weken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "uren_saldo_per_medewerker"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_weken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      v_bestuurders_overzicht: {
        Row: {
          bevindingen_open: number | null
          bijtelling_betaald: boolean | null
          kenteken: string | null
          km_prive_ytd: number | null
          km_zakelijk_ytd: number | null
          koppeling_start: string | null
          medewerker_id: string | null
          ritten_ytd: number | null
          voertuig_id: string | null
          voertuig_status: Database["public"]["Enums"]["voertuig_status"] | null
          volledige_naam: string | null
        }
        Relationships: []
      }
      v_dossier_actief: {
        Row: {
          actief: boolean | null
          id: string | null
        }
        Insert: {
          actief?: never
          id?: string | null
        }
        Update: {
          actief?: never
          id?: string | null
        }
        Relationships: []
      }
      v_parkeer_toewijzing_controle: {
        Row: {
          kenteken: string | null
          parkeer_starttijd: string | null
          parkeerkosten: number | null
          parking_id: string | null
          som_aandeel: number | null
          som_bedrag: number | null
        }
        Relationships: []
      }
      vw_group_totals: {
        Row: {
          group_id: string | null
          group_name: string | null
          project_id: string | null
          total_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "calculation_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_paint_measurement_aggregate_descriptions: {
        Row: {
          behandeling: string | null
          calculation_description: string | null
          calculation_line_id: string | null
          equipment_cost: number | null
          group_id: string | null
          id: string | null
          item_id: string | null
          labor_cost: number | null
          labor_hours: number | null
          labor_rate: number | null
          material_cost: number | null
          measurement_id: string | null
          onderdeel: string | null
          project_id: string | null
          quantity: number | null
          subcontract_cost: number | null
          treatment_id: string | null
          type: string | null
          unit: string | null
        }
        Insert: {
          behandeling?: string | null
          calculation_description?: never
          calculation_line_id?: string | null
          equipment_cost?: number | null
          group_id?: string | null
          id?: string | null
          item_id?: string | null
          labor_cost?: number | null
          labor_hours?: number | null
          labor_rate?: number | null
          material_cost?: number | null
          measurement_id?: string | null
          onderdeel?: string | null
          project_id?: string | null
          quantity?: number | null
          subcontract_cost?: number | null
          treatment_id?: string | null
          type?: string | null
          unit?: string | null
        }
        Update: {
          behandeling?: string | null
          calculation_description?: never
          calculation_line_id?: string | null
          equipment_cost?: number | null
          group_id?: string | null
          id?: string | null
          item_id?: string | null
          labor_cost?: number | null
          labor_hours?: number | null
          labor_rate?: number | null
          material_cost?: number | null
          measurement_id?: string | null
          onderdeel?: string | null
          project_id?: string | null
          quantity?: number | null
          subcontract_cost?: number | null
          treatment_id?: string | null
          type?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paint_measurement_aggregates_calculation_line_id_fkey"
            columns: ["calculation_line_id"]
            isOneToOne: false
            referencedRelation: "calculation_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "calculation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "vw_group_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "paint_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "paint_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_measurement_aggregates_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "paint_treatments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      dossier_actieve_substatus: {
        Args: {
          p_aanvraag: string
          p_hoofd: string
          p_offerte: string
          p_opdracht: string
        }
        Returns: string
      }
      fn_reconcile_dossier_rol_taken_for: {
        Args: { p_dossier_id: string }
        Returns: undefined
      }
      is_platform_gebruiker: { Args: never; Returns: boolean }
      log_fout: {
        Args: {
          p_bron: string
          p_digest?: string
          p_extra?: Json
          p_fingerprint: string
          p_fout_type?: string
          p_medewerker_id?: string
          p_melding: string
          p_module?: string
          p_omgeving: string
          p_soort?: string
          p_stack?: string
          p_url?: string
        }
        Returns: string
      }
      planning_datums_per_dossier: {
        Args: never
        Returns: {
          dossier_id: string
          planning_eind: string
          planning_start: string
        }[]
      }
      reserveer_offerte_nummer: { Args: never; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      spiegel_behandeling_naar_treatment: {
        Args: { p_behandeling_id: string }
        Returns: string
      }
      spiegel_schilder_naar_recept: {
        Args: { p_combinatie_id: string }
        Returns: undefined
      }
      volgend_kwaliteit_afwijkingnummer: { Args: never; Returns: string }
      volgend_kwaliteit_inspectienummer: { Args: never; Returns: string }
      volgend_opnamenummer: { Args: never; Returns: string }
    }
    Enums: {
      aanvraag_substatus:
        | "nieuw"
        | "inlezen_aanvraag"
        | "werkopname"
        | "uitwerken_begroting"
        | "controle_begroting"
        | "offerte_gereed"
        | "verzonden"
        | "afgewezen"
        | "vervallen"
      afhankelijkheids_type: "FS" | "SS" | "FF" | "SF"
      attribuut_veldtype: "tekst" | "datum" | "getal" | "boolean"
      bedrijf_type: "organisatie" | "werkmaatschappij"
      bedrijfsagenda_herhaling:
        | "geen"
        | "dagelijks"
        | "wekelijks"
        | "maandelijks"
        | "jaarlijks"
      bedrijfsagenda_type:
        | "vca_toolbox"
        | "audit"
        | "teamoverleg"
        | "activiteit"
        | "herinnering"
        | "atv_dag"
        | "overig"
      bedrijfsmiddel_type: "sleutel" | "telefoon" | "tankpas" | "overig"
      bestand_categorie:
        | "contract"
        | "certificaat"
        | "id_bewijs"
        | "vca_diploma"
        | "overig"
      bevinding_ernst: "info" | "waarschuwing" | "overtreding"
      bevinding_status:
        | "open"
        | "geaccepteerd_uitzondering"
        | "opgelost"
        | "afgewezen"
      brandstof_type:
        | "diesel"
        | "benzine"
        | "elektrisch"
        | "hybride"
        | "lpg"
        | "waterstof"
        | "onbekend"
      hoofdstatus: "aanvraag" | "offerte" | "opdracht"
      materieel_categorie:
        | "gereedschap"
        | "machine"
        | "aanhanger"
        | "keet"
        | "steigeronderdeel"
        | "meetapparatuur"
        | "pbm"
        | "ladder"
      materieel_document_type:
        | "foto"
        | "handleiding"
        | "ce"
        | "keuring"
        | "factuur"
        | "overig"
      materieel_status:
        | "in_gebruik"
        | "beschikbaar"
        | "gereserveerd"
        | "onderhoud"
        | "defect"
        | "vermist"
      materieel_team_type: "bus" | "keet" | "ploeg" | "algemeen"
      materieel_toewijzing_niveau: "persoonlijk" | "team" | "algemeen"
      medewerker_afwezigheid_type: "verlof" | "ziek" | "training" | "overig"
      offerte_substatus:
        | "aanvraag"
        | "in_behandeling"
        | "gecontroleerd"
        | "verzonden"
        | "vervallen"
        | "afgewezen"
        | "opdracht"
        | "concept"
        | "nabellen"
        | "mondelinge_toezegging"
        | "gewonnen"
        | "verloren"
      opdracht_substatus:
        | "nieuwe_opdracht"
        | "werkvoorbereiding"
        | "onderhanden"
        | "uitvoering_gereed"
        | "financieel_gereed"
        | "financieel_afgesloten"
      planning_activiteit_status:
        | "backlog"
        | "gepland"
        | "in_uitvoering"
        | "opgeleverd"
        | "on_hold"
      planning_item_status:
        | "gepland"
        | "in_uitvoering"
        | "opgeleverd"
        | "afgemeld"
      rit_type_berekend: "zakelijk" | "prive"
      vastgoed_object_rol:
        | "vve"
        | "eigenaar"
        | "beheerder"
        | "opdrachtgever"
        | "overig"
      vastgoed_object_soort: "vve" | "complex" | "pand" | "locatie" | "overig"
      voertuig_status: "actief" | "in_onderhoud" | "uit_dienst" | "verkocht"
      voertuig_type:
        | "werkbus"
        | "bestelwagen"
        | "station_mini_suv"
        | "station_midi_suv"
        | "personenauto"
        | "aanhanger"
        | "overig"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      aanvraag_substatus: [
        "nieuw",
        "inlezen_aanvraag",
        "werkopname",
        "uitwerken_begroting",
        "controle_begroting",
        "offerte_gereed",
        "verzonden",
        "afgewezen",
        "vervallen",
      ],
      afhankelijkheids_type: ["FS", "SS", "FF", "SF"],
      attribuut_veldtype: ["tekst", "datum", "getal", "boolean"],
      bedrijf_type: ["organisatie", "werkmaatschappij"],
      bedrijfsagenda_herhaling: [
        "geen",
        "dagelijks",
        "wekelijks",
        "maandelijks",
        "jaarlijks",
      ],
      bedrijfsagenda_type: [
        "vca_toolbox",
        "audit",
        "teamoverleg",
        "activiteit",
        "herinnering",
        "atv_dag",
        "overig",
      ],
      bedrijfsmiddel_type: ["sleutel", "telefoon", "tankpas", "overig"],
      bestand_categorie: [
        "contract",
        "certificaat",
        "id_bewijs",
        "vca_diploma",
        "overig",
      ],
      bevinding_ernst: ["info", "waarschuwing", "overtreding"],
      bevinding_status: [
        "open",
        "geaccepteerd_uitzondering",
        "opgelost",
        "afgewezen",
      ],
      brandstof_type: [
        "diesel",
        "benzine",
        "elektrisch",
        "hybride",
        "lpg",
        "waterstof",
        "onbekend",
      ],
      hoofdstatus: ["aanvraag", "offerte", "opdracht"],
      materieel_categorie: [
        "gereedschap",
        "machine",
        "aanhanger",
        "keet",
        "steigeronderdeel",
        "meetapparatuur",
        "pbm",
        "ladder",
      ],
      materieel_document_type: [
        "foto",
        "handleiding",
        "ce",
        "keuring",
        "factuur",
        "overig",
      ],
      materieel_status: [
        "in_gebruik",
        "beschikbaar",
        "gereserveerd",
        "onderhoud",
        "defect",
        "vermist",
      ],
      materieel_team_type: ["bus", "keet", "ploeg", "algemeen"],
      materieel_toewijzing_niveau: ["persoonlijk", "team", "algemeen"],
      medewerker_afwezigheid_type: ["verlof", "ziek", "training", "overig"],
      offerte_substatus: [
        "aanvraag",
        "in_behandeling",
        "gecontroleerd",
        "verzonden",
        "vervallen",
        "afgewezen",
        "opdracht",
        "concept",
        "nabellen",
        "mondelinge_toezegging",
        "gewonnen",
        "verloren",
      ],
      opdracht_substatus: [
        "nieuwe_opdracht",
        "werkvoorbereiding",
        "onderhanden",
        "uitvoering_gereed",
        "financieel_gereed",
        "financieel_afgesloten",
      ],
      planning_activiteit_status: [
        "backlog",
        "gepland",
        "in_uitvoering",
        "opgeleverd",
        "on_hold",
      ],
      planning_item_status: [
        "gepland",
        "in_uitvoering",
        "opgeleverd",
        "afgemeld",
      ],
      rit_type_berekend: ["zakelijk", "prive"],
      vastgoed_object_rol: [
        "vve",
        "eigenaar",
        "beheerder",
        "opdrachtgever",
        "overig",
      ],
      vastgoed_object_soort: ["vve", "complex", "pand", "locatie", "overig"],
      voertuig_status: ["actief", "in_onderhoud", "uit_dienst", "verkocht"],
      voertuig_type: [
        "werkbus",
        "bestelwagen",
        "station_mini_suv",
        "station_midi_suv",
        "personenauto",
        "aanhanger",
        "overig",
      ],
    },
  },
} as const
