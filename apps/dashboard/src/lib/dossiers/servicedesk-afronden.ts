'use server'

/**
 * Een servicedeskbon afronden vanaf de telefoon: pakbonfoto's toevoegen en de bon gereed melden
 * met de uitgevoerde werkzaamheden en eventueel een handtekening voor akkoord.
 *
 * LET OP — elke export hier moet `async function` zijn (zie `feedback_use_server_geen_sync_exports`).
 * Types staan in `servicedesk-afronden-types.ts`.
 *
 * Wie mag dit? Iedere ingelogde platformgebruiker die de bon kan openen, dus ook een monteur zonder
 * projectrol: op een bon staat de monteur in de planning, niet in de rollen. Bewust níét achter
 * de functie `dossiers.status_wijzigen` (die staat standaard uit): gereed melden is geen vrije
 * statuskeuze maar een vaste stap, en het is juist het werk van de buitendienst.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisSessie, GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { updateServicedeskSubstatus } from '@/lib/dossiers/actions'
import { medewerkerNaam } from '@/lib/dossiers/medewerker-naam'
import { maakNotificatie } from '@/lib/notificaties/maak'
import type { ServicedeskAfronding } from './servicedesk-afronden-types'

const BUCKET = 'servicedesk-fotos'

/**
 * Standen waarin de bon al verder is dan "uitgevoerd". Een gereedmelding zet de status dan niet
 * terug: de administratie is er al mee bezig, en een late melding van de monteur is dan alleen
 * nog informatie.
 */
const VOORBIJ_UITGEVOERD = new Set(['uitgevoerd', 'kosten_compleet', 'financieel_gereed', 'financieel_afgesloten'])

type Uitkomst = { ok: true } | { ok: false; error: string }

/** Ingelogd als platformgebruiker. Gooit anders — de aanroepers vangen dat af. */
async function poort(): Promise<CurrentMedewerker> {
  const medewerker = await vereisSessie()
  if (medewerker.gebruiker_type !== 'platform_gebruiker') {
    throw new GeenToegangError('Je hebt geen toegang tot deze bon.')
  }
  return medewerker
}

/** De bon zelf — alleen een servicedeskdossier doet mee. */
async function haalBon(dossierId: string) {
  const { data } = await createAdminClient()
    .from('dossiers')
    .select('id, titel, dossiernummer, servicedesk_substatus, project_manager_id')
    .eq('id', dossierId)
    .maybeSingle()
  if (!data || data.servicedesk_substatus == null) return null
  return data
}

function foutTekst(e: unknown): string {
  return e instanceof Error ? e.message : 'Onbekende fout'
}

function revalideer(dossierId: string) {
  revalidatePath(`/m/dossiers/${dossierId}/informatie`)
  revalidatePath(`/servicedesk/${dossierId}`, 'layout')
}

/**
 * Laat de projectleider weten wat er op de bon gebeurde. Niet naar jezelf: meldt de
 * projectleider zelf gereed, dan is een melding in zijn eigen belletje alleen ruis.
 */
async function meldAanProjectleider(
  bon: { id: string; titel: string | null; dossiernummer: string | null; project_manager_id: string | null },
  door: CurrentMedewerker,
  melding: { type: string; titel: string; body: string; url: string },
) {
  if (!bon.project_manager_id || bon.project_manager_id === door.id) return
  const { data: pl } = await createAdminClient()
    .from('medewerkers')
    .select('auth_user_id')
    .eq('id', bon.project_manager_id)
    .maybeSingle()
  if (!pl?.auth_user_id) return
  await maakNotificatie({
    user_id: pl.auth_user_id,
    ...melding,
    dossier_id: bon.id,
    dossier_naam: [bon.dossiernummer, bon.titel].filter(Boolean).join(' · ') || null,
  })
}

/** Laatste gereedmelding + alle pakbonnen van de bon. */
export async function getServicedeskAfronding(dossierId: string): Promise<ServicedeskAfronding> {
  const medewerker = await vereisSessie()
  const supabase = createAdminClient()

  const [{ data: meldingen }, { data: pakbonnen }] = await Promise.all([
    supabase
      .from('servicedesk_gereedmeldingen')
      .select('id, uitgevoerde_werkzaamheden, handtekening_url, getekend_door, gemeld_op, medewerker:medewerkers!servicedesk_gereedmeldingen_gemeld_door_fkey(voornaam, tussenvoegsel, achternaam)')
      .eq('dossier_id', dossierId)
      .order('gemeld_op', { ascending: false })
      .limit(1),
    // Begrensd door het dossier: een bon heeft een handvol pakbonnen, geen duizend.
    supabase
      .from('dossier_pakbonnen')
      .select('id, foto_url, opmerking, geupload_door, geupload_op, medewerker:medewerkers!dossier_pakbonnen_geupload_door_fkey(voornaam, tussenvoegsel, achternaam)')
      .eq('dossier_id', dossierId)
      .order('geupload_op', { ascending: false })
      .limit(200),
  ])

  const m = meldingen?.[0]
  return {
    gereedmelding: m ? {
      id: m.id,
      uitgevoerdeWerkzaamheden: m.uitgevoerde_werkzaamheden,
      handtekeningUrl: m.handtekening_url,
      getekendDoor: m.getekend_door,
      gemeldDoorNaam: medewerkerNaam(m.medewerker),
      gemeldOp: m.gemeld_op,
    } : null,
    pakbonnen: (pakbonnen ?? []).map(p => ({
      id: p.id,
      fotoUrl: p.foto_url,
      opmerking: p.opmerking,
      geuploadDoorNaam: medewerkerNaam(p.medewerker),
      isEigen: p.geupload_door === medewerker.id,
      geuploadOp: p.geupload_op,
    })),
  }
}

/** Foto van een pakbon aan de bon hangen. FormData: `foto` (bestand), optioneel `opmerking`. */
export async function voegPakbonToe(dossierId: string, formData: FormData): Promise<Uitkomst> {
  try {
    const medewerker = await poort()
    await assertDossierBewerkbaar(dossierId)
    const bon = await haalBon(dossierId)
    if (!bon) return { ok: false, error: 'Dit is geen servicedeskbon.' }

    const file = formData.get('foto')
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Geen foto meegegeven.' }
    const opmerking = String(formData.get('opmerking') ?? '').trim() || null

    const supabase = createAdminClient()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const pad = `${dossierId}/pakbon-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(pad, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'image/jpeg', upsert: false })
    if (uploadErr) return { ok: false, error: `Uploaden mislukt: ${uploadErr.message}` }

    const fotoUrl = supabase.storage.from(BUCKET).getPublicUrl(pad).data.publicUrl
    const { error } = await supabase.from('dossier_pakbonnen').insert({
      dossier_id: dossierId, foto_url: fotoUrl, opmerking, geupload_door: medewerker.id,
    })
    if (error) {
      await supabase.storage.from(BUCKET).remove([pad]).catch(() => {})
      return { ok: false, error: error.message }
    }

    await meldAanProjectleider(bon, medewerker, {
      type: 'servicedesk_pakbon',
      titel: 'Pakbon toegevoegd',
      body: `${medewerkerNaam(medewerker) ?? 'Een collega'} voegde een pakbon toe${opmerking ? `: ${opmerking}` : ''}. Er komt dus nog een inkoopfactuur.`,
      url: `/servicedesk/${dossierId}/inkoop`,
    })

    revalideer(dossierId)
    return { ok: true }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: foutTekst(e) }
  }
}

/** Een eigen pakbon weer weghalen (verkeerde foto). Andermans pakbonnen blijven staan. */
export async function verwijderPakbon(pakbonId: string): Promise<Uitkomst> {
  try {
    const medewerker = await poort()
    const supabase = createAdminClient()
    const { data: pakbon } = await supabase
      .from('dossier_pakbonnen')
      .select('id, dossier_id, foto_url, geupload_door')
      .eq('id', pakbonId)
      .maybeSingle()
    if (!pakbon) return { ok: false, error: 'Pakbon niet gevonden.' }
    if (pakbon.geupload_door !== medewerker.id) {
      return { ok: false, error: 'Je kunt alleen je eigen pakbonnen verwijderen.' }
    }
    await assertDossierBewerkbaar(pakbon.dossier_id)

    const { error } = await supabase.from('dossier_pakbonnen').delete().eq('id', pakbonId)
    if (error) return { ok: false, error: error.message }

    const pad = pakbon.foto_url.split(`/${BUCKET}/`)[1]
    if (pad) await supabase.storage.from(BUCKET).remove([decodeURIComponent(pad)]).catch(() => {})

    revalideer(pakbon.dossier_id)
    return { ok: true }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: foutTekst(e) }
  }
}

/**
 * De bon gereed melden: werkzaamheden + optionele handtekening vastleggen en de bon op
 * "Uitgevoerd" zetten (op mutatiewerk heet die stand "Uitvoering gereed").
 */
export async function meldServicedeskGereed(
  dossierId: string,
  invoer: { uitgevoerdeWerkzaamheden: string; handtekeningB64: string | null; getekendDoor: string | null },
): Promise<Uitkomst & { waarschuwing?: string }> {
  try {
    const medewerker = await poort()
    await assertDossierBewerkbaar(dossierId)
    const bon = await haalBon(dossierId)
    if (!bon) return { ok: false, error: 'Dit is geen servicedeskbon.' }

    const werkzaamheden = invoer.uitgevoerdeWerkzaamheden.trim()
    if (!werkzaamheden) return { ok: false, error: 'Vul in welke werkzaamheden je hebt uitgevoerd.' }
    const getekendDoor = invoer.getekendDoor?.trim() || null

    const supabase = createAdminClient()

    let handtekeningUrl: string | null = null
    if (invoer.handtekeningB64) {
      const pad = `${dossierId}/handtekening-${Date.now()}.png`
      const buffer = Buffer.from(invoer.handtekeningB64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(pad, buffer, { contentType: 'image/png', upsert: false })
      // Een handtekening die niet mee kan, mag de gereedmelding niet stilletjes zonder laten
      // doorgaan: de monteur denkt dan dat er is afgetekend.
      if (uploadErr) return { ok: false, error: `Handtekening opslaan mislukt: ${uploadErr.message}` }
      handtekeningUrl = supabase.storage.from(BUCKET).getPublicUrl(pad).data.publicUrl
    }

    const { error } = await supabase.from('servicedesk_gereedmeldingen').insert({
      dossier_id: dossierId,
      uitgevoerde_werkzaamheden: werkzaamheden,
      handtekening_url: handtekeningUrl,
      getekend_door: handtekeningUrl ? getekendDoor : null,
      gemeld_door: medewerker.id,
    })
    if (error) return { ok: false, error: error.message }

    // Status pas ná een geslaagde vastlegging: liever een gemelde bon op de oude stand dan een
    // bon op "Uitgevoerd" waar niemand kan terugvinden wat er is gedaan.
    let waarschuwing: string | undefined
    if (!VOORBIJ_UITGEVOERD.has(String(bon.servicedesk_substatus))) {
      const res = await updateServicedeskSubstatus(dossierId, 'uitgevoerd')
      if (!res.ok) waarschuwing = `Gereedmelding opgeslagen, maar de status bleef staan: ${res.error ?? 'onbekende fout'}`
    }

    await meldAanProjectleider(bon, medewerker, {
      type: 'servicedesk_gereed',
      titel: 'Bon gereed gemeld',
      body: `${medewerkerNaam(medewerker) ?? 'Een collega'}: ${werkzaamheden.slice(0, 140)}${werkzaamheden.length > 140 ? '…' : ''}`,
      url: `/servicedesk/${dossierId}`,
    })

    revalideer(dossierId)
    return waarschuwing ? { ok: true, waarschuwing } : { ok: true }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: foutTekst(e) }
  }
}
