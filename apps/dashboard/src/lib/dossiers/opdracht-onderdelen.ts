'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { OpdrachtOnderdeel, OpdrachtOnderdeelGrondslag } from '@everts/database'
import { getDossierBewaking } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { kiesAanneemsom } from './aanneemsom'
import { getDossierMeerwerk } from './meerwerk'
import { getServicedeskRegie } from './servicedesk'
import {
  maakStelpostBewakingscodeBouw7,
  vindVrijeBewakingscode,
} from '@/app/(platform)/everts-calc/actions/werkbegroting'

/* ─── helpers ─────────────────────────────────────────────────────── */
const rond = (n: number): number => Math.round(n * 100) / 100
const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
  return 0
}
const numOfNull = (v: unknown): number | null => (v == null ? null : num(v))

/**
 * Het werkelijke bedrag (in verkoopwaarde, excl. btw) waartegen een stelpost afrekent.
 *
 * Eén rekenregel voor twee aanroepers — het overzicht dat het saldo toont en de verrekening die het
 * boekt. Liepen die uiteen, dan zou de gebruiker een ander saldo zien dan er geboekt wordt.
 *
 *   • 'geboekte_kosten'  → de verkoopwaarde van de uren en kosten op de eigen bewakingscode.
 *   • 'eenheidsprijzen'  → de afgesproken eenheidsprijs maal de werkelijk uitgevoerde hoeveelheid.
 *   • 'vast' (of leeg)   → null; een vast bedrag valt per definitie niets te verrekenen.
 *
 * Bij 'eenheidsprijzen' telt een ingevulde hoeveelheid van 0 als een echt antwoord ("er is niets
 * uitgevoerd", saldo = −stelpostbedrag = minderwerk). Alleen een lege prijs óf lege hoeveelheid
 * geeft null: dan is de afrekening simpelweg nog niet ingevuld.
 */
function werkelijkBedrag(
  r: Pick<OpdrachtOnderdeel, 'grondslag' | 'bewakingscode' | 'eenheidsprijs' | 'hoeveelheid_werkelijk'>,
  verkoopOpCode: (code: string) => number,
): number | null {
  if (r.grondslag === 'geboekte_kosten') {
    return r.bewakingscode ? rond(verkoopOpCode(r.bewakingscode)) : null
  }
  if (r.grondslag === 'eenheidsprijzen') {
    if (r.eenheidsprijs == null || r.hoeveelheid_werkelijk == null) return null
    return rond(num(r.eenheidsprijs) * num(r.hoeveelheid_werkelijk))
  }
  return null
}

/**
 * Afwijkende opslagpercentages per bewakingscode, afgeleid uit de stelposten die er een hebben.
 * Zo rekent een stelpost met een eigen opslag af tegen dát percentage, terwijl de rest van het
 * dossier de bedrijfsstandaard houdt.
 */
function opslagPerCode(rows: Pick<OpdrachtOnderdeel, 'soort' | 'grondslag' | 'bewakingscode' | 'opslag_pct'>[]): Record<string, number> {
  const uit: Record<string, number> = {}
  for (const r of rows) {
    if (r.soort !== 'stelpost' || r.grondslag !== 'geboekte_kosten') continue
    if (!r.bewakingscode || r.opslag_pct == null) continue
    uit[r.bewakingscode] = num(r.opslag_pct)
  }
  return uit
}

/* ─── views ───────────────────────────────────────────────────────── */
export type OpdrachtStelpostView = {
  id: string
  omschrijving: string
  bedrag_excl_btw: number | null
  in_opdracht: boolean
  bewakingscode: string | null
  /** 'offerte' = geseed uit de calculatie (niet handmatig te bewerken) · 'handmatig' = zelf aangewezen. */
  bron: 'offerte' | 'handmatig'
  /** True = carve-out uit de aanneemsom · false = staat erbuiten, apart factureren. */
  in_aanneemsom: boolean
  /** Kostprijs-budget dat naar de bewakingscode is geschreven (handmatig ingevuld). */
  begroot_excl_btw: number | null
  grondslag: OpdrachtOnderdeelGrondslag | null
  /** Eenheid, prijs per eenheid en werkelijke hoeveelheid bij grondslag 'eenheidsprijzen'. */
  eenheid: string | null
  eenheidsprijs: number | null
  hoeveelheid_werkelijk: number | null
  /** Opslag op geboekte kosten voor deze stelpost; null = de bedrijfsstandaard is gebruikt. */
  opslag_pct: number | null
  /** Live bewaking (alleen gevuld zodra er een bewakingscode is toegekend). */
  begroot: number | null
  prognose: number | null
  geboekt: number | null
  progress: number | null
  /**
   * Het werkelijke bedrag waartegen de stelpost afrekent, in verkoopwaarde. Bij grondslag
   * 'geboekte_kosten' is dat de verkoopwaarde van de uren/kosten op de eigen bewakingscode; bij
   * 'eenheidsprijzen' is het eenheidsprijs x hoeveelheid_werkelijk. Bij 'vast' blijft het null —
   * dan valt er niets te verrekenen.
   */
  werkelijkVerkoop: number | null
  /** werkelijkVerkoop − stelpostbedrag. Positief = meerwerk, negatief = minderwerk. */
  verrekenSaldo: number | null
  /** Id van de meerwerkregel waarin deze stelpost al is verrekend (max. één, DB-uniek). */
  verrekendMeerwerkId: string | null
}
export type OpdrachtOptieView = {
  id: string
  omschrijving: string
  bedrag_excl_btw: number | null
  in_opdracht: boolean
}
export type OpdrachtMeerwerkView = {
  id: string
  omschrijving: string
  bedrag_excl_btw: number
  /** Gevuld als deze regel de verrekening van een stelpost is. */
  opdrachtOnderdeelId: string | null
}
export type OpdrachtOverzicht = {
  /** Aanneemsom excl. btw; bron gekozen door `kiesAanneemsom` (fase-afhankelijk). */
  aanneemsom: number | null
  /** Waar de aanneemsom vandaan komt — bepaalt of stelposten handmatig aangewezen mogen worden. */
  aanneemsomBron: 'offerte' | 'bouw7' | null
  /**
   * Bedrag van de EVA-offerte wanneer die de aanneemsom NIET levert en er materieel van afwijkt.
   * Zo blijft zichtbaar dat er een afwijkende offerte bij dit dossier hangt in plaats van dat het
   * verschil stil verdwijnt. Null als er niets afwijkt.
   */
  afwijkendeEvaOfferte: number | null
  /**
   * Orderbasis = aanneemsom + de stelposten die buiten de aanneemsom vallen. Carve-outs zitten er
   * al in en worden hier dus NIET nog eens bij opgeteld.
   */
  aanneemsomInclStelposten: number | null
  /** Basisscope = orderbasis − alle stelposten (het niet-stelpost-werk). */
  basis: number | null
  stelposten: OpdrachtStelpostView[]
  opties: OpdrachtOptieView[]
  /** Alle stelposten in opdracht. */
  stelpostenTotaal: number
  /** Stelposten die ín de aanneemsom zitten (carve-outs) — verlagen de basisscope. */
  stelpostenInAanneemsomTotaal: number
  /** Stelposten die erbuiten vallen — tellen bij het contracttotaal op. */
  stelpostenApartTotaal: number
  /** Alle opties (gekozen + niet-gekozen). */
  optiesTotaal: number
  /** Alleen de opties die in opdracht zijn. */
  gekozenOptiesTotaal: number
  /** Goedgekeurde (akkoord/voltooid) meerwerkregels van het dossier. */
  meerwerken: OpdrachtMeerwerkView[]
  meerwerkTotaal: number
  /**
   * Gezet als de aanneemsom is gewijzigd nadat de stelposten waren aangewezen (Bouw7-sync
   * overschrijft `bedrag_excl_btw` 2× per dag). EVA herrekent bewust niet stil mee — dit is een
   * signaal aan de gebruiker om de stelposten te controleren.
   */
  aanneemsomDrift: { snapshot: number; actueel: number } | null
  /** Gezet als de carve-outs samen boven de aanneemsom uitkomen (basisscope zou negatief worden). */
  overschrijding: { carveOuts: number; aanneemsom: number } | null
  /** True zodra handmatige stelposten mogen worden aangewezen (er is een aanneemsom). */
  handmatigMogelijk: boolean
}

/** Hoofd-offerte (geen meerwerk-offerte) van een calculatieproject; nieuwste eerst. */
async function vindHoofdOfferte(
  supabase: any,
  projectId: string,
): Promise<{ id: string; subtotaal_ex_btw: number | null; stelposten_in_totaal: boolean | null } | null> {
  const { data } = await supabase
    .from('quotes')
    .select('id, subtotaal_ex_btw, stelposten_in_totaal, meerwerk_regel_id')
    .eq('project_id', projectId)
    .is('meerwerk_regel_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

/**
 * Aanneemsom van een dossier met zijn herkomst. De keuze tussen de EVA-hoofdofferte en het uit
 * Bouw7 gesynchroniseerde bedrag maakt `kiesAanneemsom` (./aanneemsom): in de offertefase wint de
 * offerte, in de opdrachtfase het Bouw7-contractbedrag. Bouw7 is sowieso de bron voor het overgrote
 * deel van de opdrachten (die hebben geen EVA-calculatie) en is precies waarom stelposten ook
 * handmatig aangewezen moeten kunnen worden.
 *
 * De offerte wordt altijd opgehaald, ook als hij de aanneemsom niet levert: het seeden van
 * stelposten en optionele secties leest hem los daarvan uit.
 */
async function bepaalAanneemsom(supabase: any, dossierId: string): Promise<{
  aanneemsom: number | null
  bron: 'offerte' | 'bouw7' | null
  afwijkendeEvaOfferte: number | null
  quote: { id: string; subtotaal_ex_btw: number | null; stelposten_in_totaal: boolean | null } | null
}> {
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id, bedrag_excl_btw, hoofdstatus')
    .eq('id', dossierId)
    .maybeSingle()

  const projectId: string | null = dossier?.everts_calc_project_id ?? null
  const quote = projectId ? await vindHoofdOfferte(supabase, projectId) : null

  const keuze = kiesAanneemsom({
    hoofdstatus:       dossier?.hoofdstatus ?? null,
    bouw7ExclBtw:      numOfNull(dossier?.bedrag_excl_btw),
    evaOfferteExclBtw: numOfNull(quote?.subtotaal_ex_btw),
  })
  return {
    aanneemsom: keuze.aanneemsom,
    bron: keuze.bron === 'eva' ? 'offerte' : keuze.bron,
    afwijkendeEvaOfferte: keuze.afwijkendeEvaOfferte,
    quote,
  }
}

/**
 * Seedt de opdracht-samenstelling uit de geaccepteerde offerte: één rij per stelpost-regel
 * (`quote_lines.is_stelpost`, in opdracht) en één rij per optionele sectie
 * (`quote_sections.is_optioneel`, standaard niet in opdracht). Idempotent — bestaande rijen
 * (op quote_line_id / quote_section_id) blijven ongemoeid, nieuwe posten worden toegevoegd.
 * Best effort: een fout blokkeert het tonen van het overzicht niet.
 */
export async function seedOpdrachtOnderdelen(dossierId: string): Promise<void> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', dossierId)
    .maybeSingle()
  const projectId: string | null = dossier?.everts_calc_project_id ?? null
  if (!projectId) return

  const quote = await vindHoofdOfferte(supabase, projectId)
  if (!quote) return

  // Al aanwezige herkomst-verwijzingen, zodat we alleen ontbrekende posten toevoegen.
  const { data: bestaand } = await supabase
    .from('opdracht_onderdelen')
    .select('quote_line_id, quote_section_id, volgnummer')
    .eq('dossier_id', dossierId)
  const gehadLines = new Set<string>((bestaand ?? []).map((r: any) => r.quote_line_id).filter(Boolean))
  const gehadSecties = new Set<string>((bestaand ?? []).map((r: any) => r.quote_section_id).filter(Boolean))
  // Volgnummers doorlopen over álle bestaande rijen (ook handmatige), zodat de SP-nummering die
  // daarop wordt gebaseerd niet botst.
  let vn = Math.max(0, ...(bestaand ?? []).map((r: any) => num(r.volgnummer))) + 1

  const [{ data: stelpostLines }, { data: optieSecties }] = await Promise.all([
    supabase.from('quote_lines')
      .select('id, omschrijving, line_total, btw_pct')
      .eq('quote_id', quote.id)
      .eq('is_stelpost', true),
    supabase.from('quote_sections')
      .select('id, naam, subtotaal, nummer')
      .eq('quote_id', quote.id)
      .eq('is_optioneel', true),
  ])

  // Offerte-stelposten erven de offerte-instelling: zitten ze in het totaal, dan zijn het carve-outs.
  const inAanneemsom = quote.stelposten_in_totaal ?? true
  const aanneemsom = numOfNull(quote.subtotaal_ex_btw)

  const rijen: Record<string, unknown>[] = []
  for (const l of (stelpostLines ?? []) as any[]) {
    if (gehadLines.has(l.id)) continue
    rijen.push({
      dossier_id: dossierId, quote_id: quote.id, soort: 'stelpost', bron: 'offerte',
      quote_line_id: l.id, omschrijving: (l.omschrijving?.trim() || 'Stelpost'),
      volgnummer: vn++, in_opdracht: true,
      bedrag_excl_btw: rond(num(l.line_total)),
      btw_pct: l.btw_pct != null ? num(l.btw_pct) : null,
      in_aanneemsom: inAanneemsom,
      aanneemsom_snapshot: aanneemsom,
      grondslag: 'vast',
    })
  }
  for (const s of (optieSecties ?? []) as any[]) {
    if (gehadSecties.has(s.id)) continue
    rijen.push({
      dossier_id: dossierId, quote_id: quote.id, soort: 'optie', bron: 'offerte',
      quote_section_id: s.id, omschrijving: (s.naam?.trim() || 'Optie'),
      volgnummer: vn++, in_opdracht: false,
      bedrag_excl_btw: rond(num(s.subtotaal)), btw_pct: null,
      // Een optie staat per definitie buiten de aanneemsom tot hij gekozen wordt.
      in_aanneemsom: false,
      aanneemsom_snapshot: aanneemsom,
    })
  }
  if (!rijen.length) return
  // Best effort: bij een race kan de unique-index (dossier+line/sectie) een dubbele insert weigeren.
  try { await supabase.from('opdracht_onderdelen').insert(rijen) } catch { /* genegeerd */ }
}

/**
 * Opdracht-samenstelling + live bewaking voor het Financiële-totalen-blok.
 *
 * Werkt met én zonder EVA-offerte: is er een hoofd-offerte, dan wordt daaruit geseed; anders draait
 * het overzicht op de uit Bouw7 gesynchroniseerde aanneemsom met handmatig aangewezen stelposten.
 * De zware Bouw7-calls draaien alleen als er iets te halen is (bewaking pas bij toegekende codes,
 * regie pas bij een stelpost die op geboekte kosten afrekent).
 */
export async function getOpdrachtOverzicht(dossierId: string): Promise<OpdrachtOverzicht | null> {
  const supabase = createAdminClient() as any

  await seedOpdrachtOnderdelen(dossierId)
  const { aanneemsom, bron: aanneemsomBron, afwijkendeEvaOfferte } = await bepaalAanneemsom(supabase, dossierId)

  const { data: onderdelen } = await supabase
    .from('opdracht_onderdelen')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: true })
  const rows = (onderdelen ?? []) as OpdrachtOnderdeel[]

  // Live bewaking per bewakingscode — alleen als er codes zijn toegekend.
  const heeftCodes = rows.some(r => r.soort === 'stelpost' && !!r.bewakingscode)
  const perCode = new Map<string, { begroot: number; prognose: number; geboekt: number; progress: number | null }>()
  if (heeftCodes) {
    const bewaking = await getDossierBewaking(dossierId).catch(() => null)
    if (bewaking) {
      for (const h of bewaking.hoofdstukken) {
        for (const r of h.regels) {
          if (!r.code) continue
          perCode.set(r.code, { begroot: r.begroot, prognose: r.prognose, geboekt: r.geboekteKosten, progress: r.progress })
        }
      }
    }
  }

  // Verkoopwaarde van het werkelijk geboekte werk per bewakingscode — alleen nodig voor stelposten
  // die op geboekte kosten afrekenen (zelfde patroon als het meerwerk-tab). Eenheidsprijs-stelposten
  // rekenen op hun eigen velden en hebben deze dure Bouw7-call niet nodig.
  const heeftTeVerrekenen = rows.some(r =>
    r.soort === 'stelpost' && r.grondslag === 'geboekte_kosten' && !!r.bewakingscode)
  const verkoopPerCode = new Map<string, number>()
  if (heeftTeVerrekenen) {
    const regie = await getServicedeskRegie(dossierId, { opslagPerCode: opslagPerCode(rows) }).catch(() => null)
    for (const r of regie?.regels ?? []) {
      if (r.uitgesloten || !r.bewakingscode) continue
      verkoopPerCode.set(r.bewakingscode, (verkoopPerCode.get(r.bewakingscode) ?? 0) + (r.verkoopBedrag || 0))
    }
  }

  // Al bestaande verrekeningen — de DB houdt het op maximaal één per stelpost.
  const { data: verrekend } = await supabase
    .from('meerwerk_regels')
    .select('id, opdracht_onderdeel_id')
    .eq('dossier_id', dossierId)
    .not('opdracht_onderdeel_id', 'is', null)
  const verrekendPerOnderdeel = new Map<string, string>(
    (verrekend ?? []).map((r: any) => [String(r.opdracht_onderdeel_id), String(r.id)]),
  )

  const stelposten: OpdrachtStelpostView[] = rows
    .filter(r => r.soort === 'stelpost')
    .map(r => {
      const bw = r.bewakingscode ? perCode.get(r.bewakingscode) : undefined
      const bedrag = numOfNull(r.bedrag_excl_btw)
      const werkelijkVerkoop = werkelijkBedrag(r, code => verkoopPerCode.get(code) ?? 0)
      return {
        id: r.id, omschrijving: r.omschrijving,
        bedrag_excl_btw: bedrag,
        in_opdracht: r.in_opdracht, bewakingscode: r.bewakingscode,
        bron: r.bron ?? 'offerte',
        in_aanneemsom: r.in_aanneemsom ?? true,
        begroot_excl_btw: numOfNull(r.begroot_excl_btw),
        grondslag: r.grondslag ?? null,
        eenheid: r.eenheid ?? null,
        eenheidsprijs: numOfNull(r.eenheidsprijs),
        hoeveelheid_werkelijk: numOfNull(r.hoeveelheid_werkelijk),
        opslag_pct: numOfNull(r.opslag_pct),
        begroot: bw?.begroot ?? null, prognose: bw?.prognose ?? null,
        geboekt: bw?.geboekt ?? null, progress: bw?.progress ?? null,
        werkelijkVerkoop,
        verrekenSaldo: (werkelijkVerkoop != null && bedrag != null)
          ? rond(werkelijkVerkoop - bedrag)
          : null,
        verrekendMeerwerkId: verrekendPerOnderdeel.get(r.id) ?? null,
      }
    })
  const opties: OpdrachtOptieView[] = rows
    .filter(r => r.soort === 'optie')
    .map(r => ({
      id: r.id, omschrijving: r.omschrijving,
      bedrag_excl_btw: numOfNull(r.bedrag_excl_btw),
      in_opdracht: r.in_opdracht,
    }))

  // ── Totalen. De scheiding tussen carve-outs en apart-te-factureren stelposten is het hele punt:
  // een carve-out zit al ín de aanneemsom en mag er niet nog eens bij op (dubbeltelling), een
  // aparte stelpost is extra omzet en moet er wél bij op (gat in de omzet).
  const inOpdracht = stelposten.filter(s => s.in_opdracht)
  const stelpostenInAanneemsomTotaal = rond(
    inOpdracht.filter(s => s.in_aanneemsom).reduce((s, x) => s + num(x.bedrag_excl_btw), 0))
  const stelpostenApartTotaal = rond(
    inOpdracht.filter(s => !s.in_aanneemsom).reduce((s, x) => s + num(x.bedrag_excl_btw), 0))
  const stelpostenTotaal = rond(stelpostenInAanneemsomTotaal + stelpostenApartTotaal)

  const aanneemsomInclStelposten = aanneemsom == null ? null : rond(aanneemsom + stelpostenApartTotaal)
  const basis = aanneemsomInclStelposten == null ? null : rond(aanneemsomInclStelposten - stelpostenTotaal)

  const optiesTotaal = rond(opties.reduce((s, x) => s + num(x.bedrag_excl_btw), 0))
  const gekozenOptiesTotaal = rond(opties.filter(o => o.in_opdracht).reduce((s, x) => s + num(x.bedrag_excl_btw), 0))

  // Drift: is de aanneemsom veranderd sinds de carve-outs zijn vastgelegd? Niet stil herrekenen.
  let aanneemsomDrift: { snapshot: number; actueel: number } | null = null
  if (aanneemsom != null) {
    const snapshots = rows
      .filter(r => r.soort === 'stelpost' && (r.in_aanneemsom ?? true) && r.aanneemsom_snapshot != null)
      .map(r => num(r.aanneemsom_snapshot))
    const afwijkend = snapshots.find(s => rond(s) !== rond(aanneemsom))
    if (afwijkend != null) aanneemsomDrift = { snapshot: rond(afwijkend), actueel: rond(aanneemsom) }
  }
  const overschrijding = (aanneemsom != null && stelpostenInAanneemsomTotaal > rond(aanneemsom))
    ? { carveOuts: stelpostenInAanneemsomTotaal, aanneemsom: rond(aanneemsom) }
    : null

  // Goedgekeurde (akkoord/voltooid) meerwerkregels, itemized voor het blok. Een verrekening zit
  // hier als gewone meerwerkregel in — dát is de enige plek waar het stelpostverschil meetelt.
  const mw = await getDossierMeerwerk(dossierId).catch(() => null)
  const meerwerken: OpdrachtMeerwerkView[] = (mw?.regels ?? [])
    .filter(r => r.status === 'akkoord' || r.status === 'voltooid')
    .map(r => ({
      id: r.id,
      omschrijving: r.omschrijving,
      bedrag_excl_btw: rond(num(r.effectiefExcl)),
      opdrachtOnderdeelId: r.opdracht_onderdeel_id ?? null,
    }))
  const meerwerkTotaal = rond(mw?.totalen.goedgekeurdExcl ?? 0)

  return {
    aanneemsom, aanneemsomBron, afwijkendeEvaOfferte, aanneemsomInclStelposten, basis,
    stelposten, opties,
    stelpostenTotaal, stelpostenInAanneemsomTotaal, stelpostenApartTotaal,
    optiesTotaal, gekozenOptiesTotaal,
    meerwerken, meerwerkTotaal,
    aanneemsomDrift, overschrijding,
    handmatigMogelijk: aanneemsom != null,
  }
}

/**
 * Zet een optie wél/niet in de opdracht. Een aangezette optie telt daarna mee in het contracttotaal
 * (maar krijgt geen eigen bewakingscode). Respecteert afgesloten (alleen-lezen) dossiers.
 */
export async function zetOptieInOpdracht(
  onderdeelId: string,
  inOpdracht: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: rij } = await supabase
    .from('opdracht_onderdelen')
    .select('dossier_id, soort')
    .eq('id', onderdeelId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Onderdeel niet gevonden.' }
  await assertDossierBewerkbaar(rij.dossier_id)
  const { error } = await supabase
    .from('opdracht_onderdelen')
    .update({ in_opdracht: inOpdracht, updated_at: new Date().toISOString() })
    .eq('id', onderdeelId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${rij.dossier_id}/informatie`)
  return { ok: true }
}

/* ─── handmatige stelposten ───────────────────────────────────────── */

export type StelpostInvoer = {
  omschrijving: string
  bedrag_excl_btw: number
  /** True = deel van de aanneemsom (carve-out) · false = valt erbuiten, apart factureren. */
  in_aanneemsom: boolean
  /** Kostprijs-budget voor de bewakingscode. Nooit gelijkstellen aan bedrag_excl_btw. */
  begroot_excl_btw?: number | null
  grondslag?: OpdrachtOnderdeelGrondslag
  /** Alleen bij grondslag 'eenheidsprijzen'. */
  eenheid?: string | null
  eenheidsprijs?: number | null
  hoeveelheid_werkelijk?: number | null
  /** Alleen bij grondslag 'geboekte_kosten'; leeg = de bedrijfsstandaard. */
  opslag_pct?: number | null
}

/**
 * Controleert of de carve-outs samen binnen de aanneemsom blijven. Zonder deze controle wordt de
 * basisscope (aanneemsom − stelposten) stil negatief en klopt het hele blok niet meer.
 * `negeerId` laat de rij die je aan het bewerken bent buiten de som.
 */
async function controleerCarveOuts(
  supabase: any,
  dossierId: string,
  nieuwBedrag: number,
  negeerId: string | null,
): Promise<{ ok: true; aanneemsom: number } | { ok: false; error: string }> {
  const { aanneemsom } = await bepaalAanneemsom(supabase, dossierId)
  if (aanneemsom == null) {
    return { ok: false, error: 'Dit dossier heeft nog geen aanneemsom; een deel daarvan aanwijzen als stelpost kan pas daarna.' }
  }
  const { data } = await supabase
    .from('opdracht_onderdelen')
    .select('id, bedrag_excl_btw')
    .eq('dossier_id', dossierId)
    .eq('soort', 'stelpost')
    .eq('in_aanneemsom', true)
    .eq('in_opdracht', true)
  const bestaand = ((data ?? []) as any[])
    .filter(r => r.id !== negeerId)
    .reduce((s, r) => s + num(r.bedrag_excl_btw), 0)
  const totaal = rond(bestaand + nieuwBedrag)
  if (totaal > rond(aanneemsom)) {
    return {
      ok: false,
      error: `De stelposten in de aanneemsom komen dan uit op € ${totaal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}, `
        + `meer dan de aanneemsom van € ${rond(aanneemsom).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}. `
        + 'Verlaag het bedrag, of zet de stelpost buiten de aanneemsom (apart factureren).',
    }
  }
  return { ok: true, aanneemsom }
}

/**
 * Wijst een deel van de aanneemsom aan als stelpost. Bedoeld voor dossiers die uit Bouw7 komen en
 * dus geen EVA-offerte hebben: de aanneemsom staat vast, jij markeert welk deel daarvan een
 * stelpost is zodat EVA hem apart kan bewaken.
 *
 * Een carve-out (`in_aanneemsom: true`) verhoogt het contracttotaal NIET — hij herclassificeert een
 * deel van de bestaande aanneemsom. Alleen een stelpost buiten de aanneemsom is extra omzet.
 */
export async function maakStelpost(
  dossierId: string,
  invoer: StelpostInvoer,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const supabase = createAdminClient() as any

  const omschrijving = invoer.omschrijving.trim()
  if (!omschrijving) return { ok: false, error: 'Geef de stelpost een omschrijving.' }
  const bedrag = rond(num(invoer.bedrag_excl_btw))
  if (!(bedrag > 0)) return { ok: false, error: 'Vul een bedrag groter dan nul in.' }

  // Aanneemsom is altijd nodig: een carve-out moet erin passen, en ook een aparte stelpost hoort
  // bij een opdracht die een som heeft.
  const { aanneemsom } = await bepaalAanneemsom(supabase, dossierId)
  if (aanneemsom == null) {
    return { ok: false, error: 'Dit dossier heeft nog geen aanneemsom; een deel daarvan aanwijzen als stelpost kan pas daarna.' }
  }
  if (invoer.in_aanneemsom) {
    const check = await controleerCarveOuts(supabase, dossierId, bedrag, null)
    if (!check.ok) return check
  }

  const { data: maxRow } = await supabase
    .from('opdracht_onderdelen')
    .select('volgnummer')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: ins, error } = await supabase
    .from('opdracht_onderdelen')
    .insert({
      dossier_id: dossierId,
      soort: 'stelpost',
      bron: 'handmatig',
      omschrijving,
      volgnummer: num(maxRow?.volgnummer) + 1,
      in_opdracht: true,
      bedrag_excl_btw: bedrag,
      in_aanneemsom: invoer.in_aanneemsom,
      aanneemsom_snapshot: rond(aanneemsom),
      begroot_excl_btw: invoer.begroot_excl_btw != null ? rond(num(invoer.begroot_excl_btw)) : null,
      grondslag: invoer.grondslag ?? 'vast',
      eenheid: invoer.eenheid?.trim() || null,
      eenheidsprijs: invoer.eenheidsprijs != null ? num(invoer.eenheidsprijs) : null,
      hoeveelheid_werkelijk: invoer.hoeveelheid_werkelijk != null ? num(invoer.hoeveelheid_werkelijk) : null,
      opslag_pct: invoer.opslag_pct != null ? num(invoer.opslag_pct) : null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/opdrachten/${dossierId}/informatie`)
  return { ok: true, id: ins.id }
}

/** Werkt een handmatige stelpost bij. Offerte-geseede stelposten zijn hier niet te wijzigen. */
export async function updateStelpost(
  onderdeelId: string,
  patch: Partial<StelpostInvoer>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: rij } = await supabase
    .from('opdracht_onderdelen')
    .select('*')
    .eq('id', onderdeelId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Stelpost niet gevonden.' }
  if (rij.soort !== 'stelpost') return { ok: false, error: 'Dit onderdeel is geen stelpost.' }
  await assertDossierBewerkbaar(rij.dossier_id)

  // Wat er in de offerte is afgesproken hoort in de calculatie thuis, niet hier: omschrijving,
  // bedrag en de vraag of de stelpost in de aanneemsom zit zijn bij een geseede stelpost
  // vergrendeld. Hóe hij afrekent is daarentegen een uitvoeringsbeslissing die pas tijdens het werk
  // valt — de grondslag en zijn parameters mogen daarom op élke stelpost gezet worden. Zonder dat
  // onderscheid zou een stelpost uit de offerte nooit op eenheidsprijzen kunnen afrekenen.
  if (rij.bron !== 'handmatig') {
    const uitOfferte: (keyof StelpostInvoer)[] = ['omschrijving', 'bedrag_excl_btw', 'in_aanneemsom']
    const geblokkeerd = uitOfferte.filter(v => patch[v] !== undefined)
    if (geblokkeerd.length > 0) {
      return { ok: false, error: 'Omschrijving, bedrag en aanneemsom-keuze van deze stelpost komen uit de offerte; wijzig ze in de calculatie.' }
    }
  }

  const velden: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.omschrijving !== undefined) {
    const o = patch.omschrijving.trim()
    if (!o) return { ok: false, error: 'Geef de stelpost een omschrijving.' }
    velden.omschrijving = o
  }
  if (patch.begroot_excl_btw !== undefined) {
    velden.begroot_excl_btw = patch.begroot_excl_btw != null ? rond(num(patch.begroot_excl_btw)) : null
  }
  if (patch.grondslag !== undefined) velden.grondslag = patch.grondslag
  if (patch.eenheid !== undefined) velden.eenheid = patch.eenheid?.trim() || null
  if (patch.eenheidsprijs !== undefined) {
    velden.eenheidsprijs = patch.eenheidsprijs != null ? num(patch.eenheidsprijs) : null
  }
  if (patch.hoeveelheid_werkelijk !== undefined) {
    velden.hoeveelheid_werkelijk = patch.hoeveelheid_werkelijk != null ? num(patch.hoeveelheid_werkelijk) : null
  }
  if (patch.opslag_pct !== undefined) {
    velden.opslag_pct = patch.opslag_pct != null ? num(patch.opslag_pct) : null
  }

  // Bedrag en carve-out-vlag samen valideren: beide bepalen of de som nog binnen de aanneemsom past.
  const nieuwBedrag = patch.bedrag_excl_btw !== undefined ? rond(num(patch.bedrag_excl_btw)) : num(rij.bedrag_excl_btw)
  const nieuwInAanneemsom = patch.in_aanneemsom !== undefined ? patch.in_aanneemsom : !!rij.in_aanneemsom
  if (patch.bedrag_excl_btw !== undefined) {
    if (!(nieuwBedrag > 0)) return { ok: false, error: 'Vul een bedrag groter dan nul in.' }
    velden.bedrag_excl_btw = nieuwBedrag
  }
  if (patch.in_aanneemsom !== undefined) velden.in_aanneemsom = nieuwInAanneemsom
  if (nieuwInAanneemsom && (patch.bedrag_excl_btw !== undefined || patch.in_aanneemsom !== undefined)) {
    const check = await controleerCarveOuts(supabase, rij.dossier_id, nieuwBedrag, onderdeelId)
    if (!check.ok) return check
    // Herijk de snapshot op de aanneemsom waartegen we nu hebben gevalideerd.
    velden.aanneemsom_snapshot = rond(check.aanneemsom)
  }

  const { error } = await supabase.from('opdracht_onderdelen').update(velden).eq('id', onderdeelId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${rij.dossier_id}/informatie`)
  return { ok: true }
}

/**
 * Verwijdert een handmatige stelpost. Kan niet als hij al verrekend is — dan hangt er een
 * meerwerkregel aan en zou het verschil in de lucht blijven hangen.
 */
export async function verwijderStelpost(
  onderdeelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: rij } = await supabase
    .from('opdracht_onderdelen')
    .select('dossier_id, soort, bron')
    .eq('id', onderdeelId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Stelpost niet gevonden.' }
  if (rij.bron !== 'handmatig') {
    return { ok: false, error: 'Deze stelpost komt uit de offerte en kan hier niet worden verwijderd.' }
  }
  await assertDossierBewerkbaar(rij.dossier_id)

  const { data: verrekening } = await supabase
    .from('meerwerk_regels')
    .select('id')
    .eq('opdracht_onderdeel_id', onderdeelId)
    .maybeSingle()
  if (verrekening) {
    return { ok: false, error: 'Deze stelpost is al verrekend. Verwijder eerst de bijbehorende meerwerkregel.' }
  }

  const { error } = await supabase.from('opdracht_onderdelen').delete().eq('id', onderdeelId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${rij.dossier_id}/informatie`)
  return { ok: true }
}

/**
 * Wijst elke stelpost zonder code een eigen bewakingscode toe en maakt die direct in Bouw7 aan
 * (onder een stelpost-hoofdstuk). De code wordt eerst op vrijheid getoetst tegen de codes die al
 * op het project staan — blind doornummeren zou de stelpost aan een vreemde code kunnen hangen.
 *
 * Als budget gaat alleen het handmatig ingevulde `begroot_excl_btw` (kostprijs) mee. Het
 * stelpostbedrag is bewust géén budget: dat is omzet inclusief AK en winst, en als budget zou het
 * de verwachte kosten opblazen en de marge vervuilen.
 */
export async function wijsStelpostBewakingscodesToe(
  dossierId: string,
): Promise<{ ok: true; aantal: number; waarschuwing?: string } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('opdracht_onderdelen')
    .select('id, volgnummer, omschrijving, bewakingscode, begroot_excl_btw')
    .eq('dossier_id', dossierId)
    .eq('soort', 'stelpost')
    .order('volgnummer', { ascending: true })
  const rows = (data ?? []) as {
    id: string; volgnummer: number; omschrijving: string
    bewakingscode: string | null; begroot_excl_btw: unknown
  }[]

  // Codes die EVA zelf al heeft uitgedeeld tellen als bezet, ook als Bouw7 ze nog niet kent.
  const bezet = rows.map(r => r.bewakingscode).filter((c): c is string => !!c && !!c.trim())
  const waarschuwingen: string[] = []
  let aantal = 0

  for (const r of rows) {
    if (r.bewakingscode && r.bewakingscode.trim()) continue

    const vrij = await vindVrijeBewakingscode(dossierId, 'SP', bezet)
    if (!vrij.ok) { waarschuwingen.push(vrij.error); break }
    const code = vrij.code
    bezet.push(code)

    const begroot = r.begroot_excl_btw != null ? rond(num(r.begroot_excl_btw)) : null
    const res = await maakStelpostBewakingscodeBouw7(dossierId, {
      code, naam: r.omschrijving, begroot,
    })

    const velden: Record<string, unknown> = { bewakingscode: code, updated_at: new Date().toISOString() }
    if (res.ok) {
      velden.bouw7_chapter_id = res.chapterId
      velden.bouw7_security_code_id = res.pslId
      if (res.waarschuwing) waarschuwingen.push(res.waarschuwing)
    } else {
      // Bouw7-write mislukt: code lokaal wél vastleggen zodat de calculator hem kan gebruiken,
      // met een expliciete waarschuwing dat hij nog niet in Bouw7 staat.
      waarschuwingen.push(`${code}: aanmaken in Bouw7 mislukt (${res.error})`)
    }
    const { error } = await supabase.from('opdracht_onderdelen').update(velden).eq('id', r.id)
    if (!error) aantal++
  }

  revalidatePath(`/opdrachten/${dossierId}/informatie`)
  return { ok: true, aantal, waarschuwing: waarschuwingen.length ? waarschuwingen.join(' ') : undefined }
}

/** Zet/wijzigt handmatig de bewakingscode van één stelpost (kale code, bijv. "SP01"). */
export async function zetStelpostBewakingscode(
  onderdeelId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: rij } = await supabase
    .from('opdracht_onderdelen')
    .select('dossier_id, soort')
    .eq('id', onderdeelId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Onderdeel niet gevonden.' }
  if (rij.soort !== 'stelpost') return { ok: false, error: 'Alleen stelposten krijgen een bewakingscode.' }
  await assertDossierBewerkbaar(rij.dossier_id)
  const schoon = code.trim() || null
  const { error } = await supabase
    .from('opdracht_onderdelen')
    .update({ bewakingscode: schoon, updated_at: new Date().toISOString() })
    .eq('id', onderdeelId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${rij.dossier_id}/informatie`)
  return { ok: true }
}

/**
 * Verrekent een stelpost: het verschil tussen het werkelijke bedrag en het stelpostbedrag wordt
 * één meer- of minderwerkregel, gekoppeld aan deze stelpost. Wat "werkelijk" is, hangt aan de
 * grondslag — de verkoopwaarde op de eigen bewakingscode, of eenheidsprijs maal werkelijke
 * hoeveelheid. Zie `werkelijkBedrag`, dat dezelfde regel toepast als het overzicht: wat de
 * gebruiker als saldo ziet, is exact wat hier geboekt wordt.
 *
 * Waarom zo, en niet door het stelpostbedrag zelf te wijzigen:
 *   • het stelpostbedrag blijft de contractuele waarde die in de aanneemsom is meegenomen;
 *   • het verschil komt precies één keer in het contracttotaal terecht, namelijk via het meerwerk;
 *   • de regel start in status `aangevraagd`, dus het klantakkoord loopt via de normale
 *     meerwerkstatus — verrekening boven de drempel wordt nooit stil doorgevoerd;
 *   • de regel krijgt afrekenwijze `aangenomen` met een vastgezet bedrag, géén eigen
 *     bewakingscode. Zou hij op geboekte kosten afrekenen, dan telde het volledige werkelijke
 *     bedrag als meerwerk in plaats van alleen het verschil — dat is de dubbeltelling die deze
 *     opzet uitsluit.
 * De unieke index op `meerwerk_regels.opdracht_onderdeel_id` maakt een tweede verrekening
 * onmogelijk.
 */
export async function verrekenStelpost(
  onderdeelId: string,
): Promise<{ ok: true; meerwerkId: string; saldo: number } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: rij } = await supabase
    .from('opdracht_onderdelen')
    .select('*')
    .eq('id', onderdeelId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Stelpost niet gevonden.' }
  if (rij.soort !== 'stelpost') return { ok: false, error: 'Alleen een stelpost is te verrekenen.' }
  await assertDossierBewerkbaar(rij.dossier_id)

  if (rij.grondslag !== 'geboekte_kosten' && rij.grondslag !== 'eenheidsprijzen') {
    return { ok: false, error: 'Deze stelpost rekent op een vast bedrag af; er is niets te verrekenen. Zet de grondslag op geboekte kosten of eenheidsprijzen.' }
  }
  if (rij.grondslag === 'geboekte_kosten' && !rij.bewakingscode) {
    return { ok: false, error: 'Deze stelpost heeft nog geen bewakingscode, dus er zijn geen geboekte kosten aan toe te rekenen.' }
  }
  if (rij.grondslag === 'eenheidsprijzen' && (rij.eenheidsprijs == null || rij.hoeveelheid_werkelijk == null)) {
    return { ok: false, error: 'Vul eerst de eenheidsprijs en de werkelijk uitgevoerde hoeveelheid in.' }
  }

  const { data: bestaand } = await supabase
    .from('meerwerk_regels')
    .select('id')
    .eq('opdracht_onderdeel_id', onderdeelId)
    .maybeSingle()
  if (bestaand) return { ok: false, error: 'Deze stelpost is al verrekend.' }

  // Het werkelijke bedrag. Bij geboekte kosten komt dat live uit Bouw7; bij eenheidsprijzen uit de
  // stelpost zelf, en dan is de Bouw7-call niet nodig (en mag een Bouw7-storing niet blokkeren).
  const verkoopPerCode = new Map<string, number>()
  if (rij.grondslag === 'geboekte_kosten') {
    const regie = await getServicedeskRegie(rij.dossier_id, { opslagPerCode: opslagPerCode([rij]) })
      .catch(() => null)
    if (!regie?.beschikbaar) {
      return { ok: false, error: 'De geboekte uren en kosten zijn nu niet op te halen uit Bouw7. Probeer het later opnieuw.' }
    }
    for (const r of regie.regels ?? []) {
      if (r.uitgesloten || !r.bewakingscode) continue
      verkoopPerCode.set(r.bewakingscode, (verkoopPerCode.get(r.bewakingscode) ?? 0) + (r.verkoopBedrag || 0))
    }
  }
  const werkelijk = werkelijkBedrag(rij, code => verkoopPerCode.get(code) ?? 0)
  if (werkelijk == null) {
    return { ok: false, error: 'Het werkelijke bedrag van deze stelpost is niet te bepalen.' }
  }

  const stelpostBedrag = rond(num(rij.bedrag_excl_btw))
  const saldo = rond(werkelijk - stelpostBedrag)
  if (saldo === 0) {
    return { ok: false, error: 'Het werkelijke bedrag is gelijk aan de stelpost; er valt niets te verrekenen.' }
  }

  const { data: maxRow } = await supabase
    .from('meerwerk_regels')
    .select('volgnummer')
    .eq('dossier_id', rij.dossier_id)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()

  const label = saldo > 0 ? 'Meerwerk' : 'Minderwerk'
  const { data: ins, error } = await supabase
    .from('meerwerk_regels')
    .insert({
      dossier_id: rij.dossier_id,
      volgnummer: num(maxRow?.volgnummer) + 1,
      omschrijving: `${label} verrekening stelpost — ${rij.omschrijving}`,
      status: 'aangevraagd',
      afrekenwijze: 'aangenomen',
      is_stelpost: false,
      bedrag_excl_btw: saldo,
      btw_pct: rij.btw_pct ?? null,
      bron: 'eva',
      opdracht_onderdeel_id: onderdeelId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/opdrachten/${rij.dossier_id}/informatie`)
  revalidatePath(`/opdrachten/${rij.dossier_id}/meerwerk`)
  return { ok: true, meerwerkId: ins.id, saldo }
}
