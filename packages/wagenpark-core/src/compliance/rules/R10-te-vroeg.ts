/**
 * R10 — Te vroeg vertrokken van het werk.
 *
 * Het spiegelbeeld van R9: het vertrek van het werk is het BEGIN van de laatste
 * zakelijke ritketen van de dag (zie `werkdag.ts`). Ligt dat vóór het dageind
 * uit het rooster, dan is de bestuurder te vroeg weg.
 *
 * "Laatste keten" en niet "eerste rit richting huis": wie om 14:49 van de bouw
 * naar het eigen depot rijdt en daar nog een half uur bezig is, vertrok pas om
 * 15:41 van het werk. Andersom telt een tankstop van vier minuten onderweg naar
 * huis niet als werkplek — die rit hoort bij dezelfde keten.
 *
 * De regel slaat de dag over als de laatste keten ook de eerste is. Dan is er
 * maar één verplaatsing bekend (auto blijft staan, of de rittensync is
 * onvolledig) en zou de heenreis van 's ochtends als vertrektijd gelden — goed
 * voor een signaal van vele uren te vroeg.
 */

import type { ComplianceBevindingInput, UluTrip } from '../../types'
import type { RuleModule, UluUserInfo } from '../types'
import {
  DAG_NAMEN,
  bouwKetens,
  duurLabel,
  afwezigheidOpDag,
  isoWeekdag,
  ketenVertrek,
  vandaagNL,
  verwachteTijden,
  zakelijkeRittenPerDag,
} from './werkdag'

export const R10: RuleModule = {
  code: 'R10',
  runner: ({ trips, uluUsers, regels, roosters, afwezigheid }) => {
    const cfg = (regels.get('R10')?.drempel_config ?? {}) as Record<string, number>
    const margeMin = cfg.marge_minuten ?? 0
    const pauzeMin = cfg.keten_pauze_min ?? 5
    const overtredingVanaf = cfg.overtreding_vanaf_min ?? 5

    if (!uluUsers) return []

    const vandaag = vandaagNL()
    const out: ComplianceBevindingInput[] = []

    for (const { userId, datum, ritten: dagRitten } of zakelijkeRittenPerDag(trips)) {
      if (datum >= vandaag) continue

      const user = uluUsers.get(userId!)
      if (!user) continue

      const mwRoosters = user.medewerker_id ? roosters?.get(user.medewerker_id) ?? [] : []
      const { isWerkdag, eind, eindLabel, benadering } = verwachteTijden(datum, mwRoosters, user)
      if (!isWerkdag || eind == null) continue

      if (
        user.medewerker_id &&
        afwezigheidOpDag(datum, afwezigheid?.get(user.medewerker_id) ?? [])
      ) {
        continue
      }

      const ketens = bouwKetens(dagRitten, pauzeMin)
      // Eén keten = alleen de heenreis bekend; daar is geen vertrek uit af te leiden.
      if (ketens.length < 2) continue

      const laatste = ketens[ketens.length - 1]
      const { trip: ankerTrip, minuten: vertrek } = ketenVertrek(laatste)
      if (vertrek == null) continue

      const verschil = eind - margeMin - vertrek
      if (verschil <= 0) continue

      out.push(...bouwBevindingen(laatste, ankerTrip, {
        user,
        datum,
        verschil,
        vertrek,
        eindLabel,
        benadering,
        margeMin,
        pauzeMin,
        overtredingVanaf,
      }))
    }

    return out
  },
}

type Context = {
  user: UluUserInfo
  datum: string
  verschil: number
  vertrek: number
  eindLabel: string | null
  benadering: boolean
  margeMin: number
  pauzeMin: number
  overtredingVanaf: number
}

function hm(minuten: number): string {
  const u = Math.floor(minuten / 60)
  const m = minuten % 60
  return `${String(u).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function bouwBevindingen(
  keten: UluTrip[],
  anker: UluTrip,
  ctx: Context,
): ComplianceBevindingInput[] {
  const { user, datum, verschil } = ctx
  const naam = user.volledige_naam ?? `Bestuurder #${user.id}`
  const dag = DAG_NAMEN[isoWeekdag(datum)]

  const gedeeldeData = {
    user_id_ulu: user.id,
    soort: 'te_vroeg',
    datum,
    dag,
    verwacht_eind: ctx.eindLabel,
    vertrek_werk: hm(ctx.vertrek),
    verschil_minuten: verschil,
    marge_minuten: ctx.margeMin,
    keten_pauze_min: ctx.pauzeMin,
    overtreding_vanaf_min: ctx.overtredingVanaf,
    keten_trip_ids: keten.map((t) => t.id),
    rooster_benadering: ctx.benadering,
    uitleg_regel:
      'Vertrek van het werk = het begin van de laatste zakelijke ritketen van de dag. ' +
      `Ritten met minder dan ${ctx.pauzeMin} minuten ertussen tellen als één rit, zodat een ` +
      'tankstop onderweg naar huis het vertrekmoment niet verschuift. De grens is het dageind ' +
      'uit het werkrooster. Verlof onderdrukt het signaal, en een dag met maar één ritketen ' +
      `wordt overgeslagen. Tot en met ${ctx.overtredingVanaf} minuten te vroeg is een ` +
      'waarschuwing, daarboven een overtreding.',
  }

  // Alle ritten van de keten krijgen dezelfde ernst: het gaat om één te vroeg
  // vertrek, alleen verdeeld over meerdere geregistreerde ritten.
  const ernst = verschil > ctx.overtredingVanaf ? 'overtreding' : 'waarschuwing'

  return keten.map((trip) => {
    const isAnker = trip.id === anker.id
    return {
      regel_code: 'R10',
      voertuig_id: trip.voertuig_id ?? null,
      medewerker_id: null,
      trip_id: trip.id,
      periode_start: datum,
      periode_eind: datum,
      ernst,
      omschrijving: isAnker
        ? `${naam}: op ${dag} ${datum} om ${hm(ctx.vertrek)} van het werk vertrokken — ` +
          `${duurLabel(verschil)} voor de roostertijd (${ctx.eindLabel}).` +
          (keten.length > 1 ? ` De thuisreis bestaat uit ${keten.length} ritten.` : '')
        : `${naam}: deel van de thuisreis op ${dag} ${datum}, die om ${hm(ctx.vertrek)} begon — ` +
          `${duurLabel(verschil)} voor de roostertijd (${ctx.eindLabel}).`,
      data: { ...gedeeldeData, keten_rol: isAnker ? 'anker' : 'deel' },
    }
  })
}
