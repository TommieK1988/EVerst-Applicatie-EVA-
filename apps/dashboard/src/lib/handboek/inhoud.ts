import 'server-only'
import { cache } from 'react'
import { createClient, createAdminClient } from '@everts/database/server'
import type {
  Bijlage, Blok, Contact, Sectie, SectieMetBlokken, ZoekRegel,
} from './types'

/**
 * Lezen van handboek-inhoud.
 *
 * UITZONDERING OP DE /m-REGEL: deze module leest met de SESSIE-client, niet met
 * de admin-client. Elders op /m moet dat wél, omdat vrijwel elke tabel achter
 * `is_platform_gebruiker()` zit en een app-gebruiker daar nul rijen krijgt. De
 * handboek-tabellen hebben hun eigen policies (migratie 20260914b) die precies
 * de zichtbaarheidsregel afdwingen.
 *
 * Dat is hier geen detail maar het hele punt: als we met de service-role zouden
 * lezen en daarna in TypeScript filteren, bestaat de regel op twee plekken en
 * lekt een fout in de tweede de interne tekst naar een flexkracht. Nu geldt:
 * wat de database niet teruggeeft, kan de pagina niet tonen.
 */

const SECTIE_KOLOMMEN =
  'id, slug, titel, samenvatting, icoon, volgorde, soort, zichtbaar_voor, verborgen_voor'
const BLOK_KOLOMMEN =
  'id, sectie_id, volgorde, type, inhoud, zoektekst, zichtbaar_voor, verborgen_voor'

/**
 * Alle zichtbare secties mét hun blokken.
 *
 * Bewust twee queries en geen genest select: PostgREST past het rijlimiet toe
 * op de buitenste rijen, en geneste kinderen tellen daar niet los in mee — dan
 * zou een hoofdstuk stilletjes een paar alinea's kunnen missen. Twee platte
 * queries met een expliciete grens zijn hier eerlijker. Het handboek is met
 * ~20 secties en ~160 blokken ruim onder de 1000-rijengrens van PostgREST; de
 * `.limit()` staat er als vangnet voor de dag dat dat niet meer waar is.
 */
export const haalHandboek = cache(async (): Promise<SectieMetBlokken[]> => {
  const supabase = await createClient()

  const [{ data: secties }, { data: blokken }] = await Promise.all([
    supabase
      .from('personeelshandboek_secties')
      .select(SECTIE_KOLOMMEN)
      .order('soort')
      .order('volgorde')
      .limit(500),
    supabase
      .from('personeelshandboek_blokken')
      .select(BLOK_KOLOMMEN)
      .order('sectie_id')
      .order('volgorde')
      .limit(900),
  ])

  const perSectie = new Map<string, Blok[]>()
  for (const b of (blokken ?? []) as unknown as Blok[]) {
    const lijst = perSectie.get(b.sectie_id)
    if (lijst) lijst.push(b)
    else perSectie.set(b.sectie_id, [b])
  }

  return ((secties ?? []) as unknown as Sectie[]).map((s) => ({
    ...s,
    blokken: perSectie.get(s.id) ?? [],
  }))
})

/** Alleen de hoofdstukken, in volgorde. */
export async function haalHoofdstukken(): Promise<SectieMetBlokken[]> {
  return (await haalHandboek()).filter((s) => s.soort === 'hoofdstuk')
}

/** Alleen de "Wat te doen bij…"-situaties, in volgorde. */
export async function haalSituaties(): Promise<SectieMetBlokken[]> {
  return (await haalHandboek()).filter((s) => s.soort === 'situatie')
}

/** Eén sectie op slug, of null als hij niet bestaat óf niet voor jou zichtbaar is. */
export async function haalSectie(slug: string): Promise<SectieMetBlokken | null> {
  return (await haalHandboek()).find((s) => s.slug === slug) ?? null
}

/**
 * Zoekindex van alles wat déze lezer mag zien.
 *
 * Koppen en het eerste blok van een hoofdstuk wegen zwaarder: die dragen het
 * onderwerp. Blokken zonder tekst (een losse afbeelding) doen niet mee.
 */
export async function haalZoekIndex(): Promise<ZoekRegel[]> {
  const secties = await haalHandboek()
  const index: ZoekRegel[] = []
  for (const s of secties) {
    for (const b of s.blokken) {
      const tekst = b.zoektekst?.trim()
      if (!tekst) continue
      index.push({
        sectieSlug: s.slug,
        sectieTitel: s.titel,
        sectieSoort: s.soort,
        blokId: b.id,
        tekst,
        gewicht: b.type === 'kop' ? 3 : b.type === 'stap' ? 2 : 1,
      })
    }
  }
  return index
}

/** Zichtbare bijlagen, optioneel beperkt tot één sectie. */
export async function haalBijlagen(sectieId?: string): Promise<Bijlage[]> {
  const supabase = await createClient()
  let query = supabase
    .from('personeelshandboek_bijlagen')
    .select('id, sectie_id, titel, omschrijving, bestandsnaam, mimetype, grootte, volgorde, zichtbaar_voor, verborgen_voor')
    .order('volgorde')
    .limit(200)
  if (sectieId) query = query.eq('sectie_id', sectieId)
  const { data } = await query
  return (data ?? []) as unknown as Bijlage[]
}

/**
 * Contacten met een uitgerekend telefoonnummer.
 *
 * De nummers komen uit `medewerkers`, en die tabel staat achter de
 * `is_platform_gebruiker()`-muur — een monteur leest daar met zijn eigen sessie
 * niets. Daarom hier wél de admin-client, maar strikt beperkt: alleen de
 * medewerkers die in een zichtbaar contact staan, en alleen naam + nummer.
 * Welke contacten zichtbaar zijn, heeft RLS hierboven al bepaald.
 *
 * `mobiel` is bij de meeste medewerkers leeg en het 06-nummer staat in
 * `telefoon`; vandaar de terugval.
 */
export async function haalContacten(): Promise<Contact[]> {
  const supabase = await createClient()
  const { data: rijen } = await supabase
    .from('personeelshandboek_contacten')
    .select('id, rol, medewerker_id, telefoon_override')
    .order('volgorde')
    .limit(100)

  const contacten = (rijen ?? []) as {
    id: string; rol: string; medewerker_id: string | null; telefoon_override: string | null
  }[]
  const ids = contacten.map((c) => c.medewerker_id).filter((x): x is string => !!x)

  const namen = new Map<string, { naam: string; nummer: string | null }>()
  if (ids.length) {
    const { data } = await createAdminClient()
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam, mobiel, telefoon')
      .in('id', ids)
      .eq('actief', true)
    for (const m of data ?? []) {
      namen.set(m.id, {
        naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
        nummer: m.mobiel || m.telefoon || null,
      })
    }
  }

  return contacten.map((c) => {
    const mdw = c.medewerker_id ? namen.get(c.medewerker_id) : undefined
    return {
      id: c.id,
      rol: c.rol,
      naam: mdw?.naam ?? null,
      nummer: c.telefoon_override || mdw?.nummer || null,
    }
  })
}
