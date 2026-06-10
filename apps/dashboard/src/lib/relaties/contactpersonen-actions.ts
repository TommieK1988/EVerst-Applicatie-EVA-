'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { Contactpersoon, ContactpersoonOrganisatie, Relatie } from '@everts/database'

type ActionResult = { ok: true } | { ok: false; error: string }

export type ContactpersoonMetOrganisaties = Contactpersoon & {
  koppelingen: (ContactpersoonOrganisatie & {
    organisatie: Pick<Relatie, 'id' | 'naam' | 'types'>
  })[]
}

export async function getContactpersonenVoorOrganisatie(organisatie_id: string): Promise<(ContactpersoonOrganisatie & { contactpersoon: Contactpersoon })[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('contactpersoon_organisaties')
    .select('*, contactpersoon:contactpersonen(*)')
    .eq('organisatie_id', organisatie_id)
    .order('is_primair', { ascending: false })

  return data ?? []
}

export async function getContactpersoonById(id: string): Promise<ContactpersoonMetOrganisaties | null> {
  const supabase = createAdminClient() as any
  const [cpRes, koppelingenRes] = await Promise.all([
    supabase.from('contactpersonen').select('*').eq('id', id).single(),
    supabase
      .from('contactpersoon_organisaties')
      .select('*, organisatie:relaties(id, naam, types)')
      .eq('contactpersoon_id', id)
      .order('is_primair', { ascending: false }),
  ])

  if (!cpRes.data) return null
  return {
    ...(cpRes.data as Contactpersoon),
    koppelingen: koppelingenRes.data ?? [],
  }
}

export async function getAlleContactpersonen(): Promise<(Contactpersoon & { organisaties: { naam: string; functie: string | null }[] })[]> {
  const supabase = createAdminClient() as any
  const { data: koppelingen } = await supabase
    .from('contactpersoon_organisaties')
    .select('contactpersoon_id, functie, organisatie:relaties(naam)')

  const { data: personen } = await supabase
    .from('contactpersonen')
    .select('*')
    .order('achternaam')

  if (!personen) return []

  const orgMap = new Map<string, { naam: string; functie: string | null }[]>()
  for (const k of koppelingen ?? []) {
    const lijst = orgMap.get(k.contactpersoon_id) ?? []
    lijst.push({ naam: k.organisatie?.naam ?? '?', functie: k.functie })
    orgMap.set(k.contactpersoon_id, lijst)
  }

  return personen.map((p: Contactpersoon) => ({
    ...p,
    organisaties: orgMap.get(p.id) ?? [],
  }))
}

export async function createContactpersoon(input: {
  aanhef?: string | null
  geslacht?: 'man' | 'vrouw' | 'overig' | null
  voorletter?: string | null
  voornaam: string
  tussenvoegsel?: string | null
  achternaam: string
  email?: string | null
  telefoon?: string | null
  mobiel?: string | null
  linkedin_url?: string | null
  prive_email?: string | null
  prive_telefoon?: string | null
  prive_adres_straat?: string | null
  prive_adres_postcode?: string | null
  prive_adres_plaats?: string | null
  prive_adres_land?: string | null
  geboortedatum?: string | null
  opmerkingen?: string | null
  organisatie_id?: string | null
  functie?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { organisatie_id, functie, ...persoonsData } = input

  const { data, error } = await supabase
    .from('contactpersonen')
    .insert({ ...persoonsData, actief: true })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  if (organisatie_id) {
    await supabase.from('contactpersoon_organisaties').insert({
      contactpersoon_id: data.id,
      organisatie_id,
      functie: functie ?? null,
      is_primair: true,
    })
  }

  revalidatePath('/relaties')
  return { ok: true, id: data.id }
}

export async function updateContactpersoon(
  id: string,
  patch: {
    aanhef?: string | null
    geslacht?: 'man' | 'vrouw' | 'overig' | null
    voorletter?: string | null
    voornaam?: string
    tussenvoegsel?: string | null
    achternaam?: string
    email?: string | null
    telefoon?: string | null
    mobiel?: string | null
    linkedin_url?: string | null
    prive_email?: string | null
    prive_telefoon?: string | null
    prive_adres_straat?: string | null
    prive_adres_postcode?: string | null
    prive_adres_plaats?: string | null
    prive_adres_land?: string | null
    geboortedatum?: string | null
    opmerkingen?: string | null
  }
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('contactpersonen')
    .update(patch)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/contactpersonen/${id}`)
  return { ok: true }
}

export async function koppelContactpersoonAanOrganisatie(
  contactpersoon_id: string,
  organisatie_id: string,
  functie?: string | null
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('contactpersoon_organisaties')
    .insert({ contactpersoon_id, organisatie_id, functie: functie ?? null, is_primair: false })

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/contactpersonen/${contactpersoon_id}`)
  revalidatePath(`/relaties/${organisatie_id}`)
  return { ok: true }
}

export async function ontkoppelContactpersoonVanOrganisatie(
  link_id: string,
  contactpersoon_id: string,
  organisatie_id: string
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('contactpersoon_organisaties')
    .delete()
    .eq('id', link_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/contactpersonen/${contactpersoon_id}`)
  revalidatePath(`/relaties/${organisatie_id}`)
  return { ok: true }
}

export async function updateContactpersoonLink(
  link_id: string,
  contactpersoon_id: string,
  patch: { functie?: string | null; is_primair?: boolean }
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('contactpersoon_organisaties')
    .update(patch)
    .eq('id', link_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/contactpersonen/${contactpersoon_id}`)
  return { ok: true }
}

export async function toggleContactpersoonActief(
  id: string,
  actief: boolean
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('contactpersonen')
    .update({ actief })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/contactpersonen/${id}`)
  revalidatePath('/relaties')
  return { ok: true }
}
