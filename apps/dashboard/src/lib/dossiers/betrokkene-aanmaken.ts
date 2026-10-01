'use server'

/**
 * Een nieuwe contactpersoon aanmaken vanuit het blok Betrokkenen — en hem meteen aan het dossier
 * hangen.
 *
 * Wie je bij een opdracht tegenkomt staat vaak nog niet in EVA: de nieuwe opzichter van de
 * corporatie, de penningmeester van de VvE. Eerst naar Relatiebeheer en dan terug is precies het
 * soort omweg waardoor zo iemand in een notitie belandt in plaats van in het adresboek.
 *
 * De persoon kan op drie manieren ontstaan:
 *  - **los** — alleen de persoon, zonder werkgever;
 *  - **bij een organisatie** — via `createContactpersoon`, zodat hij ook in Bouw7 onder dat contact
 *    komt te staan, net als vanaf de relatiekaart;
 *  - **bij een factuuradres** — het VvE-bestuur of de assetmanager achter een adres. Die koppeling
 *    is EVA-eigen en gaat niet naar Bouw7 (zie `factuuradres-contactpersonen.ts`).
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { createContactpersoon } from '@/lib/relaties/contactpersonen-actions'
import { assertDossierBewerkbaar } from './guards'

const db = () => createAdminClient()

export type FactuuradresKeuze = {
  id: string
  label: string
  /** Straat en plaats, voor de tweede regel in de lijst. */
  adres: string | null
  relatie_naam: string | null
}

export type KoppelKeuzes = {
  opdrachtgever: { id: string; naam: string } | null
  factuuradressen: FactuuradresKeuze[]
  /** Het factuuradres dat op het dossier staat — de voor de hand liggende keuze. */
  dossierFactuuradresId: string | null
}

type AdresRij = {
  id: string; label: string; straat: string | null; postcode: string | null; plaats: string | null
  relatie: { naam: string } | null
}

function naarKeuze(r: AdresRij): FactuuradresKeuze {
  return {
    id: r.id,
    label: r.label,
    adres: [r.straat, [r.postcode, r.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
    relatie_naam: r.relatie?.naam ?? null,
  }
}

const ADRES_SELECT = 'id, label, straat, postcode, plaats, relatie:relaties(naam)'

/**
 * Wat het formulier vooraf aanbiedt: de opdrachtgever als organisatie, en zijn factuuradressen
 * plus het adres dat op het dossier staat (dat kan bij een andere relatie horen — de VvE
 * betaalt, de beheerder heeft het dossier).
 */
export async function getKoppelKeuzes(dossierId: string): Promise<KoppelKeuzes> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = db()
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('klant_id, factuuradres_id, klant:relaties!klant_id(id, naam)')
    .eq('id', dossierId)
    .maybeSingle()
  if (!dossier) return { opdrachtgever: null, factuuradressen: [], dossierFactuuradresId: null }

  const [vanKlant, vanDossier] = await Promise.all([
    // Begrensd op één relatie: een beheerder heeft er tientallen, geen duizend.
    dossier.klant_id
      ? supabase.from('relatie_factuuradressen').select(ADRES_SELECT)
          .eq('relatie_id', dossier.klant_id).order('label').limit(500)
      : Promise.resolve({ data: [] }),
    dossier.factuuradres_id
      ? supabase.from('relatie_factuuradressen').select(ADRES_SELECT)
          .eq('id', dossier.factuuradres_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const lijst = ((vanKlant.data ?? []) as unknown as AdresRij[]).map(naarKeuze)
  const eigen = vanDossier.data as unknown as AdresRij | null
  if (eigen && !lijst.some(a => a.id === eigen.id)) lijst.unshift(naarKeuze(eigen))

  return {
    opdrachtgever: dossier.klant ? { id: dossier.klant.id, naam: dossier.klant.naam } : null,
    factuuradressen: lijst,
    dossierFactuuradresId: dossier.factuuradres_id ?? null,
  }
}

/** De factuuradressen van een andere organisatie dan de opdrachtgever. */
export async function getFactuuradressenVanRelatie(relatieId: string): Promise<FactuuradresKeuze[]> {
  await vereisRecht('relaties', 'lezen')
  const { data } = await db()
    .from('relatie_factuuradressen')
    .select(ADRES_SELECT)
    .eq('relatie_id', relatieId)
    .order('label')
    .limit(500)
  return ((data ?? []) as unknown as AdresRij[]).map(naarKeuze)
}

export type NieuweBetrokkeneKoppeling =
  | { soort: 'los' }
  | { soort: 'organisatie'; relatie_id: string }
  | { soort: 'factuuradres'; factuuradres_id: string }

export async function maakBetrokkeneContactpersoon(input: {
  dossier_id: string
  voornaam: string
  tussenvoegsel?: string | null
  achternaam: string
  email?: string | null
  telefoon?: string | null
  functie?: string | null
  /** Rol bij déze opdracht — staat op de betrokkene, niet op de persoon. */
  rol?: string | null
  koppeling: NieuweBetrokkeneKoppeling
}): Promise<{ ok: true; waarschuwing?: string } | { ok: false; error: string }> {
  try {
    await vereisRecht('dossiers', 'schrijven')
    await vereisRecht('relaties', 'schrijven')
    await assertDossierBewerkbaar(input.dossier_id)
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message || 'Je hebt geen rechten om contactpersonen aan te maken.' }
    throw e
  }

  const voornaam = input.voornaam.trim()
  const achternaam = input.achternaam.trim()
  if (!voornaam || !achternaam) return { ok: false, error: 'Voornaam en achternaam zijn verplicht.' }

  const { koppeling } = input
  const functie = input.functie?.trim() || null
  const res = await createContactpersoon({
    voornaam,
    tussenvoegsel: input.tussenvoegsel?.trim() || null,
    achternaam,
    email: input.email?.trim() || null,
    telefoon: input.telefoon?.trim() || null,
    organisatie_id: koppeling.soort === 'organisatie' ? koppeling.relatie_id : null,
    functie: koppeling.soort === 'organisatie' ? functie : null,
  })
  if (!res.ok) return res

  const supabase = db()
  let waarschuwing: string | undefined

  if (koppeling.soort === 'factuuradres') {
    // Een functie hoort bij een werkgever; bij een adres heet hetzelfde de rol ("Voorzitter").
    const { error } = await supabase.from('contactpersoon_factuuradressen').insert({
      contactpersoon_id: res.id,
      factuuradres_id: koppeling.factuuradres_id,
      rol: functie,
      is_primair: false,
    })
    if (error) waarschuwing = `Aangemaakt, maar niet aan het factuuradres gekoppeld: ${error.message}`
  }

  const { error } = await supabase.from('dossier_betrokkenen').insert({
    dossier_id: input.dossier_id,
    contactpersoon_id: res.id,
    // Zo toont de lijst meteen bij welke organisatie hij hoort.
    relatie_id: koppeling.soort === 'organisatie' ? koppeling.relatie_id : null,
    rol: input.rol?.trim() || null,
  })
  if (error) {
    return { ok: false, error: `De contactpersoon is aangemaakt, maar niet aan het dossier gehangen: ${error.message}` }
  }

  revalidatePath(`/dossiers/${input.dossier_id}`)
  revalidatePath('/relaties')
  return { ok: true, waarschuwing }
}
