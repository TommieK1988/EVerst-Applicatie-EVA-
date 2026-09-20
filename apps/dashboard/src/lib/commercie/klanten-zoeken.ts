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

export type KlantTreffer = {
  id: string
  naam: string
  plaats: string | null
  /** Gevuld als de treffer via een contactpersoon binnenkwam: "via Jan de Vries". */
  viaContactpersoon: string | null
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

  // Ruimer ophalen dan `limiet`: de twee kanten overlappen vaak (je vindt dezelfde klant via
  // de naam én via een contactpersoon), en na het samenvoegen wil je nog steeds een volle lijst.
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

  /** Naam van de contactpersoon per id; dubbele treffers vallen vanzelf samen. */
  const cpNaamPerId = new Map<string, string>()
  for (const res of [cpVoornaam, cpAchternaam, cpEmail]) {
    for (const c of (res.data ?? [])) {
      const naam = [c.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' ').trim()
      if (naam) cpNaamPerId.set(c.id, naam)
    }
  }

  // De organisaties waar die contactpersonen aan hangen. `.in()` op de gevonden ids, dus
  // begrensd; zonder treffers slaan we de query over.
  const cpIds = [...cpNaamPerId.keys()]
  const viaContactpersoon = new Map<string, string>()
  if (cpIds.length > 0) {
    const { data: koppelingen } = await supabase
      .from('contactpersoon_organisaties')
      .select('contactpersoon_id, organisatie_id')
      .in('contactpersoon_id', cpIds)
    for (const k of (koppelingen ?? [])) {
      // Eerste wint: hangen twee gevonden personen aan dezelfde klant, dan noemen we er één.
      if (!viaContactpersoon.has(k.organisatie_id)) {
        const naam = cpNaamPerId.get(k.contactpersoon_id)
        if (naam) viaContactpersoon.set(k.organisatie_id, naam)
      }
    }
  }

  const viaIds = [...viaContactpersoon.keys()]
  const relatiesViaCp = viaIds.length > 0
    ? await supabase.from('relaties').select('id, naam, adres_plaats, types')
        .in('id', viaIds).eq('actief', true).limit(ruim)
    : { data: [] as RelatieRij[] }

  // Samenvoegen. Directe naamtreffers eerst: wie de bedrijfsnaam intypt bedoelt dat bedrijf,
  // niet de klant waar toevallig een gelijknamige contactpersoon werkt.
  const gezien = new Set<string>()
  const treffers: KlantTreffer[] = []
  const voegToe = (rijen: RelatieRij[] | null, viaCp: boolean) => {
    for (const r of (rijen ?? [])) {
      if (gezien.has(r.id)) continue
      // Alleen opdrachtgevers; een relatie kan meerdere types hebben.
      if (!r.types?.includes('opdrachtgever')) continue
      gezien.add(r.id)
      treffers.push({
        id: r.id,
        naam: r.naam,
        plaats: r.adres_plaats,
        viaContactpersoon: viaCp ? (viaContactpersoon.get(r.id) ?? null) : null,
      })
    }
  }
  voegToe(opNaam.data as RelatieRij[] | null, false)
  voegToe(relatiesViaCp.data as RelatieRij[] | null, true)
  voegToe(opPlaats.data as RelatieRij[] | null, false)

  return treffers.slice(0, limiet)
}
