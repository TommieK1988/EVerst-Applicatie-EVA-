'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { Contactpersoon, ContactpersoonBouw7Koppeling, ContactpersoonOrganisatie, Relatie } from '@everts/database'
import { BOUW7_CONTACTPERSOON_VELDEN, beschermdeVelden } from './sync-velden'
import { ontmarkeerHandmatig } from '@/lib/bouw7/handmatige-velden'
import { schrijfBouw7Contactpersoon, schrijfBouw7ContactpersoonFunctie } from '@/lib/bouw7/contact-write'
import { haalAlleRijen } from '@/lib/supabase/paginate'

type ActionResult = { ok: true; waarschuwing?: string } | { ok: false; error: string }

/** Kolommen die naar de Bouw7-contactpersoon gaan (`geslacht` is een EVA-afleiding en gaat niet mee). */
const CP_SCHRIJFVELDEN = ['voornaam', 'achternaam', 'email', 'telefoon', 'aanhef']

/**
 * Write-back van contactpersoonvelden naar Bouw7. Wat aankomt wordt ontmarkeerd; wat niet aankomt
 * blijft beschermd en krijgt via de cron een herkansing.
 */
export async function schrijfContactpersoonNaarBouw7(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  contactpersoonId: string,
  velden: string[],
): Promise<string | undefined> {
  const teSchrijven = velden.filter(v => CP_SCHRIJFVELDEN.includes(v))
  if (teSchrijven.length === 0) return undefined
  // Staat de persoon nergens in Bouw7 (geen enkele spiegel), dan is er niets te schrijven en
  // is dat geen waarschuwing waard.
  const { count } = await supabase
    .from('contactpersoon_bouw7_koppelingen')
    .select('id', { count: 'exact', head: true })
    .eq('contactpersoon_id', contactpersoonId)
  if (!count) return undefined
  const res = await schrijfBouw7Contactpersoon(contactpersoonId, teSchrijven)
  if (res.geschreven.length > 0) await ontmarkeerHandmatig(supabase, 'contactpersonen', contactpersoonId, res.geschreven).catch(() => {})
  if (!res.ok) return `Opgeslagen in EVA, maar niet naar Bouw7: ${res.error}`
  if (res.nietOvergenomen.length > 0) return `Opgeslagen in EVA; Bouw7 nam niet over: ${res.nietOvergenomen.join(', ')}.`
  return undefined
}

export type ContactpersoonMetOrganisaties = Contactpersoon & {
  koppelingen: (ContactpersoonOrganisatie & {
    organisatie: Pick<Relatie, 'id' | 'naam' | 'types'>
  })[]
  /** Eén rij per Bouw7-contactpersoon; meerdere betekent: in Bouw7 staat deze mens vaker. */
  spiegels: ContactpersoonBouw7Koppeling[]
  /** Gevuld als je naar een samengevoegde rij kijkt: waar hij naartoe is gegaan. */
  samengevoegd_naar: { id: string; naam: string } | null
}

export async function getContactpersonenVoorOrganisatie(organisatie_id: string): Promise<(ContactpersoonOrganisatie & { contactpersoon: Contactpersoon })[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('contactpersoon_organisaties')
    .select('*, contactpersoon:contactpersonen(*)')
    .eq('organisatie_id', organisatie_id)
    .order('is_primair', { ascending: false })

  // Twee soorten rijen horen hier niet te staan. Samengevoegde: hun koppelingen zijn al verhuisd,
  // maar een handmatig teruggezette koppeling zou hem alsnog tonen. En inactieve: dat zijn mensen
  // die uit dienst zijn of, vaker, VvE's die ooit als "contactpersoon" onder hun beheerder waren
  // aangemaakt en in Bouw7 allang verwijderd zijn. Alle aanroepers van deze functie vragen
  // "wie kan ik hier aanspreken?" — de relatiekaart, de mailintake-kiezer, Nieuwe aanvraag en het
  // klantbeeld. In geen van die vier hoort een opgeruimde rij nog te verschijnen.
  return (data ?? []).filter((k: { contactpersoon?: { samengevoegd_in?: string | null; actief?: boolean | null } | null }) =>
    k.contactpersoon != null && !k.contactpersoon.samengevoegd_in && k.contactpersoon.actief !== false)
}

export async function getContactpersoonById(id: string): Promise<ContactpersoonMetOrganisaties | null> {
  const supabase = createAdminClient() as any
  const [cpRes, koppelingenRes, spiegelRes] = await Promise.all([
    supabase.from('contactpersonen').select('*').eq('id', id).single(),
    supabase
      .from('contactpersoon_organisaties')
      .select('*, organisatie:relaties(id, naam, types)')
      .eq('contactpersoon_id', id)
      .order('is_primair', { ascending: false }),
    supabase
      .from('contactpersoon_bouw7_koppelingen')
      .select('*')
      .eq('contactpersoon_id', id)
      .order('is_primair', { ascending: false }),
  ])

  if (!cpRes.data) return null
  const cp = cpRes.data as Contactpersoon

  // Kijk je naar een samengevoegde rij, dan hoort daar één ding te staan: waar hij nu leeft.
  let samengevoegd_naar: { id: string; naam: string } | null = null
  if (cp.samengevoegd_in) {
    const { data: naar } = await supabase
      .from('contactpersonen')
      .select('id, voornaam, tussenvoegsel, achternaam')
      .eq('id', cp.samengevoegd_in)
      .maybeSingle()
    if (naar) {
      samengevoegd_naar = {
        id: naar.id,
        naam: [naar.voornaam, naar.tussenvoegsel, naar.achternaam].filter(Boolean).join(' '),
      }
    }
  }

  return {
    ...cp,
    koppelingen: koppelingenRes.data ?? [],
    spiegels: spiegelRes.data ?? [],
    samengevoegd_naar,
  }
}

export async function getAlleContactpersonen(): Promise<(Contactpersoon & { organisaties: { naam: string; functie: string | null }[] })[]> {
  const supabase = createAdminClient() as any
  // Gepagineerd: beide tabellen zijn de 1000-rijengrens van PostgREST voorbij of naderen hem,
  // en een afkapping komt zonder foutmelding — dan mist een contactpersoon stil zijn organisatie.
  const koppelingen = await haalAlleRijen<{
    contactpersoon_id: string; functie: string | null; organisatie: { naam: string } | null
  }>((van, tot) => supabase
    .from('contactpersoon_organisaties')
    .select('contactpersoon_id, functie, organisatie:relaties(naam)')
    .order('id')
    .range(van, tot))

  // Samengevoegde rijen blijven bestaan als doorverwijzing, maar horen in geen enkele lijst.
  const personen = await haalAlleRijen<any>((van, tot) => supabase
    .from('contactpersonen')
    .select('*')
    .is('samengevoegd_in', null)
    .order('achternaam')
    .order('id')
    .range(van, tot))

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

    // Direct in Bouw7 aanmaken (best-effort) als de moederrelatie een Bouw7-id heeft.
    try {
      const { data: org } = await supabase.from('relaties').select('bouw7_id').eq('id', organisatie_id).single()
      const parentBouw7Id = org?.bouw7_id ? Number(org.bouw7_id) : null
      if (parentBouw7Id) {
        const { maakBouw7Contactpersoon } = await import('@/lib/bouw7/create-contact')
        const bouw7Id = await maakBouw7Contactpersoon(parentBouw7Id, {
          voornaam: input.voornaam,
          achternaam: input.achternaam,
          email: input.email,
          telefoon: input.telefoon,
          functie: functie ?? null,
          aanhef: input.aanhef,
        })
        if (bouw7Id) {
          const { legSpiegelVast } = await import('@/lib/bouw7/contactpersoon-spiegel')
          await legSpiegelVast({
            contactpersoonId: data.id,
            bouw7Id,
            bouw7ContactId: parentBouw7Id,
            organisatieId: organisatie_id,
          })
        }
      }
    } catch {
      // Bouw7 optioneel bij aanmaken; niet blokkerend.
    }
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
    kerstkaart?: boolean
  }
): Promise<ActionResult> {
  const supabase = createAdminClient() as any

  // Handmatig gewijzigde velden vastleggen; anders zet de Bouw7-sync ze terug.
  const gewijzigd = beschermdeVelden(patch, BOUW7_CONTACTPERSOON_VELDEN)
  let volledigePatch: Record<string, unknown> = patch
  if (gewijzigd.length > 0) {
    const { data } = await supabase
      .from('contactpersonen')
      .select('handmatige_velden')
      .eq('id', id)
      .single()
    volledigePatch = {
      ...patch,
      handmatige_velden: [...new Set([...(data?.handmatige_velden ?? []), ...gewijzigd])],
    }
  }

  const { error } = await supabase
    .from('contactpersonen')
    .update(volledigePatch)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  const waarschuwing = await schrijfContactpersoonNaarBouw7(
    supabase, id, Object.keys(patch).filter(k => (patch as Record<string, unknown>)[k] !== undefined),
  )
  revalidatePath(`/relaties/contactpersonen/${id}`)
  return { ok: true, waarschuwing }
}

/**
 * Koppel een bestaande persoon aan (nog) een organisatie.
 *
 * In EVA is dat één rij erbij. In Bouw7 kán dat niet: daar hangt een contactpersoon onder
 * precies één contact. Daarom maakt EVA daar een spiegel aan onder het tweede contact — Bouw7
 * houdt de duplicaten die het nodig heeft om de persoon op een document te kunnen zetten, en
 * EVA blijft één mens tonen. De spiegel wordt vastgelegd, dus de sync ziet het als bekend en
 * maakt er geen tweede EVA-persoon van.
 */
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

  let waarschuwing: string | undefined
  try {
    const [{ data: org }, { data: cp }, { data: bestaandeSpiegel }] = await Promise.all([
      supabase.from('relaties').select('bouw7_id').eq('id', organisatie_id).maybeSingle(),
      supabase.from('contactpersonen').select('voornaam, achternaam, email, telefoon, aanhef').eq('id', contactpersoon_id).maybeSingle(),
      supabase.from('contactpersoon_bouw7_koppelingen').select('id')
        .eq('contactpersoon_id', contactpersoon_id).eq('organisatie_id', organisatie_id).maybeSingle(),
    ])
    const parentBouw7Id = org?.bouw7_id ? Number(org.bouw7_id) : null
    if (parentBouw7Id && cp && !bestaandeSpiegel) {
      const { maakBouw7Contactpersoon } = await import('@/lib/bouw7/create-contact')
      const bouw7Id = await maakBouw7Contactpersoon(parentBouw7Id, {
        voornaam: cp.voornaam, achternaam: cp.achternaam,
        email: cp.email, telefoon: cp.telefoon, functie: functie ?? null, aanhef: cp.aanhef,
      })
      if (bouw7Id) {
        const { legSpiegelVast } = await import('@/lib/bouw7/contactpersoon-spiegel')
        await legSpiegelVast({ contactpersoonId: contactpersoon_id, bouw7Id, bouw7ContactId: parentBouw7Id, organisatieId: organisatie_id })
      } else {
        waarschuwing = 'Gekoppeld in EVA, maar Bouw7 wilde er geen contactpersoon voor aanmaken.'
      }
    }
  } catch {
    waarschuwing = 'Gekoppeld in EVA; de Bouw7-kant is niet gelukt.'
  }

  revalidatePath(`/relaties/contactpersonen/${contactpersoon_id}`)
  revalidatePath(`/relaties/${organisatie_id}`)
  return { ok: true, waarschuwing }
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

/**
 * Werk de koppeling tussen een persoon en één organisatie bij: functie, primair-vlag en de
 * zakelijke gegevens die bij déze werkgever horen. Dat laatste is wat één samengevoegde mens
 * bij twee bedrijven werkbaar maakt — bij bedrijf A een ander adres dan bij bedrijf B.
 */
export async function updateContactpersoonLink(
  link_id: string,
  contactpersoon_id: string,
  patch: {
    functie?: string | null
    is_primair?: boolean
    email?: string | null
    telefoon?: string | null
    mobiel?: string | null
  }
): Promise<ActionResult> {
  const supabase = createAdminClient() as any

  const { data: bestaand } = await supabase
    .from('contactpersoon_organisaties')
    .select('organisatie_id, handmatige_velden')
    .eq('id', link_id)
    .maybeSingle()

  // `email` en `telefoon` komen ook uit Bouw7 (de contactpersoon-rij van dít bedrijf); zodra
  // ze hier zijn gezet laat de sync ze staan. `mobiel` kent Bouw7 niet op dit niveau.
  const beschermd = (['email', 'telefoon'] as const).filter(k => patch[k] !== undefined)
  const update: Record<string, unknown> = { ...patch }
  if (patch.functie !== undefined) update.functie_handmatig = true
  if (beschermd.length > 0) {
    update.handmatige_velden = [...new Set([...(bestaand?.handmatige_velden ?? []), ...beschermd])]
  }

  const { error } = await supabase
    .from('contactpersoon_organisaties')
    .update(update)
    .eq('id', link_id)

  if (error) return { ok: false, error: error.message }
  // De functie ook naar Bouw7 (jobTitle), naar de spiegel van déze organisatie. Lukt dat, dan
  // zijn beide gelijk en mag de sync hem weer bijwerken; lukt het niet, dan blijft de
  // EVA-functie beschermd.
  let waarschuwing: string | undefined
  if (patch.functie !== undefined) {
    const res = await schrijfBouw7ContactpersoonFunctie(contactpersoon_id, patch.functie ?? null, bestaand?.organisatie_id ?? null)
    if (res.ok) await supabase.from('contactpersoon_organisaties').update({ functie_handmatig: false }).eq('id', link_id)
    else if (!/staat nog niet in Bouw7|hangt niet onder/.test(res.error)) waarschuwing = `Opgeslagen in EVA, maar niet naar Bouw7: ${res.error}`
  }
  revalidatePath(`/relaties/contactpersonen/${contactpersoon_id}`)
  if (bestaand?.organisatie_id) revalidatePath(`/relaties/${bestaand.organisatie_id}`)
  return { ok: true, waarschuwing }
}

export async function toggleContactpersoonActief(
  id: string,
  actief: boolean
): Promise<ActionResult> {
  const supabase = createAdminClient() as any

  // Een samengevoegde rij weer actief zetten zou hem terugbrengen in de zoekresultaten en
  // pickers, terwijl zijn gegevens elders staan. Eerst de samenvoeging terugdraaien.
  if (actief) {
    const { data } = await supabase.from('contactpersonen').select('samengevoegd_in').eq('id', id).maybeSingle()
    if (data?.samengevoegd_in) {
      return { ok: false, error: 'Deze contactpersoon is samengevoegd. Draai dat eerst terug via Relaties → Dubbelen.' }
    }
  }

  const { error } = await supabase
    .from('contactpersonen')
    .update({ actief })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/contactpersonen/${id}`)
  revalidatePath('/relaties')
  return { ok: true }
}
