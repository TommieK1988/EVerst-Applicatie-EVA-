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
  ankerKeuzeSleutel,
  bepaalKeten,
  bouwKetens,
  duurLabel,
  afwezigheidOpDag,
  isoWeekdag,
  vandaagNL,
  verwachteTijden,
  zakelijkeRittenPerDag,
} from './werkdag'

export const R10: RuleModule = {
  code: 'R10',
  runner: ({ trips, uluUsers, regels, roosters, afwezigheid, ankerKeuzes }) => {
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
      const bepaald = bepaalKeten(
        ketens,
        'vertrek',
        ankerKeuzes?.get(ankerKeuzeSleutel(userId, datum, 'R10')),
      )
      if (!bepaald) continue
      const { keten, anker: ankerTrip, minuten: vertrek, handmatig } = bepaald

      // Eén keten = alleen de heenreis bekend; daar is geen vertrek uit af te
      // leiden. Heeft iemand de bepalende rit zélf aangewezen, dan weet hij het
      // beter dan die vuistregel en telt zijn keuze.
      if (ketens.length < 2 && !handmatig) continue
      if (vertrek == null) continue

      const verschil = eind - margeMin - vertrek
      // Zie R9: zonder afwijking geen signaal, tenzij de rit handmatig is
      // aangewezen — dan blijft de dag staan zodat de keuze zichtbaar en
      // omkeerbaar blijft.
      if (verschil <= 0 && !handmatig) continue

      out.push(...bouwBevindingen(keten, ankerTrip, {
        user,
        datum,
        verschil: Math.max(0, verschil),
        vertrek,
        eindLabel,
        benadering,
        margeMin,
        pauzeMin,
        overtredingVanaf,
        handmatig,
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
  /** De bepalende rit is door een mens aangewezen. */
  handmatig: boolean
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
    anker_handmatig: ctx.handmatig,
    anker_trip_id: anker.id,
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
      'waarschuwing, daarboven een overtreding.' +
      (ctx.handmatig
        ? ' De bepalende rit is hier handmatig aangewezen; de ketenregel is dus overruled.'
        : ''),
  }

  // Alle ritten van de keten krijgen dezelfde ernst: het gaat om één te vroeg
  // vertrek, alleen verdeeld over meerdere geregistreerde ritten. Nul minuten
  // kan alleen bij een handmatig aangewezen rit: dan is er niets aan de hand en
  // blijft de dag alleen staan om de keuze te kunnen terugdraaien.
  const ernst =
    verschil <= 0 ? 'info' : verschil > ctx.overtredingVanaf ? 'overtreding' : 'waarschuwing'

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
        ? verschil <= 0
          ? `${naam}: op ${dag} ${datum} om ${hm(ctx.vertrek)} van het werk vertrokken — ` +
            `op tijd volgens de handmatig aangewezen rit (roostertijd ${ctx.eindLabel}).`
          : `${naam}: op ${dag} ${datum} om ${hm(ctx.vertrek)} van het werk vertrokken — ` +
            `${duurLabel(verschil)} voor de roostertijd (${ctx.eindLabel}).` +
            (keten.length > 1 ? ` De thuisreis bestaat uit ${keten.length} ritten.` : '') +
            (ctx.handmatig ? ' Bepalende rit handmatig aangewezen.' : '')
        : `${naam}: deel van de thuisreis op ${dag} ${datum}, die om ${hm(ctx.vertrek)} begon — ` +
          `${duurLabel(verschil)} voor de roostertijd (${ctx.eindLabel}).`,
      data: { ...gedeeldeData, keten_rol: isAnker ? 'anker' : 'deel' },
    }
  })
}
