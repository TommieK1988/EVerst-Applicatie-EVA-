'use server'

/**
 * Contactpersonen koppelen aan een factuuradres.
 *
 * Een factuuradres is lang niet altijd "de post van het bedrijf". Bij een VvE hangt het adres aan
 * een bestuur — de voorzitter tekent, de penningmeester betaalt — en bij een vastgoedbeheerder
 * hoort bij elke portefeuille een eigen assetmanager. Wie je daarvoor moet hebben stond tot nu toe
 * hooguit in het opmerkingenveld van het adres.
 *
 * De koppeling staat náást `contactpersoon_organisaties`: die zegt waar iemand wérkt, deze zegt
 * bij welk adres hij hoort. Vaak is dat dezelfde persoon, maar niet altijd — een VvE-voorzitter is
 * geen medewerker van de beheerder die de facturen verwerkt.
 *
 * Bouw7 kent dit onderscheid niet: daar hangt een contactpersoon onder een contact, niet onder een
 * factuuradres. Deze koppeling blijft dus bewust EVA-eigen en gaat niet mee in de sync.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import type { ContactpersoonFactuuradres } from '@everts/database'
import type { FactuuradresContact, ContactpersoonAdreskoppeling } from './factuuradres-contactpersonen-types'

type ActionResult = { ok: true } | { ok: false; error: string }

// Bewust zonder any-cast: beide tabellen staan in `database.types.ts`, dus de gegenereerde client
// leidt het rijtype af uit de select-string — ook met de embeds.
const db = () => createAdminClient()

async function magSchrijven(): Promise<string | null> {
  try {
    await vereisRecht('relaties', 'schrijven')
    return null
  } catch (e) {
    if (e instanceof GeenToegangError) return 'Je hebt geen rechten om contactpersonen te koppelen.'
    throw e
  }
}

/**
 * Alle gekoppelde personen bij een reeks factuuradressen, primair eerst.
 *
 * Begrensd door de meegegeven ids — één relatie heeft er hooguit een handvol, dus ruim onder de
 * PostgREST-grens van 1000 rijen.
 */
export async function getContactenBijFactuuradressen(
  factuuradresIds: string[],
): Promise<FactuuradresContact[]> {
  if (factuuradresIds.length === 0) return []
  await vereisRecht('relaties', 'lezen')
  const { data } = await db()
    .from('contactpersoon_factuuradressen')
    .select('*, contactpersoon:contactpersonen(id, voornaam, tussenvoegsel, achternaam, email, telefoon, mobiel)')
    .in('factuuradres_id', factuuradresIds)
    .order('is_primair', { ascending: false })
    .order('created_at', { ascending: true })

  // Samengevoegde personen leven verder onder hun blijver; een koppeling die daar nog naar wijst
  // hoort niemand meer te zien.
  return ((data ?? []) as FactuuradresContact[]).filter(r => r.contactpersoon != null)
}

/** De factuuradressen waar één persoon bij hoort — voor zijn eigen kaart. */
export async function getFactuuradressenVanContactpersoon(
  contactpersoonId: string,
): Promise<ContactpersoonAdreskoppeling[]> {
  await vereisRecht('relaties', 'lezen')
  const { data } = await db()
    .from('contactpersoon_factuuradressen')
    .select('*, factuuradres:relatie_factuuradressen(id, label, straat, postcode, plaats, relatie_id, relatie:relaties(naam))')
    .eq('contactpersoon_id', contactpersoonId)
    .order('is_primair', { ascending: false })

  type Rij = ContactpersoonFactuuradres & {
    factuuradres: {
      id: string; label: string; straat: string | null; postcode: string | null
      plaats: string | null; relatie_id: string; relatie: { naam: string } | null
    } | null
  }
  return ((data ?? []) as unknown as Rij[])
    .filter(r => r.factuuradres != null)
    .map(r => ({
      ...r,
      factuuradres: { ...r.factuuradres!, relatie_naam: r.factuuradres!.relatie?.naam ?? null },
    }))
}

export async function koppelContactpersoonAanFactuuradres(input: {
  contactpersoon_id: string
  factuuradres_id: string
  rol?: string | null
  is_primair?: boolean
  /** Alleen om de relatiekaart te verversen. */
  relatie_id?: string
}): Promise<ActionResult> {
  const fout = await magSchrijven()
  if (fout) return { ok: false, error: fout }

  const supabase = db()
  // Hooguit één primair aanspreekpunt per adres; de database bewaakt dat met een unieke index,
  // dus de vorige moet er eerst af in plaats van dat de insert stukloopt.
  if (input.is_primair) {
    await supabase
      .from('contactpersoon_factuuradressen')
      .update({ is_primair: false })
      .eq('factuuradres_id', input.factuuradres_id)
      .eq('is_primair', true)
  }

  const { error } = await supabase.from('contactpersoon_factuuradressen').insert({
    contactpersoon_id: input.contactpersoon_id,
    factuuradres_id: input.factuuradres_id,
    rol: input.rol?.trim() || null,
    is_primair: input.is_primair ?? false,
  })

  if (error) {
    // 23505 = de unieke sleutel (persoon, adres): deze koppeling bestaat al.
    if (error.code === '23505') return { ok: false, error: 'Deze persoon is al aan dit factuuradres gekoppeld.' }
    return { ok: false, error: error.message }
  }

  revalidatePath(`/relaties/contactpersonen/${input.contactpersoon_id}`)
  if (input.relatie_id) revalidatePath(`/relaties/${input.relatie_id}`)
  return { ok: true }
}

export async function wijzigFactuuradresContactpersoon(
  link_id: string,
  patch: { rol?: string | null; is_primair?: boolean; opmerkingen?: string | null },
  relatie_id?: string,
): Promise<ActionResult> {
  const fout = await magSchrijven()
  if (fout) return { ok: false, error: fout }

  const supabase = db()
  const { data: rij } = await supabase
    .from('contactpersoon_factuuradressen')
    .select('id, contactpersoon_id, factuuradres_id')
    .eq('id', link_id)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Deze koppeling bestaat niet (meer).' }

  if (patch.is_primair) {
    await supabase
      .from('contactpersoon_factuuradressen')
      .update({ is_primair: false })
      .eq('factuuradres_id', rij.factuuradres_id)
      .eq('is_primair', true)
      .neq('id', link_id)
  }

  const { error } = await supabase
    .from('contactpersoon_factuuradressen')
    .update({
      ...(patch.rol !== undefined ? { rol: patch.rol?.trim() || null } : {}),
      ...(patch.is_primair !== undefined ? { is_primair: patch.is_primair } : {}),
      ...(patch.opmerkingen !== undefined ? { opmerkingen: patch.opmerkingen?.trim() || null } : {}),
    })
    .eq('id', link_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/contactpersonen/${rij.contactpersoon_id}`)
  if (relatie_id) revalidatePath(`/relaties/${relatie_id}`)
  return { ok: true }
}

export async function ontkoppelContactpersoonVanFactuuradres(
  link_id: string,
  relatie_id?: string,
): Promise<ActionResult> {
  const fout = await magSchrijven()
  if (fout) return { ok: false, error: fout }

  const supabase = db()
  const { data: rij } = await supabase
    .from('contactpersoon_factuuradressen')
    .select('contactpersoon_id')
    .eq('id', link_id)
    .maybeSingle()

  const { error } = await supabase.from('contactpersoon_factuuradressen').delete().eq('id', link_id)
  if (error) return { ok: false, error: error.message }

  if (rij?.contactpersoon_id) revalidatePath(`/relaties/contactpersonen/${rij.contactpersoon_id}`)
  if (relatie_id) revalidatePath(`/relaties/${relatie_id}`)
  return { ok: true }
}
