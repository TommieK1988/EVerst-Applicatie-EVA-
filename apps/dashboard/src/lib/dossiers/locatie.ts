'use server'

import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { isActiefDossier, type DossierActiefVelden } from '@/lib/dossiers/actief'
import { dossierStatusBadge } from '@/components/mobiel/dossier-status'

/**
 * "Dossier openen op locatie" (mobiele buitendienst).
 *
 * Match de GPS-positie van de telefoon tegen de werkadres-coördinaten van de
 * dossiers waaraan de ingelogde medewerker gekoppeld is (rol-kolommen). Bewust
 * gescoped op de eigen dossiers: op locatie is dat het dossier waar je moet
 * zijn, en het voorkomt dat een dossier van een collega opengaat.
 *
 * Coördinaten komen uit de geocode-batch (lib/dossiers/geocode.ts); dossiers
 * zonder geslaagde geocode doen niet mee.
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

/** Haversine-afstand in meters tussen twee lat/lng-punten. */
function afstandMeter(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const SELECT = `
  id, dossiernummer, titel, hoofdstatus,
  aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus,
  gearchiveerd, werkadres_postcode, werkadres_huisnummer, adres_lat, adres_lng,
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
  const { data, error } = await supabase
    .from('dossiers')
    .select(SELECT)
    .or(ROL_KOLOMMEN.map((k) => `${k}.eq.${medewerker.id}`).join(','))
    .not('adres_lat', 'is', null)
    .not('adres_lng', 'is', null)

  if (error) return { status: 'onbekend' }

  type Rij = DossierActiefVelden & {
    id: string
    titel: string
    dossiernummer: string | null
    werkadres_postcode: string | null
    werkadres_huisnummer: string | null
    adres_lat: number | null
    adres_lng: number | null
    relaties?: { naam?: string | null } | null
  }

  // Binnen de straal + alleen actieve dossiers.
  const dichtbij: Array<{ rij: Rij; afstand: number }> = []
  for (const rij of (data ?? []) as Rij[]) {
    if (rij.adres_lat == null || rij.adres_lng == null) continue
    if (!isActiefDossier(rij)) continue
    const afstand = afstandMeter(lat, lng, rij.adres_lat, rij.adres_lng)
    if (afstand <= RADIUS_M) dichtbij.push({ rij, afstand })
  }
  if (dichtbij.length === 0) return { status: 'geen' }

  // Groepeer op adres-sleutel (postcode + huisnummer); zo blijven buurpanden
  // die toevallig binnen de straal vallen aparte plekken. Zonder adresvelden
  // valt de sleutel terug op afgeronde coördinaten (~11 m).
  const sleutel = (r: Rij): string => {
    const pc = (r.werkadres_postcode ?? '').replace(/\s+/g, '').toLowerCase()
    const hn = (r.werkadres_huisnummer ?? '').replace(/\s+/g, '').toLowerCase()
    if (pc && hn) return `${pc}|${hn}`
    return `geo:${r.adres_lat!.toFixed(4)},${r.adres_lng!.toFixed(4)}`
  }

  const groepen = new Map<string, { items: typeof dichtbij; minAfstand: number }>()
  for (const d of dichtbij) {
    const key = sleutel(d.rij)
    const g = groepen.get(key)
    if (g) {
      g.items.push(d)
      g.minAfstand = Math.min(g.minAfstand, d.afstand)
    } else {
      groepen.set(key, { items: [d], minAfstand: d.afstand })
    }
  }

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

  const items = dichtstbij.items.sort((a, b) => a.afstand - b.afstand)
  if (items.length === 1) return { status: 'een', dossier: toDossier(items[0]) }
  return { status: 'meerdere', dossiers: items.map(toDossier) }
}
