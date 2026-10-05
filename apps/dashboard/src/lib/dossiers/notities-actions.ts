'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar, magBonAfronden } from './guards'
import { meldAanProjectleider } from './meld-projectleider'

/** Foto's bij een opmerking vanaf de telefoon — zelfde publieke bucket als de pakbonnen. */
const FOTO_BUCKET = 'servicedesk-fotos'
const MAX_FOTOS = 6

export type DossierNotitie = {
  id: string
  inhoud: string
  created_at: string
  medewerker_id: string | null
  auteur_naam: string
  /** Foto's bij de notitie (publieke URL's); leeg bij een gewone tekstnotitie. */
  foto_urls: string[]
}

function volledigeNaam(m: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null } | null): string {
  if (!m) return 'Onbekend'
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim() || 'Onbekend'
}

/** Notities van een dossier, nieuwste eerst, met auteursnaam. */
export async function getDossierNotities(dossierId: string): Promise<DossierNotitie[]> {
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('dossier_notities')
    .select('id, inhoud, created_at, medewerker_id, foto_urls, medewerkers(voornaam, tussenvoegsel, achternaam)')
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return (data as any[]).map(r => ({
    id:            r.id,
    inhoud:        r.inhoud,
    created_at:    r.created_at,
    medewerker_id: r.medewerker_id,
    auteur_naam:   volledigeNaam(r.medewerkers ?? null),
    foto_urls:     r.foto_urls ?? [],
  }))
}

/** Plaats een notitie op een dossier; auteur = ingelogde medewerker. */
export async function plaatsDossierNotitie(
  dossierId: string,
  inhoud: string,
): Promise<{ ok: true; notitie: DossierNotitie } | { ok: false; error: string }> {
  const tekst = inhoud.trim()
  if (!tekst) return { ok: false, error: 'Lege notitie' }
  await assertDossierBewerkbaar(dossierId)

  const mw = await getCurrentMedewerker()
  if (!mw) return { ok: false, error: 'Niet ingelogd' }

  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('dossier_notities')
    .insert({ dossier_id: dossierId, medewerker_id: mw.id, inhoud: tekst })
    .select('id, inhoud, created_at, medewerker_id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Plaatsen mislukt' }

  // De borden tonen een notitie-indicator op de kaart, dus die moeten mee verversen.
  revalidatePath('/opdrachten')
  revalidatePath('/servicedesk')
  revalidatePath('/offertes')
  return {
    ok: true,
    notitie: {
      id:            data.id,
      inhoud:        data.inhoud,
      created_at:    data.created_at,
      medewerker_id: data.medewerker_id,
      auteur_naam:   volledigeNaam(mw),
      foto_urls:     [],
    },
  }
}

/**
 * "Opmerking voor kantoor" vanaf de telefoon: een notitie met eventueel foto's, en een melding
 * aan de projectleider — anders ligt hij in Notities tot iemand toevallig kijkt.
 *
 * FormData: `inhoud` (tekst), `foto` (0..6 bestanden, op de telefoon al verkleind).
 * Tekst is verplicht: een losse foto zonder uitleg laat kantoor raden wat er mis is.
 */
export async function plaatsNotitieMetFotos(
  dossierId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tekst = String(formData.get('inhoud') ?? '').trim()
  if (!tekst) return { ok: false, error: 'Schrijf erbij wat kantoor moet weten.' }
  const fotos = formData.getAll('foto').filter((f): f is File => f instanceof File && f.size > 0)
  if (fotos.length > MAX_FOTOS) return { ok: false, error: `Maximaal ${MAX_FOTOS} foto's per opmerking.` }

  const mw = await getCurrentMedewerker()
  if (!mw) return { ok: false, error: 'Niet ingelogd' }
  if (!(await magBonAfronden(dossierId, mw))) return { ok: false, error: 'Je hebt geen toegang tot dit dossier.' }
  await assertDossierBewerkbaar(dossierId)

  const supabase = createAdminClient()
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('id, titel, dossiernummer, project_manager_id')
    .eq('id', dossierId)
    .maybeSingle()
  if (!dossier) return { ok: false, error: 'Dossier niet gevonden.' }

  // Eerst de foto's: een notitie die naar foto's verwijst die er niet zijn, is erger dan geen notitie.
  const paden: string[] = []
  const urls: string[] = []
  const ts = Date.now()
  for (const [i, file] of fotos.entries()) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const pad = `${dossierId}/notitie-${ts}-${i}.${ext}`
    const { error } = await supabase.storage
      .from(FOTO_BUCKET)
      .upload(pad, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'image/jpeg', upsert: false })
    if (error) {
      if (paden.length) await supabase.storage.from(FOTO_BUCKET).remove(paden).catch(() => {})
      return { ok: false, error: `Foto uploaden mislukt: ${error.message}` }
    }
    paden.push(pad)
    urls.push(supabase.storage.from(FOTO_BUCKET).getPublicUrl(pad).data.publicUrl)
  }

  const { error } = await supabase
    .from('dossier_notities')
    .insert({ dossier_id: dossierId, medewerker_id: mw.id, inhoud: tekst, foto_urls: urls })
  if (error) {
    if (paden.length) await supabase.storage.from(FOTO_BUCKET).remove(paden).catch(() => {})
    return { ok: false, error: error.message }
  }

  const fotoTekst = urls.length ? ` (${urls.length} foto${urls.length > 1 ? "'s" : ''})` : ''
  await meldAanProjectleider(dossier, mw.id, {
    type: 'dossier_opmerking_buitendienst',
    titel: 'Opmerking van de buitendienst',
    body: `${volledigeNaam(mw)}${fotoTekst}: ${tekst.slice(0, 140)}${tekst.length > 140 ? '…' : ''}`,
    // Alleen de servicedeskbon heeft dit invoerblok op de telefoon; daar hoort de link heen.
    url: `/servicedesk/${dossierId}`,
  })

  revalidatePath(`/m/dossiers/${dossierId}/informatie`)
  revalidatePath(`/servicedesk/${dossierId}`, 'layout')
  revalidatePath('/servicedesk')
  revalidatePath('/opdrachten')
  return { ok: true }
}

/** Verwijder een eigen notitie (alleen de plaatser). */
export async function verwijderDossierNotitie(
  notitieId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mw = await getCurrentMedewerker()
  if (!mw) return { ok: false, error: 'Niet ingelogd' }

  const supabase = createAdminClient() as any

  // Vangnet: notities van een afgesloten (alleen-lezen) dossier mogen niet verwijderd worden.
  const { data: notitie } = await supabase
    .from('dossier_notities')
    .select('dossier_id')
    .eq('id', notitieId)
    .maybeSingle()
  if (notitie?.dossier_id) await assertDossierBewerkbaar(notitie.dossier_id)

  const { error } = await supabase
    .from('dossier_notities')
    .delete()
    .eq('id', notitieId)
    .eq('medewerker_id', mw.id)

  if (error) return { ok: false, error: error.message }

  // De borden tonen een notitie-indicator op de kaart, dus die moeten mee verversen.
  revalidatePath('/opdrachten')
  revalidatePath('/servicedesk')
  revalidatePath('/offertes')
  return { ok: true }
}
