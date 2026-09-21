'use server'

/**
 * Betrokkenen bij een dossier — het blok op het Informatie-tabblad.
 *
 * Rond een opdracht staan meer mensen dan de ene contactpersoon van de opdrachtgever: een
 * VvE-bestuur, de assetmanager van de portefeuille, een architect, een opzichter namens de
 * corporatie. Dit blok zet ze bij elkaar.
 *
 * De lijst komt uit **drie bronnen** en wordt hier samengevoegd, niet gekopieerd:
 *  1. `dossiers.contactpersoon_id` — de contactpersoon van de opdrachtgever;
 *  2. de personen bij het gekozen factuuradres (`contactpersoon_factuuradressen`) — het
 *     VvE-bestuur of de assetmanager die bij dát adres hoort;
 *  3. `dossier_betrokkenen` — wat een mens hier zelf toevoegt.
 *
 * Kopiëren zou de eerste twee laten verlopen zodra de bron wijzigt: wissel je de contactpersoon
 * op het dossier, dan hoort de oude uit dit lijstje te verdwijnen. Alleen regels uit bron 3 zijn
 * dus te wijzigen of te verwijderen.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'
import type { DossierBetrokkene } from '@everts/database'
import type { Betrokkene } from './betrokkenen-types'

type ActionResult = { ok: true } | { ok: false; error: string }

// Bewust zonder any-cast: `dossier_betrokkenen` en de tabellen eromheen staan in
// `database.types.ts`, dus de gegenereerde client leidt het rijtype af uit de select-string.
const db = () => createAdminClient()

/** Persoonsgegevens zoals de embeds hieronder ze opleveren. */
type PersoonRij = {
  id: string
  voornaam: string | null
  tussenvoegsel: string | null
  achternaam: string | null
  email: string | null
  telefoon: string | null
  mobiel: string | null
}

function naamVan(cp: { voornaam?: string | null; tussenvoegsel?: string | null; achternaam?: string | null }): string {
  return [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ').trim()
}

async function magSchrijven(dossierId: string): Promise<string | null> {
  try {
    await vereisRecht('dossiers', 'schrijven')
    await assertDossierBewerkbaar(dossierId)
    return null
  } catch (e) {
    if (e instanceof GeenToegangError) return e.message || 'Je hebt geen rechten om dit dossier te wijzigen.'
    throw e
  }
}

/**
 * De volledige lijst betrokkenen, in vaste volgorde: eerst de contactpersoon van de
 * opdrachtgever, dan het factuuradres, dan wat er handmatig bij is gezet.
 *
 * Dezelfde persoon kan uit meerdere bronnen komen (de contactpersoon van het dossier ís vaak de
 * VvE-voorzitter). Die staat dan één keer in de lijst, met de rol die het meest zegt.
 */
export async function getBetrokkenen(dossierId: string): Promise<Betrokkene[]> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = db()

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('id, klant_id, contactpersoon_id, factuuradres_id, klant:relaties!klant_id(id, naam)')
    .eq('id', dossierId)
    .maybeSingle()
  if (!dossier) return []

  const [cpRes, faRes, eigenRes] = await Promise.all([
    dossier.contactpersoon_id
      ? supabase
          .from('contactpersonen')
          .select('id, voornaam, tussenvoegsel, achternaam, email, telefoon, mobiel')
          .eq('id', dossier.contactpersoon_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    dossier.factuuradres_id
      ? supabase
          .from('contactpersoon_factuuradressen')
          .select('id, rol, is_primair, contactpersoon:contactpersonen(id, voornaam, tussenvoegsel, achternaam, email, telefoon, mobiel)')
          .eq('factuuradres_id', dossier.factuuradres_id)
          .order('is_primair', { ascending: false })
      : Promise.resolve({ data: [] }),
    // Begrensd op één dossier — een handvol rijen, ruim onder de PostgREST-grens.
    supabase
      .from('dossier_betrokkenen')
      .select('*, contactpersoon:contactpersonen(id, voornaam, tussenvoegsel, achternaam, email, telefoon, mobiel), relatie:relaties(id, naam)')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: true }),
  ])

  const opdrachtgever = dossier.klant?.id ? { id: dossier.klant.id, naam: dossier.klant.naam } : null

  const lijst: Betrokkene[] = []
  // Per persoon hooguit één regel. Wie er al staat wint; een latere bron vult alleen aan wat
  // nog leeg is — zo raak je de rol van een handmatige regel niet kwijt aan een dubbele.
  const perPersoon = new Map<string, Betrokkene>()

  const voegToe = (regel: Betrokkene) => {
    const sleutel = regel.contactpersoon_id
    if (!sleutel) { lijst.push(regel); return }
    const bestaand = perPersoon.get(sleutel)
    if (bestaand) {
      bestaand.rol ??= regel.rol
      bestaand.email ??= regel.email
      bestaand.telefoon ??= regel.telefoon
      bestaand.organisatie ??= regel.organisatie
      // Een handmatige regel blijft verwijderbaar, ook als hij achter een afgeleide staat.
      if (regel.herkomst === 'handmatig' && bestaand.id == null) bestaand.id = regel.id
      return
    }
    perPersoon.set(sleutel, regel)
    lijst.push(regel)
  }

  if (cpRes.data) {
    voegToe({
      sleutel: `dossier-${cpRes.data.id}`,
      herkomst: 'opdrachtgever',
      id: null,
      naam: naamVan(cpRes.data),
      rol: null,
      contactpersoon_id: cpRes.data.id,
      organisatie: opdrachtgever,
      email: cpRes.data.email ?? null,
      telefoon: cpRes.data.telefoon ?? cpRes.data.mobiel ?? null,
      opmerkingen: null,
    })
  }

  type AdresRij = { id: string; rol: string | null; contactpersoon: PersoonRij | null }
  for (const k of (faRes.data ?? []) as unknown as AdresRij[]) {
    if (!k.contactpersoon) continue
    voegToe({
      sleutel: `factuuradres-${k.id}`,
      herkomst: 'factuuradres',
      id: null,
      naam: naamVan(k.contactpersoon),
      rol: k.rol ?? null,
      contactpersoon_id: k.contactpersoon.id,
      organisatie: opdrachtgever,
      email: k.contactpersoon.email ?? null,
      telefoon: k.contactpersoon.telefoon ?? k.contactpersoon.mobiel ?? null,
      opmerkingen: null,
    })
  }

  type EigenRij = DossierBetrokkene & {
    contactpersoon: PersoonRij | null
    relatie: { id: string; naam: string } | null
  }
  for (const b of (eigenRes.data ?? []) as unknown as EigenRij[]) {
    const cp = b.contactpersoon
    voegToe({
      sleutel: `handmatig-${b.id}`,
      herkomst: 'handmatig',
      id: b.id,
      naam: cp ? naamVan(cp) : (b.relatie?.naam ?? 'Onbekend'),
      rol: b.rol ?? null,
      contactpersoon_id: cp?.id ?? null,
      organisatie: b.relatie?.id ? { id: b.relatie.id, naam: b.relatie.naam } : null,
      email: cp?.email ?? null,
      telefoon: cp?.telefoon ?? cp?.mobiel ?? null,
      opmerkingen: b.opmerkingen ?? null,
    })
  }

  return lijst
}

export async function voegBetrokkeneToe(input: {
  dossier_id: string
  contactpersoon_id?: string | null
  relatie_id?: string | null
  rol?: string | null
}): Promise<ActionResult> {
  const fout = await magSchrijven(input.dossier_id)
  if (fout) return { ok: false, error: fout }
  if (!input.contactpersoon_id && !input.relatie_id) {
    return { ok: false, error: 'Kies een contactpersoon of een relatie.' }
  }

  const { error } = await db().from('dossier_betrokkenen').insert({
    dossier_id: input.dossier_id,
    contactpersoon_id: input.contactpersoon_id ?? null,
    relatie_id: input.relatie_id ?? null,
    rol: input.rol?.trim() || null,
  })

  if (error) {
    // 23505 = de partiële unieke index: deze persoon of organisatie staat er al bij.
    if (error.code === '23505') return { ok: false, error: 'Deze betrokkene staat al bij dit dossier.' }
    return { ok: false, error: error.message }
  }

  revalidatePath(`/dossiers/${input.dossier_id}`)
  return { ok: true }
}

export async function wijzigBetrokkene(
  id: string,
  dossier_id: string,
  patch: { rol?: string | null; opmerkingen?: string | null },
): Promise<ActionResult> {
  const fout = await magSchrijven(dossier_id)
  if (fout) return { ok: false, error: fout }

  const { error } = await db()
    .from('dossier_betrokkenen')
    .update({
      ...(patch.rol !== undefined ? { rol: patch.rol?.trim() || null } : {}),
      ...(patch.opmerkingen !== undefined ? { opmerkingen: patch.opmerkingen?.trim() || null } : {}),
    })
    .eq('id', id)
    .eq('dossier_id', dossier_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/dossiers/${dossier_id}`)
  return { ok: true }
}

export async function verwijderBetrokkene(id: string, dossier_id: string): Promise<ActionResult> {
  const fout = await magSchrijven(dossier_id)
  if (fout) return { ok: false, error: fout }

  const { error } = await db()
    .from('dossier_betrokkenen')
    .delete()
    .eq('id', id)
    .eq('dossier_id', dossier_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/dossiers/${dossier_id}`)
  return { ok: true }
}
