/**
 * Netto aanwezig naast de te keuren uren.
 *
 * Een PL die uren keurt ziet per regel wát er geboekt is, maar niet of dat past bij de dag: stond
 * de man om half vier al thuis, dan klopt een regel van acht uur niet. De werktijdenlijst van het
 * wagenpark rekent die dag al uit (aankomst op het werk tot vertrek, min de roosterpauze). Deze
 * module legt precies díe uitkomst naast het dagtotaal aan geboekte uren -- zelfde functies, zodat
 * het keurscherm en de werktijdenlijst nooit twee verschillende aanwezigheden laten zien.
 *
 * PRIVACY. De werktijden staan in het wagenpark achter het privé-recht. Hier ziet de beoordelaar
 * ze zonder dat recht, maar alleen voor de medewerker-dagen die hij al te keuren krijgt: de
 * aanroeper geeft die paren mee NA de afscherming van de regels, en deze module haalt nooit iets
 * op voor een dag die er niet in staat. Besluit van Tom, sep 2026.
 */
import 'server-only'
import { getAanwezigheidPerDag, REDEN_TEKST } from '@/lib/wagenpark/werktijd-aanwezigheid'
import { getUrenPerDag } from '@/lib/wagenpark/werktijd-uren'
import { dagSaldoUren } from '@/lib/wagenpark/werktijd'
import { pgQuery } from '@/lib/wagenpark/db'
import { leesGlobaleBron } from '@/lib/bouw7/snapshot'
import type { UrenVensterPayload } from '@/lib/bouw7/snapshot-bronnen'
import { dagVergelijkingSleutel, type DagVergelijking } from './types'

/** Eén medewerker-dag waarvoor de vergelijking gevraagd wordt. */
export type MedewerkerDag = { bouw7MedewerkerId: number; datum: string }

/**
 * Een uurregel zoals de aanroeper hem live uit Bouw7 heeft. Het geboekte dagtotaal komt uit de
 * bewaarde urenstand, en die wordt maar een paar keer per dag ververst. Het mobiele keurscherm
 * leest de open regels wél live, dus zonder deze aanvulling zou een regel van vanmiddag in de lijst
 * staan maar niet in "geboekt": 0 u geboekt naast een regel van 8 u.
 */
export type LiveUurregel = {
  /** Bouw7 hour-log-id. */
  id: number
  bouw7MedewerkerId: number
  datum: string
  uren: number
  nietGewerkt: boolean
}

const GEEN_AUTO = 'Geen auto aan deze medewerker gekoppeld in het wagenpark.'

/**
 * Boven dit aantal bestuurders één query over het hele wagenpark in plaats van één per persoon.
 * De pool heeft vijf verbindingen; veertig losse bestuurders zouden elkaar daar laten wachten.
 */
const LOSSE_BESTUURDERS_MAX = 8

/**
 * De ULU-bestuurder(s) achter een Bouw7-medewerker. Dezelfde brug als de werktijdenlijst:
 * `medewerkers.bouw7_id → ulu_users.medewerker_id`, nooit op naam.
 */
const BESTUURDERS_SQL = `
  select m.bouw7_id::text as bouw7_id, uu.id::text as user_id_ulu
    from public.medewerkers m
    join public.ulu_users uu on uu.medewerker_id = m.id
   where m.bouw7_id = any($1::text[])
`

/**
 * Aanwezig en geboekt per medewerker-dag, als plat object zodat het naar de client kan.
 * Sleutel: `dagVergelijkingSleutel(bouw7MedewerkerId, datum)`.
 *
 * Fail-soft: gaat er iets mis, dan komt er een leeg object terug en toont het scherm streepjes.
 * Het keuren zelf mag hier nooit op vastlopen.
 */
export async function haalDagVergelijking(
  dagen: MedewerkerDag[],
  live: LiveUurregel[] = [],
): Promise<Record<string, DagVergelijking>> {
  const uit: Record<string, DagVergelijking> = {}
  const uniek = new Map<string, MedewerkerDag>()
  for (const d of dagen) uniek.set(dagVergelijkingSleutel(d.bouw7MedewerkerId, d.datum), d)
  if (uniek.size === 0) return uit

  try {
    const lijst = [...uniek.values()]
    const datums = lijst.map((d) => d.datum).sort()
    const van = datums[0]
    const tot = datums[datums.length - 1]
    const medewerkerIds = [...new Set(lijst.map((d) => String(d.bouw7MedewerkerId)))]

    const [bestuurders, uren, bewaardeStand] = await Promise.all([
      pgQuery<{ bouw7_id: string; user_id_ulu: string }>(BESTUURDERS_SQL, [medewerkerIds]),
      getUrenPerDag(van, tot),
      live.length ? leesGlobaleBron<UrenVensterPayload>('uren_venster') : Promise.resolve(null),
    ])

    // Wat de live regels afwijken van de bewaarde stand: nieuw geboekt, of sindsdien bijgesteld.
    // Per regel het verschil, zodat een regel die in beide staat niet dubbel telt.
    const bewaard = new Map<number, number>()
    for (const h of bewaardeStand?.data?.items ?? []) bewaard.set(h.id, Number(h.hours) || 0)
    const liveVerschil = new Map<string, number>()
    for (const r of live) {
      if (r.nietGewerkt) continue
      const sleutel = dagVergelijkingSleutel(r.bouw7MedewerkerId, r.datum)
      liveVerschil.set(sleutel, (liveVerschil.get(sleutel) ?? 0) + r.uren - (bewaard.get(r.id) ?? 0))
    }

    // Een medewerker kan meer dan één ULU-account hebben (andere auto, nieuwe kaart).
    const bestuurdersPer = new Map<string, string[]>()
    for (const b of bestuurders) {
      bestuurdersPer.set(b.bouw7_id, [...(bestuurdersPer.get(b.bouw7_id) ?? []), b.user_id_ulu])
    }

    // Per bestuurder alleen de eigen dagen; met veel bestuurders één ronde over het hele wagenpark.
    const alleBestuurders = [...new Set(bestuurders.map((b) => b.user_id_ulu))]
    const aanwezigheid = alleBestuurders.length > LOSSE_BESTUURDERS_MAX
      ? [await getAanwezigheidPerDag(van, tot, null)]
      : await Promise.all(alleBestuurders.map((userId) => {
          const eigen = bestuurders.filter((b) => b.user_id_ulu === userId).map((b) => b.bouw7_id)
          const eigenDatums = lijst.filter((d) => eigen.includes(String(d.bouw7MedewerkerId))).map((d) => d.datum).sort()
          return getAanwezigheidPerDag(eigenDatums[0], eigenDatums[eigenDatums.length - 1], userId)
        }))
    const venster = (userId: string, datum: string) => {
      for (const kaart of aanwezigheid) {
        const v = kaart.get(`${userId}|${datum}`)
        if (v) return v
      }
      return null
    }

    for (const [sleutel, { bouw7MedewerkerId, datum }] of uniek) {
      const dagUren = uren.fout ? null : uren.perDag.get(`${bouw7MedewerkerId}|${datum}`)
      // Niets in de urenstand = die dag niets gewerkt geboekt (alleen verlof, of niets). Uursoorten
      // zonder classificatie tellen mee als werk: liever een getal dat je kunt narekenen dan een gat.
      const geboektUren = uren.fout ? null
        : Math.round((
            (dagUren ? (dagUren.werk ?? 0) + dagUren.ongeclassificeerd : 0)
            + (liveVerschil.get(sleutel) ?? 0)
          ) * 100) / 100

      const userIds = bestuurdersPer.get(String(bouw7MedewerkerId)) ?? []
      // Bij meer accounts telt de dag die een venster oplevert; anders de eerste met een reden.
      const vensters = userIds.map((u) => venster(u, datum))
      const v = vensters.find((x) => x?.nettoMinuten != null) ?? vensters.find((x) => x != null) ?? null

      const aanwezigMinuten = v?.nettoMinuten ?? null
      uit[sleutel] = {
        aanwezigMinuten,
        aankomst: v?.aankomst ?? null,
        vertrek: v?.vertrek ?? null,
        pauzeMinuten: v?.pauzeMinuten ?? 0,
        pauzeInRooster: v?.pauzeInRooster ?? false,
        geenVenster: aanwezigMinuten != null ? null
          : userIds.length === 0 ? GEEN_AUTO
          : REDEN_TEKST[v?.reden ?? 'geen_ritten'],
        geboektUren,
        verschilUren: dagSaldoUren(aanwezigMinuten, geboektUren),
      }
    }
  } catch (e) {
    console.error('[uren] aanwezigheid bij uren:', e)
    return {}
  }
  return uit
}
