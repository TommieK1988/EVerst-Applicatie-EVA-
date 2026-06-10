import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import { pgQuery } from '@/lib/wagenpark/db'

export const dynamic = 'force-dynamic'

type VoertuigZoneTotaal = {
  kenteken: string
  zone: string
  aantal: number
  totaal_kosten: number
  totaal_duur_min: number
}

type ZoneTotaal = {
  stad: string
  zone: string
  aantal: number
  totaal_kosten: number
  voertuigen: number
}

type StadTotaal = {
  stad: string
  aantal: number
  totaal_kosten: number
  zones: number
  voertuigen: number
}

type VoertuigTotaal = {
  kenteken: string
  aantal: number
  totaal_kosten: number
  zones: number
}

// Zone = ULU-code + straat (alles vóór de laatste komma).
// Stad = alles na de laatste komma (gemeente).
// Input:  "1946 3e Joan Maetsuyckerstraat, Den Haag"
// Zone:   "1946 3e Joan Maetsuyckerstraat"
// Stad:   "Den Haag"
const ZONE_SQL = `
  trim(regexp_replace(coalesce(parkeerlocatie, ''), ',[^,]+$', ''))
`
const STAD_SQL = `
  trim(case
    when position(',' in coalesce(parkeerlocatie, '')) > 0
      then split_part(parkeerlocatie, ',', -1)
    else '—'
  end)
`

export default async function ParkeerZonesPage(
  props: {
    searchParams: Promise<{ kenteken?: string; zone?: string; van?: string; tot?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const kentekenFilter = searchParams.kenteken?.trim() ?? ''
  const zoneFilter = searchParams.zone?.trim() ?? ''
  const van = searchParams.van ?? ''
  const tot = searchParams.tot ?? ''

  const wherePart = `
    where ($1 = '' or kenteken ilike '%' || $1 || '%')
      and ($2 = '' or ${ZONE_SQL} ilike '%' || $2 || '%')
      and ($3 = '' or parkeer_starttijd::date >= $3::date)
      and ($4 = '' or parkeer_starttijd::date <= $4::date)
  `

  const [perVoertuigZone, perZone, perStad, perVoertuig, totaal] = await Promise.all([
    pgQuery<VoertuigZoneTotaal>(
      `
      select kenteken,
             coalesce(nullif(${ZONE_SQL}, ''), '—') as zone,
             count(*)::int as aantal,
             coalesce(sum(parkeerkosten), 0)::float as totaal_kosten,
             coalesce(sum(duur_seconden) / 60.0, 0)::float as totaal_duur_min
        from public.ulu_parking
      ${wherePart}
       group by kenteken, zone
       order by kenteken, totaal_kosten desc
      `,
      [kentekenFilter, zoneFilter, van, tot],
    ),
    pgQuery<ZoneTotaal>(
      `
      select coalesce(nullif(${STAD_SQL}, ''), '—') as stad,
             coalesce(nullif(${ZONE_SQL}, ''), '—') as zone,
             count(*)::int as aantal,
             coalesce(sum(parkeerkosten), 0)::float as totaal_kosten,
             count(distinct kenteken)::int as voertuigen
        from public.ulu_parking
      ${wherePart}
       group by stad, zone
       order by stad, totaal_kosten desc, aantal desc
      `,
      [kentekenFilter, zoneFilter, van, tot],
    ),
    pgQuery<StadTotaal>(
      `
      select coalesce(nullif(${STAD_SQL}, ''), '—') as stad,
             count(*)::int as aantal,
             coalesce(sum(parkeerkosten), 0)::float as totaal_kosten,
             count(distinct ${ZONE_SQL})::int as zones,
             count(distinct kenteken)::int as voertuigen
        from public.ulu_parking
      ${wherePart}
       group by stad
       order by totaal_kosten desc, aantal desc
      `,
      [kentekenFilter, zoneFilter, van, tot],
    ),
    pgQuery<VoertuigTotaal>(
      `
      select kenteken,
             count(*)::int as aantal,
             coalesce(sum(parkeerkosten), 0)::float as totaal_kosten,
             count(distinct ${ZONE_SQL})::int as zones
        from public.ulu_parking
      ${wherePart}
       group by kenteken
       order by totaal_kosten desc
      `,
      [kentekenFilter, zoneFilter, van, tot],
    ),
    pgQuery<{ aantal: number; totaal_kosten: number; unieke_zones: number }>(
      `
      select count(*)::int as aantal,
             coalesce(sum(parkeerkosten), 0)::float as totaal_kosten,
             count(distinct ${ZONE_SQL})::int as unieke_zones
        from public.ulu_parking
      ${wherePart}
      `,
      [kentekenFilter, zoneFilter, van, tot],
    ),
  ])
  const tot_ = totaal[0] ?? { aantal: 0, totaal_kosten: 0, unieke_zones: 0 }

  return (
    <>
      <PageHeader
        titel="Parkeerkosten per zone"
        omschrijving={
          `${tot_.aantal} parkeer-records in ${tot_.unieke_zones} zones • totale kosten €${tot_.totaal_kosten.toFixed(2)} — ` +
          `gebruik dit overzicht voor doorbelasting aan klanten.`
        }
        actions={
          <Link
            href="/wagenpark/parkeren"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug
          </Link>
        }
      />

      {/* Filters */}
      <form className="mb-4 flex flex-wrap gap-2 items-end text-sm">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Kenteken</label>
          <input name="kenteken" defaultValue={kentekenFilter} placeholder="bv. VN-188-P"
            className="rounded border px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Zone / plaats</label>
          <input name="zone" defaultValue={zoneFilter} placeholder="bv. Den Haag"
            className="rounded border px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Van</label>
          <input name="van" defaultValue={van} type="date"
            className="rounded border px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Tot</label>
          <input name="tot" defaultValue={tot} type="date"
            className="rounded border px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="px-3 py-1.5 rounded border bg-white hover:bg-slate-50 text-sm">Filter</button>
        {(kentekenFilter || zoneFilter || van || tot) && (
          <Link href="/wagenpark/parkeren/zones" className="text-sm text-slate-600 hover:underline">Reset</Link>
        )}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Zones per stad — hoofdoverzicht */}
        <section className="bg-white rounded-lg border lg:col-span-2">
          <div className="px-5 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">
              Zones per stad (doorbelasting per klant-locatie)
            </h2>
          </div>
          {perStad.length === 0 ? (
            <p className="text-sm text-slate-500 p-5">Geen data.</p>
          ) : (
            <div className="divide-y">
              {perStad.map((stad) => {
                const zonesInStad = perZone.filter((z) => z.stad === stad.stad)
                return (
                  <details key={stad.stad} className="group" open={perStad.length <= 3}>
                    <summary className="px-5 py-3 cursor-pointer hover:bg-slate-50 flex items-center gap-4">
                      <span className="font-semibold text-slate-800 flex-1">{stad.stad}</span>
                      <span className="text-xs text-slate-500">{stad.zones} zones</span>
                      <span className="text-xs text-slate-500">{stad.voertuigen} voertuigen</span>
                      <span className="text-xs text-slate-500">{stad.aantal} records</span>
                      <span className={stad.totaal_kosten > 0 ? 'font-medium text-slate-900 w-24 text-right' : 'text-slate-400 w-24 text-right'}>
                        {stad.totaal_kosten > 0 ? `€ ${stad.totaal_kosten.toFixed(2)}` : '—'}
                      </span>
                    </summary>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Zone</th>
                          <th className="text-right">Voertuigen</th>
                          <th className="text-right">Records</th>
                          <th className="text-right">Totaal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zonesInStad.map((z) => (
                          <tr key={z.zone}>
                            <td className="pl-8">
                              <Link
                                href={`/parkeren/zones?zone=${encodeURIComponent(z.zone)}`}
                                className="hover:underline"
                              >
                                {z.zone}
                              </Link>
                            </td>
                            <td className="text-right">{z.voertuigen}</td>
                            <td className="text-right">{z.aantal}</td>
                            <td className={'text-right ' + (z.totaal_kosten > 0 ? 'font-medium' : 'text-slate-400')}>
                              {z.totaal_kosten > 0 ? `€ ${z.totaal_kosten.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )
              })}
            </div>
          )}
          <div className="px-5 py-2 border-t bg-slate-50 text-xs text-slate-500 text-right">
            Klik op een stad om zones uit/in te klappen
          </div>
        </section>

        {/* Top zones (plat, voor snelle ranking) */}
        <section className="bg-white rounded-lg border">
          <div className="px-5 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">Top zones (flat)</h2>
          </div>
          {perZone.length === 0 ? (
            <p className="text-sm text-slate-500 p-5">Geen data.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Stad</th>
                  <th className="text-right">Records</th>
                  <th className="text-right">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {perZone.slice(0, 30).map((z) => (
                  <tr key={z.stad + '|' + z.zone}>
                    <td>
                      <Link
                        href={`/parkeren/zones?zone=${encodeURIComponent(z.zone)}`}
                        className="hover:underline"
                      >
                        {z.zone}
                      </Link>
                    </td>
                    <td className="text-slate-500">{z.stad}</td>
                    <td className="text-right">{z.aantal}</td>
                    <td className={'text-right ' + (z.totaal_kosten > 0 ? 'font-medium' : 'text-slate-400')}>
                      {z.totaal_kosten > 0 ? `€ ${z.totaal_kosten.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Per voertuig */}
        <section className="bg-white rounded-lg border">
          <div className="px-5 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">Per voertuig</h2>
          </div>
          {perVoertuig.length === 0 ? (
            <p className="text-sm text-slate-500 p-5">Geen data.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kenteken</th>
                  <th className="text-right">Zones</th>
                  <th className="text-right">Records</th>
                  <th className="text-right">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {perVoertuig.map((v) => (
                  <tr key={v.kenteken}>
                    <td>
                      <Link
                        href={`/parkeren/zones?kenteken=${encodeURIComponent(v.kenteken)}`}
                        className="font-mono hover:underline"
                      >
                        {v.kenteken}
                      </Link>
                    </td>
                    <td className="text-right">{v.zones}</td>
                    <td className="text-right">{v.aantal}</td>
                    <td className={'text-right ' + (v.totaal_kosten > 0 ? 'font-medium' : 'text-slate-400')}>
                      {v.totaal_kosten > 0 ? `€ ${v.totaal_kosten.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Kruis-tabel voertuig × zone */}
        <section className="bg-white rounded-lg border lg:col-span-2">
          <div className="px-5 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">
              Voertuig × zone (detailregels voor doorbelasting)
            </h2>
          </div>
          {perVoertuigZone.length === 0 ? (
            <p className="text-sm text-slate-500 p-5">Geen data.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kenteken</th>
                  <th>Zone</th>
                  <th className="text-right">Records</th>
                  <th className="text-right">Totaal duur</th>
                  <th className="text-right">Totaal kosten</th>
                </tr>
              </thead>
              <tbody>
                {perVoertuigZone.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono">{r.kenteken}</td>
                    <td>{r.zone}</td>
                    <td className="text-right">{r.aantal}</td>
                    <td className="text-right">
                      {r.totaal_duur_min > 60
                        ? `${(r.totaal_duur_min / 60).toFixed(1)}u`
                        : `${Math.round(r.totaal_duur_min)} min`}
                    </td>
                    <td className={'text-right ' + (r.totaal_kosten > 0 ? 'font-medium' : 'text-slate-400')}>
                      {r.totaal_kosten > 0 ? `€ ${r.totaal_kosten.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}
