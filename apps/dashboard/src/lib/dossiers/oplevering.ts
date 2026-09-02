'use server'

import { createHash, randomBytes } from 'crypto'
import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  OpleverMoment,
  OpleverMomentStatus,
  OpleverMomentType,
  OpleverPunt,
  OpleverPuntStatus,
  OpleverPuntReactie,
  OpleverFoto,
  OpleverHandtekening,
  OpleverHandtekeningRol,
  OpleverToewijzingType,
  OpleverTokenScope,
} from '@everts/database'
import { assertDossierBewerkbaar, isDossierBewerkbaar } from './guards'
import { NIET_ACTIEVE_STATUSSEN } from './oplever-status'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { maakMeerwerkRegel } from './meerwerk'
import { formatVeldwaardeTekst } from '@/components/formulieren/format'
import { isInvoerVeld } from '@/components/formulieren/types'
import type { AandachtspuntWaarde, FormField, FormSchema } from '@/components/formulieren/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

async function huidigeMedewerkerId(): Promise<string | null> {
  const mw = await getCurrentMedewerker()
  return mw?.id ?? null
}

function revalidate(dossierId: string) {
  revalidatePath(`/opdrachten/${dossierId}/oplevering`)
}

/* ─────────────────────────────── Views ───────────────────────────────────── */

export type OpleverPuntView = OpleverPunt & {
  fotos: OpleverFoto[]
  reacties: OpleverPuntReactie[]
  toegewezenNaam: string | null
  meerwerkVolgnummer: number | null
  /** Naam van het formulier waaruit dit punt is gemeld; null bij handmatig aangemaakte punten. */
  bronTemplateNaam: string | null
}

export type OpleverMomentView = OpleverMoment & {
  punten: OpleverPuntView[]
  handtekeningen: OpleverHandtekening[]
  aantalTotaal: number
  aantalOpen: number
  aantalGeaccepteerd: number
}

export type DossierOpleveringData = {
  momenten: OpleverMomentView[]
  /** Meldingen uit een formulier die nog beoordeeld moeten worden (status 'nieuw'). */
  triage: OpleverPuntView[]
  /** Punten die op de lijst staan maar niet aan een oplevermoment hangen. */
  lossePunten: OpleverPuntView[]
  /** Beoordeeld en afgevallen; alleen ter verantwoording, ingeklapt in beeld. */
  afgewezen: OpleverPuntView[]
}

/**
 * Volledige opleverstructuur van een dossier: momenten → punten (met foto's, reacties, toegewezen-naam
 * en meerwerkkoppeling) → handtekeningen, plus de punten die níét aan een moment hangen. Namen van
 * toegewezen medewerkers/relaties worden in één batch opgelost.
 *
 * Punten worden op `dossier_id` opgehaald, niet via de momenten: een aandachtspunt uit een formulier
 * heeft geen moment, en een dossier kan meldingen hebben zonder dat er ooit een oplevermoment is
 * aangemaakt. Alleen `soort = 'oplever'` — veiligheidspunten (VCA) horen niet op de opleverlijst.
 */
export async function getDossierOplevering(dossierId: string): Promise<DossierOpleveringData> {
  const supabase = db()

  const [{ data: momentenRaw }, { data: puntenRaw }] = await Promise.all([
    supabase.from('oplever_momenten').select('*').eq('dossier_id', dossierId).order('created_at', { ascending: true }),
    supabase.from('oplever_punten').select('*').eq('dossier_id', dossierId).eq('soort', 'oplever')
      .order('volgnummer', { ascending: true }),
  ])
  const momenten = (momentenRaw ?? []) as OpleverMoment[]
  const punten = (puntenRaw ?? []) as OpleverPunt[]

  const momentIds = momenten.map(m => m.id)
  const { data: handtekeningenRaw } = momentIds.length
    ? await supabase.from('oplever_handtekeningen').select('*').in('moment_id', momentIds).order('created_at', { ascending: true })
    : { data: [] }
  const handtekeningen = (handtekeningenRaw ?? []) as OpleverHandtekening[]
  const puntIds = punten.map(p => p.id)

  // Foto's, reacties, toegewezen-namen en meerwerk-volgnummers in batch ophalen.
  const [{ data: fotosRaw }, { data: reactiesRaw }] = await Promise.all([
    puntIds.length
      ? supabase.from('oplever_fotos').select('*').in('punt_id', puntIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    puntIds.length
      ? supabase.from('oplever_punt_reacties').select('*').in('punt_id', puntIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])
  const fotos = (fotosRaw ?? []) as OpleverFoto[]
  const reacties = (reactiesRaw ?? []) as OpleverPuntReactie[]

  // Namen van toegewezenen + meerwerk-volgnummers + herkomst-formulier oplossen.
  const medewerkerIds = [...new Set(punten.map(p => p.toegewezen_medewerker_id).filter(Boolean))] as string[]
  const relatieIds = [...new Set(punten.map(p => p.toegewezen_relatie_id).filter(Boolean))] as string[]
  const meerwerkIds = [...new Set(punten.map(p => p.meerwerk_regel_id).filter(Boolean))] as string[]
  const inzendingIds = [...new Set(punten.map(p => p.form_inzending_id).filter(Boolean))] as string[]

  const [medewerkers, relaties, meerwerk, inzendingen] = await Promise.all([
    medewerkerIds.length
      ? supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', medewerkerIds)
      : Promise.resolve({ data: [] }),
    relatieIds.length
      ? supabase.from('relaties').select('id, naam').in('id', relatieIds)
      : Promise.resolve({ data: [] }),
    meerwerkIds.length
      ? supabase.from('meerwerk_regels').select('id, volgnummer').in('id', meerwerkIds)
      : Promise.resolve({ data: [] }),
    inzendingIds.length
      ? supabase.from('form_inzendingen').select('id, template_id').in('id', inzendingIds)
      : Promise.resolve({ data: [] }),
  ])
  const medewerkerNaam = new Map<string, string>()
  for (const m of (medewerkers.data ?? [])) {
    medewerkerNaam.set(m.id, [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '))
  }
  const relatieNaam = new Map<string, string>((relaties.data ?? []).map((r: any) => [r.id, r.naam]))
  const meerwerkVolg = new Map<string, number>((meerwerk.data ?? []).map((r: any) => [r.id, r.volgnummer]))

  // Inzending → template → naam, in twee batches.
  const inzendingTemplate = new Map<string, string>((inzendingen.data ?? []).map((r: any) => [r.id, r.template_id]))
  const templateIds = [...new Set([...inzendingTemplate.values()].filter(Boolean))]
  const { data: templatesRaw } = templateIds.length
    ? await supabase.from('form_templates').select('id, naam').in('id', templateIds)
    : { data: [] }
  const templateNaam = new Map<string, string>((templatesRaw ?? []).map((r: any) => [r.id, r.naam]))

  const view = (p: OpleverPunt): OpleverPuntView => ({
    ...p,
    fotos: fotos.filter(f => f.punt_id === p.id),
    reacties: reacties.filter(r => r.punt_id === p.id),
    toegewezenNaam:
      p.toegewezen_type === 'medewerker'
        ? medewerkerNaam.get(p.toegewezen_medewerker_id ?? '') ?? null
        : p.toegewezen_type === 'relatie'
          ? relatieNaam.get(p.toegewezen_relatie_id ?? '') ?? null
          : null,
    meerwerkVolgnummer: p.meerwerk_regel_id ? meerwerkVolg.get(p.meerwerk_regel_id) ?? null : null,
    bronTemplateNaam: p.form_inzending_id
      ? templateNaam.get(inzendingTemplate.get(p.form_inzending_id) ?? '') ?? null
      : null,
  })

  const views = punten.map(view)

  const puntenPerMoment = new Map<string, OpleverPuntView[]>()
  for (const v of views) {
    if (!v.moment_id) continue
    const list = puntenPerMoment.get(v.moment_id) ?? []
    list.push(v)
    puntenPerMoment.set(v.moment_id, list)
  }

  const momentViews: OpleverMomentView[] = momenten.map(m => {
    const mp = puntenPerMoment.get(m.id) ?? []
    // Afgewezen en nog te beoordelen punten tellen niet mee als werk: anders blijft een moment
    // eeuwig "open" en komt het nooit op 'gereed_voor_ondertekening'.
    const meetellend = mp.filter(p => !NIET_ACTIEVE_STATUSSEN.includes(p.status))
    return {
      ...m,
      punten: mp,
      handtekeningen: handtekeningen.filter(h => h.moment_id === m.id),
      aantalTotaal: meetellend.length,
      aantalOpen: meetellend.filter(p => p.status !== 'geaccepteerd').length,
      aantalGeaccepteerd: meetellend.filter(p => p.status === 'geaccepteerd').length,
    }
  })

  return {
    momenten: momentViews,
    triage:      views.filter(p => p.status === 'nieuw'),
    lossePunten: views.filter(p => !p.moment_id && p.status !== 'nieuw' && p.status !== 'afgewezen'),
    afgewezen:   views.filter(p => p.status === 'afgewezen'),
  }
}

/* ────────────────────────────── Rapportage ───────────────────────────────── */

export type OpleverRapport = {
  dossier: { titel: string | null; nummer: string | null; werkadres: string | null; klant: string | null }
  moment: OpleverMoment
  punten: OpleverPuntView[]
  /**
   * Losse aandachtspunten van het dossier (zonder oplevermoment). Bewust een apart veld en niet
   * samengevoegd met `punten`: ze hebben een eigen nummerreeks — AP-xx tegenover OP-xx — en horen
   * bij het dossier, niet bij dit ene moment. Het rapport zet ze in een eigen hoofdstuk.
   */
  aandachtspunten: OpleverPuntView[]
  handtekeningen: OpleverHandtekening[]
}

/** Alle gegevens voor de opleverrapportage van één moment (dossier + klant + punten + handtekeningen). */
export async function getOplevermomentRapport(momentId: string): Promise<OpleverRapport | null> {
  const supabase = db()
  const { data: moment } = await supabase.from('oplever_momenten').select('*').eq('id', momentId).maybeSingle()
  if (!moment) return null

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('titel, dossiernummer, klant_id, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad')
    .eq('id', moment.dossier_id)
    .maybeSingle()
  let klant: string | null = null
  if (dossier?.klant_id) {
    const { data: r } = await supabase.from('relaties').select('naam').eq('id', dossier.klant_id).maybeSingle()
    klant = r?.naam ?? null
  }
  const werkadres = dossier
    ? [[dossier.werkadres_straat, dossier.werkadres_huisnummer].filter(Boolean).join(' '),
       [dossier.werkadres_postcode, dossier.werkadres_stad].filter(Boolean).join('  ')]
        .filter(Boolean).join(', ') || null
    : null

  const [{ data: punten }, { data: losse }] = await Promise.all([
    supabase.from('oplever_punten').select('*').eq('moment_id', momentId).order('volgnummer'),
    // De aandachtspunten van hetzelfde dossier. Alleen 'oplever' — veiligheidspunten (VCA) horen
    // niet in een opleverrapport naar de klant.
    supabase.from('oplever_punten').select('*')
      .eq('dossier_id', moment.dossier_id).is('moment_id', null).eq('soort', 'oplever')
      .order('volgnummer'),
  ])

  const alle = [...(punten ?? []), ...(losse ?? [])]
  const puntIds = alle.map((p: any) => p.id)
  const [{ data: fotos }, { data: reacties }, { data: handtekeningen }] = await Promise.all([
    puntIds.length ? supabase.from('oplever_fotos').select('*').in('punt_id', puntIds) : Promise.resolve({ data: [] }),
    puntIds.length ? supabase.from('oplever_punt_reacties').select('*').in('punt_id', puntIds).order('created_at') : Promise.resolve({ data: [] }),
    supabase.from('oplever_handtekeningen').select('*').eq('moment_id', momentId).order('created_at'),
  ])

  const naarView = (rows: any[]): OpleverPuntView[] => rows
    // Afgewezen meldingen en nog niet beoordeelde meldingen horen niet in een rapport naar de klant.
    .filter((p: any) => !NIET_ACTIEVE_STATUSSEN.includes(p.status))
    .map((p: any) => ({
      ...p,
      fotos: (fotos ?? []).filter((f: any) => f.punt_id === p.id),
      reacties: (reacties ?? []).filter((r: any) => r.punt_id === p.id),
      toegewezenNaam: null,
      meerwerkVolgnummer: null,
      bronTemplateNaam: null,
    }))

  return {
    dossier: { titel: dossier?.titel ?? null, nummer: dossier?.dossiernummer ?? null, werkadres, klant },
    moment: moment as OpleverMoment,
    punten: naarView(punten ?? []),
    aandachtspunten: naarView(losse ?? []),
    handtekeningen: (handtekeningen ?? []) as OpleverHandtekening[],
  }
}

/* ────────────────────────────── Momenten ─────────────────────────────────── */

export async function maakOplevermoment(
  dossierId: string,
  data: { titel: string; type?: OpleverMomentType; opgeleverd_op?: string | null; opmerking?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const supabase = db()
  const { data: ins, error } = await supabase
    .from('oplever_momenten')
    .insert({
      dossier_id: dossierId,
      titel: data.titel,
      type: data.type ?? 'eindoplevering',
      opgeleverd_op: data.opgeleverd_op ?? null,
      opmerking: data.opmerking ?? null,
      created_by: await huidigeMedewerkerId(),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(dossierId)
  return { ok: true, id: ins.id }
}

export async function updateOplevermoment(
  id: string,
  patch: { titel?: string; type?: OpleverMomentType; opgeleverd_op?: string | null; opmerking?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_momenten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const velden: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['titel', 'type', 'opgeleverd_op', 'opmerking'] as const) if (k in patch) velden[k] = patch[k]
  const { error } = await supabase.from('oplever_momenten').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

export async function setMomentStatus(
  id: string,
  status: OpleverMomentStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_momenten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase
    .from('oplever_momenten')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

export async function verwijderOplevermoment(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_momenten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase.from('oplever_momenten').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

/* ─────────────────────────────── Punten ──────────────────────────────────── */

export type NieuwOpleverpunt = {
  omschrijving: string
  ruimte?: string | null
  toegewezen_type?: OpleverToewijzingType | null
  toegewezen_medewerker_id?: string | null
  toegewezen_relatie_id?: string | null
  deadline?: string | null
}

export async function maakOpleverpunt(
  momentId: string,
  data: NieuwOpleverpunt,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: moment } = await supabase
    .from('oplever_momenten')
    .select('dossier_id')
    .eq('id', momentId)
    .single()
  if (!moment) return { ok: false, error: 'Oplevermoment niet gevonden' }
  await assertDossierBewerkbaar(moment.dossier_id)

  const { data: maxRow } = await supabase
    .from('oplever_punten')
    .select('volgnummer')
    .eq('moment_id', momentId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const volgnummer = (maxRow?.volgnummer ?? 0) + 1

  const { data: ins, error } = await supabase
    .from('oplever_punten')
    .insert({
      moment_id: momentId,
      dossier_id: moment.dossier_id,
      volgnummer,
      omschrijving: data.omschrijving,
      ruimte: data.ruimte ?? null,
      toegewezen_type: data.toegewezen_type ?? null,
      toegewezen_medewerker_id: data.toegewezen_type === 'medewerker' ? data.toegewezen_medewerker_id ?? null : null,
      toegewezen_relatie_id: data.toegewezen_type === 'relatie' ? data.toegewezen_relatie_id ?? null : null,
      deadline: data.deadline ?? null,
      created_by: await huidigeMedewerkerId(),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(moment.dossier_id)
  return { ok: true, id: ins.id }
}

/**
 * Maakt een opleverpunt dat níét aan een oplevermoment hangt — een aandachtspunt dat een collega
 * ter plekke zelf meldt.
 *
 * Twee verschillen met `maakOpleverpunt`:
 *  - eigen nummerreeks per dossier over `moment_id is null` (weergave "AP-xx"), gelijk aan wat
 *    `materialiseerAandachtspunten` doet voor meldingen uit een formulier;
 *  - status `open` in plaats van `nieuw`. Triage bestaat om meldingen van buiten te beoordelen;
 *    een medewerker die zelf iets constateert hoeft zichzelf niet goed te keuren.
 */
export async function maakLosOpleverpunt(
  dossierId: string,
  data: NieuwOpleverpunt,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const supabase = db()

  const { data: maxRow } = await supabase
    .from('oplever_punten')
    .select('volgnummer')
    .eq('dossier_id', dossierId)
    .is('moment_id', null)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const volgnummer = (maxRow?.volgnummer ?? 0) + 1

  const { data: ins, error } = await supabase
    .from('oplever_punten')
    .insert({
      moment_id: null,
      dossier_id: dossierId,
      volgnummer,
      omschrijving: data.omschrijving,
      ruimte: data.ruimte ?? null,
      status: 'open',
      soort: 'oplever',
      bron: 'handmatig',
      toegewezen_type: data.toegewezen_type ?? null,
      toegewezen_medewerker_id: data.toegewezen_type === 'medewerker' ? data.toegewezen_medewerker_id ?? null : null,
      toegewezen_relatie_id: data.toegewezen_type === 'relatie' ? data.toegewezen_relatie_id ?? null : null,
      deadline: data.deadline ?? null,
      created_by: await huidigeMedewerkerId(),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(dossierId)
  return { ok: true, id: ins.id }
}

export async function updateOpleverpunt(
  id: string,
  patch: Partial<NieuwOpleverpunt>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const velden: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['omschrijving', 'ruimte', 'toegewezen_type', 'deadline'] as const) if (k in patch) velden[k] = patch[k]
  // Toewijzing consistent houden: het niet-actieve id wordt op null gezet.
  if ('toegewezen_type' in patch || 'toegewezen_medewerker_id' in patch || 'toegewezen_relatie_id' in patch) {
    const type = patch.toegewezen_type ?? null
    velden.toegewezen_type = type
    velden.toegewezen_medewerker_id = type === 'medewerker' ? patch.toegewezen_medewerker_id ?? null : null
    velden.toegewezen_relatie_id = type === 'relatie' ? patch.toegewezen_relatie_id ?? null : null
  }
  const { error } = await supabase.from('oplever_punten').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

/**
 * Statuswijziging. Elke status mag naar elke andere — zie `oplever-status.ts` voor waarom er geen
 * volgorde meer wordt afgedwongen. Zet automatisch afgemeld_op (bij 'opgelost'),
 * geaccepteerd_op (bij 'geaccepteerd') en de reden (bij 'geweigerd' en 'afgewezen').
 */
export async function setPuntStatus(
  id: string,
  status: OpleverPuntStatus,
  opts?: { reden?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase
    .from('oplever_punten').select('dossier_id, status, afgemeld_op, geaccepteerd_op').eq('id', id).single()
  if (!row) return { ok: false, error: 'Opleverpunt niet gevonden' }
  await assertDossierBewerkbaar(row.dossier_id)

  const now = new Date().toISOString()
  const velden: Record<string, unknown> = { status, updated_at: now }
  // Stempels volgen de nieuwe stand, ook terugwaarts: nu een punt vrij terug mag naar 'open',
  // zou een blijvende geaccepteerd-datum een punt tonen als afgehandeld terwijl het weer loopt.
  velden.afgemeld_op = status === 'opgelost' || status === 'geaccepteerd'
    ? (row.afgemeld_op ?? now)
    : null
  velden.geaccepteerd_op = status === 'geaccepteerd' ? (row.geaccepteerd_op ?? now) : null
  velden.geweigerd_reden = status === 'geweigerd' || status === 'afgewezen' ? opts?.reden ?? null : null

  const { data: bijgewerkt, error } = await supabase
    .from('oplever_punten').update(velden).eq('id', id).select('moment_id').single()
  if (error) return { ok: false, error: error.message }

  // Auto-status: zodra alle punten van het moment geaccepteerd zijn → moment "gereed voor
  // ondertekening" (alleen vanuit een lopende status; ondertekend/afgerond blijven ongemoeid).
  if (status === 'geaccepteerd' && bijgewerkt?.moment_id) {
    await bumpMomentBijVolledigGeaccepteerd(supabase, bijgewerkt.moment_id)
  }

  revalidate(row.dossier_id)
  return { ok: true }
}

/**
 * Zet een moment op 'gereed_voor_ondertekening' zodra er punten zijn en geen enkel punt meer open is.
 * Nog te beoordelen en afgewezen punten tellen niet mee — die zouden het moment anders permanent
 * blokkeren.
 */
async function bumpMomentBijVolledigGeaccepteerd(supabase: any, momentId: string): Promise<void> {
  const { data: punten } = await supabase.from('oplever_punten').select('status').eq('moment_id', momentId)
  const rows = ((punten ?? []) as { status: OpleverPuntStatus }[])
    .filter(p => !NIET_ACTIEVE_STATUSSEN.includes(p.status))
  if (rows.length === 0 || rows.some(p => p.status !== 'geaccepteerd')) return
  const { data: moment } = await supabase.from('oplever_momenten').select('status').eq('id', momentId).single()
  if (moment && (moment.status === 'concept' || moment.status === 'in_uitvoering')) {
    await supabase.from('oplever_momenten')
      .update({ status: 'gereed_voor_ondertekening', updated_at: new Date().toISOString() })
      .eq('id', momentId)
  }
}

export async function verwijderOpleverpunt(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase.from('oplever_punten').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

/* ────────────────────────── Extra werk → meerwerk ────────────────────────── */

/**
 * Markeert een opleverpunt als "extra werk": maakt een meerwerkregel aan (regie, aangevraagd) met de
 * omschrijving van het punt en koppelt de nieuwe regel terug op het punt. Idempotent — een punt dat al
 * gekoppeld is, wordt niet nogmaals aangemaakt.
 */
export async function markeerAlsExtraWerk(
  puntId: string,
): Promise<{ ok: true; meerwerkRegelId: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: punt } = await supabase
    .from('oplever_punten')
    .select('dossier_id, omschrijving, ruimte, meerwerk_regel_id, is_extra_werk')
    .eq('id', puntId)
    .single()
  if (!punt) return { ok: false, error: 'Opleverpunt niet gevonden' }
  await assertDossierBewerkbaar(punt.dossier_id)
  if (punt.meerwerk_regel_id) return { ok: true, meerwerkRegelId: punt.meerwerk_regel_id }

  const omschrijving = punt.ruimte ? `${punt.omschrijving} (${punt.ruimte})` : punt.omschrijving
  const res = await maakMeerwerkRegel(punt.dossier_id, { omschrijving, afrekenwijze: 'regie' })
  if (!res.ok) return res

  const { error } = await supabase
    .from('oplever_punten')
    .update({ is_extra_werk: true, meerwerk_regel_id: res.id, updated_at: new Date().toISOString() })
    .eq('id', puntId)
  if (error) return { ok: false, error: error.message }
  revalidate(punt.dossier_id)
  return { ok: true, meerwerkRegelId: res.id }
}

/** Ontkoppelt "extra werk" van een punt (laat de meerwerkregel zelf staan). */
export async function ontkoppelExtraWerk(puntId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', puntId).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase
    .from('oplever_punten')
    .update({ is_extra_werk: false, meerwerk_regel_id: null, updated_at: new Date().toISOString() })
    .eq('id', puntId)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

/* ─────────────────────────────── Reacties ────────────────────────────────── */

export async function voegPuntReactieToe(
  puntId: string,
  data: {
    opmerking?: string | null
    foto_urls?: string[]
    soort?: 'afmelding' | 'review' | 'opmerking'
    auteur_type?: 'intern' | 'onderaannemer'
    auteur_naam?: string | null
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', puntId).single()
  if (!row) return { ok: false, error: 'Opleverpunt niet gevonden' }

  const auteurType = data.auteur_type ?? 'intern'
  let auteurMedewerkerId: string | null = null
  let auteurNaam = data.auteur_naam ?? null
  if (auteurType === 'intern') {
    const mw = await getCurrentMedewerker()
    auteurMedewerkerId = mw?.id ?? null
    if (!auteurNaam && mw) auteurNaam = [mw.voornaam, mw.tussenvoegsel, mw.achternaam].filter(Boolean).join(' ')
  }

  const { data: ins, error } = await supabase
    .from('oplever_punt_reacties')
    .insert({
      punt_id: puntId,
      auteur_type: auteurType,
      auteur_naam: auteurNaam,
      auteur_medewerker_id: auteurMedewerkerId,
      soort: data.soort ?? 'opmerking',
      opmerking: data.opmerking ?? null,
      foto_urls: data.foto_urls ?? [],
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  if (row.dossier_id) revalidate(row.dossier_id)
  return { ok: true, id: ins.id }
}

/* ───────────────────────────────── Foto's ────────────────────────────────── */

/** Uploadt een opleverfoto naar de publieke bucket `oplever-fotos` en registreert de rij. */
export async function uploadOpleverFoto(
  puntId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', puntId).single()
  if (!row) return { ok: false, error: 'Opleverpunt niet gevonden' }

  const file = formData.get('foto') as File | null
  if (!file) return { ok: false, error: 'Geen bestand meegegeven' }
  const soort = (formData.get('soort') as string | null) ?? 'algemeen'

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${puntId}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('oplever-fotos')
    .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: urlData } = supabase.storage.from('oplever-fotos').getPublicUrl(path)
  await supabase.from('oplever_fotos').insert({
    punt_id: puntId,
    url: urlData.publicUrl,
    soort: ['voor', 'na', 'algemeen'].includes(soort) ? soort : 'algemeen',
    created_by: await huidigeMedewerkerId(),
  })
  revalidate(row.dossier_id)
  return { ok: true, url: urlData.publicUrl }
}

export async function verwijderOpleverFoto(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: foto } = await supabase
    .from('oplever_fotos')
    .select('url, oplever_punten!inner(dossier_id)')
    .eq('id', id)
    .single()
  const dossierId = (foto as any)?.oplever_punten?.dossier_id as string | undefined
  const { error } = await supabase.from('oplever_fotos').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (dossierId) revalidate(dossierId)
  return { ok: true }
}

/* ─────────────────────── Aandachtspunten uit formulieren ─────────────────── */

/** Publieke basis-URL van de oplever-fotos-bucket, bijv. https://<ref>.supabase.co/storage/v1/object/public/oplever-fotos/ */
function opleverFotoBasisUrl(supabase: any): string {
  return supabase.storage.from('oplever-fotos').getPublicUrl('').data.publicUrl
}

/**
 * Materialiseert de aandachtspunten uit een ingediende formulier-inzending als opleverpunten
 * (status `nieuw`, dus wachtend op triage door de projectleider).
 *
 * Niet-blokkerend van opzet: elk randgeval levert `{ok:true, aangemaakt:0}` op in plaats van een
 * fout. Deze functie draait namelijk óók achter de publieke bewonerslink, en een bewoner die zijn
 * feedback al heeft ingestuurd mag daar geen foutscherm voor terugkrijgen.
 *
 * **Eenmalig, niet synchroniserend.** Is er voor deze inzending al gematerialiseerd, dan gebeurt er
 * niets meer — ook niet als de antwoorden intussen zijn gewijzigd. Anders zou een her-indiening de
 * triage-beslissingen van de projectleider overschrijven.
 */
export async function materialiseerAandachtspunten(
  inzendingId: string,
): Promise<{ ok: true; aangemaakt: number } | { ok: false; error: string }> {
  try {
    const supabase = db()
    const { data: inzending } = await supabase
      .from('form_inzendingen')
      .select('id, dossier_id, versie_id, waarden, ingediend_door')
      .eq('id', inzendingId)
      .maybeSingle()
    if (!inzending) return { ok: false, error: 'Inzending niet gevonden' }

    // Zonder dossier is er geen opleverlijst om het punt op te zetten. De antwoorden blijven gewoon
    // in de inzending staan, dus er gaat niets verloren.
    if (!inzending.dossier_id) return { ok: true, aangemaakt: 0 }

    // Al gematerialiseerd? Dan klaar. De unique index uq_oplever_punten_bron vangt de race waarin
    // twee submits elkaar kruisen.
    const { data: bestaand } = await supabase
      .from('oplever_punten').select('id').eq('form_inzending_id', inzendingId).limit(1).maybeSingle()
    if (bestaand) return { ok: true, aangemaakt: 0 }

    // Afgesloten dossier: bewust geen fout — de feedback blijft bewaard, er komt alleen geen punt bij.
    if (!(await isDossierBewerkbaar(inzending.dossier_id))) return { ok: true, aangemaakt: 0 }

    const { data: versie } = await supabase
      .from('form_versies').select('schema').eq('id', inzending.versie_id).maybeSingle()
    const schema = versie?.schema as FormSchema | undefined
    // Alleen top-level velden: een aandachtspunt in een herhalende sectie wordt niet gelezen (en is
    // in de bouwer ook niet te plaatsen).
    const velden = (schema?.fields ?? []).filter(f => f.type === 'aandachtspunt')
    if (velden.length === 0) return { ok: true, aangemaakt: 0 }

    const waarden = (inzending.waarden ?? {}) as Record<string, unknown>
    const basisUrl = opleverFotoBasisUrl(supabase)

    type NieuwePunt = { veld: FormField; index: number; punt: AandachtspuntWaarde }
    const teMaken: NieuwePunt[] = []
    for (const veld of velden) {
      const rijen = Array.isArray(waarden[veld.id]) ? (waarden[veld.id] as AandachtspuntWaarde[]) : []
      rijen
        .map((punt, index) => ({ veld, index, punt }))
        .filter(r => typeof r.punt?.omschrijving === 'string' && r.punt.omschrijving.trim() !== '')
        // Harde bovengrens tegen misbruik van de publieke route.
        .slice(0, 20)
        .forEach(r => teMaken.push(r))
    }
    if (teMaken.length === 0) return { ok: true, aangemaakt: 0 }

    // Melder: een collega kennen we bij naam, een bewoner via de publieke link niet.
    let melderNaam: string | null = null
    if (inzending.ingediend_door) {
      const { data: mw } = await supabase
        .from('medewerkers').select('voornaam, tussenvoegsel, achternaam')
        .eq('id', inzending.ingediend_door).maybeSingle()
      if (mw) melderNaam = [mw.voornaam, mw.tussenvoegsel, mw.achternaam].filter(Boolean).join(' ') || null
    }

    // Losse punten hebben een eigen nummerreeks per dossier (weergave "AP-xx").
    const { data: maxRow } = await supabase
      .from('oplever_punten')
      .select('volgnummer')
      .eq('dossier_id', inzending.dossier_id)
      .is('moment_id', null)
      .order('volgnummer', { ascending: false })
      .limit(1)
      .maybeSingle()
    let volgnummer = (maxRow?.volgnummer ?? 0) + 1

    const rijen = teMaken.map(r => ({
      moment_id: null,
      dossier_id: inzending.dossier_id,
      volgnummer: volgnummer++,
      omschrijving: r.punt.omschrijving.trim(),
      ruimte: typeof r.punt.ruimte === 'string' && r.punt.ruimte.trim() !== '' ? r.punt.ruimte.trim() : null,
      status: 'nieuw',
      soort: r.veld.aandachtspunt?.soort ?? 'oplever',
      bron: 'formulier',
      form_inzending_id: inzendingId,
      bron_veld_id: r.veld.id,
      bron_index: r.index,
      melder_naam: melderNaam,
    }))

    const { data: ins, error } = await supabase.from('oplever_punten').insert(rijen).select('id')
    if (error) {
      // 23505 = de unique index sloeg toe: een gelijktijdige submit was ons voor. Geen fout.
      if (error.code === '23505') return { ok: true, aangemaakt: 0 }
      return { ok: false, error: error.message }
    }

    // Foto's registreren. Alleen URL's uit onze eigen bucket: `oplever_fotos.url` wordt elders als
    // <img src> gerenderd en in het opleverrapport ingebed, en `waarden` komt van een publieke,
    // niet-geauthenticeerde route.
    // soort 'voor': wie een aandachtspunt meldt fotografeert het probleem, niet het herstel.
    // Het bewijs dat het verholpen is komt later als 'na'-foto binnen.
    const fotoRijen = (ins ?? []).flatMap((row: any, i: number) =>
      (teMaken[i].punt.fotos ?? [])
        .filter(u => typeof u === 'string' && u.startsWith(basisUrl))
        .map(url => ({ punt_id: row.id, url, soort: 'voor' })),
    )
    if (fotoRijen.length > 0) await supabase.from('oplever_fotos').insert(fotoRijen)

    revalidate(inzending.dossier_id)
    return { ok: true, aangemaakt: rijen.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

/* ─────────────────────────── Handtekening / akkoord ──────────────────────── */

/** Legt een handtekening (ter plekke, PNG-dataURL) of akkoord vast bij een oplevermoment. */
export async function voegHandtekeningToe(
  momentId: string,
  data: {
    rol: OpleverHandtekeningRol
    naam?: string | null
    handtekening_b64?: string | null
    methode?: 'pad' | 'akkoord_knop'
    ip?: string | null
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: moment } = await supabase.from('oplever_momenten').select('dossier_id').eq('id', momentId).single()
  if (!moment) return { ok: false, error: 'Oplevermoment niet gevonden' }

  const methode = data.methode ?? (data.handtekening_b64 ? 'pad' : 'akkoord_knop')
  let handtekeningUrl: string | null = null
  if (methode === 'pad' && data.handtekening_b64) {
    const base64 = data.handtekening_b64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    const path = `handtekeningen/${momentId}/${data.rol}-${Date.now()}.png`
    const { error: upErr } = await supabase.storage
      .from('oplever-fotos')
      .upload(path, buffer, { contentType: 'image/png', upsert: true })
    if (!upErr) handtekeningUrl = supabase.storage.from('oplever-fotos').getPublicUrl(path).data.publicUrl
  }

  const { data: ins, error } = await supabase
    .from('oplever_handtekeningen')
    .insert({
      moment_id: momentId,
      rol: data.rol,
      naam: data.naam ?? null,
      methode,
      handtekening_url: handtekeningUrl,
      ip: data.ip ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(moment.dossier_id)
  return { ok: true, id: ins.id }
}

/* ─────────────────────────── Toewijsbare partijen ────────────────────────── */

export type OpleverToewijsbaar = {
  medewerkers: { id: string; naam: string }[]
  relaties: { id: string; naam: string; email: string | null; onderaannemer: boolean }[]
}

/**
 * Lijsten voor de toewijzing-picker: actieve medewerkers + onderaannemer/leverancier-relaties.
 *
 * Met een `dossierId` worden de relaties beperkt tot de **partijen die in dat dossier een bestelling
 * hebben gehad** (via de werkbegroting) — niet elke onderaannemer in het systeem. Je wijst een
 * herstelpunt immers toe aan een partij die je op dit project hebt ingezet. Zonder `dossierId`
 * (of als er nog geen bestellingen zijn) blijft de volledige lijst staan.
 *
 * Medewerkers worden nooit gefilterd: eigen personeel kun je overal op inzetten.
 */
export async function getOpleverToewijsbaar(dossierId?: string): Promise<OpleverToewijsbaar> {
  const supabase = db()
  const [{ data: mw }, { data: rel }] = await Promise.all([
    supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').eq('actief', true).order('achternaam'),
    supabase
      .from('relaties')
      .select('id, naam, email, types')
      .eq('actief', true)
      .overlaps('types', ['onderaannemer', 'leverancier'])
      .order('naam'),
  ])

  // Relaties beperken tot de bestelde partijen van dit dossier. bestelling → werkbegroting → dossier.
  let besteldeRelaties: Set<string> | null = null
  if (dossierId) {
    const { data: wbs } = await supabase.from('werkbegrotingen').select('id').eq('dossier_id', dossierId)
    const wbIds = (wbs ?? []).map((w: any) => w.id)
    if (wbIds.length > 0) {
      const { data: best } = await supabase
        .from('werkbegroting_bestellingen')
        .select('relatie_id')
        .in('werkbegroting_id', wbIds)
        .not('relatie_id', 'is', null)
      besteldeRelaties = new Set((best ?? []).map((b: any) => b.relatie_id as string))
    } else {
      // Dossier zonder werkbegroting = zeker geen bestellingen. Lege set i.p.v. "alles tonen",
      // anders zou het filter stil wegvallen precies wanneer er niets besteld is.
      besteldeRelaties = new Set()
    }
  }
  const gefilterdeRel = besteldeRelaties
    ? (rel ?? []).filter((r: any) => besteldeRelaties!.has(r.id))
    : (rel ?? [])

  return {
    medewerkers: (mw ?? []).map((m: any) => ({
      id: m.id,
      naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
    })),
    relaties: gefilterdeRel.map((r: any) => ({
      id: r.id,
      naam: r.naam,
      email: r.email ?? null,
      onderaannemer: Array.isArray(r.types) && r.types.includes('onderaannemer'),
    })),
  }
}

/* ─────────────────────── Betaalsignaal (alleen signaleren) ────────────────── */

export type OpleverBetaalsignaal = {
  relatieId: string
  naam: string | null
  open: number
  totaal: number
}

/**
 * Per betrokken relatie het aantal nog niet-geaccepteerde opleverpunten. Puur informatief: de
 * Inkoop-tab toont hiermee "betaling nog niet vrijgeven" zolang `open > 0`. Blokkeert niets.
 *
 * Nog te beoordelen en afgewezen punten tellen niet mee — die zouden een betaling eeuwig laten
 * "openstaan" zonder dat er werk tegenover staat.
 */
export async function getOpleverBetaalsignaal(dossierId: string): Promise<OpleverBetaalsignaal[]> {
  const supabase = db()
  const { data: punten } = await supabase
    .from('oplever_punten')
    .select('toegewezen_relatie_id, status')
    .eq('dossier_id', dossierId)
    .eq('soort', 'oplever')
    .eq('toegewezen_type', 'relatie')
    .not('status', 'in', `(${NIET_ACTIEVE_STATUSSEN.join(',')})`)
    .not('toegewezen_relatie_id', 'is', null)
  const rows = (punten ?? []) as { toegewezen_relatie_id: string; status: OpleverPuntStatus }[]
  if (rows.length === 0) return []

  const perRelatie = new Map<string, { open: number; totaal: number }>()
  for (const r of rows) {
    const agg = perRelatie.get(r.toegewezen_relatie_id) ?? { open: 0, totaal: 0 }
    agg.totaal += 1
    if (r.status !== 'geaccepteerd') agg.open += 1
    perRelatie.set(r.toegewezen_relatie_id, agg)
  }

  const ids = [...perRelatie.keys()]
  const { data: relaties } = await supabase.from('relaties').select('id, naam').in('id', ids)
  const naam = new Map<string, string>((relaties ?? []).map((r: any) => [r.id, r.naam]))
  return ids.map(id => ({
    relatieId: id,
    naam: naam.get(id) ?? null,
    open: perRelatie.get(id)!.open,
    totaal: perRelatie.get(id)!.totaal,
  }))
}

/* ──────────────────────────── Toegang-tokens ──────────────────────────────── */

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Saneert een basis-URL uit een omgevingsvariabele. Vangt de veelgemaakte
 * misconfig waarbij de héle dotenv-regel als waarde is geplakt
 * (`NEXT_PUBLIC_APP_URL=https://…`) — dan zou elke tokenlink met
 * `NEXT_PUBLIC_APP_URL=` beginnen en dus onklikbaar zijn. Strippen we hier
 * altijd weg, samen met omringende quotes/spaties en een trailing slash.
 */
function schoonBasisUrl(waarde: string): string {
  return waarde
    .trim()
    .replace(/^['"]|['"]$/g, '')          // omringende quotes
    .replace(/^[A-Z0-9_]+\s*=\s*/i, '')   // per ongeluk meegeplakte "KEY=" (bv. NEXT_PUBLIC_APP_URL=)
    .trim()
    .replace(/\/+$/, '')                  // trailing slash(es)
}

function appBaseUrl(): string {
  const ruw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  return schoonBasisUrl(ruw)
}

const TOKEN_PAD: Record<OpleverTokenScope, string> = {
  onderaannemer: 'oplevering',
  ondertekening: 'akkoord',
  feedback: 'feedback',
}

/** Bouwt de publieke link voor een ruwe token. */
function tokenUrl(scope: OpleverTokenScope, raw: string): string {
  return `${appBaseUrl()}/p/${TOKEN_PAD[scope]}/${raw}`
}

/**
 * Maakt een publiek toegang-token aan en geeft de volledige tokenlink terug.
 * `token_hash` blijft de lookup-sleutel; `token_raw` wordt bewaard zodat de link later
 * opnieuw te tonen en te kopiëren is in de Oplevering-tab.
 */
export async function maakToegangToken(
  scope: OpleverTokenScope,
  opts: {
    dossierId: string
    relatieId?: string | null
    momentId?: string | null
    formTemplateId?: string | null
    omschrijving?: string | null
    geldigDagen?: number
  },
): Promise<{ ok: true; url: string; token: string } | { ok: false; error: string }> {
  const supabase = db()
  const raw = randomBytes(24).toString('base64url')
  const verlooptOp = opts.geldigDagen
    ? new Date(Date.now() + opts.geldigDagen * 86400_000).toISOString()
    : null
  const { error } = await supabase.from('oplever_toegang_tokens').insert({
    token_hash: hashToken(raw),
    token_raw: raw,
    dossier_id: opts.dossierId,
    scope,
    relatie_id: opts.relatieId ?? null,
    moment_id: opts.momentId ?? null,
    form_template_id: opts.formTemplateId ?? null,
    omschrijving: opts.omschrijving ?? null,
    verloopt_op: verlooptOp,
    created_by: await huidigeMedewerkerId(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, url: tokenUrl(scope, raw), token: raw }
}

export type OpleverTokenLink = {
  id: string
  url: string
  scope: OpleverTokenScope
  omschrijving: string | null
  formTemplateId: string | null
  templateNaam: string | null
  verlooptOp: string | null
  verlopen: boolean
  createdAt: string
}

/**
 * Eerder aangemaakte tokenlinks van een dossier, zodat ze in de Oplevering-tab getoond en
 * opnieuw gekopieerd kunnen worden. Links van vóór de `token_raw`-migratie hebben geen ruwe
 * token meer en worden overgeslagen — die zijn onherstelbaar.
 */
export async function getOpleverTokenLinks(
  dossierId: string,
  scope?: OpleverTokenScope,
): Promise<OpleverTokenLink[]> {
  const supabase = db()
  let query = supabase
    .from('oplever_toegang_tokens')
    .select('id, token_raw, scope, omschrijving, form_template_id, verloopt_op, created_at')
    .eq('dossier_id', dossierId)
    .not('token_raw', 'is', null)
    .order('created_at', { ascending: false })
  if (scope) query = query.eq('scope', scope)
  const { data } = await query
  const rijen = (data ?? []) as any[]
  if (rijen.length === 0) return []

  const templateIds = [...new Set(rijen.map(r => r.form_template_id).filter(Boolean))]
  const namen = new Map<string, string>()
  if (templateIds.length > 0) {
    const { data: templates } = await supabase.from('form_templates').select('id, naam').in('id', templateIds)
    for (const t of (templates ?? []) as any[]) namen.set(t.id, t.naam)
  }

  const nu = Date.now()
  return rijen.map(r => ({
    id: r.id,
    url: tokenUrl(r.scope as OpleverTokenScope, r.token_raw as string),
    scope: r.scope as OpleverTokenScope,
    omschrijving: r.omschrijving ?? null,
    formTemplateId: r.form_template_id ?? null,
    templateNaam: r.form_template_id ? namen.get(r.form_template_id) ?? null : null,
    verlooptOp: r.verloopt_op ?? null,
    verlopen: !!r.verloopt_op && new Date(r.verloopt_op).getTime() < nu,
    createdAt: r.created_at,
  }))
}

/** Trekt een tokenlink in: de link werkt daarna niet meer. */
export async function verwijderToegangToken(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { error } = await supabase.from('oplever_toegang_tokens').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* ──────────────────────── Feedback-ronde (Formulieren) ────────────────────── */

/** Gepubliceerde feedbacksjablonen (categorie 'oplevering') voor de feedback-link-picker. */
export async function getOpleverFeedbackTemplates(): Promise<{ id: string; naam: string }[]> {
  const supabase = db()
  const { data } = await supabase
    .from('form_templates')
    .select('id, naam')
    .eq('categorie', 'oplevering')
    .eq('status', 'gepubliceerd')
    .order('naam')
  return (data ?? []).map((t: any) => ({ id: t.id, naam: t.naam }))
}

export type FeedbackCijfer = {
  label: string
  gemiddelde: number
  aantal: number
  /** Bovenkant van de schaal, zodat "4,2" te lezen is als "4,2 van de 5". */
  max: number
  stijl: 'cijfers' | 'sterren'
}
export type OpleverFeedbackSamenvatting = {
  aantal: number
  cijfers: FeedbackCijfer[]
  /**
   * Het cijfer dat als hoofdscore getoond mag worden: bij voorkeur een sterrenveld, anders het
   * eerste rating-veld. Null als er alleen losse getalvelden zijn — een willekeurig aantal
   * kozijnen als "score" tonen zou onzin zijn.
   */
  hoofdscore: FeedbackCijfer | null
}

/**
 * Aggregatie van bewonersfeedback op een dossier: aantal inzendingen + gemiddeld cijfer per
 * rating-/number-veld (klanttevredenheid). Leest de schema's van de betrokken versies om de
 * cijfervelden en hun labels te vinden.
 */
export async function getOpleverFeedbackSamenvatting(dossierId: string): Promise<OpleverFeedbackSamenvatting> {
  const supabase = db()
  const { data: inzendingen } = await supabase
    .from('form_inzendingen')
    .select('waarden, versie_id')
    .eq('dossier_id', dossierId)
    .eq('project_ref', 'oplever-feedback')
    .eq('status', 'ingediend')
  const rijen = (inzendingen ?? []) as { waarden: Record<string, unknown>; versie_id: string }[]
  if (rijen.length === 0) return { aantal: 0, cijfers: [], hoofdscore: null }

  const versieIds = [...new Set(rijen.map(r => r.versie_id).filter(Boolean))]
  const { data: versies } = await supabase.from('form_versies').select('id, schema').in('id', versieIds)

  // fieldId → label + schaal voor cijfer-achtige velden (rating/number), incl. herhalende secties.
  // LET OP: de bovengrens staat in `validation.max`, niet op het veld zelf (zie defaultField in
  // formulieren/types.ts) — `f.max` is altijd undefined.
  type VeldMeta = { label: string; max: number; stijl: 'cijfers' | 'sterren'; rating: boolean }
  const cijferVeld = new Map<string, VeldMeta>()
  const scanFields = (fields: any[]) => {
    for (const f of fields ?? []) {
      if (f.type === 'rating' || f.type === 'number') {
        cijferVeld.set(f.id, {
          label: f.label,
          max: typeof f.validation?.max === 'number' ? f.validation.max : 10,
          stijl: f.ratingStijl === 'sterren' ? 'sterren' : 'cijfers',
          rating: f.type === 'rating',
        })
      }
      if (Array.isArray(f.children)) scanFields(f.children)
    }
  }
  for (const v of (versies ?? []) as any[]) scanFields(v.schema?.fields ?? [])

  // Aggregeren op label: hetzelfde veld heeft per formulierversie een ander id, maar dezelfde vraag.
  const som = new Map<string, { total: number; n: number; meta: VeldMeta }>()
  for (const r of rijen) {
    for (const [fid, meta] of cijferVeld) {
      const raw = r.waarden?.[fid]
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN
      if (!Number.isFinite(n)) continue
      const agg = som.get(meta.label) ?? { total: 0, n: 0, meta }
      agg.total += n; agg.n += 1
      som.set(meta.label, agg)
    }
  }

  const cijfers: FeedbackCijfer[] = [...som.entries()].map(([label, a]) => ({
    label,
    gemiddelde: Math.round((a.total / a.n) * 10) / 10,
    aantal: a.n,
    max: a.meta.max,
    stijl: a.meta.stijl,
  }))

  // Sterren winnen van cijfers: als de bouwer bewust sterren koos, is dát de tevredenheidsvraag.
  const metMeta = [...som.values()]
  const indexVan = (pred: (m: VeldMeta) => boolean) => metMeta.findIndex(a => pred(a.meta))
  const i = indexVan(m => m.rating && m.stijl === 'sterren')
  const j = i >= 0 ? i : indexVan(m => m.rating)
  const hoofdscore = j >= 0 ? cijfers[j] : null

  return { aantal: rijen.length, cijfers, hoofdscore }
}

/** Eén ingevuld veld van een feedbackinzending, klaar om te tonen. */
export type FeedbackAntwoord = {
  label: string
  waarde: string
  /** Afbeeldings-URL's bij photo-/signature-velden. */
  fotos: string[]
}
export type FeedbackInzending = {
  id: string
  templateId: string
  templateNaam: string
  ingediendOp: string | null
  aangemaaktOp: string
  antwoorden: FeedbackAntwoord[]
}

function isLegeWaarde(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

/** Zet één veld + waarde om naar toonbare antwoorden (herhalende secties worden uitgevouwen). */
function veldNaarAntwoorden(field: FormField, waarde: unknown, prefix = ''): FeedbackAntwoord[] {
  // Koppen, tekstblokken, afbeeldingen e.d. zijn opmaak en hebben geen antwoord.
  if (!isInvoerVeld(field)) return []
  // Dossier-velden worden bij het invullen automatisch gevuld en niet opgeslagen; een leeg
  // dossier-veld is dus geen onbeantwoorde vraag maar ruis.
  if (field.type === 'dossier' && isLegeWaarde(waarde)) return []
  const label = prefix ? `${prefix} · ${field.label}` : field.label

  if (field.type === 'repeatable') {
    const rijen = Array.isArray(waarde) ? (waarde as Record<string, unknown>[]) : []
    return rijen.flatMap((rij, i) =>
      (field.children ?? []).flatMap(child =>
        veldNaarAntwoorden(child, rij?.[child.id], `${label} ${i + 1}`),
      ),
    )
  }

  // Elk gemeld aandachtspunt als eigen regel, zodat de foto's als thumbnails meekomen.
  if (field.type === 'aandachtspunt') {
    const punten = Array.isArray(waarde) ? (waarde as AandachtspuntWaarde[]) : []
    if (punten.length === 0) return []
    return punten.map((p, i) => ({
      label: `${label} ${i + 1}`,
      waarde: [p?.omschrijving, p?.ruimte ? `(${p.ruimte})` : null].filter(Boolean).join(' ') || 'Niet ingevuld',
      fotos: Array.isArray(p?.fotos) ? p.fotos.filter(u => typeof u === 'string') : [],
    }))
  }

  const fotos =
    field.type === 'photo' && Array.isArray(waarde)
      ? (waarde as string[]).filter(u => typeof u === 'string')
      : field.type === 'signature' && typeof waarde === 'string' && waarde !== ''
        ? [waarde]
        : []

  return [{
    label,
    waarde: isLegeWaarde(waarde) ? 'Niet ingevuld' : formatVeldwaardeTekst(field, waarde),
    fotos,
  }]
}

/**
 * Alle ingezonden bewonersfeedback van een dossier, mét álle ingevulde velden — niet alleen de
 * cijfers uit `getOpleverFeedbackSamenvatting`. Leest het schema van de gebruikte versie zodat
 * labels en opmaak overeenkomen met het formulier zoals het is ingevuld.
 */
export async function getOpleverFeedbackInzendingen(dossierId: string): Promise<FeedbackInzending[]> {
  const supabase = db()
  const { data: inzendingen } = await supabase
    .from('form_inzendingen')
    .select('id, template_id, versie_id, waarden, ingediend_op, aangemaakt_op')
    .eq('dossier_id', dossierId)
    .eq('project_ref', 'oplever-feedback')
    .eq('status', 'ingediend')
    .order('ingediend_op', { ascending: false, nullsFirst: false })
  const rijen = (inzendingen ?? []) as any[]
  if (rijen.length === 0) return []

  const versieIds = [...new Set(rijen.map(r => r.versie_id).filter(Boolean))]
  const templateIds = [...new Set(rijen.map(r => r.template_id).filter(Boolean))]
  const [{ data: versies }, { data: templates }] = await Promise.all([
    supabase.from('form_versies').select('id, schema').in('id', versieIds),
    supabase.from('form_templates').select('id, naam').in('id', templateIds),
  ])
  const schemaVanVersie = new Map<string, FormField[]>()
  for (const v of (versies ?? []) as any[]) schemaVanVersie.set(v.id, v.schema?.fields ?? [])
  const naamVanTemplate = new Map<string, string>()
  for (const t of (templates ?? []) as any[]) naamVanTemplate.set(t.id, t.naam)

  return rijen.map(r => {
    const fields = schemaVanVersie.get(r.versie_id) ?? []
    const waarden = (r.waarden ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      templateId: r.template_id,
      templateNaam: naamVanTemplate.get(r.template_id) ?? 'Formulier',
      ingediendOp: r.ingediend_op ?? null,
      aangemaaktOp: r.aangemaakt_op,
      antwoorden: fields.flatMap(f => veldNaarAntwoorden(f, waarden[f.id])),
    }
  })
}

export type ToegangTokenContext = {
  id: string
  dossier_id: string
  scope: OpleverTokenScope
  relatie_id: string | null
  moment_id: string | null
  form_template_id: string | null
}

/**
 * Valideert een ruwe token voor een verwachte scope. Gebruikt door de publieke /p/-routes met de
 * admin-client (geen login). Retourneert de contextvelden, of null bij ongeldig/verlopen.
 */
export async function valideerToken(
  rawToken: string,
  verwachteScope: OpleverTokenScope,
): Promise<ToegangTokenContext | null> {
  const supabase = db()
  const { data } = await supabase
    .from('oplever_toegang_tokens')
    .select('id, dossier_id, scope, relatie_id, moment_id, form_template_id, verloopt_op')
    .eq('token_hash', hashToken(rawToken))
    .eq('scope', verwachteScope)
    .maybeSingle()
  if (!data) return null
  if (data.verloopt_op && new Date(data.verloopt_op).getTime() < Date.now()) return null
  return {
    id: data.id,
    dossier_id: data.dossier_id,
    scope: data.scope,
    relatie_id: data.relatie_id,
    moment_id: data.moment_id,
    form_template_id: data.form_template_id,
  }
}
