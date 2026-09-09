'use client'

/**
 * De ritten van één werkdag, met de knoppen die erop zitten.
 *
 * Apart van het zijpaneel omdat dit een eigen ding is geworden: per rit kun je
 * de classificatie wisselen en aanwijzen welke rit de aankomst of het vertrek
 * bepaalt, en beide grijpen in op de hele dag. Bij elkaar in één bestand liep
 * het paneel tegen de 900 regels.
 */

import React from 'react'
import { Flag, MapPin } from 'lucide-react'
import { formatKm } from '@/lib/wagenpark/utils'
import type { DagRit } from '@/app/(platform)/wagenpark/actions/werktijd-ritten'
import type { WerktijdAfwijking } from '@/lib/wagenpark/werktijd-dag'

/** "23 min" / "1 u 12" — duur van een rit. */
function duurLabel(seconden: number | null): string {
  if (seconden == null) return '—'
  const min = Math.round(seconden / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} u ${String(min % 60).padStart(2, '0')}`
}

const RIT_TYPE_STIJL: Record<string, string> = {
  zakelijk: 'bg-slate-100 text-slate-600',
  prive: 'bg-blue-100 text-blue-700',
  woon_werk: 'bg-slate-100 text-slate-600',
}

/**
 * De ritten van de dag, met de bepalende ritketens eruit gelicht.
 *
 * Waarom álle ritten en niet alleen de keten: het gesprek gaat juist over wat
 * er omheen gebeurde. Een privérit om kwart voor acht verklaart een late
 * aankomst; een tussenstop bij de groothandel laat zien dat er al gewerkt werd.
 * De keten is groen gemarkeerd zodat wél duidelijk blijft waar het getal
 * vandaan komt.
 *
 * Elke zakelijke rit kan de bepalende worden. De ketenregel raadt goed maar niet
 * altijd: wie weet dat het depotbezoek van kwart voor vier gewoon werk was, wijst
 * die rit hier aan en de afwijking wordt erop herrekend. Privéritten krijgen die
 * knop niet — de werkdag-regels kijken alleen naar zakelijke ritten, dus een
 * keuze daarop zou stilletjes niets doen.
 */
export default function RittenLijst({
  ritten,
  fout,
  teLaat,
  teVroeg,
  bezig,
  onKies,
  onWisselType,
}: {
  ritten: DagRit[] | null
  fout: string | null
  teLaat: WerktijdAfwijking | null
  teVroeg: WerktijdAfwijking | null
  bezig: boolean
  onKies: (afwijking: WerktijdAfwijking, trip_id: string) => void
  onWisselType: (trip_id: string, nieuwType: 'zakelijk' | 'prive' | null) => void
}) {
  if (fout) {
    return <p className="text-sm text-slate-500">De ritten konden niet worden opgehaald ({fout}).</p>
  }
  if (ritten === null) {
    return <p className="text-sm text-slate-400">Ritten laden…</p>
  }
  if (ritten.length === 0) {
    return <p className="text-sm text-slate-500">Geen ritten gevonden op deze dag.</p>
  }

  return (
    <ol className="space-y-1.5">
      {ritten.map((r) => {
        const inKeten = r.in_keten_aankomst || r.in_keten_vertrek
        const zakelijk = r.rit_type === 'zakelijk'
        return (
          <li
            key={r.id}
            className={`rounded-md border px-3 py-2 ${
              inKeten ? 'border-green-300 bg-green-50/60' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-baseline gap-2 text-sm flex-wrap">
              <span className="font-medium tabular-nums text-slate-900">
                {r.start_tijd?.slice(0, 5) ?? '—'}–{r.stop_tijd?.slice(0, 5) ?? '—'}
              </span>
              <span className="text-xs text-slate-500">{duurLabel(r.duur_seconden)}</span>
              <span className="text-xs text-slate-500">{formatKm(r.afstand_km, 1)}</span>
              <RitTypeKnop rit={r} bezig={bezig} onWissel={onWisselType} />
              <span className="ml-auto inline-flex items-center gap-2">
                <AnkerKnop
                  afwijking={teLaat}
                  woord="de aankomst"
                  isAnker={r.bepaalt_aankomst}
                  zakelijk={zakelijk}
                  bezig={bezig}
                  onKies={() => teLaat && onKies(teLaat, r.id)}
                />
                <AnkerKnop
                  afwijking={teVroeg}
                  woord="het vertrek"
                  isAnker={r.bepaalt_vertrek}
                  zakelijk={zakelijk}
                  bezig={bezig}
                  onKies={() => teVroeg && onKies(teVroeg, r.id)}
                />
                {!zakelijk && (
                  <span
                    className="text-[11px] text-slate-400"
                    title="Alleen zakelijke ritten tellen mee in de werkdag."
                  >
                    telt niet mee
                  </span>
                )}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1 min-w-0">
              <AdresLink adres={r.adres_start} />
              <span className="text-slate-400">→</span>
              <AdresLink adres={r.adres_stop} />
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * "bepaalt de aankomst" per rit.
 *
 * Alleen zichtbaar als er een afwijking van die soort IS: zonder bevinding valt
 * er niets te herrekenen, en een knop die stilletjes niets doet is erger dan
 * geen knop.
 */
function AnkerKnop({
  afwijking,
  woord,
  isAnker,
  zakelijk,
  bezig,
  onKies,
}: {
  afwijking: WerktijdAfwijking | null
  woord: string
  isAnker: boolean
  zakelijk: boolean
  bezig: boolean
  onKies: () => void
}) {
  if (isAnker) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
        <Flag className="w-3 h-3" />
        bepaalt {woord}
      </span>
    )
  }
  if (!afwijking || !zakelijk) return null
  return (
    <button
      type="button"
      disabled={bezig}
      onClick={onKies}
      title={`Deze rit bepaalt ${woord}; de afwijking wordt erop herrekend.`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-white hover:text-green-700 hover:ring-1 hover:ring-green-300 disabled:opacity-50"
    >
      <Flag className="w-3 h-3" />
      bepaalt {woord}
    </button>
  )
}

/**
 * Het zakelijk/privé-label als knop: klikken wisselt de classificatie.
 *
 * Staat hier en niet de gedeelde `RitTypeToggle` van de rittenlijst: die schrijft
 * alleen de rit weg. Vanuit dit paneel moet de dag daarna opnieuw doorgerekend
 * worden — de werkdag-regels kijken alleen naar zakelijke ritten, dus deze
 * wissel verzet de aankomst, het vertrek en het saldo van de hele dag.
 *
 * Het label staat er ALTIJD, ook bij een zakelijke rit. In de rittenlijst wordt
 * "zakelijk" weggelaten omdat het de normale waarde is; hier is het label de
 * knop, en een knop die alleen verschijnt als er al iets mis is kun je niet
 * gebruiken om iets recht te zetten.
 */
function RitTypeKnop({
  rit,
  bezig,
  onWissel,
}: {
  rit: DagRit
  bezig: boolean
  onWissel: (trip_id: string, nieuwType: 'zakelijk' | 'prive' | null) => void
}) {
  const prive = rit.rit_type !== 'zakelijk'
  const handmatig = rit.rit_type_override != null
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={bezig}
        onClick={() => onWissel(rit.id, prive ? 'zakelijk' : 'prive')}
        title={`Klik om deze rit op ${prive ? 'zakelijk' : 'privé'} te zetten; de dag wordt opnieuw doorgerekend.`}
        className={`text-[10px] px-1.5 py-0.5 rounded-full disabled:opacity-50 ${
          RIT_TYPE_STIJL[rit.rit_type] ?? 'bg-slate-100 text-slate-600'
        } hover:ring-1 hover:ring-slate-400`}
      >
        {rit.rit_type === 'prive' ? 'privé' : rit.rit_type.replace('_', '-')}
        {handmatig && <span className="ml-1 opacity-70">●</span>}
      </button>
      {handmatig && (
        <button
          type="button"
          disabled={bezig}
          onClick={() => onWissel(rit.id, null)}
          title="Terug naar de automatische classificatie (rooster, verlof, dag en tijd)"
          className="text-[10px] text-slate-400 hover:text-slate-700 underline disabled:opacity-50"
        >
          auto
        </button>
      )}
    </span>
  )
}

/**
 * Eén adres uit een rit, met een doorklik naar Google Maps.
 *
 * De ritregistratie levert een straat en plaats, geen coördinaat — daarom een
 * zoekopdracht en geen kaartpin. Bij "de bouw in Zwolle" of "het depot" zegt de
 * tekst je meestal niets; de kaart wel.
 */
function AdresLink({ adres }: { adres: string | null }) {
  if (!adres) return <span className="text-slate-400">—</span>
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`${adres} — opzoeken in Google Maps`}
      className="group inline-flex items-center gap-0.5 min-w-0 hover:text-green-700"
    >
      <MapPin className="w-3 h-3 shrink-0 text-slate-300 group-hover:text-green-600" />
      <span className="truncate group-hover:underline">{adres}</span>
    </a>
  )
}
