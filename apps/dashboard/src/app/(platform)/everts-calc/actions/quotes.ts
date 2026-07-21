'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/everts-calc/supabase/server'
import type { NieuweQuoteData, QuoteType, QuoteStatus, Discipline, TermType } from '@/lib/everts-calc/types-quotes'
import type { StructuurGroep } from '@/lib/everts-calc/import-structuur'
import { assertQuoteBewerkbaar } from '@/lib/everts-calc/quote-guards'
import { omschrijvingMetBehandeling } from '@/lib/everts-calc/behandeling-label'

const PAD = '/quotes'

// Helper: cast Supabase client naar any (nieuwe tabellen zijn nog niet in auto-gen types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> {
  return createClient()
}

/**
 * Reserveert het volgende offertenummer (OFT-YYYY-NNN) uit de DB-sequence, zonder
 * een offerte aan te maken. Wordt bij het aanmaken van een calculatie aangeroepen,
 * zodat de calculatie al een nummer heeft dat de offerte later overneemt.
 */
export async function reserveerOfferteNummer(): Promise<string | null> {
  const supabase = await getDb()
  const { data, error } = await supabase.rpc('reserveer_offerte_nummer')
  if (error) return null
  return (data as string) ?? null
}

// ─── Offerte vanuit project (één-klik aanmaken) ───────────────────────────────

export async function maakQuoteVanuitProject(
  projectId: string,
  projectNaam: string,
  clientNaam: string | null,
  projectNummer: string | null,
  type: QuoteType
): Promise<never> {
  const supabase = await getDb()

  // Haal standaard template op
  const { data: template } = await supabase
    .from('quote_templates')
    .select('id, geldigheid_dagen, standaard_voorwaarden, standaard_uitsluitingen, standaard_opmerkingen')
    .eq('is_standaard', true)
    .single()

  // Maak of zoek klant op basis van naam
  let clientId: string | null = null
  if (clientNaam) {
    const { data: bestaand } = await supabase
      .from('clients')
      .select('id')
      .eq('naam', clientNaam)
      .single()
    if (bestaand) {
      clientId = bestaand.id
    } else {
      const { data: nieuw } = await supabase
        .from('clients')
        .insert({ naam: clientNaam })
        .select('id')
        .single()
      clientId = nieuw?.id ?? null
    }
  }

  const datum = new Date().toISOString().split('T')[0]
  const dagen = template?.geldigheid_dagen ?? 30
  const d = new Date(datum)
  d.setDate(d.getDate() + dagen)
  const geldig_tot = d.toISOString().split('T')[0]

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      type,
      client_id: clientId,
      titel: type === 'interne_calculatie'
        ? `Interne begroting — ${projectNaam}`
        : `Offerte — ${projectNaam}`,
      referentie: projectNummer ?? null,
      datum,
      geldig_tot,
      project_id: projectId,
      template_id: template?.id ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // Voeg standaard voorwaarden in
  if (template) {
    const terms: { quote_id: string; type: TermType; inhoud: string; volgorde: number }[] = []
    if (template.standaard_voorwaarden) terms.push({ quote_id: quote.id, type: 'voorwaarden', inhoud: template.standaard_voorwaarden, volgorde: 0 })
    if (template.standaard_uitsluitingen) terms.push({ quote_id: quote.id, type: 'uitsluitingen', inhoud: template.standaard_uitsluitingen, volgorde: 0 })
    if (template.standaard_opmerkingen) terms.push({ quote_id: quote.id, type: 'opmerkingen', inhoud: template.standaard_opmerkingen, volgorde: 0 })
    if (terms.length) await supabase.from('quote_terms').insert(terms)
  }

  revalidatePath(PAD)
  redirect(`/everts-calc/quotes/${quote.id}?import=1`)
}

// ─── Meerwerk-offerte (gekoppeld aan een meerwerkregel) ───────────────────────

/**
 * Maakt een "Meerwerk offerte"-calculatie voor een meerwerkregel binnen een bestaand everts-calc
 * project. Geen redirect — geeft het nieuwe quote-id terug zodat de aanroeper (lib/dossiers/meerwerk.ts)
 * het op de regel kan vastleggen. Hergebruikt de standaard-template + standaardvoorwaarden zoals
 * maakQuoteVanuitProject.
 */
export async function maakMeerwerkOfferte(opts: {
  projectId: string
  meerwerkRegelId: string
  omschrijving: string
  clientId?: string | null
  referentie?: string | null
  /** Dossier van de meerwerkregel — directe koppeling voor de offerte-render. */
  dossierId?: string | null
}): Promise<{ ok: true; quoteId: string } | { ok: false; error: string }> {
  const supabase = await getDb()

  const { data: template } = await supabase
    .from('quote_templates')
    .select('id, geldigheid_dagen, standaard_voorwaarden, standaard_uitsluitingen, standaard_opmerkingen')
    .eq('is_standaard', true)
    .single()

  const datum = new Date().toISOString().split('T')[0]
  const dagen = template?.geldigheid_dagen ?? 30
  const d = new Date(datum)
  d.setDate(d.getDate() + dagen)
  const geldig_tot = d.toISOString().split('T')[0]

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      type: 'verkoopofferte' as QuoteType,
      client_id: opts.clientId ?? null,
      titel: `Meerwerk offerte — ${opts.omschrijving}`,
      referentie: opts.referentie ?? null,
      datum,
      geldig_tot,
      project_id: opts.projectId,
      dossier_id: opts.dossierId ?? null,
      template_id: template?.id ?? null,
      meerwerk_regel_id: opts.meerwerkRegelId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  if (template) {
    const terms: { quote_id: string; type: TermType; inhoud: string; volgorde: number }[] = []
    if (template.standaard_voorwaarden) terms.push({ quote_id: quote.id, type: 'voorwaarden', inhoud: template.standaard_voorwaarden, volgorde: 0 })
    if (template.standaard_uitsluitingen) terms.push({ quote_id: quote.id, type: 'uitsluitingen', inhoud: template.standaard_uitsluitingen, volgorde: 0 })
    if (template.standaard_opmerkingen) terms.push({ quote_id: quote.id, type: 'opmerkingen', inhoud: template.standaard_opmerkingen, volgorde: 0 })
    if (terms.length) await supabase.from('quote_terms').insert(terms)
  }

  revalidatePath(PAD)
  return { ok: true, quoteId: quote.id }
}

// ─── Offerte vanuit project — met directe import van calculatieregels ─────────

export type ImportRegel = {
  groep_id: string
  groep_naam: string
  groep_nummer?: string | null
  groep_niveau?: number | null
  groep_optioneel?: boolean
  omschrijving: string
  hoeveelheid: number
  eenheid: string
  eenheidsprijs: number
  kostprijs_pe?: number | null
  uren_pe?: number | null
  calculatieregel_id?: string | null
  opmerking?: string | null
  is_stelpost?: boolean
  btw_pct?: number | null
  /** Koppeling naar de bibliotheek; de tekst wordt hier pas bevroren (zie importeerRegels). */
  schilderbehandeling_id?: string | null
  schilderbehandeling?: string | null
  werkomschrijving_afbeeldingen?: string[] | null
}

export async function maakQuoteVanuitProjectMetImport(params: {
  projectId: string
  projectNaam: string
  clientNaam: string | null
  projectNummer: string | null
  type: QuoteType
  layoutId: string | null
  importRegels: ImportRegel[]
  structuur?: StructuurGroep[]
  /** Dossier waarin de offerte inline wordt aangemaakt — koppelt project ⇄ dossier
   *  zodat de render werkadres/werkmaatschappij/contactpersoon terugvindt. */
  dossierId?: string | null
  /** Scenario (calculatie) waaruit de offerte gemaakt is — onthouden op de quote
   *  zodat er precies één offerte per calculatie is. */
  scenarioId?: string | null
  /** Offertenummer van de calculatie; leeg → de DB genereert er een (OFT-…). */
  quoteNummer?: string | null
  /** Versienummer van de calculatie (erft de offerte over; default 1). */
  versie?: number | null
  /** Gekozen betalingsconditie uit het Offerte-instellingen-blok. */
  betalingsconditieId?: string | null
  /** Gekozen algemene voorwaarden uit het Offerte-instellingen-blok. */
  voorwaardenId?: string | null
  /** Vrije offerte-teksten van de calculatie; leeg → terugval op standaardsjabloon. */
  voorwaardenTekst?: string | null
  uitsluitingenTekst?: string | null
  opmerkingenTekst?: string | null
}): Promise<{ id: string }> {
  const supabase = await getDb()

  // Haal standaard template op
  const { data: template } = await supabase
    .from('quote_templates')
    .select('id, geldigheid_dagen, standaard_voorwaarden, standaard_uitsluitingen, standaard_opmerkingen')
    .eq('is_standaard', true)
    .single()

  // Maak of zoek klant op basis van naam
  let clientId: string | null = null
  if (params.clientNaam) {
    const { data: bestaand } = await supabase
      .from('clients')
      .select('id')
      .eq('naam', params.clientNaam)
      .single()
    if (bestaand) {
      clientId = bestaand.id
    } else {
      const { data: nieuw } = await supabase
        .from('clients')
        .insert({ naam: params.clientNaam })
        .select('id')
        .single()
      clientId = nieuw?.id ?? null
    }
  }

  const datum = new Date().toISOString().split('T')[0]
  const dagen = template?.geldigheid_dagen ?? 30
  const d = new Date(datum)
  d.setDate(d.getDate() + dagen)
  const geldig_tot = d.toISOString().split('T')[0]

  // Eén concept-offerte per calculatie: een eventuele bestaande CONCEPT-offerte van
  // dit scenario wordt vervangen (cascade ruimt secties/regels/voorwaarden op). Een
  // reeds definitieve (verzonden) offerte blijft staan — die mag niet verwijderd.
  if (params.scenarioId) {
    await supabase
      .from('quotes')
      .delete()
      .eq('project_id', params.projectId)
      .eq('scenario_id', params.scenarioId)
      .eq('status', 'concept')
  }

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      type: params.type,
      // Nummer van de calculatie overnemen; leeg → DB-trigger genereert een OFT-nummer.
      quote_nummer: params.quoteNummer || '',
      client_id: clientId,
      titel: params.type === 'interne_calculatie'
        ? `Interne begroting — ${params.projectNaam}`
        : `Offerte — ${params.projectNaam}`,
      referentie: params.projectNummer ?? null,
      datum,
      geldig_tot,
      project_id: params.projectId,
      // Directe dossier-koppeling: robuuster dan alleen de omgekeerde link via het
      // everts-calc project. De offerte-render leest hier als eerste uit.
      dossier_id: params.dossierId ?? null,
      scenario_id: params.scenarioId ?? null,
      // Offerte erft het versienummer van zijn calculatie (1:1 per versie).
      versie: params.versie ?? 1,
      template_id: template?.id ?? null,
      layout_id: params.layoutId ?? null,
      // Betalingsconditie = uitsluitend de keuze uit de calculatie (Offerte-
      // instellingen). Géén blinde standaard-fallback: zonder keuze blijft dit leeg,
      // zodat de offerte nooit een verkeerde staffel toont.
      betalingsconditie_id: params.betalingsconditieId ?? null,
      voorwaarden_id: params.voorwaardenId ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // Dossier ⇄ project persisteren (idempotent) zodat de offerte-render het dossier
  // terugvindt. Best-effort: een fout hier mag het aanmaken niet blokkeren.
  if (params.dossierId) {
    try {
      const { koppelDossierAanProject } = await import('@/lib/dossiers/actions')
      await koppelDossierAanProject(params.dossierId, params.projectId)
    } catch { /* koppeling is best-effort */ }
  }

  // Voeg de vrije offerte-teksten in. De calculatie-teksten (Offerte-instellingen)
  // winnen; is een veld daar leeg, dan valt het terug op het standaardsjabloon.
  {
    const kies = (calc: string | null | undefined, sjabloon: string | null | undefined) => {
      const c = (calc ?? '').trim()
      return c !== '' ? c : (sjabloon ?? '')
    }
    const teksten: Record<TermType, string> = {
      voorwaarden:   kies(params.voorwaardenTekst,   template?.standaard_voorwaarden),
      uitsluitingen: kies(params.uitsluitingenTekst, template?.standaard_uitsluitingen),
      opmerkingen:   kies(params.opmerkingenTekst,   template?.standaard_opmerkingen),
    }
    const terms = (Object.keys(teksten) as TermType[])
      .filter(type => teksten[type] !== '')
      .map(type => ({ quote_id: quote.id, type, inhoud: teksten[type], volgorde: 0 }))
    if (terms.length) await supabase.from('quote_terms').insert(terms)
  }

  // Importeer calculatieregels direct (geen AutoImporter nodig)
  if (params.importRegels.length > 0) {
    await importeerRegels(quote.id, params.importRegels, params.structuur)
  }

  revalidatePath(PAD)
  return { id: quote.id }
}

// ─── Klanten ──────────────────────────────────────────────────────────────────

export async function maakClient(data: {
  naam: string
  bedrijfsnaam?: string
  adres?: string
  postcode?: string
  plaats?: string
  email?: string
  telefoon?: string
  kvk?: string
  btw_nummer?: string
}): Promise<string> {
  const supabase = await getDb()
  const { data: row, error } = await supabase
    .from('clients')
    .insert({ ...data })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
  return row.id
}

export async function wijzigClient(id: string, data: {
  naam?: string
  bedrijfsnaam?: string | null
  adres?: string | null
  postcode?: string | null
  plaats?: string | null
  email?: string | null
  telefoon?: string | null
}): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase
    .from('clients')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}

// ─── Offertes aanmaken / verwijderen ──────────────────────────────────────────

export async function maakQuote(data: NieuweQuoteData): Promise<never> {
  const supabase = await getDb()

  // Haal standaard template op voor geldigheid_dagen
  const { data: template } = await supabase
    .from('quote_templates')
    .select('id, geldigheid_dagen, standaard_voorwaarden, standaard_uitsluitingen, standaard_opmerkingen')
    .eq('is_standaard', true)
    .single()

  const geldig_tot = data.geldig_tot ?? (() => {
    const dagen = template?.geldigheid_dagen ?? 30
    const d = new Date(data.datum)
    d.setDate(d.getDate() + dagen)
    return d.toISOString().split('T')[0]
  })()

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      type: data.type,
      client_id: data.client_id ?? null,
      titel: data.titel,
      referentie: data.referentie ?? null,
      datum: data.datum,
      geldig_tot,
      project_id: data.project_id ?? null,
      scenario_id: data.scenario_id ?? null,
      template_id: data.template_id ?? template?.id ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // Voeg standaard voorwaarden in als template beschikbaar is
  if (template) {
    const terms: { quote_id: string; type: TermType; inhoud: string; volgorde: number }[] = []
    if (template.standaard_voorwaarden) terms.push({ quote_id: quote.id, type: 'voorwaarden', inhoud: template.standaard_voorwaarden, volgorde: 0 })
    if (template.standaard_uitsluitingen) terms.push({ quote_id: quote.id, type: 'uitsluitingen', inhoud: template.standaard_uitsluitingen, volgorde: 0 })
    if (template.standaard_opmerkingen) terms.push({ quote_id: quote.id, type: 'opmerkingen', inhoud: template.standaard_opmerkingen, volgorde: 0 })
    if (terms.length) await supabase.from('quote_terms').insert(terms)
  }

  revalidatePath(PAD)
  redirect(`/everts-calc/quotes/${quote.id}`)
}

export async function verwijderQuote(id: string): Promise<never> {
  // Definitieve (verzonden) offertes zijn onveranderbaar en mogen niet worden
  // verwijderd — server-side backstop naast het verbergen van de UI-knop.
  await assertQuoteBewerkbaar(id)
  const supabase = await getDb()
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
  redirect(PAD)
}

/**
 * Kopieert een offerte naar een nieuwe versie: nieuwe rij met status 'concept',
 * verwijzing naar de oorspronkelijke offerte (parent_quote_id = wortel) en een
 * ophogend versienummer in het offertenummer (bv. OFT-2026-046-v2). Secties,
 * regels en voorwaarden worden meegekopieerd. Zo blijft een verzonden/definitieve
 * offerte onaangetast terwijl je verder werkt aan de kopie.
 */
export async function dupliceerQuoteAlsNieuweVersie(quoteId: string): Promise<{ id: string }> {
  const supabase = await getDb()

  const { data: orig, error: oErr } = await supabase
    .from('quotes')
    .select('*, sections:quote_sections(*, lines:quote_lines(*)), terms:quote_terms(*)')
    .eq('id', quoteId)
    .single()
  if (oErr || !orig) throw new Error('Offerte niet gevonden')

  // Versienummer bepalen op basis van de hele familie (wortel + alle versies).
  const rootId: string = orig.parent_quote_id ?? orig.id
  const { data: familie } = await supabase
    .from('quotes')
    .select('versie')
    .or(`id.eq.${rootId},parent_quote_id.eq.${rootId}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxVersie = Math.max(1, ...(((familie ?? []) as any[]).map(q => q.versie ?? 1)))
  const nieuweVersie = maxVersie + 1
  const basisNummer = String(orig.quote_nummer ?? '').replace(/-v\d+$/, '')
  const nieuwNummer = `${basisNummer}-v${nieuweVersie}`

  // Headervelden kopiëren; id/audit/relatie-arrays en versie-/verzendvelden weglaten.
  const {
    id: _id, created_at: _c, updated_at: _u, sections, terms,
    quote_nummer: _qn, status: _st, parent_quote_id: _pp, versie: _vv,
    verzonden_at: _va, verzonden_door: _vd, verzonden_naar: _vn,
    ...rest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = orig as any

  const { data: nieuw, error: nErr } = await supabase
    .from('quotes')
    .insert({
      ...rest,
      quote_nummer: nieuwNummer,
      status: 'concept',
      parent_quote_id: rootId,
      versie: nieuweVersie,
      verzonden_at: null, verzonden_door: null, verzonden_naar: null,
    })
    .select('id')
    .single()
  if (nErr || !nieuw) throw new Error(nErr?.message ?? 'Kopiëren mislukt')

  // Secties + regels kopiëren met nieuwe id-mapping.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of ((sections ?? []) as any[])) {
    const { id: _sid, quote_id: _sq, created_at: _sc, lines, ...srest } = s
    const { data: nieuweSectie } = await supabase
      .from('quote_sections')
      .insert({ ...srest, quote_id: nieuw.id })
      .select('id')
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nieuweRegels = ((lines ?? []) as any[]).map(l => {
      const { id: _lid, quote_id: _lq, section_id: _lsid, created_at: _lc, updated_at: _lu, ...lrest } = l
      return { ...lrest, quote_id: nieuw.id, section_id: nieuweSectie?.id ?? null }
    })
    if (nieuweRegels.length) await supabase.from('quote_lines').insert(nieuweRegels)
  }

  // Voorwaarden kopiëren.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nieuweTerms = ((terms ?? []) as any[]).map(t => {
    const { id: _tid, quote_id: _tq, created_at: _tc, ...trest } = t
    return { ...trest, quote_id: nieuw.id }
  })
  if (nieuweTerms.length) await supabase.from('quote_terms').insert(nieuweTerms)

  await herbereken(nieuw.id)
  revalidatePath(PAD)
  revalidatePath(`${PAD}/${nieuw.id}`)
  return { id: nieuw.id }
}

// ─── Header bijwerken ─────────────────────────────────────────────────────────

export async function updateQuoteHeader(id: string, data: {
  client_id?: string | null
  titel?: string
  referentie?: string | null
  datum?: string
  geldig_tot?: string | null
  contactpersoon?: string | null
  aanhef?: string
  inleiding?: string | null
  slottekst?: string | null
  status?: QuoteStatus
  type?: QuoteType
  betalingsconditie_id?: string | null
  voorwaarden_id?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Vergrendeling: een definitieve (verzonden) offerte is onveranderbaar; geen
  // inhoudelijke velden meer wijzigbaar.
  const wijzigtInhoud = Object.keys(data).some(k => k !== 'status')
  if (wijzigtInhoud) {
    try { await assertQuoteBewerkbaar(id) }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Offerte vergrendeld' } }
  }

  const supabase = await getDb()

  // Gate: definitief maken (concept → verzonden) mag alleen na controller-
  // goedkeuring — server-side afgedwongen, de UI toont de foutmelding als toast.
  if (data.status === 'verzonden') {
    const { data: huidig } = await supabase.from('quotes').select('status').eq('id', id).maybeSingle()
    if (huidig?.status === 'concept') {
      const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')
      const check = await assertOfferteVerzendbaar(id)
      if (!check.ok) return { ok: false, error: check.error }
    }
  }

  const { error } = await supabase
    .from('quotes')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`${PAD}/${id}`)
  return { ok: true }
}

export async function updateQuoteSettings(id: string, data: {
  detailregels_tonen?: boolean
  btw_pct?: number
  stelposten_in_totaal?: boolean
}): Promise<void> {
  await assertQuoteBewerkbaar(id)
  const supabase = await getDb()
  const { error } = await supabase
    .from('quotes')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await herbereken(id)
  revalidatePath(`${PAD}/${id}`)
}

// ─── Secties ──────────────────────────────────────────────────────────────────

export async function maakSection(quoteId: string, data: {
  naam: string
  discipline?: Discipline | null
  volgorde?: number
  is_optioneel?: boolean
  niveau?: number
  nummer?: string | null
}): Promise<string> {
  await assertQuoteBewerkbaar(quoteId)
  const supabase = await getDb()

  // Bepaal volgorde als niet opgegeven
  let volgorde = data.volgorde ?? 0
  if (!data.volgorde) {
    const { data: bestaand } = await supabase
      .from('quote_sections')
      .select('volgorde')
      .eq('quote_id', quoteId)
      .order('volgorde', { ascending: false })
      .limit(1)
      .single()
    volgorde = (bestaand?.volgorde ?? -1) + 1
  }

  const { data: section, error } = await supabase
    .from('quote_sections')
    .insert({
      quote_id: quoteId,
      naam: data.naam,
      discipline: data.discipline ?? null,
      volgorde,
      is_optioneel: data.is_optioneel ?? false,
      niveau: data.niveau ?? 1,
      nummer: data.nummer ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`${PAD}/${quoteId}`)
  return section.id
}

export async function updateSection(id: string, quoteId: string, data: {
  naam?: string
  discipline?: Discipline | null
  toon_detail?: boolean
  volgorde?: number
  is_optioneel?: boolean
  niveau?: number
  nummer?: string | null
}): Promise<void> {
  await assertQuoteBewerkbaar(quoteId)
  const supabase = await getDb()
  const { error } = await supabase.from('quote_sections').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`${PAD}/${quoteId}`)
}

export async function verwijderSection(id: string, quoteId: string): Promise<void> {
  await assertQuoteBewerkbaar(quoteId)
  const supabase = await getDb()
  const { error } = await supabase.from('quote_sections').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`${PAD}/${quoteId}`)
}

/**
 * Herorder secties door voor elk id de nieuwe volgorde op te slaan.
 * items = array van {id, volgorde} in de gewenste volgorde.
 */
export async function herorderSections(
  quoteId: string,
  items: { id: string; volgorde: number }[],
): Promise<void> {
  await assertQuoteBewerkbaar(quoteId)
  const supabase = await getDb()
  await Promise.all(
    items.map(({ id, volgorde }) =>
      supabase.from('quote_sections').update({ volgorde }).eq('id', id)
    )
  )
  revalidatePath(`${PAD}/${quoteId}`)
}

// ─── Offerteregels ────────────────────────────────────────────────────────────

export async function maakLine(data: {
  quote_id: string
  section_id?: string | null
  omschrijving: string
  hoeveelheid?: number
  eenheid?: string
  eenheidsprijs?: number
  btw_pct?: number
  volgorde?: number
  kostprijs_pe?: number | null
  uren_pe?: number | null
  opmerking?: string | null
  calculatieregel_id?: string | null
  groep_id?: string | null
}): Promise<string> {
  await assertQuoteBewerkbaar(data.quote_id)
  const supabase = await getDb()
  const hoeveelheid = data.hoeveelheid ?? 1
  const eenheidsprijs = data.eenheidsprijs ?? 0
  const line_total = Math.round(hoeveelheid * eenheidsprijs * 100) / 100

  const { data: line, error } = await supabase
    .from('quote_lines')
    .insert({
      quote_id: data.quote_id,
      section_id: data.section_id ?? null,
      omschrijving: data.omschrijving,
      hoeveelheid,
      eenheid: data.eenheid ?? 'st',
      eenheidsprijs,
      line_total,
      btw_pct: data.btw_pct ?? 21,
      volgorde: data.volgorde ?? 0,
      kostprijs_pe: data.kostprijs_pe ?? null,
      uren_pe: data.uren_pe ?? null,
      opmerking: data.opmerking ?? null,
      calculatieregel_id: data.calculatieregel_id ?? null,
      groep_id: data.groep_id ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`${PAD}/${data.quote_id}`)
  return line.id
}

export async function updateLine(id: string, quoteId: string, data: {
  omschrijving?: string
  hoeveelheid?: number
  eenheid?: string
  eenheidsprijs?: number
  btw_pct?: number
  volgorde?: number
  kostprijs_pe?: number | null
  uren_pe?: number | null
  opmerking?: string | null
  section_id?: string | null
}): Promise<void> {
  await assertQuoteBewerkbaar(quoteId)
  const supabase = await getDb()

  // Herbereken line_total als hoeveelheid of prijs wijzigt
  let extra: Record<string, number> = {}
  if (data.hoeveelheid !== undefined || data.eenheidsprijs !== undefined) {
    // Haal huidige waarden op
    const { data: huidig } = await supabase
      .from('quote_lines')
      .select('hoeveelheid, eenheidsprijs')
      .eq('id', id)
      .single()
    if (huidig) {
      const h = data.hoeveelheid ?? huidig.hoeveelheid
      const p = data.eenheidsprijs ?? huidig.eenheidsprijs
      extra = { line_total: Math.round(h * p * 100) / 100 }
    }
  }

  const { error } = await supabase
    .from('quote_lines')
    .update({ ...data, ...extra, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`${PAD}/${quoteId}`)
}

export async function verwijderLine(id: string, quoteId: string): Promise<void> {
  await assertQuoteBewerkbaar(quoteId)
  const supabase = await getDb()
  const { error } = await supabase.from('quote_lines').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`${PAD}/${quoteId}`)
}

// ─── Voorwaarden ──────────────────────────────────────────────────────────────

export async function upsertTerm(quoteId: string, type: TermType, inhoud: string): Promise<void> {
  const supabase = await getDb()

  // Check of bestaand record bestaat
  const { data: bestaand } = await supabase
    .from('quote_terms')
    .select('id')
    .eq('quote_id', quoteId)
    .eq('type', type)
    .single()

  if (bestaand) {
    const { error } = await supabase
      .from('quote_terms')
      .update({ inhoud })
      .eq('id', bestaand.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('quote_terms')
      .insert({ quote_id: quoteId, type, inhoud, volgorde: 0 })
    if (error) throw new Error(error.message)
  }

  revalidatePath(`${PAD}/${quoteId}`)
}

// ─── Totalen herberekenen ─────────────────────────────────────────────────────

export async function herbereken(quoteId: string): Promise<void> {
  const supabase = await getDb()

  // 1. Haal alle lines op incl. btw_pct per regel voor correcte BTW-berekening
  const { data: lines } = await supabase
    .from('quote_lines')
    .select('id, section_id, line_total, btw_pct')
    .eq('quote_id', quoteId)

  if (!lines) return

  // Probeer is_stelpost op te halen (v3 kolom, kan ontbreken — negeer errors)
  let stelpostIds = new Set<string>()
  try {
    const { data: linesV3 } = await supabase
      .from('quote_lines')
      .select('id, is_stelpost')
      .eq('quote_id', quoteId)
      .eq('is_stelpost', true)
    stelpostIds = new Set((linesV3 ?? []).map((l: { id: string }) => l.id))
  } catch { /* v3 kolom bestaat nog niet */ }

  // 2. Haal secties op (basis + optioneel is_optioneel als v3 beschikbaar)
  const { data: sections } = await supabase
    .from('quote_sections')
    .select('id')
    .eq('quote_id', quoteId)

  // Probeer is_optioneel op te halen (v3 kolom)
  const { data: sectionsV3 } = await supabase
    .from('quote_sections')
    .select('id, is_optioneel')
    .eq('quote_id', quoteId)

  const optieSectieIds = new Set(
    (sectionsV3 ?? [])
      .filter((s: { is_optioneel?: boolean }) => s.is_optioneel)
      .map((s: { id: string }) => s.id)
  )

  // 3. Bereken sectie subtotalen en splits normaal/stelpost/optie
  const sectieMap: Record<string, number> = {}
  let normaalEx = 0
  let stelpostEx = 0
  let optieEx = 0
  // BTW per tarief (op basis van per-regel btw_pct)
  const btwPerTarief = new Map<number, number>()

  for (const line of lines as { id: string; section_id: string | null; line_total: number; btw_pct?: number }[]) {
    const sectionId = line.section_id ?? '__geen__'
    const bedrag = line.line_total ?? 0
    sectieMap[sectionId] = (sectieMap[sectionId] ?? 0) + bedrag

    if (optieSectieIds.has(sectionId)) {
      optieEx += bedrag
    } else if (stelpostIds.has(line.id)) {
      stelpostEx += bedrag
    } else {
      normaalEx += bedrag
    }
    // Accumuleer BTW per tarief (stelposten en normale regels, geen optie)
    if (!optieSectieIds.has(sectionId)) {
      const pct = line.btw_pct ?? 21
      btwPerTarief.set(pct, (btwPerTarief.get(pct) ?? 0) + bedrag)
    }
  }

  // 4. Update sectie subtotalen
  if (sections) {
    for (const s of sections as { id: string }[]) {
      await supabase
        .from('quote_sections')
        .update({ subtotaal: sectieMap[s.id] ?? 0 })
        .eq('id', s.id)
    }
  }

  // 5. Haal btw_pct op (altijd beschikbaar) + stelposten_in_totaal (v3)
  const { data: quote } = await supabase
    .from('quotes')
    .select('btw_pct')
    .eq('id', quoteId)
    .single()

  const { data: quoteV3 } = await supabase
    .from('quotes')
    .select('stelposten_in_totaal')
    .eq('id', quoteId)
    .single()

  const fallbackBtwPct = quote?.btw_pct ?? 21
  const stelposten_in_totaal = quoteV3?.stelposten_in_totaal ?? true

  const stelposten_subtotaal = Math.round(stelpostEx * 100) / 100
  const opties_subtotaal = Math.round(optieEx * 100) / 100

  // Hoofd subtotaal: normaal + eventueel stelposten (optie NOOIT in totaal)
  const subtotaalBase = normaalEx + (stelposten_in_totaal ? stelpostEx : 0)
  const subtotaal_ex_btw = Math.round(subtotaalBase * 100) / 100

  // BTW berekenen per tarief (per-regel btw_pct); valt terug op quote-level btw_pct
  let btw_bedrag: number
  if (btwPerTarief.size > 0) {
    // Gebruik per-regel tarieven, maar pas proportioneel aan voor stelposten-keuze
    const totaalBasis = normaalEx + stelpostEx
    const inclusiefBasis = subtotaalBase
    const schaal = totaalBasis > 0 ? inclusiefBasis / totaalBasis : 1
    btw_bedrag = Math.round(
      Array.from(btwPerTarief.entries()).reduce((s, [pct, basis]) => s + basis * schaal * (pct / 100), 0) * 100
    ) / 100
  } else {
    btw_bedrag = Math.round(subtotaal_ex_btw * fallbackBtwPct) / 100
  }
  const totaal_inc_btw = Math.round((subtotaal_ex_btw + btw_bedrag) * 100) / 100

  // Basis update (altijd)
  await supabase
    .from('quotes')
    .update({
      subtotaal_ex_btw,
      btw_bedrag,
      totaal_inc_btw,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)

  // v3 velden updaten (negeert fouten als kolommen nog niet bestaan)
  await supabase
    .from('quotes')
    .update({ stelposten_subtotaal, opties_subtotaal })
    .eq('id', quoteId)
    .then(() => {/* negeer fouten */})

  revalidatePath(`${PAD}/${quoteId}`)
}

// ─── Import uit calculatie ────────────────────────────────────────────────────

export async function importeerRegels(
  quoteId: string,
  regels: {
    groep_id: string
    groep_naam: string
    groep_nummer?: string | null
    groep_niveau?: number | null
    groep_optioneel?: boolean
    omschrijving: string
    hoeveelheid: number
    eenheid: string
    eenheidsprijs: number
    kostprijs_pe?: number | null
    uren_pe?: number | null
    calculatieregel_id?: string | null
    opmerking?: string | null
    is_stelpost?: boolean
    btw_pct?: number | null
    schilderbehandeling_id?: string | null
    schilderbehandeling?: string | null
    werkomschrijving_afbeeldingen?: string[] | null
  }[],
  // Optioneel: de volledige sectie-structuur in outline-volgorde, inclusief lege
  // hoofdstuk-groepen (niveau 1) die zelf geen regels hebben. Wordt dit meegegeven,
  // dan bepaalt het de secties én hun volgorde; anders leiden we ze af uit de regels.
  structuur?: StructuurGroep[],
): Promise<void> {
  await assertQuoteBewerkbaar(quoteId)
  const supabase = await getDb()

  // Schilderbehandelingen: de calculatie bewaart alleen de koppeling (id), de tekst
  // wordt hier — op het moment dat de offerte ontstaat — bevroren. Zo volgt de
  // calculatie wijzigingen in de bibliotheek, terwijl de offerte vastligt. Zonder id
  // (oudere calculaties) valt hij terug op de meegestuurde tekst.
  const behandelingIds = Array.from(
    new Set(regels.map(r => r.schilderbehandeling_id).filter((id): id is string => !!id)),
  )
  const behandelingTeksten = new Map<string, string>()
  const behandelingNamen = new Map<string, string>()
  if (behandelingIds.length > 0) {
    const { data: behandelingen } = await supabase
      .from('schilder_behandelingen')
      .select('id, naam, korte_omschrijving, uitgebreide_werkomschrijving')
      .in('id', behandelingIds)
    for (const b of behandelingen ?? []) {
      const tekst = b.uitgebreide_werkomschrijving?.trim() || b.korte_omschrijving?.trim() || b.naam
      if (tekst) behandelingTeksten.set(b.id, tekst)
      if (b.naam?.trim()) behandelingNamen.set(b.id, b.naam.trim())
    }
  }

  // Groepeer regels per groep (altijd sectie per groep)
  const groepenMap = new Map<string, typeof regels>()
  for (const r of regels) {
    if (!groepenMap.has(r.groep_id)) groepenMap.set(r.groep_id, [])
    groepenMap.get(r.groep_id)!.push(r)
  }

  // Bepaal huidig max volgorde voor secties
  const { data: bestaandeSections } = await supabase
    .from('quote_sections')
    .select('volgorde')
    .eq('quote_id', quoteId)
    .order('volgorde', { ascending: false })
    .limit(1)
    .single()
  let sectionVolgorde = (bestaandeSections?.volgorde ?? -1) + 1

  // Sectie-definities in de juiste volgorde: uit de meegegeven structuur (incl.
  // lege hoofdstukken) of afgeleid uit de regels zelf.
  const sectieDefs: { groep_id: string; naam: string; niveau: number; nummer: string | null; optioneel: boolean }[] =
    structuur && structuur.length > 0
      ? structuur.map(s => ({ groep_id: s.groep_id, naam: s.naam, niveau: s.niveau, nummer: s.nummer, optioneel: s.optioneel }))
      : Array.from(groepenMap.entries()).map(([groepId, gr]) => ({
          groep_id: groepId,
          naam: gr[0].groep_naam,
          niveau: gr[0].groep_niveau ?? 1,
          nummer: gr[0].groep_nummer ?? null,
          optioneel: gr[0].groep_optioneel ?? false,
        }))

  for (const def of sectieDefs) {
    const groepRegels = groepenMap.get(def.groep_id) ?? []

    // Basis insert (werkt ook zonder migratie v3)
    const { data: section, error: sErr } = await supabase
      .from('quote_sections')
      .insert({
        quote_id: quoteId,
        naam: def.naam,
        volgorde: sectionVolgorde++,
      })
      .select('id')
      .single()
    if (sErr) throw new Error(sErr.message)

    // Optioneel: v3 velden bijwerken (negeert fouten als kolommen nog niet bestaan)
    await supabase
      .from('quote_sections')
      .update({
        is_optioneel: def.optioneel,
        niveau: def.niveau,
        nummer: def.nummer,
      })
      .eq('id', section.id)
      .then(() => {/* negeer fouten */})

    // Lege hoofdstuk-sectie (geen eigen regels): alleen de kop, door naar de volgende.
    if (groepRegels.length === 0) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linesToInsert = (groepRegels as any[]).map((r: any, i: number) => ({
      quote_id: quoteId,
      section_id: section.id,
      groep_id: def.groep_id,
      calculatieregel_id: r.calculatieregel_id ?? null,
      // Gekoppelde behandeling erachter: "Kozijnen voorgevel – 2-laags dekkend".
      omschrijving: omschrijvingMetBehandeling(
        r.omschrijving,
        r.schilderbehandeling_id ? behandelingNamen.get(r.schilderbehandeling_id) : null,
      ),
      hoeveelheid: r.hoeveelheid,
      eenheid: r.eenheid,
      eenheidsprijs: r.eenheidsprijs,
      line_total: Math.round(r.hoeveelheid * r.eenheidsprijs * 100) / 100,
      btw_pct: r.btw_pct ?? 21,
      volgorde: i,
      kostprijs_pe: r.kostprijs_pe ?? null,
      uren_pe: r.uren_pe ?? null,
      opmerking: r.opmerking ?? null,
    }))
    const { data: insertedLines } = await supabase.from('quote_lines').insert(linesToInsert).select('id')

    // Optioneel: is_stelpost + schilderbehandeling per regel bijwerken (v3)
    if (insertedLines) {
      for (let i = 0; i < groepRegels.length; i++) {
        const r = groepRegels[i] as typeof groepRegels[0] & { is_stelpost?: boolean; schilderbehandeling_id?: string | null; schilderbehandeling?: string | null; werkomschrijving_afbeeldingen?: string[] | null }
        const updates: Record<string, unknown> = {}
        if (r.is_stelpost) updates.is_stelpost = true
        const behandeling =
          (r.schilderbehandeling_id ? behandelingTeksten.get(r.schilderbehandeling_id) : null) ??
          r.schilderbehandeling
        if (behandeling) updates.schilderbehandeling = behandeling
        if (r.werkomschrijving_afbeeldingen && r.werkomschrijving_afbeeldingen.length > 0) {
          updates.werkomschrijving_afbeeldingen = r.werkomschrijving_afbeeldingen
        }
        if (Object.keys(updates).length > 0 && insertedLines[i]) {
          await supabase
            .from('quote_lines')
            .update(updates)
            .eq('id', insertedLines[i].id)
            .then(() => {/* negeer fouten */})
        }
      }
    }
  }

  await herbereken(quoteId)
  revalidatePath(`${PAD}/${quoteId}`)
}

// ─── Financiële totalen voor een project (voor dossier-informatieblad) ─────────

export async function getQuoteTotalenVoorProject(projectId: string): Promise<{
  subtotaal_ex_btw: number
  stelposten_subtotaal: number
  opties_subtotaal: number
  btw_bedrag: number
  totaal_incl_btw: number
  kostprijs: number
  marge_pct: number
  marge_euro: number
} | null> {
  const supabase = await getDb()
  const { data: quote } = await supabase
    .from('quotes')
    .select(`
      id, subtotaal_ex_btw, stelposten_subtotaal, opties_subtotaal, btw_bedrag, totaal_incl_btw,
      lines:quote_lines(kostprijs_pe, hoeveelheid, section_id),
      sections:quote_sections(id, is_optioneel)
    `)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (!quote) return null

  // Kostprijs = som van (kostprijs_pe × hoeveelheid) voor niet-optionele regels
  const optioneleIds = new Set(
    ((quote.sections as any[]) ?? []).filter((s: any) => s.is_optioneel).map((s: any) => s.id)
  )
  const kostprijs = Math.round(
    ((quote.lines as any[]) ?? []).reduce((sum: number, l: any) => {
      if (l.section_id && optioneleIds.has(l.section_id)) return sum
      return sum + (l.kostprijs_pe ?? 0) * (l.hoeveelheid ?? 1)
    }, 0) * 100
  ) / 100

  const vp       = quote.subtotaal_ex_btw ?? 0
  const marge_euro = Math.round((vp - kostprijs) * 100) / 100
  const marge_pct  = vp > 0 ? Math.round((marge_euro / vp) * 1000) / 10 : 0

  return {
    subtotaal_ex_btw:     vp,
    stelposten_subtotaal: quote.stelposten_subtotaal ?? 0,
    opties_subtotaal:     quote.opties_subtotaal     ?? 0,
    btw_bedrag:           quote.btw_bedrag           ?? 0,
    totaal_incl_btw:      quote.totaal_incl_btw      ?? 0,
    kostprijs,
    marge_euro,
    marge_pct,
  }
}
