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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
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
          adres_plaats: string | null
          adres_postcode: string | null
          adres_straat: string | null
          btw_nummer: string | null
          code: string | null
          created_at: string
          email: string | null
          font_primair: string | null
          font_secundair: string | null
          huisstijl_notities: string | null
          iban: string | null
          id: string
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
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          btw_nummer?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          font_primair?: string | null
          font_secundair?: string | null
          huisstijl_notities?: string | null
          iban?: string | null
          id?: string
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
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          btw_nummer?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          font_primair?: string | null
          font_secundair?: string | null
          huisstijl_notities?: string | null
          iban?: string | null
          id?: string
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
          id: number
          overige: Json
          updated_at: string
          uurtarieven: Json
        }
        Insert: {
          btw_tarieven?: Json
          id?: number
          overige?: Json
          updated_at?: string
          uurtarieven?: Json
        }
        Update: {
          btw_tarieven?: Json
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
          bouw7_sync_status: string | null
          created_at: string
          created_by: string | null
          email: string | null
          geboortedatum: string | null
          geslacht: string | null
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
          bouw7_sync_status?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          geboortedatum?: string | null
          geslacht?: string | null
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
          bouw7_sync_status?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          geboortedatum?: string | null
          geslacht?: string | null
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
          id: string
          is_primair: boolean
          opmerkingen: string | null
          organisatie_id: string
        }
        Insert: {
          contactpersoon_id: string
          created_at?: string
          functie?: string | null
          id?: string
          is_primair?: boolean
          opmerkingen?: string | null
          organisatie_id: string
        }
        Update: {
          contactpersoon_id?: string
          created_at?: string
          functie?: string | null
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
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
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
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          aanvraag_substatus:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          bedrag_excl_btw: number | null
          bedrag_incl_btw: number | null
          btw_splitsing: Json | null
          bouw7_categorie: string | null
          bouw7_categorie_id: number | null
          bouw7_categorie_naam: string | null
          bouw7_filiaal: string | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_projectstatus_id: number | null
          bouw7_projectstatus_naam: string | null
          bouw7_quotation_status: string | null
          bouw7_stad: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_status: string | null
          calculator_id: string | null
          categorie: string | null
          contactpersoon_id: string | null
          controller_id: string | null
          created_at: string
          created_by: string | null
          dossiernummer: string | null
          everts_calc_project_id: string | null
          factuuradres_id: string | null
          facturatiemethode: string
          facturatiemethode_handmatig: boolean
          gearchiveerd: boolean
          hoofdstatus: Database["public"]["Enums"]["hoofdstatus"]
          id: string
          klant_id: string | null
          kostprijs_excl_btw: number | null
          mandaat_bedrag: number | null
          offerte_substatus:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          opdracht_referentie: string | null
          opdracht_substatus:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          interne_opmerkingen: string | null
          opmerkingen: string | null
          project_manager_id: string | null
          referentie: string | null
          servicedesk_substatus: string | null
          teamleider_id: string | null
          titel: string
          uitvoerder_id: string | null
          updated_at: string
          verwacht_einddatum: string | null
          verwacht_startdatum: string | null
          verzonden_op: string | null
          werkadres_email: string | null
          werkadres_naam: string | null
          werkadres_postcode: string | null
          werkadres_stad: string | null
          werkadres_straat: string | null
          werkadres_telefoon: string | null
          werkvoorbereider_id: string | null
        }
        Insert: {
          aanvraag_substatus?:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          bedrag_excl_btw?: number | null
          bedrag_incl_btw?: number | null
          btw_splitsing?: Json | null
          bouw7_categorie?: string | null
          bouw7_categorie_id?: number | null
          bouw7_categorie_naam?: string | null
          bouw7_filiaal?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_projectstatus_id?: number | null
          bouw7_projectstatus_naam?: string | null
          bouw7_quotation_status?: string | null
          bouw7_stad?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string | null
          calculator_id?: string | null
          categorie?: string | null
          contactpersoon_id?: string | null
          controller_id?: string | null
          created_at?: string
          created_by?: string | null
          dossiernummer?: string | null
          everts_calc_project_id?: string | null
          factuuradres_id?: string | null
          facturatiemethode?: string
          facturatiemethode_handmatig?: boolean
          gearchiveerd?: boolean
          hoofdstatus?: Database["public"]["Enums"]["hoofdstatus"]
          id?: string
          klant_id?: string | null
          kostprijs_excl_btw?: number | null
          mandaat_bedrag?: number | null
          offerte_substatus?:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          opdracht_referentie?: string | null
          opdracht_substatus?:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          interne_opmerkingen?: string | null
          opmerkingen?: string | null
          project_manager_id?: string | null
          referentie?: string | null
          servicedesk_substatus?: string | null
          teamleider_id?: string | null
          titel: string
          uitvoerder_id?: string | null
          updated_at?: string
          verwacht_einddatum?: string | null
          verwacht_startdatum?: string | null
          verzonden_op?: string | null
          werkadres_email?: string | null
          werkadres_naam?: string | null
          werkadres_postcode?: string | null
          werkadres_stad?: string | null
          werkadres_straat?: string | null
          werkadres_telefoon?: string | null
          werkvoorbereider_id?: string | null
        }
        Update: {
          aanvraag_substatus?:
            | Database["public"]["Enums"]["aanvraag_substatus"]
            | null
          bedrag_excl_btw?: number | null
          bedrag_incl_btw?: number | null
          btw_splitsing?: Json | null
          bouw7_categorie?: string | null
          bouw7_categorie_id?: number | null
          bouw7_categorie_naam?: string | null
          bouw7_filiaal?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_projectstatus_id?: number | null
          bouw7_projectstatus_naam?: string | null
          bouw7_quotation_status?: string | null
          bouw7_stad?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string | null
          calculator_id?: string | null
          categorie?: string | null
          contactpersoon_id?: string | null
          controller_id?: string | null
          created_at?: string
          created_by?: string | null
          dossiernummer?: string | null
          everts_calc_project_id?: string | null
          factuuradres_id?: string | null
          facturatiemethode?: string
          facturatiemethode_handmatig?: boolean
          gearchiveerd?: boolean
          hoofdstatus?: Database["public"]["Enums"]["hoofdstatus"]
          id?: string
          klant_id?: string | null
          kostprijs_excl_btw?: number | null
          mandaat_bedrag?: number | null
          offerte_substatus?:
            | Database["public"]["Enums"]["offerte_substatus"]
            | null
          opdracht_referentie?: string | null
          opdracht_substatus?:
            | Database["public"]["Enums"]["opdracht_substatus"]
            | null
          interne_opmerkingen?: string | null
          opmerkingen?: string | null
          project_manager_id?: string | null
          referentie?: string | null
          servicedesk_substatus?: string | null
          teamleider_id?: string | null
          titel?: string
          uitvoerder_id?: string | null
          updated_at?: string
          verwacht_einddatum?: string | null
          verwacht_startdatum?: string | null
          verzonden_op?: string | null
          werkadres_email?: string | null
          werkadres_naam?: string | null
          werkadres_postcode?: string | null
          werkadres_stad?: string | null
          werkadres_straat?: string | null
          werkadres_telefoon?: string | null
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
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
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
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
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
      form_taken: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          bijgewerkt_op: string
          deadline: string | null
          dossier_id: string | null
          id: string
          inzending_id: string | null
          opmerkingen: string | null
          status: string
          template_id: string
          toegewezen_aan: string | null
          vooringevuld: Json | null
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          bijgewerkt_op?: string
          deadline?: string | null
          dossier_id?: string | null
          id?: string
          inzending_id?: string | null
          opmerkingen?: string | null
          status?: string
          template_id: string
          toegewezen_aan?: string | null
          vooringevuld?: Json | null
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          bijgewerkt_op?: string
          deadline?: string | null
          dossier_id?: string | null
          id?: string
          inzending_id?: string | null
          opmerkingen?: string | null
          status?: string
          template_id?: string
          toegewezen_aan?: string | null
          vooringevuld?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_taken_inzending_id_fkey"
            columns: ["inzending_id"]
            isOneToOne: false
            referencedRelation: "form_inzendingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_taken_template_id_fkey"
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
      formulier_pdf_config: {
        Row: {
          bijgewerkt_op: string
          id: string
          koptekst: string | null
          toon_invuller: boolean
          toon_logo: boolean
          toon_project_ref: boolean
          voettekst: string | null
        }
        Insert: {
          bijgewerkt_op?: string
          id?: string
          koptekst?: string | null
          toon_invuller?: boolean
          toon_logo?: boolean
          toon_project_ref?: boolean
          voettekst?: string | null
        }
        Update: {
          bijgewerkt_op?: string
          id?: string
          koptekst?: string | null
          toon_invuller?: boolean
          toon_logo?: boolean
          toon_project_ref?: boolean
          voettekst?: string | null
        }
        Relationships: []
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
          standaard_rooster: Json | null
          volgorde: number
        }
        Insert: {
          actief?: boolean
          created_at?: string | null
          id?: string
          naam: string
          standaard_rooster?: Json | null
          volgorde?: number
        }
        Update: {
          actief?: boolean
          created_at?: string | null
          id?: string
          naam?: string
          standaard_rooster?: Json | null
          volgorde?: number
        }
        Relationships: []
      }
      medewerker_o365_tokens: {
        Row: {
          access_token: string
          created_at: string
          medewerker_id: string
          refresh_token: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          medewerker_id: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          medewerker_id?: string
          refresh_token?: string | null
          scopes?: string[] | null
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
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
        ]
      }
      medewerkers: {
        Row: {
          achternaam: string
          actief: boolean
          adres_plaats: string | null
          adres_postcode: string | null
          adres_straat: string | null
          afdeling: string | null
          auth_user_id: string | null
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_fout: string | null
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
          handtekening_url: string | null
          id: string
          in_dienst_vanaf: string | null
          kleur: string | null
          notificatie_voorkeuren: Json
          o365_email: string | null
          o365_tenant_id: string | null
          o365_user_id: string | null
          rechten_override: Json
          relatie_id: string | null
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
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          afdeling?: string | null
          auth_user_id?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
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
          handtekening_url?: string | null
          id?: string
          in_dienst_vanaf?: string | null
          kleur?: string | null
          notificatie_voorkeuren?: Json
          o365_email?: string | null
          o365_tenant_id?: string | null
          o365_user_id?: string | null
          rechten_override?: Json
          relatie_id?: string | null
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
          adres_plaats?: string | null
          adres_postcode?: string | null
          adres_straat?: string | null
          afdeling?: string | null
          auth_user_id?: string | null
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
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
          handtekening_url?: string | null
          id?: string
          in_dienst_vanaf?: string | null
          kleur?: string | null
          notificatie_voorkeuren?: Json
          o365_email?: string | null
          o365_tenant_id?: string | null
          o365_user_id?: string | null
          rechten_override?: Json
          relatie_id?: string | null
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
            foreignKeyName: "medewerkers_relatie_id_fkey"
            columns: ["relatie_id"]
            isOneToOne: false
            referencedRelation: "relaties"
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
      notificaties: {
        Row: {
          aangemaakt_op: string
          body: string | null
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
          gelezen?: boolean
          id?: string
          titel?: string
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      paint_items: {
        Row: {
          active: boolean
          btw_tarief: string
          default_unit: string | null
          description: string | null
          family_id: string
          full_name: string
          id: string
          item_code: string
          onderdeel: string
          source: string | null
          treatment_id: string
          type: string
        }
        Insert: {
          active?: boolean
          btw_tarief?: string
          default_unit?: string | null
          description?: string | null
          family_id: string
          full_name: string
          id?: string
          item_code: string
          onderdeel: string
          source?: string | null
          treatment_id: string
          type: string
        }
        Update: {
          active?: boolean
          btw_tarief?: string
          default_unit?: string | null
          description?: string | null
          family_id?: string
          full_name?: string
          id?: string
          item_code?: string
          onderdeel?: string
          source?: string | null
          treatment_id?: string
          type?: string
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
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
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
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
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
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
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
            referencedRelation: "dossiers"
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
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_items: {
        Row: {
          activiteit_id: string
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
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
          code: string
          created_at: string
          everts_calc_omschrijvingen: string[]
          id: string
          kleur: string
          naam: string
          updated_at: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          code: string
          created_at?: string
          everts_calc_omschrijvingen?: string[]
          id?: string
          kleur?: string
          naam: string
          updated_at?: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          code?: string
          created_at?: string
          everts_calc_omschrijvingen?: string[]
          id?: string
          kleur?: string
          naam?: string
          updated_at?: string
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
            referencedRelation: "dossiers"
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
      quote_layouts: {
        Row: {
          accent_kleur: string | null
          beschrijving: string | null
          created_at: string | null
          docx_template_url: string | null
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
          created_at?: string | null
          docx_template_url?: string | null
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
          created_at?: string | null
          docx_template_url?: string | null
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
          section_id: string | null
          updated_at: string | null
          uren_pe: number | null
          volgorde: number
        }
        Insert: {
          btw_pct?: number
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
          section_id?: string | null
          updated_at?: string | null
          uren_pe?: number | null
          volgorde?: number
        }
        Update: {
          btw_pct?: number
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
          section_id?: string | null
          updated_at?: string | null
          uren_pe?: number | null
          volgorde?: number
        }
        Relationships: [
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
          btw_bedrag: number
          btw_pct: number
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
          opties_subtotaal: number
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
          voorwaarden_id: string | null
        }
        Insert: {
          aanhef?: string | null
          betalingsconditie_id?: string | null
          btw_bedrag?: number
          btw_pct?: number
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
          opties_subtotaal?: number
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
          voorwaarden_id?: string | null
        }
        Update: {
          aanhef?: string | null
          betalingsconditie_id?: string | null
          btw_bedrag?: number
          btw_pct?: number
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
          opties_subtotaal?: number
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
          voorwaarden_id?: string | null
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
      relatie_bankgegevens: {
        Row: {
          bic: string | null
          created_at: string
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
          bouw7_id: string | null
          bouw7_laatst_sync: string | null
          bouw7_sync_fout: string | null
          bouw7_sync_status: string | null
          btw_nummer: string | null
          created_at: string
          created_by: string | null
          email: string | null
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
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string | null
          btw_nummer?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
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
          bouw7_id?: string | null
          bouw7_laatst_sync?: string | null
          bouw7_sync_fout?: string | null
          bouw7_sync_status?: string | null
          btw_nummer?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
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
          created_at: string
          id: string
          onderdeel_id: string
          type_id: string
          updated_at: string
        }
        Insert: {
          actief?: boolean
          behandeling_id: string
          created_at?: string
          id?: string
          onderdeel_id: string
          type_id: string
          updated_at?: string
        }
        Update: {
          actief?: boolean
          behandeling_id?: string
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
          updated_at: string
          volgorde: number
        }
        Insert: {
          actief?: boolean
          code?: string | null
          created_at?: string
          id?: string
          naam: string
          updated_at?: string
          volgorde?: number
        }
        Update: {
          actief?: boolean
          code?: string | null
          created_at?: string
          id?: string
          naam?: string
          updated_at?: string
          volgorde?: number
        }
        Relationships: []
      }
      schilder_types: {
        Row: {
          actief: boolean
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
          created_at: string | null
          dossier_id: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_template: boolean | null
          naam: string
          owner_id: string | null
          template_id: string | null
          template_naam: string | null
          trigger_hoofdstatus: string | null
          trigger_substatus: string | null
          updated_at: string | null
          volgorde: number | null
        }
        Insert: {
          beschrijving?: string | null
          created_at?: string | null
          dossier_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_template?: boolean | null
          naam: string
          owner_id?: string | null
          template_id?: string | null
          template_naam?: string | null
          trigger_hoofdstatus?: string | null
          trigger_substatus?: string | null
          updated_at?: string | null
          volgorde?: number | null
        }
        Update: {
          beschrijving?: string | null
          created_at?: string | null
          dossier_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_template?: boolean | null
          naam?: string
          owner_id?: string | null
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
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
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
      tasks: {
        Row: {
          aangemaakt_door: string | null
          assignee_type: string
          blocked_by_task_id: string | null
          created_at: string | null
          deadline: string | null
          deadline_offset_dagen: number | null
          dossier_rollen: string[]
          formulier_template_id: string | null
          geschatte_uren: number | null
          id: string
          lijst_id: string | null
          max_doorlooptijd_dagen: number | null
          omschrijving: Json | null
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
          blocked_by_task_id?: string | null
          created_at?: string | null
          deadline?: string | null
          deadline_offset_dagen?: number | null
          dossier_rollen?: string[]
          formulier_template_id?: string | null
          geschatte_uren?: number | null
          id?: string
          lijst_id?: string | null
          max_doorlooptijd_dagen?: number | null
          omschrijving?: Json | null
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
          blocked_by_task_id?: string | null
          created_at?: string | null
          deadline?: string | null
          deadline_offset_dagen?: number | null
          dossier_rollen?: string[]
          formulier_template_id?: string | null
          geschatte_uren?: number | null
          id?: string
          lijst_id?: string | null
          max_doorlooptijd_dagen?: number | null
          omschrijving?: Json | null
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
            foreignKeyName: "tasks_formulier_template_id_fkey"
            columns: ["formulier_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
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
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
          start_tijd: string
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
          start_tijd: string
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
          start_tijd?: string
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
      uren_regels: {
        Row: {
          created_at: string
          datum: string
          dossier_id: string
          id: string
          medewerker_id: string
          opmerking: string | null
          planning_item_id: string | null
          uren: number
          uursoort_id: string | null
          werkbon_id: string
        }
        Insert: {
          created_at?: string
          datum: string
          dossier_id: string
          id?: string
          medewerker_id: string
          opmerking?: string | null
          planning_item_id?: string | null
          uren: number
          uursoort_id?: string | null
          werkbon_id: string
        }
        Update: {
          created_at?: string
          datum?: string
          dossier_id?: string
          id?: string
          medewerker_id?: string
          opmerking?: string | null
          planning_item_id?: string | null
          uren?: number
          uursoort_id?: string | null
          werkbon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uren_regels_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
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
            referencedRelation: "v_bestuurders_overzicht"
            referencedColumns: ["medewerker_id"]
          },
          {
            foreignKeyName: "uren_regels_planning_entry_id_fkey"
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
            foreignKeyName: "uren_regels_werkbon_id_fkey"
            columns: ["werkbon_id"]
            isOneToOne: false
            referencedRelation: "werkbonnen"
            referencedColumns: ["id"]
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
          bijgewerkt_op: string
          id: string
          omschrijving: string
          relatie_id: string | null
          status: string
          werkbegroting_id: string
        }
        Insert: {
          aangemaakt_op?: string
          bijgewerkt_op?: string
          id?: string
          omschrijving: string
          relatie_id?: string | null
          status?: string
          werkbegroting_id: string
        }
        Update: {
          aangemaakt_op?: string
          bijgewerkt_op?: string
          id?: string
          omschrijving?: string
          relatie_id?: string | null
          status?: string
          werkbegroting_id?: string
        }
        Relationships: [
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
          bijgewerkt_op: string
          eenheid: string | null
          id: string
          leverancier_naam: string | null
          norm_hoeveelheid: number
          offertenummer: string | null
          omschrijving: string | null
          opslag_pct: number | null
          relatie_id: string | null
          source_component_id: string | null
          tarief: number
          type: string
          werkbegroting_regel_id: string
        }
        Insert: {
          aangemaakt_op?: string
          aannemersnaam?: string | null
          bijgewerkt_op?: string
          eenheid?: string | null
          id?: string
          leverancier_naam?: string | null
          norm_hoeveelheid?: number
          offertenummer?: string | null
          omschrijving?: string | null
          opslag_pct?: number | null
          relatie_id?: string | null
          source_component_id?: string | null
          tarief?: number
          type: string
          werkbegroting_regel_id: string
        }
        Update: {
          aangemaakt_op?: string
          aannemersnaam?: string | null
          bijgewerkt_op?: string
          eenheid?: string | null
          id?: string
          leverancier_naam?: string | null
          norm_hoeveelheid?: number
          offertenummer?: string | null
          omschrijving?: string | null
          opslag_pct?: number | null
          relatie_id?: string | null
          source_component_id?: string | null
          tarief?: number
          type?: string
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
      werkbegroting_regels: {
        Row: {
          aangemaakt_op: string
          bijgewerkt_op: string
          btw_pct: number | null
          eenheid: string
          groep_id: string
          hoeveelheid: number
          id: string
          is_stelpost: boolean
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
          eenheid?: string
          groep_id: string
          hoeveelheid?: number
          id?: string
          is_stelpost?: boolean
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
          eenheid?: string
          groep_id?: string
          hoeveelheid?: number
          id?: string
          is_stelpost?: boolean
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
            foreignKeyName: "werkbegroting_regels_groep_id_fkey"
            columns: ["groep_id"]
            isOneToOne: false
            referencedRelation: "calculation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "werkbegroting_regels_groep_id_fkey"
            columns: ["groep_id"]
            isOneToOne: false
            referencedRelation: "vw_group_totals"
            referencedColumns: ["group_id"]
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
          id: string
          naam: string
          project_id: string
          scenario_id: string
          status: string
        }
        Insert: {
          aangemaakt_op?: string
          bijgewerkt_op?: string
          id?: string
          naam?: string
          project_id: string
          scenario_id: string
          status?: string
        }
        Update: {
          aangemaakt_op?: string
          bijgewerkt_op?: string
          id?: string
          naam?: string
          project_id?: string
          scenario_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "werkbegrotingen_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      planning_datums_per_dossier: {
        Args: never
        Returns: {
          dossier_id: string
          planning_eind: string
          planning_start: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
