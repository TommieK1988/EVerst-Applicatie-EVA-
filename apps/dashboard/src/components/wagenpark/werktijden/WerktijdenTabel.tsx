'use client'

import React, { useCallback, useMemo, useState } from 'react'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { formatDatumMetDag } from '@/lib/wagenpark/utils'
import {
  minutenLabel, urenLabel, teltMee, omrekening, UREN_PER_WERKDAG,
  SOORT_LABEL, dagSaldoUren, saldoLabel,
} from '@/lib/wagenpark/werktijd'
import { telSaldo } from '@/lib/wagenpark/werktijd-samenvatting'

import DagPaneel from '@/components/wagenpark/werktijden/DagPaneel'

import {
  GEEN_SIGNAAL,
  afwijkingenVanDag,
  dagAfgedaan,
  dagStatus,
  dagVerklaard,
  heeftSignaal,
  type WerktijdAfwijking,
  type WerktijdBevindingRij,
  type WerktijdRij,
} from '@/lib/wagenpark/werktijd-dag'

// Doorgeven voor de bestaande importeurs; de definities staan in werktijd-dag.ts.
export type { WerktijdAfwijking, WerktijdBevindingRij, WerktijdRij }
export { GEEN_SIGNAAL, afwijkingenVanDag, dagAfgedaan, dagStatus, dagVerklaard, heeftSignaal }

/**
 * Statuslabels in de taal van dit scherm.
 *
 * LET OP: `afgewezen` betekent hier NIET "signaal ingetrokken" maar
 * "verklaring afgewezen, overtreding bevestigd" — zie
 * app/(platform)/wagenpark/actions/werktijd-afhandeling.ts.
 */
const STATUS_LABEL: Record<string, string> = {
  [GEEN_SIGNAAL]: 'Geen afwijking',
  open: 'Te controleren',
  geaccepteerd_uitzondering: 'Verklaard',
  afgewezen: 'Bespreken',
  opgelost: 'Opgelost',
}

const STATUS_STIJL: Record<string, string> = {
  [GEEN_SIGNAAL]: 'bg-slate-50 text-slate-400',
  open: 'bg-slate-100 text-slate-600',
  geaccepteerd_uitzondering: 'bg-green-100 text-green-700',
  afgewezen: 'bg-red-100 text-red-700',
  opgelost: 'bg-green-100 text-green-700',
}

function tijd(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

const statusLabel = (r: WerktijdRij) => STATUS_LABEL[dagStatus(r)] ?? dagStatus(r)

/**
 * Eén afwijkingscel: de minuten, met de tijden erachter als tooltip.
 *
 * Een verklaarde afwijking blijft staan maar wordt doorgestreept — je moet
 * kunnen zien wat er is weggestreept, en meteen dat het nergens meetelt.
 */
function AfwijkingCel({ afwijking }: { afwijking: WerktijdAfwijking | null }) {
  if (!afwijking) return <span className="text-slate-300">—</span>
  const uitleg = `Rooster ${tijd(afwijking.verwacht)}, werkelijk ${tijd(afwijking.werkelijk)}`
  if (!teltMee(afwijking.status)) {
    return (
      <span className="text-slate-400 line-through" title={`${uitleg} · verklaard, telt niet mee`}>
        {minutenLabel(afwijking.minuten)}
      </span>
    )
  }
  return (
    <span
      className={`font-medium ${
        afwijking.ernst === 'overtreding'
          ? 'text-red-700'
          : afwijking.ernst === 'info'
            ? 'text-slate-500'
            : 'text-orange-700'
      }`}
      // Nul minuten komt alleen voor als de bepalende rit handmatig is
      // aangewezen en de afwijking daarmee wegvalt. De dag blijft in de lijst
      // staan zodat die keuze zichtbaar en omkeerbaar blijft.
      title={
        afwijking.minuten === 0 ? `${uitleg} · geen afwijking meer na handmatige correctie` : uitleg
      }
    >
      {minutenLabel(afwijking.minuten)}
    </span>
  )
}

/**
 * De rekensom achter de netto aanwezigheid, als tooltip.
 *
 * Staat er geen pauze in het rooster, dan is er niets afgetrokken en moet dat
 * er expliciet bij: anders leest een bruto dag als een netto dag en lijkt
 * iedereen zonder pauze in zijn rooster een half uur langer te werken.
 */
function aanwezigUitleg(r: WerktijdRij): string {
  const bruto = (r.aanwezigMinuten ?? 0) + r.pauzeMinuten
  const basis = `${r.aankomst}–${r.vertrek} = ${minutenLabel(bruto)} bruto`
  if (r.pauzeMinuten > 0) {
    return `${basis}, min ${minutenLabel(r.pauzeMinuten)} pauze uit het rooster.`
  }
  return r.pauzeInRooster
    ? `${basis}. De roosterpauze valt buiten dit venster, dus er is niets afgetrokken.`
    : `${basis}. Er staat geen pauze in het rooster van deze medewerker, dus er is niets afgetrokken.`
}

export default function WerktijdenTabel({
  data,
  layouts,
  user_id,
}: {
  data: WerktijdRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}) {
  // Het zijpaneel houdt het id vast, niet de rij zelf: na het afvinken komt er
  // via revalidatePath verse data binnen, en een vastgehouden object zou dan de
  // oude status blijven tonen.
  const [geopendId, setGeopendId] = useState<string | null>(null)
  const geopend = useMemo(
    () => (geopendId ? data.find((r) => r.id === geopendId) ?? null : null),
    [data, geopendId],
  )
  const bestuurderOpties = useMemo(
    () => [...new Set(data.map((r) => r.bestuurder))].sort((a, b) => a.localeCompare(b, 'nl')),
    [data],
  )

  const kolommen = useMemo<KolomDefinitie<WerktijdRij>[]>(
    () => [
      {
        key: 'datum',
        label: 'Datum',
        vast: true,
        breedte: 150,
        sorteerWaarde: (r) => r.datum,
        render: (r) => formatDatumMetDag(r.datum),
      },
      {
        key: 'bestuurder',
        label: 'Medewerker',
        breedte: 180,
        // De lijst gaat altijd over één medewerker en zijn naam staat al boven
        // het blok; een kolom die twintig keer hetzelfde herhaalt kost alleen
        // ruimte. Aan te zetten via kolombeheer als iemand hem toch wil.
        standaard_zichtbaar: false,
        filterType: 'select',
        filterOpties: bestuurderOpties,
        sorteerWaarde: (r) => r.bestuurder,
        render: (r) => <span className="block max-w-[180px] truncate">{r.bestuurder}</span>,
      },
      {
        key: 'week',
        label: 'Week',
        breedte: 90,
        standaard_zichtbaar: false,
        sorteerWaarde: (r) => r.week,
        render: (r) => <span className="text-slate-500">{r.week}</span>,
      },
      {
        // Twee aparte kolommen in plaats van één "soort" + "afwijking": een dag
        // kan allebei zijn, en dan is de vraag niet wélke van de twee maar hoe
        // groot elk van beide was. Sorteren op "te vroeg weg" is bovendien een
        // andere vraag dan sorteren op "te laat gekomen".
        key: 'telaat',
        label: 'Te laat',
        breedte: 120,
        sorteerWaarde: (r) => r.teLaat?.minuten ?? -1,
        render: (r) => <AfwijkingCel afwijking={r.teLaat} />,
      },
      {
        key: 'tevroeg',
        label: 'Te vroeg',
        breedte: 120,
        sorteerWaarde: (r) => r.teVroeg?.minuten ?? -1,
        render: (r) => <AfwijkingCel afwijking={r.teVroeg} />,
      },
      {
        // De roostertijden waar tegenaan gemeten is. Standaard uit: ze zijn
        // voor iedereen bijna altijd hetzelfde, en de afwijking zelf staat er
        // al. Aan te zetten als je een specifieke dag natrekt.
        key: 'roostertijd',
        label: 'Roostertijd',
        breedte: 130,
        standaard_zichtbaar: false,
        sorteerWaarde: (r) => r.roosterStart ?? '',
        render: (r) => {
          const start = r.roosterStart
          const eind = r.roosterEind
          if (!start && !eind) return <span className="text-slate-300">—</span>
          const benadering = r.teLaat?.benadering || r.teVroeg?.benadering
          return (
            <span
              className={benadering ? 'text-slate-400' : ''}
              title={
                benadering
                  ? 'Benadering: op deze datum gold nog geen rooster, het dichtstbijzijnde is gebruikt.'
                  : undefined
              }
            >
              {tijd(start ?? null)}–{tijd(eind ?? null)}
              {benadering && <span className="ml-1 text-[10px]">≈</span>}
            </span>
          )
        },
      },
      {
        // Het venster waarin de auto op het werk stond. Zonder de tijden erbij
        // is "8u12" niet na te rekenen, dus die staan in dezelfde cel.
        key: 'aanwezig',
        label: 'Aanwezig (netto)',
        breedte: 150,
        sorteerWaarde: (r) => r.aanwezigMinuten ?? -1,
        render: (r) =>
          r.aanwezigMinuten == null ? (
            <span className="text-slate-300" title={r.aanwezigReden ?? 'Niet te bepalen'}>
              —
            </span>
          ) : (
            <span className="tabular-nums" title={aanwezigUitleg(r)}>
              <span className="font-medium text-slate-700">
                {minutenLabel(r.aanwezigMinuten)}
              </span>
              <span className="ml-1.5 text-xs text-slate-400">
                {r.aankomst}–{r.vertrek}
              </span>
            </span>
          ),
      },
      {
        // Alleen de arbeidskant van de urenstaat. Verlof en ziek horen hier niet
        // in: die uren zijn geen aanwezigheid en zouden het saldo hiernaast
        // stilletjes goedpraten.
        key: 'arbeidsuren',
        label: 'Arbeidsuren',
        breedte: 120,
        sorteerWaarde: (r) => r.arbeidsuren ?? -1,
        render: (r) =>
          r.arbeidsuren == null ? (
            <span
              className="text-slate-300"
              title="Geen arbeidsuren te bepalen: Bouw7 niet bereikbaar, geen koppeling met een medewerker, of de geboekte uursoort is nog niet ingedeeld in Stamgegevens → Uren."
            >
              —
            </span>
          ) : (
            <span
              className={`tabular-nums ${r.arbeidsuren === 0 ? 'text-slate-400' : 'text-slate-700'}`}
              title={r.uursoorten ?? undefined}
            >
              {urenLabel(r.arbeidsuren)} u
            </span>
          ),
      },
      {
        // Waar het om draait: aanwezig min verantwoord. Kleur alleen bij een
        // afwijking van meer dan een half uur — kleinere verschillen zitten
        // binnen de meetfout van een rittenregistratie.
        key: 'saldo',
        label: 'Saldo',
        breedte: 110,
        sorteerWaarde: (r) => dagSaldoUren(r.aanwezigMinuten, r.arbeidsuren) ?? 0,
        render: (r) => {
          const saldo = dagSaldoUren(r.aanwezigMinuten, r.arbeidsuren)
          if (saldo == null) {
            return (
              <span className="text-slate-300" title="Aanwezigheid of arbeidsuren onbekend">
                —
              </span>
            )
          }
          // Een afgedane dag — verklaard of als tijd voor tijd gereserveerd —
          // telt niet mee in het totaal en wordt daarom doorgestreept getoond:
          // zichtbaar, maar duidelijk buiten de som.
          if (dagAfgedaan(r)) {
            return (
              <span
                className="tabular-nums text-slate-400 line-through"
                title={
                  r.tvtUren != null
                    ? 'Gereserveerd als tijd voor tijd — telt niet mee in het saldo'
                    : 'Verklaard — telt niet mee in het saldo'
                }
              >
                {saldoLabel(saldo)}
              </span>
            )
          }
          const kleur =
            saldo <= -0.5 ? 'text-red-700' : saldo >= 0.5 ? 'text-emerald-700' : 'text-slate-500'
          return (
            <span
              className={`tabular-nums font-medium ${kleur}`}
              title={
                saldo < 0
                  ? 'Meer arbeidsuren geschreven dan de auto op het werk stond.'
                  : saldo > 0
                    ? 'Langer aanwezig dan er arbeidsuren geschreven zijn.'
                    : 'Aanwezigheid en geschreven arbeidsuren lopen gelijk.'
              }
            >
              {saldoLabel(saldo)}
            </span>
          )
        },
      },
      {
        key: 'tvt',
        label: 'Tijd voor tijd',
        breedte: 130,
        sorteerWaarde: (r) => r.tvtUren ?? 0,
        render: (r) =>
          r.tvtUren == null ? (
            <span className="text-slate-300">—</span>
          ) : (
            <span
              className="tabular-nums font-medium text-sky-700"
              title={
                r.tvtToelichting
                  ? `${r.tvtToelichting} — gereserveerd, telt niet meer in het saldo`
                  : 'Gereserveerd als tijd voor tijd; telt niet meer in het saldo'
              }
            >
              {saldoLabel(r.tvtUren)}
            </span>
          ),
      },
      {
        // Controlekolom: schreef deze medewerker die dag genoeg uren? Getal, dus
        // sorteerbaar op "veel afwijking maar toch volle dag geboekt" — precies
        // de regels die je wilt bekijken.
        key: 'geboekt',
        label: 'Geboekt (totaal)',
        breedte: 130,
        // Het totaal inclusief verlof staat naast de arbeidsuren en is daarmee
        // een dubbeling; standaard uit, aan te zetten via kolombeheer.
        standaard_zichtbaar: false,
        sorteerWaarde: (r) => r.geboekt ?? -1,
        render: (r) =>
          r.geboekt == null ? (
            <span className="text-slate-300" title="Uren niet opgehaald uit Bouw7">
              —
            </span>
          ) : (
            <span
              className={`tabular-nums ${r.geboekt === 0 ? 'text-slate-400' : 'text-slate-700'}`}
            >
              {urenLabel(r.geboekt)} u
            </span>
          ),
      },
      {
        key: 'uursoorten',
        label: 'Uursoorten',
        breedte: 240,
        sorteerWaarde: (r) => r.uursoorten ?? '',
        render: (r) => (
          <span className="block max-w-[240px] truncate text-xs text-slate-600" title={r.uursoorten ?? ''}>
            {r.uursoorten ?? '—'}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        breedte: 130,
        filterType: 'select',
        filterOpties: [...new Set(data.map((r) => statusLabel(r)))],
        sorteerWaarde: (r) => statusLabel(r),
        render: (r) => {
          const st = dagStatus(r)
          return (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                STATUS_STIJL[st] ?? 'bg-slate-100 text-slate-600'
              }`}
              // Twee afwijkingen kunnen elk hun eigen status hebben; de kolom
              // toont de dag, de tooltip de onderdelen.
              title={
                afwijkingenVanDag(r).length > 1
                  ? afwijkingenVanDag(r)
                      .map((a) => `${SOORT_LABEL[a.soort]}: ${STATUS_LABEL[a.status] ?? a.status}`)
                      .join(' · ')
                  : undefined
              }
            >
              {STATUS_LABEL[st] ?? st}
            </span>
          )
        },
      },
    ],
    [bestuurderOpties, data],
  )

  // Totalen onder aan het Excel-bestand. Verklaarde dagen staan er apart onder,
  // zodat de medewerker ziet wat er is weggestreept en het totaal toch klopt.
  const exportTotalen = useCallback((gefilterd: WerktijdRij[]) => {
    let laat = 0
    let vroeg = 0
    let verklaard = 0
    let verklaardDagen = 0
    let zonderAfwijking = 0
    for (const r of gefilterd) {
      if (!heeftSignaal(r)) {
        zonderAfwijking += 1
        continue
      }
      if (dagVerklaard(r)) verklaardDagen += 1
      for (const a of afwijkingenVanDag(r)) {
        // Per afwijking, niet per dag: een dag kan een verklaarde late aankomst
        // en een openstaand vroeg vertrek hebben, en die horen elk in hun eigen
        // kolom van dit blok.
        if (!teltMee(a.status)) {
          verklaard += a.minuten
          continue
        }
        if (a.soort === 'te_laat') laat += a.minuten
        else vroeg += a.minuten
      }
    }
    const totaal = laat + vroeg
    const om = omrekening(totaal)
    const saldo = telSaldo(gefilterd)
    return [
      ['Totaal te laat (minuten)', laat],
      ['Totaal te vroeg (minuten)', vroeg],
      ['Totaal (minuten)', totaal],
      ['Totaal (uren)', om.uren],
      [`Totaal (werkdagen bij ${UREN_PER_WERKDAG} uur per dag)`, om.dagen],
      ['', ''],
      [`Verklaard, telt niet mee (minuten) — ${verklaardDagen} dagen`, verklaard],
      ['Dagen zonder afwijking', zonderAfwijking],
      ['', ''],
      [`Aanwezig netto (uren) — ${saldo.dagen} dagen met een bruikbaar venster`, saldo.aanwezigUren],
      ['Geboekte arbeidsuren over diezelfde dagen', saldo.arbeidsuren],
      ['Saldo (uren)', saldo.saldoUren],
      [`Gereserveerd als tijd voor tijd (uren) — ${saldo.tvtDagen} dagen`, saldo.tvtUren],
      [`Buiten het saldo: verklaard (${saldo.verklaard} dagen) en niet te meten (${saldo.overgeslagen} dagen)`, ''],
    ]
  }, [])

  return (
    <>
      <OverzichtTabel
        scherm="wagenpark-werktijden"
        data={data}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        beginSortering={[{ id: 'datum', desc: true }]}
        selecteerbaar={false}
        toonRijActie={false}
        dicht
        exportExtraRijen={exportTotalen}
        onRijKlik={(r) => setGeopendId(r.id)}
      />

      <DagPaneel
        rij={geopend}
        onClose={() => setGeopendId(null)}
        // Wordt de bepalende rit verzet, dan is de dag herrekend en zit hij in
        // een andere bevinding-rij. Het paneel schuift mee; is er geen signaal
        // meer over, dan gaat het dicht.
        onVervangen={(id) => setGeopendId(id)}
      />
    </>
  )
}
