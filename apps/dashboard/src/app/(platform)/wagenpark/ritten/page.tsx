import Link from 'next/link'
import { RefreshCw, Route, Upload } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import { pgQuery } from '@/lib/wagenpark/db'
import { formatDatumMetDag, formatKm } from '@/lib/wagenpark/utils'

export const dynamic = 'force-dynamic'

type RitRij = {
  id: string
  start_datum: string
  start_tijd: string
  kenteken: string
  bestuurder_naam_raw: string | null
  afstand_km: number | null
  rit_type_effectief: 'zakelijk' | 'prive' | null
  rit_type_ulu: string | null
  score: number | null
  adres_stop: string | null
}

type BestuurderOptie = { user_id: number; volledige_naam: string | null; ritten: number }

const SCORE_BUCKETS = [
  { id: '<50',  label: '< 50 (kritiek)',  min: 0,  max: 49 },
  { id: '50-69', label: '50 – 69',         min: 50, max: 69 },
  { id: '70-84', label: '70 – 84',         min: 70, max: 84 },
  { id: '85-100', label: '85 – 100',       min: 85, max: 100 },
  { id: 'geen', label: 'zonder score',     min: null, max: null },
]

export default async function RittenPage(
  props: {
    searchParams: Promise<{
      van?: string
      tot?: string
      bestuurder?: string
      type?: string
      score?: string
    }>
  }
) {
  const searchParams = await props.searchParams;
  const van = searchParams.van ?? ''
  const tot = searchParams.tot ?? ''
  const bestuurder = searchParams.bestuurder ?? ''
  const typeFilter = searchParams.type ?? ''
  const scoreFilter = searchParams.score ?? ''
  const bestuurderId = bestuurder ? Number(bestuurder) : null

  const bucket = SCORE_BUCKETS.find((b) => b.id === scoreFilter)
  const scoreMin = bucket && bucket.id !== 'geen' ? bucket.min : null
  const scoreMax = bucket && bucket.id !== 'geen' ? bucket.max : null
  const scoreGeen = bucket?.id === 'geen'

  // Parallel: ritten + bestuurder-opties + totaaltelling
  const [ritten, bestuurders, totaal] = await Promise.all([
    pgQuery<RitRij>(
      `
      select t.id,
             t.start_datum::text,
             t.start_tijd::text,
             t.kenteken,
             t.bestuurder_naam_raw,
             t.afstand_km::float,
             coalesce(t.rit_type_override, t.rit_type_berekend)::text as rit_type_effectief,
             t.rit_type_ulu,
             t.score,
             t.adres_stop
        from public.ulu_trips t
       where ($1 = '' or t.start_datum >= $1::date)
         and ($2 = '' or t.start_datum <= $2::date)
         and ($3::bigint is null or t.user_id_ulu = $3::bigint)
         and ($4 = '' or coalesce(t.rit_type_override, t.rit_type_berekend)::text = $4)
         and (
           ($5::int is null and $6::int is null and not $7::boolean)
           or ($7::boolean and t.score is null)
           or (t.score between $5 and $6)
         )
       order by t.start_datum desc, t.start_tijd desc
       limit 200
      `,
      [van, tot, bestuurderId, typeFilter, scoreMin, scoreMax, scoreGeen],
    ),
    pgQuery<BestuurderOptie>(
      `select u.id as user_id, u.volledige_naam, count(*)::int as ritten
         from public.ulu_trips t
         join public.ulu_users u on u.id = t.user_id_ulu
        group by u.id, u.volledige_naam
        order by u.volledige_naam nulls last`,
    ),
    pgQuery<{ aantal: number }>(
      `
      select count(*)::int as aantal
        from public.ulu_trips t
       where ($1 = '' or t.start_datum >= $1::date)
         and ($2 = '' or t.start_datum <= $2::date)
         and ($3::bigint is null or t.user_id_ulu = $3::bigint)
         and ($4 = '' or coalesce(t.rit_type_override, t.rit_type_berekend)::text = $4)
         and (
           ($5::int is null and $6::int is null and not $7::boolean)
           or ($7::boolean and t.score is null)
           or (t.score between $5 and $6)
         )
      `,
      [van, tot, bestuurderId, typeFilter, scoreMin, scoreMax, scoreGeen],
    ),
  ])

  const totaalAantal = totaal[0]?.aantal ?? 0
  const heeftActieveFilter = !!(van || tot || bestuurder || typeFilter || scoreFilter)

  return (
    <>
      <PageHeader
        titel="Ritten"
        omschrijving={`${totaalAantal.toLocaleString('nl-NL')} ritten${heeftActieveFilter ? ' (gefilterd)' : ''}. Max 200 in lijst — verfijn filters om minder te zien.`}
        actions={
          <div className="flex gap-2">
            <Link
              href="/wagenpark/ritten/import"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md text-sm hover:bg-slate-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Excel-import
            </Link>
            <Link
              href="/wagenpark/ritten/sync"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              ULU sync
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <form
        className="bg-white rounded-lg border p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
      >
        <div>
          <label htmlFor="van" className="block text-xs font-medium text-slate-600 mb-1">
            Vanaf
          </label>
          <input
            id="van"
            name="van"
            type="date"
            defaultValue={van}
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="tot" className="block text-xs font-medium text-slate-600 mb-1">
            Tot en met
          </label>
          <input
            id="tot"
            name="tot"
            type="date"
            defaultValue={tot}
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="bestuurder" className="block text-xs font-medium text-slate-600 mb-1">
            Bestuurder
          </label>
          <select
            id="bestuurder"
            name="bestuurder"
            defaultValue={bestuurder}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Alle bestuurders</option>
            {bestuurders.map((b) => (
              <option key={b.user_id} value={b.user_id}>
                {b.volledige_naam ?? `ULU #${b.user_id}`} ({b.ritten})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="type" className="block text-xs font-medium text-slate-600 mb-1">
            Type (systeem)
          </label>
          <select
            id="type"
            name="type"
            defaultValue={typeFilter}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Alle types</option>
            <option value="zakelijk">Zakelijk</option>
            <option value="prive">Privé</option>
          </select>
        </div>
        <div>
          <label htmlFor="score" className="block text-xs font-medium text-slate-600 mb-1">
            Score
          </label>
          <select
            id="score"
            name="score"
            defaultValue={scoreFilter}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Alle scores</option>
            {SCORE_BUCKETS.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-5 flex gap-2 justify-end pt-1">
          {heeftActieveFilter && (
            <Link
              href="/wagenpark/ritten"
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              Reset
            </Link>
          )}
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm hover:bg-slate-800"
          >
            Filter
          </button>
        </div>
      </form>

      {ritten.length === 0 ? (
        heeftActieveFilter ? (
          <EmptyState
            titel="Geen ritten gevonden"
            omschrijving="Geen ritten matchen de huidige filters. Pas de filters aan of reset."
            icon={Route}
          />
        ) : (
          <EmptyState
            titel="Nog geen ritten"
            omschrijving="Doe een ULU API-sync om direct ritten op te halen."
            icon={Route}
            action={
              <Link
                href="/wagenpark/ritten/sync"
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Eerste sync
              </Link>
            }
          />
        )
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Start</th>
                <th>Kenteken</th>
                <th>Bestuurder</th>
                <th>Bestemming</th>
                <th>Afstand</th>
                <th>Type (systeem)</th>
                <th>ULU</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {ritten.map((r) => (
                <tr key={r.id}>
                  <td>{formatDatumMetDag(r.start_datum)}</td>
                  <td>{r.start_tijd?.slice(0, 5)}</td>
                  <td className="font-mono">{r.kenteken}</td>
                  <td className="max-w-[160px] truncate">{r.bestuurder_naam_raw ?? '—'}</td>
                  <td className="max-w-[220px] truncate">{r.adres_stop ?? '—'}</td>
                  <td>{formatKm(r.afstand_km ?? null, 1)}</td>
                  <td>
                    <span
                      className={
                        r.rit_type_effectief === 'prive'
                          ? 'text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600'
                          : 'text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700'
                      }
                    >
                      {r.rit_type_effectief ?? '—'}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">{r.rit_type_ulu ?? '—'}</td>
                  <td
                    className={
                      r.score != null && r.score < 50
                        ? 'text-red-700 font-medium'
                        : r.score != null && r.score < 70
                        ? 'text-orange-700'
                        : ''
                    }
                  >
                    {r.score ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
