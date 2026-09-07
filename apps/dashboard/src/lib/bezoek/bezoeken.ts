'use server'

/**
 * Het projectbezoek: starten, invullen, afronden.
 *
 * Zelfde ontwerpkeuze als bij de kwaliteitsronde: **het bezoek zelf is het concept.** Elke
 * wijziging wordt direct weggeschreven. Een projectleider loopt met een telefoon over een
 * bouwplaats met matig bereik; alles pas bij "afronden" versturen is daar de verkeerde afweging.
 *
 * Wat hier NIET wordt nagebouwd:
 *  - de kwaliteitsronde (die start als gewone `kwaliteit_inspecties`-rij en wordt gekoppeld);
 *  - het puntenregister (veiligheids- en aandachtspunten landen in `oplever_punten`, met
 *    `bron='bezoek'` en `bezoek_id` als herkomst).
 *
 * Autorisatie via `vereisSessie()` — net als de kwaliteitsmodule. De admin-client passeert RLS,
 * dus elke muterende functie doet zelf de controle.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { startInspectieVoorTaak } from '@/lib/kwaliteit/inspecties'
import type {
  BezoekContext, BezoekFoto, BezoekOnderdeel, BezoekPunt, Projectbezoek,
} from './types'
import { BEZOEK_ONDERDEEL_KOLOM } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

function revalidate(dossierId?: string | null, bezoekId?: string) {
  if (dossierId) revalidatePath(`/opdrachten/${dossierId}`)
  if (bezoekId) revalidatePath(`/m/bezoek/${bezoekId}`)
  revalidatePath('/m/taken')
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

  // Voorstel: dezelfde onderdelen als het vorige bezoek op dit dossier. In de praktijk loop je
  // een maand later hetzelfde na. Is er nog geen bezoek geweest, dan staat alles uit en kiest
  // de projectleider zelf — beter dan raden.
  const { data: vorige } = await db()
    .from('projectbezoeken')
    .select('doet_kwaliteit, doet_veiligheid, doet_algemeen, doet_voortgang')
    .eq('dossier_id', dossierId)
    .eq('status', 'definitief')
    .order('datum', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nu = new Date()
  const { data, error } = await db()
    .from('projectbezoeken')
    .insert({
      dossier_id: dossierId,
      task_id: taskId,
      uitgevoerd_door: medewerkerId,
      tijd: `${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}`,
      doet_kwaliteit: vorige?.doet_kwaliteit ?? false,
      doet_veiligheid: vorige?.doet_veiligheid ?? false,
      doet_algemeen: vorige?.doet_algemeen ?? false,
      doet_voortgang: vorige?.doet_voortgang ?? false,
      created_by: medewerkerId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

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

  const [{ data: dossier }, { data: fotos }, { data: punten }, { data: medewerker }] =
    await Promise.all([
      supabase.from('dossiers')
        .select('id, dossiernummer, titel, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_plaats')
        .eq('id', bezoek.dossier_id).maybeSingle(),
      supabase.from('projectbezoek_fotos')
        .select('*').eq('bezoek_id', bezoekId).order('volgorde'),
      // Begrensd op één bezoek, dus geen paginering nodig.
      supabase.from('oplever_punten')
        .select('id, volgnummer, omschrijving, ruimte, soort, status')
        .eq('bezoek_id', bezoekId).order('volgnummer'),
      bezoek.uitgevoerd_door
        ? supabase.from('medewerkers').select('voornaam, tussenvoegsel, achternaam')
            .eq('id', bezoek.uitgevoerd_door).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const puntRijen = (punten ?? []) as Record<string, unknown>[]
  const puntIds = puntRijen.map(p => String(p.id))
  const { data: puntFotos } = puntIds.length
    ? await supabase.from('oplever_fotos').select('punt_id, url').in('punt_id', puntIds)
    : { data: [] }

  const fotoPerPunt = new Map<string, string[]>()
  for (const f of ((puntFotos ?? []) as { punt_id: string; url: string }[])) {
    const lijst = fotoPerPunt.get(f.punt_id) ?? []
    lijst.push(f.url)
    fotoPerPunt.set(f.punt_id, lijst)
  }

  let kwaliteit: BezoekContext['kwaliteit'] = null
  if (bezoek.kwaliteit_inspectie_id) {
    const { data: insp } = await supabase
      .from('kwaliteit_inspecties')
      .select('id, inspectienummer, status, steekproef_bekeken, steekproef_afwijkend')
      .eq('id', bezoek.kwaliteit_inspectie_id).maybeSingle()
    if (insp) {
      kwaliteit = {
        id: insp.id,
        nummer: insp.inspectienummer ?? '',
        status: insp.status ?? 'concept',
        beoordeeld: insp.steekproef_bekeken ?? 0,
        afwijkend: insp.steekproef_afwijkend ?? 0,
      }
    }
  }

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
    punten: puntRijen.map(p => ({
      id: String(p.id),
      volgnummer: Number(p.volgnummer),
      omschrijving: String(p.omschrijving ?? ''),
      ruimte: (p.ruimte as string | null) ?? null,
      soort: p.soort === 'veiligheid' ? 'veiligheid' : 'oplever',
      status: String(p.status ?? 'open'),
      fotoUrls: fotoPerPunt.get(String(p.id)) ?? [],
    })) as BezoekPunt[],
    fotos: (fotos ?? []) as BezoekFoto[],
    kwaliteit,
  }
}

/** De bezoeken van een dossier, nieuwste eerst. Voedt de dossiertab en de bronkiezer. */
export async function getBezoekenVanDossier(dossierId: string): Promise<Projectbezoek[]> {
  await vereisSessie()
  const { data } = await db()
    .from('projectbezoeken')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('datum', { ascending: false })
    .order('volgnummer', { ascending: false })
    .limit(100)
  return (data ?? []) as Projectbezoek[]
}

/* ─────────────────────────────── Invullen ────────────────────────────────── */

/** Zet één onderdeel aan of uit. */
export async function setBezoekOnderdeel(
  bezoekId: string,
  onderdeel: BezoekOnderdeel,
  aan: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const { error } = await db()
    .from('projectbezoeken')
    .update({ [BEZOEK_ONDERDEEL_KOLOM[onderdeel]]: aan, updated_at: new Date().toISOString() })
    .eq('id', bezoekId)
  if (error) return { ok: false, error: error.message }
  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true }
}

/** Losse tekstvelden van het bezoek. */
export async function updateBezoek(
  bezoekId: string,
  patch: Partial<Pick<Projectbezoek,
    'weer' | 'locatie' | 'werkzaamheden' | 'voortgang_tekst' | 'algemene_opmerkingen' | 'datum' | 'tijd'>>,
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

/**
 * Legt een punt vast: een onveilige situatie of iets dat opvalt.
 *
 * Beide landen in `oplever_punten` — hét meldingenregister van het dossier — met de statusmachine,
 * de toewijzing en de opvolging die daar al aan hangen. `soort` bepaalt of het een
 * veiligheidspunt of een gewoon aandachtspunt wordt.
 */
export async function voegBezoekPuntToe(
  bezoekId: string,
  data: { omschrijving: string; ruimte?: string | null; soort: 'veiligheid' | 'oplever' },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }
  if (!data.omschrijving.trim()) return { ok: false, error: 'Geef een omschrijving' }

  const medewerker = await vereisSessie()
  const supabase = db()

  // Losse punten (zonder oplevermoment) hebben een eigen nummerreeks per dossier.
  const { data: maxRow } = await supabase
    .from('oplever_punten')
    .select('volgnummer')
    .eq('dossier_id', bezoek.dossier_id)
    .is('moment_id', null)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: ins, error } = await supabase
    .from('oplever_punten')
    .insert({
      moment_id: null,
      dossier_id: bezoek.dossier_id,
      bezoek_id: bezoekId,
      volgnummer: (maxRow?.volgnummer ?? 0) + 1,
      omschrijving: data.omschrijving.trim(),
      ruimte: data.ruimte?.trim() || null,
      // 'open' en niet 'nieuw': een projectleider die dit ter plekke vastlegt heeft het al
      // beoordeeld. 'nieuw' is de triagestatus voor meldingen van buiten.
      status: 'open',
      soort: data.soort,
      bron: 'bezoek',
      melder_naam: null,
      created_by: medewerker.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true, id: ins.id }
}

/** Foto bij de voortgang of de algemene indruk van het bezoek zelf. */
export async function uploadBezoekFoto(
  bezoekId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const medewerker = await vereisSessie()
  const file = formData.get('foto') as File | null
  if (!file) return { ok: false, error: 'Geen bestand meegegeven' }
  const soortRuw = (formData.get('soort') as string | null) ?? 'voortgang'
  const soort = soortRuw === 'algemeen' ? 'algemeen' : 'voortgang'

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
    soort,
    url: urlData.publicUrl,
    storage_path: path,
    created_by: medewerker.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true, url: urlData.publicUrl }
}

export async function verwijderBezoekFoto(
  fotoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()
  const { data: foto } = await supabase
    .from('projectbezoek_fotos').select('bezoek_id, storage_path').eq('id', fotoId).maybeSingle()
  if (!foto) return { ok: false, error: 'Foto niet gevonden' }

  const bezoek = await bewerkbaar(foto.bezoek_id)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }

  const { error } = await supabase.from('projectbezoek_fotos').delete().eq('id', fotoId)
  if (error) return { ok: false, error: error.message }
  if (foto.storage_path) {
    await supabase.storage.from('bezoek-fotos').remove([foto.storage_path])
  }
  revalidate(bezoek.dossier_id, foto.bezoek_id)
  return { ok: true }
}

/**
 * Start de kwaliteitsronde die bij dit bezoek hoort, en koppelt hem.
 *
 * De ronde wordt niet nagebouwd: dit maakt een gewone `kwaliteit_inspecties`-rij via de
 * bestaande module, zodat disciplines, controlepunten, metingen en afwijkingen precies werken
 * zoals ze werken. Vereist een actie, want `startInspectieVoorTaak` hangt daaraan.
 */
export async function startKwaliteitVoorBezoek(
  bezoekId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const bezoek = await bewerkbaar(bezoekId)
  if ('error' in bezoek) return { ok: false, error: bezoek.error }
  if (bezoek.kwaliteit_inspectie_id) return { ok: true, id: bezoek.kwaliteit_inspectie_id }
  if (!bezoek.task_id) {
    return {
      ok: false,
      error: 'Een kwaliteitsronde start vanuit een actie. Plan de kwaliteitsronde in als actie, '
        + 'of laat Kwaliteit bij dit bezoek uit staan.',
    }
  }

  const res = await startInspectieVoorTaak(bezoek.task_id)
  if (!res.ok) return res

  const { error } = await db()
    .from('projectbezoeken')
    .update({ kwaliteit_inspectie_id: res.id, doet_kwaliteit: true, updated_at: new Date().toISOString() })
    .eq('id', bezoekId)
  if (error) return { ok: false, error: error.message }

  revalidate(bezoek.dossier_id, bezoekId)
  return { ok: true, id: res.id }
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
