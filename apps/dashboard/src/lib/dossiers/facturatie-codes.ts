'use server'

/**
 * Welke bewakingscodes van een dossier mogen op een verkoopfactuur komen.
 *
 * Dit is de belangrijkste vraag van de hele facturatie, en het antwoord is streng: op een
 * aangenomen opdracht zit verreweg het meeste werk al ín de aanneemsom. Die kosten zijn via de
 * termijnen al gefactureerd; ze nóg eens als regie doorbelasten is dubbel factureren.
 *
 * Nagecalculeerd wordt alleen wat als zodanig is afgesproken:
 *
 *   • een **meerwerkregel met afrekenwijze `regie`** — daar is expliciet vastgelegd dat er op
 *     werkelijke kosten wordt afgerekend;
 *   • een **stelpost** — die rekent per definitie op werkelijke kosten af;
 *   • de **kostengroep van een servicedeskbon op regie** (`RW01`) — zo'n bon is in zijn geheel
 *     nacalculatie; daar is geen aanneemsom waar iets al in zit. Zie `bon-bewakingscode.ts`.
 *
 * De tegenhanger `AW01` van een **aangenomen** bon hoort hier nadrukkelijk **niet** in. Die groep
 * draagt de kosten, niet de opbrengst: de opbrengst ligt vast in de aanneemsom en gaat via de
 * termijnstaat. Zou hij hier staan, dan bood het factuurvoorstel aan om hetzelfde werk bovenop de
 * aanneemsom nóg eens in rekening te brengen.
 *
 * Bij een meerwerkregel geldt daarbovenop dat de klant akkoord moet zijn. Vóór dat akkoord bestaat
 * de bewakingscode nog niet in Bouw7 — die wordt pas bij `akkoord` aangemaakt (zie `meerwerk.ts`),
 * dus er kunnen geen kosten op geboekt of naartoe verplaatst worden. Zo'n post in het
 * nacalculatie-overzicht zetten suggereert een factuurregel die er geen is, en blijft per definitie
 * op nul staan.
 *
 * En één uitzondering die er echt toe doet: zit een stelpost **in de aanneemsom** (carve-out), dan
 * is hij al betaald via de termijnen en is alleen het *verschil* nog te verrekenen. Dat verschil
 * loopt via `verrekenStelpost` naar een aparte meerwerkregel. Zo'n stelpost hoort dus níét als
 * volledige factuurregel op te duiken — dat zou hem twee keer in rekening brengen.
 *
 * Alle overige codes (WERKZAAMHEDEN, ALGEMEEN, bouwplaatskosten…) blijven buiten beeld.
 */

import { createAdminClient } from '@everts/database/server'
import { REGIE_BEWAKINGSCODE_NAAM } from '@/components/dossiers/types'

export type FactureerbareCode = {
  bewakingscode: string
  bron: 'stelpost' | 'meerwerk' | 'regie'
  /** Id van de stelpost of meerwerkregel waar deze code bij hoort; bij 'regie' het dossier zelf. */
  bronId: string
  /** Naam zoals hij standaard op de factuur komt. */
  omschrijving: string
  /**
   * Alleen het verschil is nog te factureren, want de post zit al in de aanneemsom. Zulke codes
   * horen niet in het factuurvoorstel; ze staan hier zodat het scherm kan uitleggen wáárom.
   */
  alleenVerschil: boolean
  /** Eigen opslagpercentage van de stelpost; leeg = de bedrijfsstandaard. */
  opslagPct: number | null
  /**
   * Staat deze bewakingscode ook echt in Bouw7? Zo niet, dan kunnen er geen kosten op geboekt
   * worden en blijft de post op nul staan — dat moet zichtbaar zijn, anders lijkt het of er niets
   * is uitgegeven.
   */
  inBouw7: boolean
}

/**
 * De bewakingscodes van dit dossier die op nacalculatie afrekenen, met hun herkomst.
 * Codes die nergens aan hangen komen hier niet in voor — die zitten in de aanneemsom.
 */
export async function getFactureerbareCodes(dossierId: string): Promise<FactureerbareCode[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [stelposten, meerwerk, dossier] = await Promise.all([
    supabase
      .from('opdracht_onderdelen')
      .select('id, omschrijving, bewakingscode, in_aanneemsom, in_opdracht, opslag_pct, grondslag, bouw7_chapter_id')
      .eq('dossier_id', dossierId)
      .eq('soort', 'stelpost')
      .not('bewakingscode', 'is', null),
    supabase
      .from('meerwerk_regels')
      .select('id, omschrijving, bewakingscode, afrekenwijze, is_stelpost, status, opdracht_onderdeel_id, bouw7_chapter_id')
      .eq('dossier_id', dossierId)
      .not('bewakingscode', 'is', null),
    supabase
      .from('dossiers')
      .select('regie_bewakingscode, regie_bouw7_chapter_id, facturatiemethode')
      .eq('id', dossierId)
      .maybeSingle(),
  ])

  const uit: FactureerbareCode[] = []
  const gezien = new Set<string>()

  // De regiecode staat vooraan: op een bon die op regie afrekent is dit de hoofdpost, en de rest
  // (een los meerwerkje) hangt eronder.
  //
  // Alléén op regie. Sinds een aangenomen bon zijn eigen kostengroep AW01 heeft, staat er in
  // dezelfde kolom ook een code die de kóstenkant draagt; die als factuurregel aanbieden zou het
  // werk bovenop de al afgesproken aanneemsom een tweede keer in rekening brengen.
  const d = dossier.data as {
    regie_bewakingscode: string | null
    regie_bouw7_chapter_id: number | null
    facturatiemethode: string | null
  } | null
  const opRegie = (d?.facturatiemethode ?? 'regie') === 'regie'
  const regieCode = opRegie ? (d?.regie_bewakingscode ?? '').trim() : ''
  if (regieCode) {
    gezien.add(regieCode)
    uit.push({
      bewakingscode: regieCode,
      bron: 'regie',
      bronId: dossierId,
      omschrijving: REGIE_BEWAKINGSCODE_NAAM,
      // Een regie-bon heeft geen aanneemsom; er is niets wat "alleen het verschil" kan zijn.
      alleenVerschil: false,
      opslagPct: null,
      inBouw7: d?.regie_bouw7_chapter_id != null,
    })
  }

  for (const s of (stelposten.data ?? []) as any[]) {
    if (!s.in_opdracht) continue // uitgesloten uit de opdracht: niets te factureren
    const code = String(s.bewakingscode)
    if (gezien.has(code)) continue
    gezien.add(code)
    uit.push({
      bewakingscode: code,
      bron: 'stelpost',
      bronId: String(s.id),
      omschrijving: s.omschrijving ?? code,
      // Een carve-out is via de aanneemsom al gefactureerd; alleen het verschil telt nog, en dat
      // loopt via de verrekening naar een meerwerkregel.
      alleenVerschil: s.in_aanneemsom !== false,
      opslagPct: s.opslag_pct != null ? Number(s.opslag_pct) : null,
      inBouw7: s.bouw7_chapter_id != null,
    })
  }

  for (const m of (meerwerk.data ?? []) as any[]) {
    // Alleen wat op nacalculatie afrekent. Een 'aangenomen' meerwerkregel heeft een vast bedrag en
    // wordt als zodanig gefactureerd, niet uit de geboekte kosten.
    const opNacalculatie = m.afrekenwijze === 'regie' || m.is_stelpost === true
    if (!opNacalculatie) continue
    // Pas ná akkoord. Niet "alles behalve afgewezen": een regel die nog aangevraagd is of waarvan
    // de offerte loopt heeft nog geen bewakingscode in Bouw7, dus er valt niets op te boeken en
    // niets naartoe te verplaatsen. Hij stond dan als lege nul-post in de nacalculatie.
    if (m.status !== 'akkoord' && m.status !== 'voltooid') continue
    // Een verrekenregel van een stelpost draagt zelf geen code en hoort hier niet; de guard is er
    // voor het geval dat ooit verandert.
    if (m.opdracht_onderdeel_id != null) continue
    const code = String(m.bewakingscode)
    if (gezien.has(code)) continue
    gezien.add(code)
    uit.push({
      bewakingscode: code,
      bron: 'meerwerk',
      bronId: String(m.id),
      omschrijving: m.omschrijving ?? code,
      alleenVerschil: false,
      opslagPct: null,
      inBouw7: m.bouw7_chapter_id != null,
    })
  }

  // De regiecode bovenaan, de rest op code. Op een regie-bon is dat de post waar alles op staat;
  // op code sorteren zou hem achter een los meerwerkje zetten.
  return uit.sort((a, b) =>
    Number(b.bron === 'regie') - Number(a.bron === 'regie')
    || a.bewakingscode.localeCompare(b.bewakingscode, 'nl'))
}

/**
 * Opgeslagen aanpassingen per bewakingscode.
 *
 * `bedrag_excl_btw` en `uitsplitsen` staan hier niet meer bij: een vast bedrag hoort sinds
 * september 2026 bij een factuurregel (`factuur_regelgroepen`) en uitsplitsen is opgegaan in
 * `groepering`. De kolommen bestaan nog als migratiebron, maar worden niet meer gelezen.
 */
export type CodeInstelling = {
  bewakingscode: string
  omschrijving: string | null
  opslag_pct: number | null
  /** Hoe boekingen zonder handmatige toewijzing tot factuurregels worden gebundeld. */
  groepering: 'per_soort' | 'samen' | 'per_boeking'
  btw_tarief_bouw7_id: number | null
  meefactureren: boolean
}

export async function getCodeInstellingen(dossierId: string): Promise<CodeInstelling[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('factuur_regelinstellingen')
    .select('bewakingscode, omschrijving, opslag_pct, groepering, btw_tarief_bouw7_id, meefactureren')
    .eq('dossier_id', dossierId)
  return (data ?? []) as CodeInstelling[]
}

/** Eén opgeslagen factuurregel. Bestaat alleen zodra er iets van de afleiding afwijkt. */
export type RegelGroep = {
  bewakingscode: string
  groep_sleutel: string
  omschrijving: string | null
  /**
   * Bij een afgeleide regel het vaste regeltotaal, bij een losse regel de prijs per eenheid.
   * Zie de kolomcommentaren in `20260918e_losse_factuurregel_aantal.sql`.
   */
  bedrag_excl_btw: number | null
  /** Alleen bij losse regels: het aantal op de factuur. Leeg = 1. */
  aantal: number | null
  /** Alleen bij losse regels: de eenheid achter het aantal. Leeg = post. */
  eenheid: string | null
  btw_tarief_bouw7_id: number | null
  meefactureren: boolean
  volgorde: number
  /** Alleen bij losse regels: de factuur waar hij op terecht is gekomen. Gevuld = klaar. */
  bouw7_invoice_id: string | null
}

export async function getRegelGroepen(dossierId: string): Promise<RegelGroep[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('factuur_regelgroepen')
    .select('bewakingscode, groep_sleutel, omschrijving, bedrag_excl_btw, aantal, eenheid, btw_tarief_bouw7_id, meefactureren, volgorde, bouw7_invoice_id')
    .eq('dossier_id', dossierId)
    .order('volgorde')
  return (data ?? []) as RegelGroep[]
}
