/**
 * R9 — Te laat aangekomen op het werk.
 *
 * De aankomst op het werk is het EINDE van de eerste zakelijke ritketen van de
 * dag (zie `werkdag.ts` voor wat een keten is). Ligt die na de dagstart uit het
 * rooster, dan is de bestuurder te laat.
 *
 * Waarom niet naar de eerste rit-starttijd kijken, zoals de oude R9 deed? Dat is
 * het moment van vertrek van huis, niet van aankomst op het werk — een
 * bestuurder die om 07:00 vertrekt en er drie kwartier over doet, was volgens de
 * oude regel keurig op tijd. Waarom niet naar de aankomst op de ingeplande
 * projectlocatie? Omdat een tussenstop bij de groothandel of het eigen depot óók
 * werk is: wie om 07:09 bij Jongeneel staat is niet te laat, ook al komt hij pas
 * om 07:52 op de bouw aan.
 *
 * Alle ritten van de bepalende keten krijgen een bevinding, zodat een
 * opgesplitste rit in de rittenlijst niet half gemarkeerd achterblijft. De rit
 * die de aankomsttijd bepaalt is het anker en draagt de ernst; de andere delen
 * zijn `info` en verwijzen ernaar.
 */

import type { ComplianceBevindingInput, UluTrip } from '../../types'
import type { RuleModule, UluUserInfo } from '../types'
import {
  DAG_NAMEN,
  bouwKetens,
  duurLabel,
  afwezigheidOpDag,
  isHeleDagAfwezig,
  isoWeekdag,
  ketenAankomst,
  vandaagNL,
  verwachteTijden,
  zakelijkeRittenPerDag,
} from './werkdag'

export const R9: RuleModule = {
  code: 'R9',
  runner: ({ trips, uluUsers, regels, roosters, afwezigheid }) => {
    const cfg = (regels.get('R9')?.drempel_config ?? {}) as Record<string, number>
    const margeMin = cfg.marge_minuten ?? 0
    const pauzeMin = cfg.keten_pauze_min ?? 5
    const overtredingVanaf = cfg.overtreding_vanaf_min ?? 5

    if (!uluUsers) return []

    const vandaag = vandaagNL()
    const out: ComplianceBevindingInput[] = []

    for (const { userId, datum, ritten: dagRitten } of zakelijkeRittenPerDag(trips)) {
      // De lopende dag is nog niet af — die beoordelen we niet.
      if (datum >= vandaag) continue

      const user = uluUsers.get(userId!)
      if (!user) continue

      const mwRoosters = user.medewerker_id ? roosters?.get(user.medewerker_id) ?? [] : []
      const { isWerkdag, start, startLabel, benadering } = verwachteTijden(datum, mwRoosters, user)
      if (!isWerkdag || start == null) continue

      const afw = user.medewerker_id
        ? afwezigheidOpDag(datum, afwezigheid?.get(user.medewerker_id) ?? [])
        : null
      // Zowel een hele vrije dag als een deeldag (bv. een ochtend verlof)
      // onderdrukt het signaal: de roostertijd geldt dan niet.
      if (afw) continue

      const ketens = bouwKetens(dagRitten, pauzeMin)
      if (ketens.length === 0) continue

      const eerste = ketens[0]
      const { trip: ankerTrip, minuten: aankomst } = ketenAankomst(eerste)
      if (aankomst == null) continue

      const verschil = aankomst - (start + margeMin)
      if (verschil <= 0) continue

      out.push(...bouwBevindingen(eerste, ankerTrip, {
        user,
        datum,
        verschil,
        aankomst,
        startLabel,
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
  aankomst: number
  startLabel: string | null
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
  const ketenIds = keten.map((t) => t.id)

  const gedeeldeData = {
    user_id_ulu: user.id,
    soort: 'te_laat',
    datum,
    dag,
    verwacht_start: ctx.startLabel,
    aankomst_werk: hm(ctx.aankomst),
    verschil_minuten: verschil,
    marge_minuten: ctx.margeMin,
    keten_pauze_min: ctx.pauzeMin,
    overtreding_vanaf_min: ctx.overtredingVanaf,
    keten_trip_ids: ketenIds,
    rooster_benadering: ctx.benadering,
    uitleg_regel:
      'Aankomst op het werk = het einde van de eerste zakelijke ritketen van de dag. ' +
      `Ritten met minder dan ${ctx.pauzeMin} minuten ertussen tellen als één rit, zodat ` +
      'een tankstop of een opgesplitste registratie niet voor een aankomst wordt aangezien. ' +
      'Elke stop die geen tussenstop is telt als werkplek — ook de groothandel of het depot. ' +
      'De grens is de dagstart uit het werkrooster. Verlof onderdrukt het signaal. ' +
      `Tot en met ${ctx.overtredingVanaf} minuten te laat is een waarschuwing, daarboven een overtreding.`,
  }

  // Tot en met de drempel een waarschuwing, daarboven een overtreding. Alle
  // ritten van de keten krijgen dezelfde ernst: het gaat om één te late
  // aankomst, alleen verdeeld over meerdere geregistreerde ritten.
  const ernst = verschil > ctx.overtredingVanaf ? 'overtreding' : 'waarschuwing'

  return keten.map((trip) => {
    const isAnker = trip.id === anker.id
    return {
      regel_code: 'R9',
      voertuig_id: trip.voertuig_id ?? null,
      medewerker_id: null,
      trip_id: trip.id,
      periode_start: datum,
      periode_eind: datum,
      ernst,
      omschrijving: isAnker
        ? `${naam}: op ${dag} ${datum} om ${hm(ctx.aankomst)} op het werk aangekomen — ` +
          `${duurLabel(verschil)} na de roostertijd (${ctx.startLabel}).` +
          (keten.length > 1 ? ` De heenreis bestaat uit ${keten.length} ritten.` : '')
        : `${naam}: deel van de heenreis op ${dag} ${datum}, die om ${hm(ctx.aankomst)} eindigde — ` +
          `${duurLabel(verschil)} na de roostertijd (${ctx.startLabel}).`,
      data: { ...gedeeldeData, keten_rol: isAnker ? 'anker' : 'deel' },
    }
  })
}
