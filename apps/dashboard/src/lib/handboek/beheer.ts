import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { Bijlage, Blok, Sectie } from './types'

/**
 * Lezen voor de beheerschermen.
 *
 * Anders dan `inhoud.ts` gebruikt dit de ADMIN-client: de beheerder moet ook de
 * concepten zien en alles wat voor hemzelf verborgen is. Zou dit met de
 * sessie-client lezen, dan filtert de RLS-policy het handboek op de kenmerken
 * van de beheerder — en dan kan iemand van kantoor de flextekst niet bewerken
 * omdat hij hem niet te zien krijgt.
 *
 * Elke aanroeper moet dus zelf achter `vereisHandboekBeheerPagina()` of
 * `vereisHandboekMutatie()` zitten; de database bewaakt hier niets.
 */

const SECTIE_KOLOMMEN =
  'id, slug, titel, samenvatting, icoon, volgorde, soort, status, zichtbaar_voor, verborgen_voor'
const BLOK_KOLOMMEN =
  'id, sectie_id, volgorde, type, inhoud, zoektekst, status, zichtbaar_voor, verborgen_voor'

export type BeheerBlok = Blok & { status: string }
// Niet SectieMetBlokken hergebruiken: daar zijn de blokken van het leestype
// zonder status, en juist die heeft het beheer nodig om concept van
// gepubliceerd te onderscheiden.
export type BeheerSectie = Sectie & { status: string; blokken: BeheerBlok[] }

/** De hele boom, inclusief concepten, in de volgorde waarin hij getoond wordt. */
export async function haalBeheerHandboek(): Promise<BeheerSectie[]> {
  const db = createAdminClient()

  const [{ data: secties }, { data: blokken }] = await Promise.all([
    db.from('personeelshandboek_secties').select(SECTIE_KOLOMMEN)
      .neq('status', 'gearchiveerd').order('soort').order('volgorde').limit(500),
    db.from('personeelshandboek_blokken').select(BLOK_KOLOMMEN)
      .order('sectie_id').order('volgorde').limit(2000),
  ])

  const perSectie = new Map<string, BeheerBlok[]>()
  for (const b of (blokken ?? []) as unknown as BeheerBlok[]) {
    const lijst = perSectie.get(b.sectie_id)
    if (lijst) lijst.push(b)
    else perSectie.set(b.sectie_id, [b])
  }

  return ((secties ?? []) as unknown as (Sectie & { status: string })[]).map((s) => ({
    ...s,
    blokken: perSectie.get(s.id) ?? [],
  }))
}

/** Eén sectie met blokken, of null. */
export async function haalBeheerSectie(id: string): Promise<BeheerSectie | null> {
  const db = createAdminClient()

  const { data: sectie } = await db
    .from('personeelshandboek_secties').select(SECTIE_KOLOMMEN).eq('id', id).maybeSingle()
  if (!sectie) return null

  const { data: blokken } = await db
    .from('personeelshandboek_blokken').select(BLOK_KOLOMMEN)
    .eq('sectie_id', id).order('volgorde').limit(500)

  return {
    ...(sectie as unknown as Sectie & { status: string }),
    blokken: (blokken ?? []) as unknown as BeheerBlok[],
  }
}

/** Alle bijlagen, inclusief concept en gearchiveerd. */
export async function haalBeheerBijlagen(): Promise<(Bijlage & { status: string })[]> {
  const { data } = await createAdminClient()
    .from('personeelshandboek_bijlagen')
    .select('id, sectie_id, titel, omschrijving, bestandsnaam, mimetype, grootte, volgorde, status, zichtbaar_voor, verborgen_voor')
    .order('volgorde')
    .limit(200)
  return (data ?? []) as unknown as (Bijlage & { status: string })[]
}

/** Werkmaatschappijen, voor de kenmerkenkiezer. */
export async function haalWerkmaatschappijKenmerken(): Promise<{ key: string; label: string }[]> {
  const { data } = await createAdminClient()
    .from('bedrijfsgegevens')
    .select('naam, code')
    .eq('type', 'werkmaatschappij')
    .not('code', 'is', null)
    .order('naam')

  return (data ?? []).map((w) => ({
    key: `werkmaatschappij:${w.code}`,
    label: w.naam ?? String(w.code),
  }))
}

/**
 * De contacten achter de belknoppen, met het nummer erbij zodat het beheer ziet
 * of de knop iets doet.
 *
 * `medewerkers` staat achter de RLS-muur, dus ook dit gaat via de admin-client —
 * en de aanroeper zit al achter een beheer-gate.
 */
export type BeheerContact = {
  id: string
  rol: string
  medewerker_id: string | null
  telefoon_override: string | null
  volgorde: number
  zichtbaar_voor: string[]
  verborgen_voor: string[]
  /** Naam van de gekoppelde medewerker, als die er is. */
  medewerker_naam: string | null
  /** Het nummer dat de knop straks belt; null betekent: de knop verschijnt niet. */
  nummer: string | null
}

export async function haalBeheerContacten(): Promise<BeheerContact[]> {
  const db = createAdminClient()

  const { data: rijen } = await db
    .from('personeelshandboek_contacten')
    .select('id, rol, medewerker_id, telefoon_override, volgorde, zichtbaar_voor, verborgen_voor')
    .order('volgorde')
    .limit(200)

  const contacten = (rijen ?? []) as unknown as Omit<BeheerContact, 'medewerker_naam' | 'nummer'>[]
  const ids = contacten.map((c) => c.medewerker_id).filter((x): x is string => !!x)

  const perMedewerker = new Map<string, { naam: string; nummer: string | null }>()
  if (ids.length) {
    const { data } = await db
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam, mobiel, telefoon')
      .in('id', ids)
    for (const m of data ?? []) {
      perMedewerker.set(m.id, {
        naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
        // mobiel is bij de meesten leeg en het 06-nummer staat in telefoon.
        nummer: m.mobiel || m.telefoon || null,
      })
    }
  }

  return contacten.map((c) => {
    const mdw = c.medewerker_id ? perMedewerker.get(c.medewerker_id) : undefined
    return {
      ...c,
      medewerker_naam: mdw?.naam ?? null,
      nummer: c.telefoon_override || mdw?.nummer || null,
    }
  })
}

/** Actieve medewerkers om als contact te kunnen kiezen. */
export async function haalKiesbareMedewerkers(): Promise<{ id: string; naam: string; nummer: string | null }[]> {
  const { data } = await createAdminClient()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, mobiel, telefoon')
    .eq('actief', true)
    .order('achternaam')
    .limit(500)

  return (data ?? []).map((m) => ({
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
    nummer: m.mobiel || m.telefoon || null,
  }))
}

/**
 * Hoeveel actieve medewerkers voldoen aan een kenmerkenset?
 *
 * Dit getal staat onder elke zichtbaarheidsregel in het beheer. Zonder dat
 * getal is een fout onzichtbaar voor degene die hem maakt: "0 van de 46" laat
 * meteen zien dat iemand twee elkaar uitsluitende kenmerken heeft aangevinkt.
 *
 * De regel wordt hier in TypeScript nagerekend en staat dus naast
 * `handboek_kenmerken()` in de database. Dat is bewust: de database kan het
 * alleen voor de ingelogde gebruiker uitrekenen, niet voor de hele populatie.
 * Loopt dit ooit uit de pas, dan klopt hooguit het telletje niet — nooit de
 * echte zichtbaarheid, want die blijft de policy.
 */
// Platte arrays en geen Set: dit gaat als prop naar een client-component, en
// een Set overleeft de server/client-grens niet.
export type Populatie = { kenmerken: string[]; aantal: number }[]

export async function haalPopulatie(): Promise<{ groepen: Populatie; totaal: number }> {
  const db = createAdminClient()

  const [{ data: medewerkers }, { data: bestuurders }] = await Promise.all([
    db.from('medewerkers')
      .select('id, extern, afdeling, werkmaatschappij_id')
      .eq('actief', true)
      .limit(1000),
    db.from('voertuig_bestuurders').select('medewerker_id, ulu_user_id').is('eind_datum', null).limit(1000),
  ])

  const { data: ulu } = await db.from('ulu_users').select('id, medewerker_id').limit(1000)
  const uluNaarMedewerker = new Map<number, string>()
  for (const u of ulu ?? []) if (u.medewerker_id) uluNaarMedewerker.set(u.id, u.medewerker_id)

  const metVoertuig = new Set<string>()
  for (const vb of bestuurders ?? []) {
    if (vb.medewerker_id) metVoertuig.add(vb.medewerker_id)
    const via = vb.ulu_user_id != null ? uluNaarMedewerker.get(vb.ulu_user_id) : undefined
    if (via) metVoertuig.add(via)
  }

  const { data: wm } = await db.from('bedrijfsgegevens').select('id, code').limit(50)
  const wmCode = new Map<string, string>()
  for (const w of wm ?? []) if (w.code) wmCode.set(w.id, w.code)

  const groepen = new Map<string, { kenmerken: string[]; aantal: number }>()
  for (const m of medewerkers ?? []) {
    const opDeBouw = m.afdeling === 'Uitvoering'
    const k = new Set<string>()
    if (m.extern && opDeBouw) k.add('extern')
    else k.add('intern')
    if (!opDeBouw) k.add('kantoor')
    if (metVoertuig.has(m.id)) k.add('voertuig')
    const code = m.werkmaatschappij_id ? wmCode.get(m.werkmaatschappij_id) : undefined
    if (code) k.add(`werkmaatschappij:${code}`)

    const sleutel = [...k].sort().join('|')
    const bestaand = groepen.get(sleutel)
    if (bestaand) bestaand.aantal++
    else groepen.set(sleutel, { kenmerken: [...k], aantal: 1 })
  }

  return {
    groepen: [...groepen.values()],
    totaal: (medewerkers ?? []).length,
  }
}
