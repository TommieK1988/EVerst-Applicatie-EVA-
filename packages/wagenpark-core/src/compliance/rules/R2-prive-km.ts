/**
 * R2 — Privé-km per jaar per **bestuurder**.
 *
 * Bijtelling staat alleen op ulu_users (bestuurder-niveau). Trips zonder
 * user_id_ulu of zonder bekende ulu_user worden overgeslagen.
 *
 * R2a: Mét bijtelling
 *   - waarschuwing boven drempel_config.prive_km_waarschuwing (default 8000)
 *   - overtreding boven drempel_config.prive_km_overtreding (default 10000)
 *
 * R2b: Zonder bijtelling
 *   - overtreding boven drempel_config.prive_km_overtreding (default 500)
 */

import type { ComplianceBevindingInput, UluTrip, Voertuig } from '../../types'
import type { RuleModule, UluUserInfo } from '../types'

type GroupKey = string

type KmBreakdown = {
  weekend_km: number
  weekend_ritten: number
  avond_km: number
  avond_ritten: number
  nacht_km: number
  nacht_ritten: number
  vroeg_km: number
  vroeg_ritten: number
}

type GroupTotals = {
  key: GroupKey
  user: UluUserInfo
  voertuig_id?: string
  voertuig?: Voertuig
  user_id_ulu: number
  bijtelling: boolean
  priveKm: number
  zakelijkKm: number
  breakdown: KmBreakdown
  trips: UluTrip[]
}

function isPrive(t: UluTrip): boolean {
  return t.rit_type_berekend === 'prive'
}

function isZakelijk(t: UluTrip): boolean {
  return t.rit_type_berekend === 'zakelijk'
}

function classificeerPriveReden(
  startDatum: string,
  startTijd: string,
): 'weekend' | 'avond' | 'nacht' | 'vroeg' | 'werktijd' {
  const dow = new Date(startDatum + 'T12:00:00').getDay() // 0=zo, 6=za
  if (dow === 0 || dow === 6) return 'weekend'
  const uur = parseInt(startTijd.slice(0, 2), 10)
  // Werktijd = 07:00 - 17:00 (weekdagen)
  if (uur >= 7 && uur < 17) return 'werktijd' // zou eigenlijk niet moeten bij priv
  if (uur >= 17 && uur < 22) return 'avond'
  if (uur >= 5 && uur < 7) return 'vroeg'
  return 'nacht' // 22:00 - 05:00
}

function emptyBreakdown(): KmBreakdown {
  return {
    weekend_km: 0, weekend_ritten: 0,
    avond_km: 0, avond_ritten: 0,
    nacht_km: 0, nacht_ritten: 0,
    vroeg_km: 0, vroeg_ritten: 0,
  }
}

/**
 * Groepeer per bestuurder. Trips zonder bekende ulu_user worden overgeslagen.
 */
function groupForPrive(
  trips: UluTrip[],
  voertuigen: Map<string, Voertuig>,
  uluUsers?: Map<number, UluUserInfo>,
): GroupTotals[] {
  const groups = new Map<GroupKey, GroupTotals>()
  if (!uluUsers) return []

  for (const t of trips) {
    if (t.user_id_ulu == null) continue
    const user = uluUsers.get(t.user_id_ulu)
    if (!user) continue
    const key = `user:${t.user_id_ulu}`

    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        user,
        voertuig: t.voertuig_id ? voertuigen.get(t.voertuig_id) : undefined,
        voertuig_id: t.voertuig_id ?? undefined,
        user_id_ulu: t.user_id_ulu,
        bijtelling: user.bijtelling_betaald,
        priveKm: 0,
        zakelijkKm: 0,
        breakdown: emptyBreakdown(),
        trips: [],
      }
      groups.set(key, g)
    } else if (!g.voertuig_id && t.voertuig_id) {
      g.voertuig_id = t.voertuig_id
    }
    g.trips.push(t)
    const km = t.afstand_km ?? 0
    if (isPrive(t)) {
      g.priveKm += km
      const reden = classificeerPriveReden(t.start_datum, t.start_tijd)
      if (reden === 'weekend') {
        g.breakdown.weekend_km += km
        g.breakdown.weekend_ritten += 1
      } else if (reden === 'avond') {
        g.breakdown.avond_km += km
        g.breakdown.avond_ritten += 1
      } else if (reden === 'vroeg') {
        g.breakdown.vroeg_km += km
        g.breakdown.vroeg_ritten += 1
      } else if (reden === 'nacht') {
        g.breakdown.nacht_km += km
        g.breakdown.nacht_ritten += 1
      }
    }
    if (isZakelijk(t)) g.zakelijkKm += km
  }
  return Array.from(groups.values())
}

function daysBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso)
  const e = new Date(endIso)
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
}

function labelVoor(g: GroupTotals): string {
  if (g.user.volledige_naam) return g.user.volledige_naam
  return `Bestuurder #${g.user_id_ulu}`
}

/** Formatteer een breakdown als leesbare reden-tekst voor in de omschrijving. */
function formatBreakdown(b: KmBreakdown): string {
  const onderdelen: string[] = []
  if (b.weekend_km > 0)
    onderdelen.push(`${b.weekend_km.toFixed(0)} km in ${b.weekend_ritten} weekendritten`)
  if (b.avond_km > 0)
    onderdelen.push(`${b.avond_km.toFixed(0)} km in ${b.avond_ritten} avondritten (17-22u)`)
  if (b.nacht_km > 0)
    onderdelen.push(`${b.nacht_km.toFixed(0)} km in ${b.nacht_ritten} nachtritten (22-05u)`)
  if (b.vroeg_km > 0)
    onderdelen.push(`${b.vroeg_km.toFixed(0)} km in ${b.vroeg_ritten} vroege ritten (voor 07:00)`)
  return onderdelen.join(' + ')
}

export const R2a: RuleModule = {
  code: 'R2a',
  runner: ({ trips, voertuigen, uluUsers, regels, periodeStart, periodeEind }) => {
    const regel = regels.get('R2a')
    const cfg = (regel?.drempel_config ?? {}) as Record<string, number>
    const limietWaarschuwing = cfg.prive_km_waarschuwing ?? 8000
    const limietOvertreding = cfg.prive_km_overtreding ?? 10000
    const zakelijkVerwacht = cfg.zakelijk_verwacht ?? 12000

    const out: ComplianceBevindingInput[] = []
    const groups = groupForPrive(trips, voertuigen, uluUsers)

    for (const g of groups) {
      if (!g.bijtelling) continue

      const groepLimiet = g.user.prive_limiet_km_jaar ?? limietOvertreding
      const groepWaarschuwing = Math.min(limietWaarschuwing, groepLimiet)
      const label = labelVoor(g)
      const breakdown = formatBreakdown(g.breakdown)

      if (g.priveKm > groepLimiet) {
        out.push({
          regel_code: 'R2a',
          voertuig_id: g.voertuig_id ?? null,
          medewerker_id: null,
          trip_id: null,
          periode_start: periodeStart,
          periode_eind: periodeEind,
          ernst: 'overtreding',
          omschrijving:
            `${label} (bijtelling: ja) heeft ${g.priveKm.toFixed(0)} privé-km — ` +
            `boven de harde limiet van ${groepLimiet} km/jaar. ` +
            (breakdown ? `Opgebouwd uit: ${breakdown}.` : '') +
            ` (Zakelijk dit jaar: ${g.zakelijkKm.toFixed(0)} km.)`,
          data: {
            label,
            user_id_ulu: g.user_id_ulu,
            bijtelling: true,
            prive_km: g.priveKm,
            zakelijk_km: g.zakelijkKm,
            limiet: groepLimiet,
            type_limiet: 'overtreding',
            breakdown: g.breakdown,
            uitleg_regel:
              'Bij bijtelling geldt volgens de vuistregel max ~8.000 privé-km per jaar. ' +
              'Boven deze harde limiet is privégebruik disproportioneel — overleg met directie.',
          },
        })
      } else if (g.priveKm > groepWaarschuwing) {
        out.push({
          regel_code: 'R2a',
          voertuig_id: g.voertuig_id ?? null,
          medewerker_id: null,
          trip_id: null,
          periode_start: periodeStart,
          periode_eind: periodeEind,
          ernst: 'waarschuwing',
          omschrijving:
            `${label} (bijtelling: ja) heeft ${g.priveKm.toFixed(0)} privé-km — ` +
            `boven de vuistregel van ${groepWaarschuwing} km/jaar. ` +
            (breakdown ? `Opgebouwd uit: ${breakdown}.` : '') +
            ` (Zakelijk dit jaar: ${g.zakelijkKm.toFixed(0)} km.)`,
          data: {
            label,
            user_id_ulu: g.user_id_ulu,
            bijtelling: true,
            prive_km: g.priveKm,
            zakelijk_km: g.zakelijkKm,
            drempel: groepWaarschuwing,
            type_limiet: 'waarschuwing',
            breakdown: g.breakdown,
            uitleg_regel:
              'Bij bijtelling is privégebruik toegestaan. Vuistregel is ~8.000 km/jaar privé bij ' +
              '~12.000 zakelijk. Boven vuistregel = signaal dat profiel afwijkt, onder limiet is ' +
              'nog geen overtreding.',
          },
        })
      }

      // Zakelijk-km prognose onder verwacht
      const dagen = daysBetween(periodeStart, periodeEind)
      const verwachtGroep = g.user.zakelijk_verwacht_km_jaar ?? zakelijkVerwacht
      const zakelijkPrognose = (g.zakelijkKm / Math.max(1, dagen)) * 365
      if (g.zakelijkKm > 0 && zakelijkPrognose < verwachtGroep * 0.5) {
        out.push({
          regel_code: 'R2a',
          voertuig_id: g.voertuig_id ?? null,
          medewerker_id: null,
          trip_id: null,
          periode_start: periodeStart,
          periode_eind: periodeEind,
          ernst: 'info',
          omschrijving:
            `${label}: prognose zakelijk-km (${zakelijkPrognose.toFixed(0)}/jaar) is minder dan ` +
            `de helft van het verwachte ${verwachtGroep} km. Signaal dat bijtelling-auto ` +
            `misschien weinig zakelijk wordt gebruikt.`,
          data: {
            label,
            user_id_ulu: g.user_id_ulu,
            zakelijk_km_periode: g.zakelijkKm,
            prognose_jaar: zakelijkPrognose,
            verwacht_jaar: verwachtGroep,
            uitleg_regel:
              'Lage zakelijke km op een bijtelling-auto kan betekenen dat de auto herverdeeld ' +
              'moet worden of dat de functie geen auto-gebruik meer vereist.',
          },
        })
      }
    }
    return out
  },
}

export const R2b: RuleModule = {
  code: 'R2b',
  runner: ({ trips, voertuigen, uluUsers, regels, periodeStart, periodeEind }) => {
    const regel = regels.get('R2b')
    const cfg = (regel?.drempel_config ?? {}) as Record<string, number>
    const limiet = cfg.prive_km_overtreding ?? 500

    const out: ComplianceBevindingInput[] = []
    const groups = groupForPrive(trips, voertuigen, uluUsers)

    for (const g of groups) {
      if (g.bijtelling) continue

      const groepLimiet = g.user.prive_limiet_km_jaar ?? limiet
      const label = labelVoor(g)
      const breakdown = formatBreakdown(g.breakdown)

      if (g.priveKm > groepLimiet) {
        out.push({
          regel_code: 'R2b',
          voertuig_id: g.voertuig_id ?? null,
          medewerker_id: null,
          trip_id: null,
          periode_start: periodeStart,
          periode_eind: periodeEind,
          ernst: 'overtreding',
          omschrijving:
            `${label} (bijtelling: nee) heeft ${g.priveKm.toFixed(0)} privé-km — ` +
            `boven de handboek-limiet van ${groepLimiet} km/jaar. ` +
            (breakdown
              ? `Opgebouwd uit: ${breakdown}.`
              : '') +
            ` Privé-km wordt bepaald door ritten buiten werktijd (07:00-17:00, ma-vr) of in het ` +
            `weekend — ongeacht hoe de bestuurder ze in de ULU-app markeert.`,
          data: {
            label,
            user_id_ulu: g.user_id_ulu,
            bijtelling: false,
            prive_km: g.priveKm,
            zakelijk_km: g.zakelijkKm,
            limiet: groepLimiet,
            type_limiet: 'overtreding',
            breakdown: g.breakdown,
            uitleg_regel:
              'Volgens het werknemers handboek is zonder bijtelling max 500 km privégebruik per ' +
              'jaar toegestaan (met toestemming directie). Daarboven moet er fiscaal bijtelling ' +
              'worden berekend, of moet privégebruik worden verrekend.',
          },
        })
      }
    }
    return out
  },
}
