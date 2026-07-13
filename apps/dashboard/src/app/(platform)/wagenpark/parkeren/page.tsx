import Link from 'next/link'
import { ParkingCircle, Upload, LayoutGrid } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import { pgQuery } from '@/lib/wagenpark/db'
import { magPriveRittenZien, ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'
import { formatDatum } from '@/lib/wagenpark/utils'

export const dynamic = 'force-dynamic'

type ParkingRij = {
  id: string
  kenteken: string
  parkeer_starttijd: string
  parkeerlocatie: string | null
  parkeerkosten: number | null
  duur_seconden: number | null
  bestuurder_naam_raw: string | null
}

export default async function ParkerenPage(
  props: {
    searchParams: Promise<{ kenteken?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const filterKenteken = searchParams.kenteken?.trim() ?? ''
  const magPrive = await magPriveRittenZien()
  const eff = ritTypeEffectiefSql('t')

  // Haal per parkeer-record ook de bijbehorende bestuurder op (via trip op zelfde dag/kenteken).
  // Zonder privé-recht matchen we alleen op effectief-zakelijke ritten, zodat we geen
  // bestuurder onthullen via een privé-rit.
  const rijen = await pgQuery<ParkingRij>(
    `
    select
      p.id,
      p.kenteken,
      p.parkeer_starttijd::text                              as parkeer_starttijd,
      p.parkeerlocatie,
      p.parkeerkosten::float                                 as parkeerkosten,
      p.duur_seconden,
      (select t.bestuurder_naam_raw from public.ulu_trips t
        where t.kenteken = p.kenteken
          and t.start_datum = (p.parkeer_starttijd::date)
          and ($2::boolean or (${eff}) = 'zakelijk')
        order by abs(extract(epoch from (t.start_datum::timestamp + t.start_tijd) - p.parkeer_starttijd))
        limit 1)                                             as bestuurder_naam_raw
    from public.ulu_parking p
    where ($1 = '' or p.kenteken ilike '%' || $1 || '%')
    order by p.parkeer_starttijd desc
    limit 200
    `,
    [filterKenteken, magPrive],
  )

  const totalen = await pgQuery<{
    totaal: number
    totaal_kosten: number
    lang: number
    dag_duurste: number
  }>(
    `
    select
      count(*)::int                                    as totaal,
      coalesce(sum(parkeerkosten), 0)::float           as totaal_kosten,
      count(*) filter (where duur_seconden > 3600)::int as lang,
      coalesce(max(parkeerkosten), 0)::float           as dag_duurste
    from public.ulu_parking
    `,
  )
  const stat = totalen[0]

  return (
    <>
      <PageHeader
        titel="Parkeren"
        omschrijving={`${stat?.totaal ?? 0} parkeer-records • totale kosten €${(stat?.totaal_kosten ?? 0).toFixed(2)} • ${stat?.lang ?? 0} langer dan 1 uur.`}
        actions={
          <div className="flex gap-2">
            <Link
              href="/wagenpark/parkeren/zones"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm hover:bg-slate-800 transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              Per zone
            </Link>
            <Link
              href="/wagenpark/parkeren/import"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Excel importeren
            </Link>
          </div>
        }
      />

      <div className="mb-4">
        <form className="flex gap-2">
          <input
            type="text"
            name="kenteken"
            defaultValue={filterKenteken}
            placeholder="Filter op kenteken…"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-md border bg-white text-sm hover:bg-slate-50"
          >
            Filter
          </button>
          {filterKenteken && (
            <Link href="/wagenpark/parkeren" className="px-3 py-2 text-sm text-slate-600 hover:underline">
              Reset
            </Link>
          )}
        </form>
      </div>

      {rijen.length === 0 ? (
        <EmptyState
          titel="Geen parkeer-records"
          omschrijving="Upload de ULU parking-export via de knop bovenaan. De ULU API biedt parking-data niet aan, dus dit moet via Excel."
          icon={ParkingCircle}
        />
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Starttijd</th>
                <th>Kenteken</th>
                <th>Bestuurder (match)</th>
                <th>Locatie</th>
                <th className="text-right">Duur</th>
                <th className="text-right">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((r) => {
                const dur = r.duur_seconden ?? 0
                const durLabel =
                  dur >= 3600
                    ? `${(dur / 3600).toFixed(1)} u`
                    : dur >= 60
                    ? `${Math.round(dur / 60)} min`
                    : `${dur} s`
                return (
                  <tr key={r.id}>
                    <td>
                      {new Date(r.parkeer_starttijd).toLocaleString('nl-NL', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="">{r.kenteken}</td>
                    <td className="text-slate-700">{r.bestuurder_naam_raw ?? '—'}</td>
                    <td className="max-w-[280px] truncate">{r.parkeerlocatie ?? '—'}</td>
                    <td className={'text-right ' + (dur > 3600 ? 'text-orange-700' : '')}>
                      {durLabel}
                    </td>
                    <td
                      className={
                        'text-right ' +
                        (r.parkeerkosten && r.parkeerkosten > 5 ? 'text-red-700 font-medium' : '')
                      }
                    >
                      {r.parkeerkosten != null && r.parkeerkosten > 0
                        ? `€${r.parkeerkosten.toFixed(2)}`
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
