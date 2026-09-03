/**
 * Opname (mutatiewerk) — types en labels.
 *
 * Deze module is client-veilig: geen `server-only`, geen Supabase-import. De mobiele
 * opnameschermen, de desktop-tab, de bibliotheekbeheerder en de calculatie-import delen deze
 * definities.
 *
 * Match met `supabase/migrations/20260902d_opname.sql`. De DB kent de enums als CHECK-constraints
 * (geen Postgres-enums), dus uitbreiden vraagt een `alter ... drop/add constraint` plus een
 * aanpassing hier. De `Record<...>`-labelmappen zijn exhaustive: een nieuwe waarde toevoegen laat
 * de compiler alle plekken aanwijzen die hem moeten kennen.
 */

// ── Prijslijst ───────────────────────────────────────────────────────────────

export type OpnamePrijslijstStatus = 'concept' | 'actief' | 'vervallen'

export const OPNAME_PRIJSLIJST_STATUS_LABELS: Record<OpnamePrijslijstStatus, string> = {
  concept: 'Concept',
  actief: 'Actief',
  vervallen: 'Vervallen',
}

export type OpnamePrijslijst = {
  id: string
  relatie_id: string
  naam: string
  jaargang: string | null
  geldig_vanaf: string | null
  geldig_tot: string | null
  status: OpnamePrijslijstStatus
  /**
   * Leidt een kostprijs af bij vaste-prijs-onderdelen zonder eigen kostprijs of recept:
   * kostprijs = verkoop / (1 + pct/100). Op 0 betekent kostprijs = verkoopprijs, dus marge 0.
   */
  standaard_opslag_pct: number
  /** Kostprijs-uurtarief, zodat de uren van een vaste-prijs-onderdeel echte arbeid worden. */
  uurtarief_kostprijs: number | null
  btw_tarief_id: string | null
  bron_bestand: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type OpnamePrijslijstInput = Omit<
  OpnamePrijslijst,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>

// ── Onderdeel (bibliotheek) ──────────────────────────────────────────────────

/**
 * Twee onafhankelijke assen op één onderdeel:
 *   `prijs_soort`   bepaalt hoe de VERKOOPPRIJS ontstaat;
 *   `paint_item_id` bepaalt waar de KOSTPRIJS vandaan komt.
 *
 * Daardoor dekt één rij alle drie de praktijkgevallen: puur recept, afgesproken prijs mét recept
 * als kostenonderbouwing, en afgesproken prijs zonder onderbouwing.
 */
export type OpnamePrijsSoort = 'vast' | 'recept'

export const OPNAME_PRIJS_SOORT_LABELS: Record<OpnamePrijsSoort, string> = {
  vast: 'Vaste prijs',
  recept: 'Recept',
}

export type OpnameOnderdeel = {
  id: string
  prijslijst_id: string
  code: string
  hoofdgroep: string | null
  subgroep: string | null
  omschrijving: string
  toelichting: string | null
  eenheid: string
  prijs_soort: OpnamePrijsSoort
  /** Verplicht bij prijs_soort 'vast'; bij 'recept' berekend en hier alleen als cache. */
  verkoop_pe: number | null
  kostprijs_pe: number | null
  uren_pe: number | null
  /** Verplicht bij prijs_soort 'recept'; verwijst naar public.paint_items. */
  paint_item_id: string | null
  opslag_pct: number | null
  btw_tarief_id: string | null
  btw_pct: number | null
  kostengroep: string | null
  foto_verplicht: boolean
  toelichting_verplicht: boolean
  standaard_aantal: number
  aantal_stap: number
  volgorde: number
  actief: boolean
  created_at: string
  updated_at: string
}

export type OpnameOnderdeelInput = Omit<
  OpnameOnderdeel,
  'id' | 'created_at' | 'updated_at'
>

/**
 * Wat de mobiele kiezer nodig heeft. Bewust smal: deze lijst gaat in zijn geheel naar de telefoon
 * en wordt daar lokaal gefilterd, dus elke kolom telt.
 */
export type OpnameOnderdeelKeuze = Pick<
  OpnameOnderdeel,
  | 'id' | 'code' | 'hoofdgroep' | 'subgroep' | 'omschrijving' | 'toelichting'
  | 'eenheid' | 'prijs_soort' | 'verkoop_pe' | 'foto_verplicht'
  | 'toelichting_verplicht' | 'standaard_aantal' | 'aantal_stap'
>

// ── Ruimte ───────────────────────────────────────────────────────────────────

export type OpnameRuimte = {
  id: string
  prijslijst_id: string
  naam: string
  volgorde: number
  actief: boolean
  created_at: string
}

// ── Opname ───────────────────────────────────────────────────────────────────

export type OpnameSoort = 'mutatie' | 'vooropname' | 'naopname'

export const OPNAME_SOORT_LABELS: Record<OpnameSoort, string> = {
  mutatie: 'Mutatie',
  vooropname: 'Vooropname',
  naopname: 'Naopname',
}

export type OpnameStatus = 'concept' | 'gereed' | 'omgezet' | 'geannuleerd'

export const OPNAME_STATUS_LABELS: Record<OpnameStatus, string> = {
  concept: 'Concept',
  gereed: 'Gereed',
  omgezet: 'In calculatie',
  geannuleerd: 'Geannuleerd',
}

/** Alleen een opname in concept is nog te bewerken door de opnemer. */
export function opnameBewerkbaar(status: OpnameStatus): boolean {
  return status === 'concept'
}

export type Opname = {
  id: string
  opnamenummer: string
  dossier_id: string
  prijslijst_id: string
  relatie_id: string | null
  task_id: string | null
  opnemer_id: string | null
  datum: string
  adres_vrij: string | null
  vhe_aanduiding: string | null
  soort: OpnameSoort
  status: OpnameStatus
  gereed_op: string | null
  gereed_door: string | null
  calculatie_project_id: string | null
  calculatie_scenario_id: string | null
  /** De bovengroep in de calculatie; bij een herimport hergebruikt, nooit een tweede blok. */
  calculatie_groep_id: string | null
  omgezet_op: string | null
  omgezet_door: string | null
  opmerking: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

// ── Regel ────────────────────────────────────────────────────────────────────

export type OpnameNormType = 'arbeid' | 'materieel' | 'onderaanneming'

/**
 * Bevroren componentregel. Één-op-één de velden die `Componentregel` in de calculatie nodig heeft,
 * zodat de import een pure vertaling is en geen opzoekwerk in de bibliotheek.
 */
export type OpnameNorm = {
  type: OpnameNormType
  norm_hoeveelheid: number
  eenheid: string
  tarief: number
  omschrijving?: string | null
}

export type OpnameRegel = {
  /**
   * Client-gegenereerd. Wordt óók de Calculatieregel.id, waardoor zowel het nasturen vanuit de
   * offline-wachtrij als de import naar de calculatie idempotent is.
   */
  id: string
  opname_id: string
  onderdeel_id: string | null
  ruimte: string | null
  ruimte_id: string | null
  volgorde: number
  aantal: number
  toelichting_opnemer: string | null

  // snapshot van de prijsafspraak, bevroren op het moment van toevoegen
  onderdeel_code: string | null
  omschrijving: string
  eenheid: string
  prijs_soort: OpnamePrijsSoort
  verkoop_pe: number | null
  kostprijs_pe: number | null
  uren_pe: number | null
  opslag_pct: number | null
  btw_tarief_id: string | null
  btw_pct: number | null
  kostengroep: string | null
  normen: OpnameNorm[]

  /** GENERATED in de database — nooit zelf schrijven. */
  regel_verkoop_totaal: number
  /** GENERATED in de database — nooit zelf schrijven. */
  regel_kostprijs_totaal: number

  client_bijgewerkt_op: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Wat de client mag wegschrijven: de generated totalen ontbreken hier met opzet. */
export type OpnameRegelInput = Omit<
  OpnameRegel,
  'regel_verkoop_totaal' | 'regel_kostprijs_totaal' | 'created_at' | 'updated_at' | 'created_by'
>

// ── Foto ─────────────────────────────────────────────────────────────────────

export type OpnameFotoSoort = 'overzicht' | 'detail' | 'schade' | 'meterstand'

export const OPNAME_FOTO_SOORT_LABELS: Record<OpnameFotoSoort, string> = {
  overzicht: 'Overzicht',
  detail: 'Detail',
  schade: 'Schade',
  meterstand: 'Meterstand',
}

export type OpnameFoto = {
  id: string
  opname_id: string
  /** Leeg = algemene foto bij de opname. Gevuld = foto bij die begrotingsregel. */
  regel_id: string | null
  pad: string
  url: string
  soort: OpnameFotoSoort
  omschrijving: string | null
  volgorde: number
  /** De foto die bij de import naar de calculatie wordt meegenomen. */
  is_hoofdfoto: boolean
  created_at: string
  created_by: string | null
}

// ── Samengestelde vormen ─────────────────────────────────────────────────────

export type OpnameMetRegels = Opname & {
  regels: OpnameRegel[]
  fotos: OpnameFoto[]
}

/** Regels gegroepeerd per ruimte, zoals de mobiele lijst en de desktop-tab ze tonen. */
export type OpnameRuimteGroep = {
  ruimte: string
  regels: OpnameRegel[]
  verkoop_totaal: number
}

/**
 * Groepeert op de ruimtenaam zoals die op de regel staat — niet op ruimte_id, want een opnemer mag
 * een eigen ruimtenaam typen en die heeft geen id.
 */
export function groepeerPerRuimte(regels: OpnameRegel[]): OpnameRuimteGroep[] {
  const perRuimte = new Map<string, OpnameRegel[]>()
  for (const regel of regels) {
    const sleutel = regel.ruimte?.trim() || 'Overig'
    const bestaand = perRuimte.get(sleutel)
    if (bestaand) bestaand.push(regel)
    else perRuimte.set(sleutel, [regel])
  }
  return Array.from(perRuimte, ([ruimte, eigenRegels]) => ({
    ruimte,
    regels: [...eigenRegels].sort((a, b) => a.volgorde - b.volgorde),
    verkoop_totaal: eigenRegels.reduce((som, r) => som + (r.regel_verkoop_totaal ?? 0), 0),
  }))
}
