'use server'

import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { isActiefDossier, type DossierActiefVelden } from '@/lib/dossiers/actief'
import { dossierStatusBadge } from '@/components/mobiel/dossier-status'
import { afstandMeter } from '@/lib/geo/afstand'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { extraWerkadressenVan } from './werkadressen-data'
import { werkpuntenVan } from './werkpunten'

/**
 * "Dossier openen op locatie" (mobiele buitendienst).
 *
 * Match de GPS-positie van de telefoon tegen de werkadres-coördinaten van de
 * dossiers waaraan de ingelogde medewerker gekoppeld is (rol-kolommen). Bewust
 * gescoped op de eigen dossiers: op locatie is dat het dossier waar je moet
 * zijn, en het voorkomt dat een dossier van een collega opengaat.
 *
 * Coördinaten komen uit de geocode-batch (lib/dossiers/geocode.ts); dossiers
 * zonder geslaagde geocode doen niet mee. Een dossier met extra werkadressen
 * (geclusterde opdracht) telt op elk van die adressen.
 */

/** Straal waarbinnen een dossier als "hier" telt. Telefoon-GPS drift ~5–20 m. */
const RADIUS_M = 100

/** Rol-kolommen waarop een dossier aan een medewerker gekoppeld kan zijn.
 *  Spiegelt DOSSIER_ROL_KOLOMMEN in lib/dossiers/actions.ts (kan daar niet
 *  geëxporteerd worden — dat is een 'use server'-module). */
const ROL_KOLOMMEN = [
  'project_manager_id',
  'teamleider_id',
  'werkvoorbereider_id',
  'calculator_id',
  'uitvoerder_id',
  'controller_id',
] as const

export type LocatieDossier = {
  id: string
  titel: string
  dossiernummer: string | null
  klant_naam: string | null
  statusLabel: string
  statusColor: string
  afstand_m: number
}

export type LocatieResultaat =
  | { status: 'geen' }
  | { status: 'een'; dossier: LocatieDossier }
  | { status: 'meerdere'; dossiers: LocatieDossier[] }
  | { status: 'onbekend' }

const SELECT = `
  id, dossiernummer, titel, hoofdstatus,
  aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus,
  gearchiveerd, werkadres_straat, werkadres_postcode, werkadres_huisnummer, werkadres_stad, adres_lat, adres_lng,
  relaties!klant_id ( naam )
`

/**
 * Bepaalt welk dossier bij de meegegeven GPS-positie hoort.
 * - `een`      → precies één dossier op de dichtstbijzijnde plek: direct openen.
 * - `meerdere` → meerdere gekoppelde dossiers op diezelfde plek: keuzelijst.
 * - `geen`     → niets binnen de straal.
 * - `onbekend` → geen medewerker-koppeling of fout.
 */
export async function dossierBijLocatie(lat: number, lng: number): Promise<LocatieResultaat> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'onbekend' }

  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return { status: 'onbekend' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  // Gepagineerd: een projectleider kan over de jaren meer dan 1000 dossiers hebben. Bewust zonder
  // coördinaten-filter — een dossier kan alleen via een extra werkadres een locatie hebben.
  let data: unknown[]
  try {
    data = await haalAlleRijen<unknown>((van, tot) =>
      supabase
        .from('dossiers')
        .select(SELECT)
        .or(ROL_KOLOMMEN.map((k) => `${k}.eq.${medewerker.id}`).join(','))
        .eq('gearchiveerd', false)
        .order('id')
        .range(van, tot),
    )
  } catch {
    return { status: 'onbekend' }
  }

  type Rij = DossierActiefVelden & {
    id: string
    titel: string
    dossiernummer: string | null
    werkadres_straat: string | null
    werkadres_postcode: string | null
    werkadres_huisnummer: string | null
    werkadres_stad: string | null
    adres_lat: number | null
    adres_lng: number | null
    relaties?: { naam?: string | null } | null
  }

  const actief = (data as Rij[]).filter((r) => isActiefDossier(r))
  const extra = await extraWerkadressenVan(actief.map((r) => r.id))

  // Elk werkadres (hoofd + extra) binnen de straal is een treffer. Groepeer op
  // adres-sleutel (postcode + huisnummer); zo blijven buurpanden die toevallig
  // binnen de straal vallen aparte plekken. Zonder adresvelden valt de sleutel
  // terug op afgeronde coördinaten (~11 m).
  type Treffer = { rij: Rij; afstand: number }
  const groepen = new Map<string, { items: Map<string, Treffer>; minAfstand: number }>()
  for (const rij of actief) {
    for (const punt of werkpuntenVan(rij, extra.get(rij.id) ?? [])) {
      const afstand = afstandMeter(lat, lng, punt.lat, punt.lng)
      if (afstand > RADIUS_M) continue
      const key = punt.sleutel ?? `geo:${punt.lat.toFixed(4)},${punt.lng.toFixed(4)}`
      const g = groepen.get(key) ?? { items: new Map<string, Treffer>(), minAfstand: afstand }
      g.minAfstand = Math.min(g.minAfstand, afstand)
      // Hetzelfde dossier twee keer op één plek telt één keer, met de kleinste afstand.
      const eerder = g.items.get(rij.id)
      if (!eerder || afstand < eerder.afstand) g.items.set(rij.id, { rij, afstand })
      groepen.set(key, g)
    }
  }
  if (groepen.size === 0) return { status: 'geen' }

  // Dichtstbijzijnde plek wint.
  const dichtstbij = [...groepen.values()].sort((a, b) => a.minAfstand - b.minAfstand)[0]

  const toDossier = ({ rij, afstand }: { rij: Rij; afstand: number }): LocatieDossier => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { label, color } = dossierStatusBadge(rij as any)
    return {
      id: rij.id,
      titel: rij.titel,
      dossiernummer: rij.dossiernummer ?? null,
      klant_naam: rij.relaties?.naam ?? null,
      statusLabel: label,
      statusColor: color,
      afstand_m: Math.round(afstand),
    }
  }

  const items = [...dichtstbij.items.values()].sort((a, b) => a.afstand - b.afstand)
  if (items.length === 1) return { status: 'een', dossier: toDossier(items[0]) }
  return { status: 'meerdere', dossiers: items.map(toDossier) }
}
