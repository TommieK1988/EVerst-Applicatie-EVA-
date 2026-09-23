'use server'

/**
 * Het projectbezoek: starten, invullen, afronden.
 *
 * Zelfde ontwerpkeuze als bij de kwaliteitsronde: **het bezoek zelf is het concept.** Elke
 * wijziging wordt direct weggeschreven. Een projectleider loopt met een telefoon over een
 * bouwplaats met matig bereik; alles pas bij "afronden" versturen is daar de verkeerde afweging.
 *
 * Een bezoek is opgebouwd rond **disciplines**. De projectleider kiest de vakken die op dat
 * moment in uitvoering zijn, legt daar punten bij vast (tekst + foto) en geeft per vak een
 * voortgangspercentage. Een punt met het vinkje "aandachtspunt" krijgt daarnaast een afgeleide
 * rij in `oplever_punten` — hét meldingenregister van het dossier, met de statusmachine, de
 * toewijzing en de opvolging die daar al aan hangen.
 *
 * Autorisatie via `vereisSessie()` — net als de kwaliteitsmodule. De admin-client passeert RLS,
 * dus elke muterende functie doet zelf de controle.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import type {
  BezoekContext, BezoekDiscipline, BezoekFoto, BezoekPunt, DisciplineKeuze, Projectbezoek,
} from './types'
import { BEZOEK_UITGESLOTEN_DISCIPLINES } from './types'
import {
  materialiseerAandachtspunt, verwijderAfgeleidPunt, bepaalOpgepakt, disciplineNamen,
} from './aandachtspunten'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

function revalidate(dossierId?: string | null, bezoekId?: string) {
  if (dossierId) revalidatePath(`/opdrachten/${dossierId}`)
  if (bezoekId) revalidatePath(`/m/bezoek/${bezoekId}`)
  revalidatePath('/m/taken')
}

/* ─────────────────────────────── Disciplines ─────────────────────────────── */

/**
 * De disciplines waaruit de projectleider kan kiezen.
 *
 * Gedeeld met de kwaliteitsmodule, minus `ALG`: die staat daar altijd aan omdat er
 * controlepunten aan hangen, en een bezoek kent geen controlepunten.
 */
export async function getDisciplineKeuzes(): Promise<DisciplineKeuze[]> {
  await vereisSessie()
  // Begrensd: 22 rijen in de hele tabel. Geen paginering nodig.
  const { data } = await db()
    .from('kwaliteit_disciplines')
    .select('code, naam, volgorde')
    .eq('actief', true)
    .not('code', 'in', `(${BEZOEK_UITGESLOTEN_DISCIPLINES.join(',')})`)
    .order('volgorde')
  return (data ?? []) as DisciplineKeuze[]
}

/* ─────────────────────────────── Starten ─────────────────────────────────── */

/**
 * Start of hervat het bezoek dat aan deze actie hangt.
 *
 * Een openstaand concept op dezelfde actie wordt hervat in plaats van dat er een tweede bezoek
 * bijkomt — anders levert een dubbele tik twee half ingevulde bezoeken op.
 */
export async function startBezoekVoorTaak(
  taskId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const { data: bestaand } = await supabase
    .from('projectbezoeken')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'concept')
    .maybeSingle()
  if (bestaand) return { ok: true, id: bestaand.id }

  // Het dossier hangt óf direct aan de taak, óf aan de actielijst waar de taak in zit. Zelfde
  // terugval als bij de kwaliteitsronde: sjabloontaken hebben zelf geen dossier_id.
  const { data: taak } = await supabase
    .from('tasks')
    .select('id, dossier_id, bezoek_ronde, task_lists(dossier_id)')
    .eq('id', taskId)
    .maybeSingle()
  if (!taak) return { ok: false, error: 'Actie niet gevonden' }
  if (!taak.bezoek_ronde) return { ok: false, error: 'Deze actie is geen projectbezoek' }

  const dossierId: string | null = taak.dossier_id ?? taak.task_lists?.dossier_id ?? null
  if (!dossierId) return { ok: false, error: 'Deze actie hangt niet aan een opdracht' }

  return maakBezoek(dossierId, taskId, medewerker.id)
}

/** Start een bezoek zonder actie — de projectleider staat er gewoon. */
export async function startBezoekVoorDossier(
  dossierId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()

  // Een openstaand eigen concept op dit dossier hervatten. Op iemand anders zijn concept
  // doorgaan zou zijn waarnemingen onder jouw naam laten landen.
  const { data: bestaand } = await db()
    .from('projectbezoeken')
    .select('id')
    .eq('dossier_id', dossierId)
    .eq('status', 'concept')
    .eq('uitgevoerd_door', medewerker.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (bestaand) return { ok: true, id: bestaand.id }

  return maakBezoek(dossierId, null, medewerker.id)
}

async function maakBezoek(
  dossierId: string,
  taskId: string | null,
  medewerkerId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)

  const supabase = db()
  const nu = new Date()
  const { data, error } = await supabase
    .from('projectbezoeken')
    .insert({
      dossier_id: dossierId,
      task_id: taskId,
      uitgevoerd_door: medewerkerId,
      tijd: `${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}`,
      created_by: medewerkerId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  // Voorstel: dezelfde disciplines als het vorige bezoek op dit dossier. In de praktijk loop je
  // een paar weken later dezelfde vakken na. Bewust ongeacht de status van dat vorige bezoek —
  // een concept dat iemand is vergeten af te ronden zegt net zo goed wat er speelt.
  //
  // De PERCENTAGES gaan NIET mee: die hoor je opnieuw te beoordelen, anders rapporteer je een
  // voortgang van weken geleden als de stand van vandaag.
  const { data: vorige } = await supabase
    .from('projectbezoeken')
    .select('id')
    .eq('dossier_id', dossierId)
    .neq('id', data.id)
    .order('datum', { ascending: false })
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (vorige) {
    // Begrensd op één bezoek; hooguit ~21 rijen.
    const { data: eerder } = await supabase
      .from('projectbezoek_disciplines')
      .select('discipline_code, volgorde')
      .eq('bezoek_id', vorige.id)
      .order('volgorde')
    const rijen = ((eerder ?? []) as { discipline_code: string; volgorde: number }[])
      .map(d => ({ bezoek_id: data.id, discipline_code: d.discipline_code, volgorde: d.volgorde }))
    if (rijen.length) await supabase.from('projectbezoek_disciplines').insert(rijen)
  }

  revalidate(dossierId, data.id)
  return { ok: true, id: data.id }
}

/* ─────────────────────────────── Ophalen ─────────────────────────────────── */

export async function getBezoek(bezoekId: string): Promise<BezoekContext | null> {
  await vereisSessie()
  const supabase = db()

  const { data: bezoek } = await supabase
    .from('projectbezoeken').select('*').eq('id', bezoekId).maybeSingle()
  if (!bezoek) return null

  // Elke query hieronder is begrensd op één bezoek respectievelijk één dossier; de
  // disciplinetabel telt 22 rijen in totaal. Geen paginering nodig.
  const [{ data: dossier }, { data: gekozen }, { data: punten }, { data: fotos }, { data: medewerker }] =
    await Promise.all([
      supabase.from('dossiers')
        .select('id, dossiernummer, titel, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_plaats')
        .eq('id', bezoek.dossier_id).maybeSingle(),
      supabase.from('projectbezoek_disciplines')
        .select('discipline_code, voortgang_pct, volgorde')
        .eq('bezoek_id', bezoekId).order('volgorde'),
      supabase.from('projectbezoek_punten')
        .select('id, discipline_code, volgnummer, tekst, is_aandachtspunt, oplever_punt_id')
        .eq('bezoek_id', bezoekId).order('volgnummer'),
      supabase.from('projectbezoek_fotos')
        .select('*').eq('bezoek_id', bezoekId).order('volgorde'),
      bezoek.uitgevoerd_door
        ? supabase.from('medewerkers').select('voornaam, tussenvoegsel, achternaam')
            .eq('id', bezoek.uitgevoerd_door).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const beschikbaar = await getDisciplineKeuzes()
  const naamPerCode = new Map(beschikbaar.map(d => [d.code, d.naam]))

  const fotoRijen = (fotos ?? []) as BezoekFoto[]
  const fotoPerPunt = new Map<string, BezoekFoto[]>()
  for (const f of fotoRijen) {
    if (!f.punt_id) continue
    const lijst = fotoPerPunt.get(f.punt_id) ?? []
    lijst.push(f)
    fotoPerPunt.set(f.punt_id, lijst)
  }
  // Wat niet aan een punt hangt, hoort bij het bezoek als geheel.
  const bezoekFotos = fotoRijen.filter(f => !f.punt_id)

  const puntRijen = (punten ?? []) as Record<string, unknown>[]

  // Welke afgeleide aandachtspunten zijn al opgepakt op het dossier: dan mag het vinkje
  // niet meer uit. Eén query voor alle punten samen; begrensd op dit bezoek.
  const opleverIds = puntRijen
    .map(p => p.oplever_punt_id as string | null).filter(Boolean) as string[]
  const opgepakteIds = opleverIds.length ? await bepaalOpgepakt(supabase, opleverIds) : new Set<string>()

  const disciplines: BezoekDiscipline[] =
    ((gekozen ?? []) as { discipline_code: string; voortgang_pct: number | null }[])
      .map(d => ({
        code: d.discipline_code,
        naam: naamPerCode.get(d.discipline_code) ?? d.discipline_code,
        voortgang_pct: d.voortgang_pct,
      }))

  const naam = medewerker
    ? [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')
    : null

  return {
    bezoek: bezoek as Projectbezoek,
    dossier: {
      id: dossier?.id ?? bezoek.dossier_id,
      dossiernummer: dossier?.dossiernummer ?? null,
      titel: dossier?.titel ?? '',
      werkadres: [
        [dossier?.werkadres_straat, dossier?.werkadres_huisnummer].filter(Boolean).join(' '),
        [dossier?.werkadres_postcode, dossier?.werkadres_plaats].filter(Boolean).join('  '),
      ].filter(Boolean).join(', '),
    },
    uitvoerderNaam: naam,
    disciplines,
    punten: puntRijen.map(p => ({
      id: String(p.id),
      discipline_code: String(p.discipline_code),
      volgnummer: Number(p.volgnummer),
      tekst: String(p.tekst ?? ''),
      is_aandachtspunt: p.is_aandachtspunt === true,
      oplever_punt_id: (p.oplever_punt_id as string | null) ?? null,
      opgepakt: opgepakteIds.has(String(p.oplever_punt_id ?? '')),
      fotos: fotoPerPunt.get(String(p.id)) ?? [],
    })) as BezoekPunt[],
    fotos: bezoekFotos,
    beschikbareDisciplines: beschikbaar,
  }
}

/* ─────────────────────────────── Invullen ────────────────────────────────── */

/**
 * Zet de gekozen disciplines van dit bezoek.
 *
 * Bestaande rijen blijven staan — anders raakt een al ingevuld percentage kwijt zodra iemand
 * er een discipline bij kiest. Een discipline weghalen waar nog punten onder hangen wordt
 * geweigerd: een misklik in de keuzelijst mag geen half uur typewerk wissen.
 */
export async function zetBezoekDisciplines(
  bezoekId: string,
  codes: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const uitgesloten = new Set<string>(BEZOEK_UITGESLOTEN_DISCIPLINES)
  const gewenst = [...new Set(codes)].filter(c => c && !uitgesloten.has(c))

  const supabase = db()
  // Beide begrensd op één bezoek.
  const [{ data: huidig }, { data: puntRijen }] = await Promise.all([
    supabase.from('projectbezoek_disciplines').select('discipline_code').eq('bezoek_id', bezoekId),
    supabase.from('projectbezoek_punten').select('discipline_code').eq('bezoek_id', bezoekId),
  ])
  const bestaand = new Set(
    ((huidig ?? []) as { discipline_code: string }[]).map(d => d.discipline_code),
  )
  const metPunten = new Set(
    ((puntRijen ?? []) as { discipline_code: string }[]).map(p => p.discipline_code),
  )

  const weg = [...bestaand].filter(c => !gewenst.includes(c))
  const geblokkeerd = weg.filter(c => metPunten.has(c))
  if (geblokkeerd.length) {
    const namen = await disciplineNamen(supabase, geblokkeerd)
    return {
      ok: false,
      error: `${namen.join(', ')} heeft nog punten. Verwijder die eerst als je de discipline wilt weghalen.`,
    }
  }

  if (weg.length) {
    await supabase.from('projectbezoek_disciplines')
      .delete().eq('bezoek_id', bezoekId).in('discipline_code', weg)
  }

  const nieuw = gewenst.filter(c => !bestaand.has(c))
  if (nieuw.length) {
    const { error } = await supabase.from('projectbezoek_disciplines').insert(
      nieuw.map(code => ({
        bezoek_id: bezoekId,
        discipline_code: code,
        volgorde: gewenst.indexOf(code),
      })),
    )
    if (error) return { ok: false, error: error.message }
  }

  // Volgorde bijwerken zodat de weergave de volgorde van de keuzelijst volgt.
  for (const code of gewenst.filter(c => bestaand.has(c))) {
    await supabase.from('projectbezoek_disciplines')
      .update({ volgorde: gewenst.indexOf(code) })
      .eq('bezoek_id', bezoekId).eq('discipline_code', code)
  }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true }
}

/** De voortgang van één discipline. `null` = weer leeggemaakt. */
export async function zetVoortgang(
  bezoekId: string,
  code: string,
  pct: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  let waarde: number | null = null
  if (pct !== null && pct !== undefined && Number.isFinite(pct)) {
    waarde = Math.min(100, Math.max(0, Math.round(pct)))
  }

  const { error } = await db()
    .from('projectbezoek_disciplines')
    .update({ voortgang_pct: waarde })
    .eq('bezoek_id', bezoekId).eq('discipline_code', code)
  if (error) return { ok: false, error: error.message }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true }
}

/** Losse tekstvelden van het bezoek. */
export async function updateBezoek(
  bezoekId: string,
  patch: Partial<Pick<Projectbezoek,
    'weer' | 'locatie' | 'werkzaamheden' | 'algemene_opmerkingen' | 'datum' | 'tijd'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const { error } = await db()
    .from('projectbezoeken')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', bezoekId)
  if (error) return { ok: false, error: error.message }
  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true }
}

/* ─────────────────────────────── Punten ──────────────────────────────────── */

/** Legt een punt vast bij een discipline. */
export async function voegPuntToe(
  bezoekId: string,
  data: { discipline_code: string; tekst: string; is_aandachtspunt?: boolean },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }
  if (!data.tekst.trim()) return { ok: false, error: 'Geef een omschrijving' }
  if (!data.discipline_code) return { ok: false, error: 'Kies een discipline' }

  const medewerker = await vereisSessie()
  const supabase = db()

  const { data: ins, error } = await supabase
    .from('projectbezoek_punten')
    .insert({
      bezoek_id: bezoekId,
      discipline_code: data.discipline_code,
      tekst: data.tekst.trim(),
      is_aandachtspunt: data.is_aandachtspunt === true,
      created_by: medewerker.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  if (data.is_aandachtspunt === true) {
    await materialiseerAandachtspunt(supabase, ins.id, bezoek.dossier_id, medewerker.id)
  }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true, id: ins.id }
}

/**
 * Wijzigt de tekst of het aandachtspunt-vinkje van een punt.
 *
 * Het vinkje aanzetten maakt de afgeleide rij in `oplever_punten`; uitzetten haalt hem weer
 * weg — maar alleen als er nog niets mee gedaan is.
 */
export async function updatePunt(
  puntId: string,
  patch: { tekst?: string; is_aandachtspunt?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const { data: punt } = await supabase
    .from('projectbezoek_punten')
    .select('id, bezoek_id, tekst, is_aandachtspunt, oplever_punt_id')
    .eq('id', puntId).maybeSingle()
  if (!punt) return { ok: false, error: 'Punt niet gevonden' }

  const bezoek = await bewerkbaar(punt.bezoek_id)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const nieuweTekst = patch.tekst !== undefined ? patch.tekst.trim() : undefined
  if (nieuweTekst !== undefined && !nieuweTekst) return { ok: false, error: 'Geef een omschrijving' }

  // Het vinkje uitzetten terwijl het dossierpunt al is opgepakt: weigeren. Doorgaan zou twee
  // versies van de waarheid opleveren — het bezoek zegt "geen aandachtspunt", het dossier
  // heeft er een met een toegewezen uitvoerder.
  if (patch.is_aandachtspunt === false && punt.oplever_punt_id) {
    const opgepakt = await bepaalOpgepakt(supabase, [punt.oplever_punt_id])
    if (opgepakt.has(punt.oplever_punt_id)) {
      return {
        ok: false,
        error: 'Dit aandachtspunt is al in behandeling op het dossier. Haal het daar weg als je het wilt intrekken.',
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wijziging: Record<string, any> = {}
  if (nieuweTekst !== undefined) wijziging.tekst = nieuweTekst
  if (patch.is_aandachtspunt !== undefined) wijziging.is_aandachtspunt = patch.is_aandachtspunt

  if (Object.keys(wijziging).length) {
    const { error } = await supabase
      .from('projectbezoek_punten').update(wijziging).eq('id', puntId)
    if (error) return { ok: false, error: error.message }
  }

  // De tekst blijft in beide registers gelijk zolang het dossierpunt nog van ons is: een
  // projectleider moet zijn eigen typefout binnen dezelfde ronde kunnen herstellen.
  if (nieuweTekst !== undefined && punt.oplever_punt_id) {
    await supabase.from('oplever_punten')
      .update({ omschrijving: nieuweTekst, updated_at: new Date().toISOString() })
      .eq('id', punt.oplever_punt_id)
  }

  if (patch.is_aandachtspunt === true && !punt.oplever_punt_id) {
    await materialiseerAandachtspunt(supabase, puntId, bezoek.dossier_id, medewerker.id)
  } else if (patch.is_aandachtspunt === false && punt.oplever_punt_id) {
    await verwijderAfgeleidPunt(supabase, puntId, punt.oplever_punt_id)
  }

  revalidate(bezoek.dossier_id, punt.bezoek_id)
  return { ok: true }
}

export async function verwijderPunt(
  puntId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()

  const { data: punt } = await supabase
    .from('projectbezoek_punten')
    .select('bezoek_id, oplever_punt_id').eq('id', puntId).maybeSingle()
  if (!punt) return { ok: false, error: 'Punt niet gevonden' }

  const bezoek = await bewerkbaar(punt.bezoek_id)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  if (punt.oplever_punt_id) {
    const opgepakt = await bepaalOpgepakt(supabase, [punt.oplever_punt_id])
    if (opgepakt.has(punt.oplever_punt_id)) {
      return {
        ok: false,
        error: 'Dit punt staat als aandachtspunt in behandeling op het dossier. Haal het daar eerst weg.',
      }
    }
    await verwijderAfgeleidPunt(supabase, puntId, punt.oplever_punt_id)
  }

  // Begrensd op één punt. De bestanden zelf gaan mee; de fotorijen ruimt de cascade op.
  const { data: fotos } = await supabase
    .from('projectbezoek_fotos').select('storage_path').eq('punt_id', puntId)
  const paden = ((fotos ?? []) as { storage_path: string | null }[])
    .map(f => f.storage_path).filter(Boolean) as string[]
  if (paden.length) await supabase.storage.from('bezoek-fotos').remove(paden)

  const { error } = await supabase.from('projectbezoek_punten').delete().eq('id', puntId)
  if (error) return { ok: false, error: error.message }

  revalidate(bezoek.dossier_id, punt.bezoek_id)
  return { ok: true }
}

/* ─────────────────────────────── Fotos ───────────────────────────────────── */

/**
 * Foto bij een punt of bij het bezoek als geheel.
 *
 * Eén upload-pad en één bucket voor allebei: `punt_id` in de FormData bepaalt waar hij aan
 * hangt. Hangt hij aan een punt dat al een aandachtspunt is, dan gaat de URL meteen mee naar
 * `oplever_fotos` — anders mist het dossier de foto die er net bij is gemaakt.
 */
export async function uploadBezoekFoto(
  bezoekId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const medewerker = await vereisSessie()
  const file = formData.get('foto') as File | null
  if (!file) return { ok: false, error: 'Geen bestand meegegeven' }

  const puntId = (formData.get('punt_id') as string | null) || null
  const soort = puntId ? 'punt' : 'algemeen'

  const supabase = db()
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${bezoekId}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('bezoek-fotos')
    .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: urlData } = supabase.storage.from('bezoek-fotos').getPublicUrl(path)
  const { error } = await supabase.from('projectbezoek_fotos').insert({
    bezoek_id: bezoekId,
    punt_id: puntId,
    soort,
    url: urlData.publicUrl,
    storage_path: path,
    created_by: medewerker.id,
  })
  if (error) return { ok: false, error: error.message }

  if (puntId) {
    const { data: punt } = await supabase
      .from('projectbezoek_punten').select('oplever_punt_id').eq('id', puntId).maybeSingle()
    if (punt?.oplever_punt_id) {
      await supabase.from('oplever_fotos').insert({
        punt_id: punt.oplever_punt_id,
        url: urlData.publicUrl,
        soort: 'voor',
        created_by: medewerker.id,
      })
    }
  }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true, url: urlData.publicUrl }
}

export async function verwijderBezoekFoto(
  fotoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()
  const { data: foto } = await supabase
    .from('projectbezoek_fotos').select('bezoek_id, punt_id, url, storage_path')
    .eq('id', fotoId).maybeSingle()
  if (!foto) return { ok: false, error: 'Foto niet gevonden' }

  const bezoek = await bewerkbaar(foto.bezoek_id)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const { error } = await supabase.from('projectbezoek_fotos').delete().eq('id', fotoId)
  if (error) return { ok: false, error: error.message }

  // De gespiegelde rij op het dossier gaat mee; anders wijst die naar een bestand dat we
  // hieronder weggooien en toont het aandachtspunt een gebroken afbeelding.
  if (foto.punt_id) {
    const { data: punt } = await supabase
      .from('projectbezoek_punten').select('oplever_punt_id').eq('id', foto.punt_id).maybeSingle()
    if (punt?.oplever_punt_id) {
      await supabase.from('oplever_fotos')
        .delete().eq('punt_id', punt.oplever_punt_id).eq('url', foto.url)
    }
  }

  if (foto.storage_path) {
    await supabase.storage.from('bezoek-fotos').remove([foto.storage_path])
  }
  revalidate(bezoek.dossier_id, foto.bezoek_id)
  return { ok: true }
}

/* ─────────────────────────────── Afronden ────────────────────────────────── */

/**
 * Zet het bezoek op definitief en sluit de bijbehorende actie.
 *
 * De actie sluiten hoort hier en niet bij de gebruiker: dat is de afspraak van elke doorloop —
 * de registratie zet de actie zelf op gereed, zodat er geen los vinkje is dat de doorloop kan
 * overslaan.
 */
export async function rondBezoekAf(
  bezoekId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const supabase = db()

  // Zonder discipline is een bezoek geen bezoekrapport: de voortgangstabel en "Per onderdeel"
  // blijven leeg en het rapport zegt alleen "het werk is beoordeeld". Server-side afgedwongen,
  // niet alleen met een uitgeschakelde knop.
  const { count } = await supabase
    .from('projectbezoek_disciplines')
    .select('discipline_code', { count: 'exact', head: true })
    .eq('bezoek_id', bezoekId)
  if (!count) {
    return { ok: false, error: 'Kies minstens één discipline voordat je het bezoek afrondt.' }
  }

  const { error } = await supabase
    .from('projectbezoeken')
    .update({ status: 'definitief', afgerond_op: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', bezoekId)
  if (error) return { ok: false, error: error.message }

  if (bezoek.task_id) {
    await supabase.from('tasks')
      .update({ status: 'gereed', updated_at: new Date().toISOString() })
      .eq('id', bezoek.task_id)
  }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true }
}

/** Heropenen met een reden — hetzelfde gebaar als bij een kwaliteitsinspectie. */
export async function heropenBezoek(
  bezoekId: string,
  reden: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  if (!reden.trim()) return { ok: false, error: 'Geef een reden voor het heropenen' }

  const { data: bezoek } = await db()
    .from('projectbezoeken').select('dossier_id').eq('id', bezoekId).maybeSingle()
  if (!bezoek) return { ok: false, error: 'Bezoek niet gevonden' }
  await assertDossierBewerkbaar(bezoek.dossier_id)

  const { error } = await db()
    .from('projectbezoeken')
    .update({ status: 'concept', heropend_reden: reden.trim(), updated_at: new Date().toISOString() })
    .eq('id', bezoekId)
  if (error) return { ok: false, error: error.message }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true }
}

/* ─────────────────────────────── Hulpjes ─────────────────────────────────── */

/**
 * Haalt het bezoek op en controleert dat er nog aan gewerkt mag worden. Eén plek, zodat geen
 * enkele muterende functie kan vergeten dat een definitief bezoek en een afgesloten dossier op
 * slot zitten.
 */
async function bewerkbaar(
  bezoekId: string,
): Promise<Projectbezoek | { error: string }> {
  await vereisSessie()
  const { data } = await db()
    .from('projectbezoeken').select('*').eq('id', bezoekId).maybeSingle()
  if (!data) return { error: 'Bezoek niet gevonden' }
  if (data.status === 'definitief') {
    return { error: 'Dit bezoek is afgerond. Heropen het eerst om nog iets te wijzigen.' }
  }
  try {
    await assertDossierBewerkbaar(data.dossier_id)
  } catch {
    return { error: 'Dit dossier is afgesloten' }
  }
  return data as Projectbezoek
}
