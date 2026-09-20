import 'server-only'

/**
 * Opdrachtgever zoeken voor de mobiele module Commercieel.
 *
 * Zoekt langs twee kanten en voegt ze samen: de organisatienaam/plaats, én de naam of het
 * e-mailadres van een contactpersoon. Dat tweede is geen luxe — aan de telefoon ken je vaak
 * wél de persoon en niet de precieze bedrijfsnaam ("die Jan van dat VvE-kantoor").
 *
 * Bewust een eigen functie en niet `zoekRelaties` uit `lib/dossiers/actions.ts`. Die heeft
 * geen rechtencheck (terwijl het een `'use server'`-export is), escapet de ilike-jokers niet,
 * en bouwt één `.or()`-string waarin een komma of haakje in de zoekterm de PostgREST-filter
 * breekt. Hier dus losse `.ilike()`-queries, net als `lib/materieel/zoeken.ts`.
 *
 * Alleen opdrachtgevers: je gaat geen commercieel gesprek voeren met je eigen leverancier.
 * De inkoopkant heeft zijn eigen schermen.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'

/**
 * Eén zoekresultaat. Twee soorten, want je zoekt twee dingen: een bedrijf ("KesslerPerspektief")
 * of een persoon ("Jan de Vries"). Ze landen op verschillende schermen — een organisatie op het
 * klantbeeld, een persoon op zijn eigen kaart — dus ze moeten uit elkaar te houden zijn.
 */
export type KlantTreffer = {
  /** Organisatie: de relatie-id. Contactpersoon: de contactpersoon-id. */
  id: string
  soort: 'organisatie' | 'contactpersoon'
  naam: string
  /** Organisatie: de plaats. Contactpersoon: waar hij werkt, en in welke functie. */
  onder: string | null
}

/** Vanaf hier zoeken we pas; korter levert de halve kaartenbak op. */
export const MIN_ZOEKLENGTE = 2

/** `%`, `_` en `\` zijn jokers in ilike en moeten letterlijk gezocht worden. */
function escapeIlike(waarde: string): string {
  return waarde.replace(/[\\%_]/g, (t) => `\\${t}`)
}

type RelatieRij = { id: string; naam: string; adres_plaats: string | null; types: string[] }

/**
 * Zoek opdrachtgevers op naam of via hun contactpersonen.
 *
 * Alle queries zijn begrensd met `.limit()`, dus de stille PostgREST-afkapping op 1000 rijen
 * kan hier niet toeslaan. De aantallen zijn ook klein: 285 opdrachtgevers en 350
 * contactpersonen.
 */
export async function zoekKlanten(term: string, limiet = 20): Promise<KlantTreffer[]> {
  const schoon = term.trim()
  if (schoon.length < MIN_ZOEKLENGTE) return []

  try {
    await vereisRecht('relaties', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return []
    throw e
  }

  const supabase = createAdminClient()
  const patroon = `%${escapeIlike(schoon)}%`

  // Ruimer ophalen dan `limiet`: na het filteren op opdrachtgever en het samenvoegen van de
  // drie contactpersoon-queries wil je nog steeds een volle lijst overhouden.
  const ruim = limiet * 2

  const [opNaam, opPlaats, cpVoornaam, cpAchternaam, cpEmail] = await Promise.all([
    supabase.from('relaties').select('id, naam, adres_plaats, types')
      .ilike('naam', patroon).eq('actief', true).order('naam').limit(ruim),
    supabase.from('relaties').select('id, naam, adres_plaats, types')
      .ilike('adres_plaats', patroon).eq('actief', true).order('naam').limit(ruim),
    supabase.from('contactpersonen').select('id, voornaam, tussenvoegsel, achternaam')
      .ilike('voornaam', patroon).eq('actief', true).limit(ruim),
    supabase.from('contactpersonen').select('id, voornaam, tussenvoegsel, achternaam')
      .ilike('achternaam', patroon).eq('actief', true).limit(ruim),
    supabase.from('contactpersonen').select('id, voornaam, tussenvoegsel, achternaam')
      .ilike('email', patroon).eq('actief', true).limit(ruim),
  ])

  /** Naam per contactpersoon-id; de drie queries overlappen en vallen hier samen. */
  const cpNaamPerId = new Map<string, string>()
  for (const res of [cpVoornaam, cpAchternaam, cpEmail]) {
    for (const c of (res.data ?? [])) {
      const naam = [c.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' ').trim()
      if (naam) cpNaamPerId.set(c.id, naam)
    }
  }

  /**
   * Waar de gevonden personen werken. Nodig om twee redenen: een contactpersoon zonder
   * opdrachtgever hoort niet in deze module thuis (dat kan de contactpersoon van een
   * leverancier zijn), en de organisatienaam is wat een treffer herkenbaar maakt — "Jan de
   * Vries" alleen zegt niets als er drie Jannen zijn.
   */
  const cpIds = [...cpNaamPerId.keys()]
  const werkgevers = new Map<string, { naam: string; functie: string | null }[]>()
  if (cpIds.length > 0) {
    const { data: koppelingen } = await supabase
      .from('contactpersoon_organisaties')
      .select('contactpersoon_id, functie, relaties(naam, types)')
      .in('contactpersoon_id', cpIds)
    type Koppel = {
      contactpersoon_id: string
      functie: string | null
      relaties: { naam: string; types: string[] } | null
    }
    for (const k of ((koppelingen ?? []) as unknown as Koppel[])) {
      if (!k.relaties?.types?.includes('opdrachtgever')) continue
      const lijst = werkgevers.get(k.contactpersoon_id) ?? []
      lijst.push({ naam: k.relaties.naam, functie: k.functie })
      werkgevers.set(k.contactpersoon_id, lijst)
    }
  }

  const gezien = new Set<string>()
  const organisaties: KlantTreffer[] = []
  const personen: KlantTreffer[] = []

  const voegOrganisaties = (rijen: RelatieRij[] | null) => {
    for (const r of (rijen ?? [])) {
      if (gezien.has(r.id)) continue
      // Alleen opdrachtgevers; een relatie kan meerdere types tegelijk hebben.
      if (!r.types?.includes('opdrachtgever')) continue
      gezien.add(r.id)
      organisaties.push({
        id: r.id, soort: 'organisatie', naam: r.naam, onder: r.adres_plaats,
      })
    }
  }

  voegOrganisaties(opNaam.data as RelatieRij[] | null)
  voegOrganisaties(opPlaats.data as RelatieRij[] | null)

  for (const [id, naam] of cpNaamPerId) {
    const bij = werkgevers.get(id)
    if (!bij || bij.length === 0) continue
    const eerste = bij[0]
    // "Technisch beheerder bij KesslerPerspektief"; hangt hij aan meer organisaties, dan
    // zegt "+1" dat er meer is zonder de regel te laten overlopen.
    const rol = eerste.functie?.trim() ? `${eerste.functie.trim()} bij ` : ''
    const meer = bij.length > 1 ? ` +${bij.length - 1}` : ''
    personen.push({ id, soort: 'contactpersoon', naam, onder: `${rol}${eerste.naam}${meer}` })
  }
  personen.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))

  // Organisaties eerst: wie een bedrijfsnaam intypt bedoelt dat bedrijf, niet de persoon die
  // daar toevallig zo heet.
  return [...organisaties, ...personen].slice(0, limiet)
}
