'use server'

/**
 * De kwaliteitsronde: starten, invullen, afronden.
 *
 * Belangrijkste ontwerpkeuze: **de inspectie zelf is het concept.** Elk controlepunt wordt direct
 * weggeschreven zodra de opzichter erop tikt. Er is dus geen aparte conceptopslag zoals bij de
 * Formulieren-module (localStorage + formulier_concepten). Een ronde duurt een uur op een dak met
 * matig bereik; alles pas bij "indienen" versturen is daar de verkeerde afweging.
 *
 * Autorisatie via `vereisSessie()` — zie de toelichting in bibliotheek.ts.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  KwaliteitAfwijking,
  KwaliteitControlepunt,
  KwaliteitEis,
  KwaliteitErnst,
  KwaliteitFoto,
  KwaliteitFotoSoort,
  KwaliteitInspectie,
  KwaliteitResultaat,
  KwaliteitResultaatStatus,
  KwaliteitWaarneming,
} from '@everts/database/kwaliteit-types'
import { vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { bepaalEis, beoordeel, fotoVerplicht, levertAfwijkingOp, rapportTekst } from './regels'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const BUCKET = 'kwaliteit-fotos'

function revalidate(dossierId: string, inspectieId?: string) {
  revalidatePath(`/opdrachten/${dossierId}/vca`)
  revalidatePath('/kam/kwaliteit')
  if (inspectieId) revalidatePath(`/kam/kwaliteit/${inspectieId}`)
}

/* ─────────────────────────────── Starten ─────────────────────────────────── */

/**
 * Start (of hervat) de kwaliteitsronde die bij deze actie hoort.
 *
 * Idempotent: staat er al een concept-inspectie op deze taak, dan krijg je die terug. Zo levert een
 * dubbele tik op "Kwaliteitsronde starten" — of een herstart na verloren verbinding — nooit twee
 * halve rondes op.
 */
export async function startInspectieVoorTaak(
  taskId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const { data: bestaand } = await supabase
    .from('kwaliteit_inspecties')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'concept')
    .maybeSingle()
  if (bestaand) return { ok: true, id: bestaand.id }

  // Het dossier hangt óf direct aan de taak, óf aan de actielijst waar de taak in zit. Zelfde
  // terugval als resolveTaakDossierId in de Formulieren-module: sjabloontaken hebben zelf geen
  // dossier_id, alleen hun lijst.
  const { data: taak } = await supabase
    .from('tasks')
    .select('id, dossier_id, kwaliteit_ronde, task_lists(dossier_id)')
    .eq('id', taskId)
    .maybeSingle()
  if (!taak) return { ok: false, error: 'Actie niet gevonden' }
  if (!taak.kwaliteit_ronde) return { ok: false, error: 'Deze actie is geen kwaliteitsronde' }

  const dossierId: string | null = taak.dossier_id ?? taak.task_lists?.dossier_id ?? null
  if (!dossierId) return { ok: false, error: 'Deze actie hangt niet aan een opdracht' }
  await assertDossierBewerkbaar(dossierId)

  // Disciplines van de vorige ronde op dit dossier als voorstel: in de praktijk loop je twee weken
  // later dezelfde onderdelen na.
  const { data: vorige } = await supabase
    .from('kwaliteit_inspecties')
    .select('discipline_codes')
    .eq('dossier_id', dossierId)
    .order('datum', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nu = new Date()
  const { data, error } = await supabase
    .from('kwaliteit_inspecties')
    .insert({
      dossier_id: dossierId,
      task_id: taskId,
      inspecteur_id: medewerker.id,
      tijd: `${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}`,
      discipline_codes: vorige?.discipline_codes?.length ? vorige.discipline_codes : ['ALG'],
      created_by: medewerker.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidate(dossierId, data.id)
  return { ok: true, id: data.id }
}

/* ─────────────────────────────── Ophalen ─────────────────────────────────── */

export type InspectieContext = {
  inspectie: KwaliteitInspectie
  dossier: {
    id: string
    dossiernummer: string | null
    titel: string
    werkadres: string
    opdrachtgever: string | null
  }
  inspecteurNaam: string | null
  controlepunten: KwaliteitControlepunt[]
  resultaten: KwaliteitResultaat[]
  afwijkingen: KwaliteitAfwijking[]
  waarnemingen: KwaliteitWaarneming[]
  fotos: KwaliteitFoto[]
  /** Openstaande afwijkingen uit eerdere inspecties op dit dossier (§38). */
  openEerdere: (KwaliteitAfwijking & { fotoUrls: string[] })[]
  /** Eisen die op dit project zijn ingesteld; overschrijven de bibliotheekwaarden. */
  projectEisen: { sleutel: string; min_waarde: number | null; max_waarde: number | null
    doel_waarde: number | null; tolerantie_min: number | null; tolerantie_plus: number | null
    eenheid: string | null; eis_tekst: string | null; bron_type: KwaliteitEis['bron_type']
    bron_document: string | null }[]
}

/**
 * Alles wat het inspectiescherm nodig heeft, in één keer. Bewust één functie: op 4G is elke extra
 * round-trip zichtbaar als flikkering.
 *
 * De controlepunten worden gefilterd op de gekozen disciplines. Ook punten waarvan de discipline
 * intussen is uitgezet blijven zichtbaar zolang er al een resultaat voor bestaat — anders
 * verdwijnt een ingevuld oordeel uit beeld zonder dat iemand dat merkt.
 */
export async function getInspectie(inspectieId: string): Promise<InspectieContext | null> {
  await vereisSessie()
  const supabase = db()

  const { data: inspectie } = await supabase
    .from('kwaliteit_inspecties')
    .select('*')
    .eq('id', inspectieId)
    .maybeSingle()
  if (!inspectie) return null

  const [
    { data: dossier },
    { data: resultaten },
    { data: afwijkingen },
    { data: waarnemingen },
    { data: projectEisen },
  ] = await Promise.all([
    supabase
      .from('dossiers')
      .select('id, dossiernummer, titel, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad, klant:relaties!klant_id(naam)')
      .eq('id', inspectie.dossier_id)
      .maybeSingle(),
    supabase.from('kwaliteit_resultaten').select('*').eq('inspectie_id', inspectieId),
    supabase.from('kwaliteit_afwijkingen').select('*').eq('inspectie_id', inspectieId).order('afwijkingsnummer'),
    supabase.from('kwaliteit_waarnemingen').select('*').eq('inspectie_id', inspectieId).order('created_at'),
    supabase.from('kwaliteit_project_eisen').select('*').eq('dossier_id', inspectie.dossier_id),
  ])

  const resultaatIds = ((resultaten ?? []) as KwaliteitResultaat[]).map(r => r.controlepunt_id)
  const puntenQuery = supabase
    .from('kwaliteit_controlepunten')
    .select('*')
    .eq('actief', true)
    .order('discipline_code')
    .order('volgorde')
  const codes: string[] = inspectie.discipline_codes ?? []
  const { data: alleGekozen } = codes.length
    ? await puntenQuery.in('discipline_code', codes)
    : await puntenQuery.limit(0)

  // Punten die buiten de huidige disciplinekeuze vallen maar wél al beoordeeld zijn.
  let extraPunten: KwaliteitControlepunt[] = []
  const gekozenIds = new Set(((alleGekozen ?? []) as KwaliteitControlepunt[]).map(p => p.id))
  const verweesd = resultaatIds.filter(id => !gekozenIds.has(id))
  if (verweesd.length > 0) {
    const { data } = await supabase.from('kwaliteit_controlepunten').select('*').in('id', verweesd)
    extraPunten = (data ?? []) as KwaliteitControlepunt[]
  }

  const inspectieAfwijkingen = (afwijkingen ?? []) as KwaliteitAfwijking[]
  const fotoFilters = [
    supabase.from('kwaliteit_fotos').select('*').eq('inspectie_id', inspectieId),
    resultaatIds.length
      ? supabase.from('kwaliteit_fotos').select('*').in('resultaat_id', ((resultaten ?? []) as KwaliteitResultaat[]).map(r => r.id))
      : Promise.resolve({ data: [] }),
    inspectieAfwijkingen.length
      ? supabase.from('kwaliteit_fotos').select('*').in('afwijking_id', inspectieAfwijkingen.map(a => a.id))
      : Promise.resolve({ data: [] }),
    (waarnemingen ?? []).length
      ? supabase.from('kwaliteit_fotos').select('*').in('waarneming_id', ((waarnemingen ?? []) as KwaliteitWaarneming[]).map(w => w.id))
      : Promise.resolve({ data: [] }),
  ]
  const fotoResultaten = await Promise.all(fotoFilters)
  const fotos = fotoResultaten.flatMap(r => (r.data ?? []) as KwaliteitFoto[])

  const openEerdere = await getOpenAfwijkingenRuw(inspectie.dossier_id, inspectieId)

  const mw = inspectie.inspecteur_id
    ? (await supabase.from('medewerkers').select('voornaam, tussenvoegsel, achternaam').eq('id', inspectie.inspecteur_id).maybeSingle()).data
    : null

  const adres = dossier
    ? [
        [dossier.werkadres_straat, dossier.werkadres_huisnummer].filter(Boolean).join(' '),
        [dossier.werkadres_postcode, dossier.werkadres_stad].filter(Boolean).join('  '),
      ].filter(Boolean).join(', ')
    : ''

  return {
    inspectie: inspectie as KwaliteitInspectie,
    dossier: {
      id: dossier?.id ?? inspectie.dossier_id,
      dossiernummer: dossier?.dossiernummer ?? null,
      titel: dossier?.titel ?? '—',
      werkadres: adres,
      opdrachtgever: dossier?.klant?.naam ?? null,
    },
    inspecteurNaam: mw
      ? [mw.voornaam, mw.tussenvoegsel, mw.achternaam].filter(Boolean).join(' ')
      : null,
    controlepunten: [...((alleGekozen ?? []) as KwaliteitControlepunt[]), ...extraPunten],
    resultaten: (resultaten ?? []) as KwaliteitResultaat[],
    afwijkingen: inspectieAfwijkingen,
    waarnemingen: (waarnemingen ?? []) as KwaliteitWaarneming[],
    fotos,
    openEerdere,
    projectEisen: (projectEisen ?? []) as InspectieContext['projectEisen'],
  }
}

/** Openstaande afwijkingen van eerdere inspecties op dit dossier, met hun foto's. */
async function getOpenAfwijkingenRuw(
  dossierId: string,
  behalveInspectieId?: string,
): Promise<(KwaliteitAfwijking & { fotoUrls: string[] })[]> {
  const supabase = db()
  let q = supabase
    .from('kwaliteit_afwijkingen')
    .select('*')
    .eq('dossier_id', dossierId)
    .not('status', 'in', '("hersteld_akkoord","geaccepteerde_afwijking")')
    .order('datum_constatering')
  if (behalveInspectieId) q = q.neq('inspectie_id', behalveInspectieId)
  const { data } = await q
  const rijen = (data ?? []) as KwaliteitAfwijking[]
  if (rijen.length === 0) return []

  const { data: fotos } = await supabase
    .from('kwaliteit_fotos')
    .select('afwijking_id, url')
    .in('afwijking_id', rijen.map(r => r.id))
  const perAfwijking = new Map<string, string[]>()
  for (const f of (fotos ?? []) as { afwijking_id: string; url: string }[]) {
    perAfwijking.set(f.afwijking_id, [...(perAfwijking.get(f.afwijking_id) ?? []), f.url])
  }
  return rijen.map(r => ({ ...r, fotoUrls: perAfwijking.get(r.id) ?? [] }))
}

/* ──────────────────────────────── Header ─────────────────────────────────── */

export async function updateInspectieHeader(
  inspectieId: string,
  patch: Partial<Pick<KwaliteitInspectie,
    'datum' | 'tijd' | 'weer' | 'werkzaamheden_omschrijving' | 'gebied_omschrijving'
    | 'algemene_opmerkingen' | 'steekproef_bekeken' | 'steekproef_afwijkend'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const guard = await assertConcept(inspectieId)
  if (!guard.ok) return guard
  const { error } = await db().from('kwaliteit_inspecties').update(patch).eq('id', inspectieId)
  if (error) return { ok: false, error: error.message }
  revalidate(guard.dossierId, inspectieId)
  return { ok: true }
}

/** De disciplinekeuze; stuurt welke controlepunten de opzichter te zien krijgt. */
export async function zetDisciplines(
  inspectieId: string,
  codes: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const guard = await assertConcept(inspectieId)
  if (!guard.ok) return guard
  // Algemeen staat altijd aan; uitzetten is geen geldige keuze.
  const uniek = [...new Set(['ALG', ...codes])]
  const { error } = await db()
    .from('kwaliteit_inspecties')
    .update({ discipline_codes: uniek })
    .eq('id', inspectieId)
  if (error) return { ok: false, error: error.message }
  revalidate(guard.dossierId, inspectieId)
  return { ok: true }
}

async function assertConcept(
  inspectieId: string,
): Promise<{ ok: true; dossierId: string } | { ok: false; error: string }> {
  const { data } = await db()
    .from('kwaliteit_inspecties')
    .select('dossier_id, status')
    .eq('id', inspectieId)
    .maybeSingle()
  if (!data) return { ok: false, error: 'Inspectie niet gevonden' }
  if (data.status !== 'concept') {
    return { ok: false, error: 'Deze inspectie is definitief en kan niet meer worden gewijzigd. Heropen hem eerst.' }
  }
  return { ok: true, dossierId: data.dossier_id }
}

/* ─────────────────────────────── Resultaat ───────────────────────────────── */

export type BewaarResultaatInvoer = {
  controlepuntId: string
  status: KwaliteitResultaatStatus
  antwoord?: 'ja' | 'nee' | null
  gemetenWaarde?: number | null
  gemetenWaarde2?: number | null
  gemetenWaarde3?: number | null
  meetlocatie?: string | null
  meetmiddel?: string | null
  opmerking?: string | null
}

/**
 * Legt het oordeel over één controlepunt vast.
 *
 * De rekenregel draait hier óók, niet alleen in de UI: een action is als kale RPC aanroepbaar en de
 * status in de database moet altijd bij de meetwaarde passen. Het eis-snapshot gaat mee, zodat een
 * latere bijstelling in de bibliotheek dit resultaat niet met terugwerkende kracht verandert.
 *
 * Gaat een punt terug naar VOLDOET, dan verdwijnen de bevindingen die eraan hingen — dat is de
 * enige manier om een verkeerd aangetikte afwijking weer weg te krijgen zolang de ronde loopt.
 */
export async function bewaarResultaat(
  inspectieId: string,
  invoer: BewaarResultaatInvoer,
): Promise<{ ok: true; resultaatId: string; status: KwaliteitResultaatStatus } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const guard = await assertConcept(inspectieId)
  if (!guard.ok) return guard
  const supabase = db()

  const { data: punt } = await supabase
    .from('kwaliteit_controlepunten')
    .select('*')
    .eq('id', invoer.controlepuntId)
    .maybeSingle()
  if (!punt) return { ok: false, error: 'Controlepunt niet gevonden' }

  const { data: projectEisen } = await supabase
    .from('kwaliteit_project_eisen')
    .select('*')
    .eq('dossier_id', guard.dossierId)

  const eis = bepaalEis(punt as KwaliteitControlepunt, (projectEisen ?? []))
  const oordeel = beoordeel(punt as KwaliteitControlepunt, eis, {
    status: invoer.status,
    antwoord: invoer.antwoord ?? null,
    gemeten_waarde: invoer.gemetenWaarde ?? null,
  })
  if (oordeel.blokkade) return { ok: false, error: oordeel.blokkade }

  const rij = {
    inspectie_id: inspectieId,
    controlepunt_id: invoer.controlepuntId,
    status: oordeel.status,
    antwoord: invoer.antwoord ?? null,
    gemeten_waarde: invoer.gemetenWaarde ?? null,
    gemeten_waarde_2: invoer.gemetenWaarde2 ?? null,
    gemeten_waarde_3: invoer.gemetenWaarde3 ?? null,
    meetlocatie: invoer.meetlocatie ?? null,
    meetmiddel: invoer.meetmiddel ?? (punt as KwaliteitControlepunt).meetmiddel ?? null,
    berekend_voldoet: oordeel.berekend_voldoet,
    toegepaste_eis: eis,
    opmerking: invoer.opmerking ?? null,
    created_by: medewerker.id,
  }

  const { data, error } = await supabase
    .from('kwaliteit_resultaten')
    .upsert(rij, { onConflict: 'inspectie_id,controlepunt_id' })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  // Geen afwijking meer? Dan mogen de bevindingen weg — zolang de ronde nog concept is.
  if (!levertAfwijkingOp(oordeel.status)) {
    await supabase.from('kwaliteit_afwijkingen')
      .delete()
      .eq('resultaat_id', data.id)
      .eq('vergrendeld', false)
  }

  revalidate(guard.dossierId, inspectieId)
  return { ok: true, resultaatId: data.id, status: oordeel.status }
}

/* ─────────────────────────────── Bevinding ───────────────────────────────── */

export type BevindingInvoer = {
  resultaatId: string
  locatie: string
  omschrijving?: string | null
  ernst?: KwaliteitErnst
  voorgesteldeActie?: string | null
  gewensteHersteldatum?: string | null
}

/**
 * Voegt één bevinding (= één rij in het afwijkingenregister) toe aan een afgekeurd controlepunt.
 * Meerdere bevindingen per punt zijn normaal: hetzelfde gebrek op de voor- en de achtergevel zijn
 * twee afwijkingen met elk een eigen locatie, foto en hersteltermijn.
 */
export async function voegBevindingToe(
  inspectieId: string,
  invoer: BevindingInvoer,
): Promise<{ ok: true; id: string; nummer: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const guard = await assertConcept(inspectieId)
  if (!guard.ok) return guard
  const supabase = db()

  const { data: resultaat } = await supabase
    .from('kwaliteit_resultaten')
    .select('*, punt:controlepunt_id(*)')
    .eq('id', invoer.resultaatId)
    .maybeSingle()
  if (!resultaat) return { ok: false, error: 'Resultaat niet gevonden' }
  if (resultaat.inspectie_id !== inspectieId) return { ok: false, error: 'Resultaat hoort niet bij deze inspectie' }

  const punt = resultaat.punt as KwaliteitControlepunt
  const eis = (resultaat.toegepaste_eis ?? {}) as KwaliteitEis

  const { data, error } = await supabase
    .from('kwaliteit_afwijkingen')
    .insert({
      dossier_id: guard.dossierId,
      inspectie_id: inspectieId,
      resultaat_id: invoer.resultaatId,
      controlepunt_id: punt.id,
      controlepunt_code: punt.code,
      discipline_code: punt.discipline_code,
      locatie: invoer.locatie,
      inspecteur_id: medewerker.id,
      eis_tekst: eis.eis_tekst ?? punt.eis_tekst,
      gemeten_waarde: resultaat.gemeten_waarde,
      eenheid: eis.eenheid ?? punt.eenheid,
      ernst: invoer.ernst ?? punt.standaard_ernst,
      omschrijving: invoer.omschrijving
        ?? rapportTekst(punt, resultaat.status, eis, resultaat.gemeten_waarde),
      voorgestelde_actie: invoer.voorgesteldeActie ?? punt.standaard_herstelactie,
      gewenste_hersteldatum: invoer.gewensteHersteldatum ?? null,
      created_by: medewerker.id,
    })
    .select('id, afwijkingsnummer')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidate(guard.dossierId, inspectieId)
  return { ok: true, id: data.id, nummer: data.afwijkingsnummer }
}

export async function updateBevinding(
  afwijkingId: string,
  patch: Partial<Pick<KwaliteitAfwijking,
    'locatie' | 'omschrijving' | 'ernst' | 'voorgestelde_actie' | 'gewenste_hersteldatum'
    | 'verantwoordelijke_type' | 'verantwoordelijke_medewerker_id' | 'verantwoordelijke_relatie_id'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()
  const { data: rij } = await supabase
    .from('kwaliteit_afwijkingen')
    .select('dossier_id, inspectie_id, vergrendeld')
    .eq('id', afwijkingId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Afwijking niet gevonden' }
  const { error } = await supabase.from('kwaliteit_afwijkingen').update(patch).eq('id', afwijkingId)
  if (error) return { ok: false, error: error.message }
  revalidate(rij.dossier_id, rij.inspectie_id)
  return { ok: true }
}

export async function verwijderBevinding(
  afwijkingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()
  const { data: rij } = await supabase
    .from('kwaliteit_afwijkingen')
    .select('dossier_id, inspectie_id, vergrendeld')
    .eq('id', afwijkingId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Afwijking niet gevonden' }
  if (rij.vergrendeld) {
    return { ok: false, error: 'Deze afwijking hoort bij een afgeronde inspectie en kan niet worden verwijderd.' }
  }
  const { error } = await supabase.from('kwaliteit_afwijkingen').delete().eq('id', afwijkingId)
  if (error) return { ok: false, error: error.message }
  revalidate(rij.dossier_id, rij.inspectie_id)
  return { ok: true }
}

/* ────────────────────────── Positieve waarneming ─────────────────────────── */

export async function voegWaarnemingToe(
  inspectieId: string,
  invoer: { disciplineCode?: string | null; locatie?: string | null; omschrijving: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const guard = await assertConcept(inspectieId)
  if (!guard.ok) return guard
  const { data, error } = await db()
    .from('kwaliteit_waarnemingen')
    .insert({
      inspectie_id: inspectieId,
      discipline_code: invoer.disciplineCode ?? null,
      locatie: invoer.locatie ?? null,
      omschrijving: invoer.omschrijving,
      created_by: medewerker.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(guard.dossierId, inspectieId)
  return { ok: true, id: data.id }
}

export async function verwijderWaarneming(
  id: string,
  inspectieId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const guard = await assertConcept(inspectieId)
  if (!guard.ok) return guard
  const { error } = await db().from('kwaliteit_waarnemingen').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidate(guard.dossierId, inspectieId)
  return { ok: true }
}

/* ──────────────────────────────── Foto's ─────────────────────────────────── */

/**
 * Uploadt een foto naar de publieke bucket en registreert de rij. Patroon van `uploadOpleverFoto`.
 *
 * De client verkleint eerst met `lib/foto/verkleinFoto.ts`; server-actions kappen bodies af op de
 * limiet in next.config.js en een onbewerkte telefoonfoto haalt die zonder meer.
 */
export async function uploadKwaliteitFoto(
  formData: FormData,
): Promise<{ ok: true; url: string; id: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const file = formData.get('foto') as File | null
  if (!file) return { ok: false, error: 'Geen bestand meegegeven' }

  const soort = (formData.get('soort') as string | null) ?? 'detail'
  const koppelSoort = formData.get('koppel_soort') as string | null
  const koppelId = formData.get('koppel_id') as string | null
  if (!koppelSoort || !koppelId) return { ok: false, error: 'Geen koppeling meegegeven' }

  const kolom = {
    inspectie: 'inspectie_id',
    resultaat: 'resultaat_id',
    afwijking: 'afwijking_id',
    waarneming: 'waarneming_id',
  }[koppelSoort]
  if (!kolom) return { ok: false, error: 'Onbekende koppeling' }

  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${koppelSoort}/${koppelId}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const geldigeSoorten: KwaliteitFotoSoort[] =
    ['overzicht', 'detail', 'afwijking', 'meetbewijs', 'positief', 'herstel']
  const { data, error } = await supabase
    .from('kwaliteit_fotos')
    .insert({
      [kolom]: koppelId,
      url: urlData.publicUrl,
      soort: geldigeSoorten.includes(soort as KwaliteitFotoSoort) ? soort : 'detail',
      created_by: medewerker.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  return { ok: true, url: urlData.publicUrl, id: data.id }
}

export async function verwijderKwaliteitFoto(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const { error } = await db().from('kwaliteit_fotos').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* ─────────────────────────────── Afronden ────────────────────────────────── */

export type AfrondControle = {
  gereed: boolean
  ontbreekt: { controlepuntId: string; code: string; titel: string; reden: string }[]
}

/**
 * Wat er nog mist voordat de inspectie definitief mag. Geeft een lijst terug in plaats van te
 * gooien, zodat het afrondscherm elk ontbrekend punt aanklikbaar kan tonen.
 */
export async function controleerAfronden(inspectieId: string): Promise<AfrondControle> {
  await vereisSessie()
  const supabase = db()

  const { data: resultaten } = await supabase
    .from('kwaliteit_resultaten')
    .select('*, punt:controlepunt_id(id, code, titel, foto_verplicht_bij_afkeur, foto_altijd_verplicht)')
    .eq('inspectie_id', inspectieId)

  const rijen = (resultaten ?? []) as (KwaliteitResultaat & { punt: KwaliteitControlepunt })[]
  if (rijen.length === 0) {
    return { gereed: false, ontbreekt: [{ controlepuntId: '', code: '', titel: 'Nog niets beoordeeld', reden: 'Beoordeel ten minste één controlepunt voordat je afrondt.' }] }
  }

  const { data: afwijkingen } = await supabase
    .from('kwaliteit_afwijkingen')
    .select('id, resultaat_id, locatie, omschrijving')
    .eq('inspectie_id', inspectieId)
  const perResultaat = new Map<string, { id: string; locatie: string | null; omschrijving: string | null }[]>()
  for (const a of (afwijkingen ?? []) as { id: string; resultaat_id: string; locatie: string | null; omschrijving: string | null }[]) {
    perResultaat.set(a.resultaat_id, [...(perResultaat.get(a.resultaat_id) ?? []), a])
  }

  const afwijkingIds = (afwijkingen ?? []).map((a: { id: string }) => a.id)
  const { data: fotos } = afwijkingIds.length
    ? await supabase.from('kwaliteit_fotos').select('afwijking_id').in('afwijking_id', afwijkingIds)
    : { data: [] }
  const metFoto = new Set(((fotos ?? []) as { afwijking_id: string }[]).map(f => f.afwijking_id))

  const ontbreekt: AfrondControle['ontbreekt'] = []
  for (const r of rijen) {
    if (!levertAfwijkingOp(r.status)) continue
    const bevindingen = perResultaat.get(r.id) ?? []
    if (bevindingen.length === 0) {
      ontbreekt.push({ controlepuntId: r.controlepunt_id, code: r.punt.code, titel: r.punt.titel, reden: 'Voeg ten minste één bevinding met locatie toe.' })
      continue
    }
    for (const b of bevindingen) {
      if (!b.locatie?.trim()) {
        ontbreekt.push({ controlepuntId: r.controlepunt_id, code: r.punt.code, titel: r.punt.titel, reden: 'Locatie ontbreekt bij een bevinding.' })
      }
      if (!b.omschrijving?.trim()) {
        ontbreekt.push({ controlepuntId: r.controlepunt_id, code: r.punt.code, titel: r.punt.titel, reden: 'Toelichting ontbreekt bij een bevinding.' })
      }
      if (fotoVerplicht(r.punt, r.status) && !metFoto.has(b.id)) {
        ontbreekt.push({ controlepuntId: r.controlepunt_id, code: r.punt.code, titel: r.punt.titel, reden: 'Foto is verplicht bij deze afwijking.' })
      }
    }
  }

  return { gereed: ontbreekt.length === 0, ontbreekt }
}

/**
 * Maakt de inspectie definitief.
 *
 * Volgorde: controleren → afwijkingen vergrendelen → inspectie vergrendelen → de gekoppelde actie
 * op gereed zetten. Die laatste stap is niet-blokkerend, precies zoals `submitFormInzending` doet:
 * een mislukte taakstatus mag een afgeronde inspectie niet ongedaan maken.
 */
export async function rondInspectieAf(
  inspectieId: string,
): Promise<{ ok: true } | { ok: false; error: string; ontbreekt?: AfrondControle['ontbreekt'] }> {
  const medewerker = await vereisSessie()
  const guard = await assertConcept(inspectieId)
  if (!guard.ok) return guard

  const controle = await controleerAfronden(inspectieId)
  if (!controle.gereed) {
    return { ok: false, error: 'De inspectie is nog niet compleet.', ontbreekt: controle.ontbreekt }
  }

  const supabase = db()
  await supabase.from('kwaliteit_afwijkingen').update({ vergrendeld: true }).eq('inspectie_id', inspectieId)

  const { data: inspectie, error } = await supabase
    .from('kwaliteit_inspecties')
    .update({ status: 'definitief', definitief_op: new Date().toISOString(), definitief_door: medewerker.id })
    .eq('id', inspectieId)
    .select('task_id, dossier_id')
    .single()
  if (error) return { ok: false, error: error.message }

  if (inspectie?.task_id) {
    try {
      await updateTaakStatus(inspectie.task_id, 'gereed')
    } catch {
      /* niet-blokkerend: de inspectie is afgerond, de actie kan handmatig worden afgevinkt */
    }
  }

  revalidate(guard.dossierId, inspectieId)
  return { ok: true }
}

/**
 * Heropent een definitieve inspectie voor correctie. De reden wordt vastgelegd; zonder die
 * vastlegging is een gecorrigeerd rapport niet meer te verantwoorden.
 */
export async function heropenInspectie(
  inspectieId: string,
  reden: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  if (!reden.trim()) return { ok: false, error: 'Geef een reden voor het heropenen.' }
  const supabase = db()

  const { data, error } = await supabase
    .from('kwaliteit_inspecties')
    .update({
      status: 'concept',
      heropend_op: new Date().toISOString(),
      heropend_door: medewerker.id,
      heropen_reden: reden.trim(),
    })
    .eq('id', inspectieId)
    .select('dossier_id')
    .single()
  if (error) return { ok: false, error: error.message }

  await supabase.from('kwaliteit_afwijkingen').update({ vergrendeld: false }).eq('inspectie_id', inspectieId)
  revalidate(data.dossier_id, inspectieId)
  return { ok: true }
}

/* ─────────────────────────────── Overzichten ─────────────────────────────── */

export type InspectieRij = {
  id: string
  inspectienummer: string
  datum: string
  status: string
  dossier_id: string
  dossiernummer: string | null
  projectnaam: string
  inspecteur: string | null
  disciplines: string[]
  aantal_beoordeeld: number
  aantal_afwijkingen: number
  aantal_kritiek: number
}

/** Het inspectie-overzicht in KAM en het blok op de dossiertab. */
export async function getInspecties(filters?: {
  dossierId?: string
  van?: string
  tot?: string
  status?: string
  limiet?: number
}): Promise<InspectieRij[]> {
  await vereisSessie()
  const supabase = db()

  let q = supabase
    .from('kwaliteit_inspecties')
    .select(`
      id, inspectienummer, datum, status, dossier_id, discipline_codes,
      dossier:dossiers!dossier_id ( dossiernummer, titel ),
      inspecteur:medewerkers!inspecteur_id ( voornaam, tussenvoegsel, achternaam )
    `)
    .order('datum', { ascending: false })
    .limit(filters?.limiet ?? 200)
  if (filters?.dossierId) q = q.eq('dossier_id', filters.dossierId)
  if (filters?.status && filters.status !== 'alle') q = q.eq('status', filters.status)
  if (filters?.van) q = q.gte('datum', filters.van)
  if (filters?.tot) q = q.lte('datum', filters.tot)

  const { data } = await q
  const rijen = (data ?? []) as Record<string, any>[]
  if (rijen.length === 0) return []

  const ids = rijen.map(r => r.id as string)
  const [{ data: resultaten }, { data: afwijkingen }] = await Promise.all([
    supabase.from('kwaliteit_resultaten').select('inspectie_id, status').in('inspectie_id', ids),
    supabase.from('kwaliteit_afwijkingen').select('inspectie_id, ernst').in('inspectie_id', ids),
  ])

  const beoordeeld = new Map<string, number>()
  for (const r of (resultaten ?? []) as { inspectie_id: string; status: string }[]) {
    if (r.status === 'nvt') continue
    beoordeeld.set(r.inspectie_id, (beoordeeld.get(r.inspectie_id) ?? 0) + 1)
  }
  const afwTotaal = new Map<string, number>()
  const afwKritiek = new Map<string, number>()
  for (const a of (afwijkingen ?? []) as { inspectie_id: string; ernst: string }[]) {
    afwTotaal.set(a.inspectie_id, (afwTotaal.get(a.inspectie_id) ?? 0) + 1)
    if (a.ernst === 'kritiek') afwKritiek.set(a.inspectie_id, (afwKritiek.get(a.inspectie_id) ?? 0) + 1)
  }

  return rijen.map(r => ({
    id: r.id,
    inspectienummer: r.inspectienummer,
    datum: r.datum,
    status: r.status,
    dossier_id: r.dossier_id,
    dossiernummer: r.dossier?.dossiernummer ?? null,
    projectnaam: r.dossier?.titel ?? '—',
    inspecteur: r.inspecteur
      ? [r.inspecteur.voornaam, r.inspecteur.tussenvoegsel, r.inspecteur.achternaam].filter(Boolean).join(' ')
      : null,
    disciplines: r.discipline_codes ?? [],
    aantal_beoordeeld: beoordeeld.get(r.id) ?? 0,
    aantal_afwijkingen: afwTotaal.get(r.id) ?? 0,
    aantal_kritiek: afwKritiek.get(r.id) ?? 0,
  }))
}
