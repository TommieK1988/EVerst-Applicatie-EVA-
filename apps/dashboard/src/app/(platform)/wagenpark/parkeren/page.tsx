import Link from 'next/link'
import { ParkingCircle, Upload, LayoutGrid, FolderTree } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import { pgQuery } from '@/lib/wagenpark/db'
import {
  magPriveRittenZien, ritTypeEffectiefSql, ritHorizonVanaf, RITTEN_HORIZON_DAGEN,
} from '@/lib/wagenpark/privacy'
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
  /** Regelcodes + ernst van de open R8-signalen op dit parkeer-record. */
  signalen: { ernst: 'info' | 'waarschuwing' | 'overtreding'; omschrijving: string }[]
  toewijzing: { status: string; dossiernummer: string | null; titel: string | null }[] | null
}

/**
 * Toont waar deze parkeerkost naartoe gaat. Een voorstel is nog geen feit, dus
 * dat wordt als zodanig gelabeld; anders zou de lijst suggereren dat de kosten
 * al verdeeld zijn.
 */
function ProjectCel({
  toewijzing,
}: {
  toewijzing: { status: string; dossiernummer: string | null; titel: string | null }[] | null
}) {
  const rijen = toewijzing ?? []
  const metDossier = rijen.filter((t) => t.dossiernummer || t.titel)

  if (metDossier.length === 0) {
    const status = rijen[0]?.status
    if (status === 'prive') return <span className="text-slate-400">privé</span>
    if (status === 'afgewezen') return <span className="text-slate-400">niet doorbelast</span>
    if (status === 'geen_kandidaat') return <span className="text-slate-400">geen project</span>
    return <span className="text-slate-300">—</span>
  }

  const eerste = metDossier[0]
  const label = eerste.dossiernummer ?? eerste.titel ?? ''
  const isVoorstel = rijen.some((t) => t.status === 'voorstel')

  return (
    <span title={metDossier.map((t) => [t.dossiernummer, t.titel].filter(Boolean).join(' — ')).join(', ')}>
      {metDossier.length > 1 ? `${metDossier.length} projecten` : label}
      {isVoorstel && <span className="ml-1 text-xs text-amber-700">voorstel</span>}
    </span>
  )
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
  // Een parkeertransactie zegt waar iemand stond en hoe lang; zelfde horizon als
  // de ritten. Zie lib/wagenpark/privacy.ts.
  const vanaf = ritHorizonVanaf(magPrive)

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
        limit 1)                                             as bestuurder_naam_raw,
      -- Open R8-signalen op dít parkeer-record (hoge kosten, extreem lang parkeren).
      -- Het maandtotaal per bestuurder heeft geen parking_id en staat op de
      -- bestuurderspagina onder Parkeren.
      -- De omschrijving van een R8-signaal noemt de bestuurder bij naam, dus
      -- zonder privé-recht komen de signalen er niet bij.
      (select coalesce(
                json_agg(json_build_object('ernst', b.ernst::text, 'omschrijving', b.omschrijving)),
                '[]'::json)
         from public.compliance_bevindingen b
        where b.regel_code = 'R8'
          and b.status = 'open'
          and $2::boolean
          and b.data->>'parking_id' = p.id::text)            as signalen,
      -- Toewijzing aan een project. Meerdere rijen alleen bij een handmatige
      -- verdeling over twee dossiers; dan tonen we het aantal in plaats van een naam.
      (select json_agg(json_build_object(
                'status', tw.status,
                'dossiernummer', d.dossiernummer,
                'titel', d.titel))
         from public.parkeer_toewijzingen tw
         left join public.dossiers d on d.id = tw.dossier_id
        where tw.parking_id = p.id)                          as toewijzing
    from public.ulu_parking p
    where ($1 = '' or p.kenteken ilike '%' || $1 || '%')
      and ($3::date is null or p.parkeer_starttijd >= $3::date)
    order by p.parkeer_starttijd desc
    limit 200
    `,
    [filterKenteken, magPrive, vanaf],
  )

  const totalen = await pgQuery<{
    totaal: number
    totaal_kosten: number
    lang: number
    dag_duurste: number
    te_beoordelen: number
    toegewezen_kosten: number
  }>(
    `
    select
      count(*)::int                                    as totaal,
      coalesce(sum(parkeerkosten), 0)::float           as totaal_kosten,
      count(*) filter (where duur_seconden > 3600)::int as lang,
      coalesce(max(parkeerkosten), 0)::float           as dag_duurste,
      (select count(*) from public.parkeer_toewijzingen where status = 'voorstel')::int
                                                       as te_beoordelen,
      (select coalesce(sum(bedrag), 0) from public.parkeer_toewijzingen where status = 'bevestigd')::float
                                                       as toegewezen_kosten
    from public.ulu_parking
    where ($1::date is null or parkeer_starttijd >= $1::date)
    `,
    [vanaf],
  )
  const stat = totalen[0]

  return (
    <>
      <PageHeader
        titel="Parkeren"
        omschrijving={
          `${stat?.totaal ?? 0} parkeer-records • totale kosten €${(stat?.totaal_kosten ?? 0).toFixed(2)} • ` +
          `€${(stat?.toegewezen_kosten ?? 0).toFixed(2)} toegewezen aan een project • ` +
          `${stat?.lang ?? 0} langer dan 1 uur${magPrive ? '' : ` (laatste ${RITTEN_HORIZON_DAGEN} dagen)`}.`
        }
        actions={
          <div className="flex gap-2">
            <Link
              href="/wagenpark/parkeren/toewijzen"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border bg-white text-sm hover:bg-slate-50"
            >
              <FolderTree className="w-4 h-4" />
              Toewijzen
              {(stat?.te_beoordelen ?? 0) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">
                  {stat!.te_beoordelen}
                </span>
              )}
            </Link>
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
                <th>Project</th>
                <th className="text-right">Duur</th>
                <th className="text-right">Kosten</th>
                <th>Signaal</th>
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
                    <td className="max-w-[200px] truncate">
                      <ProjectCel toewijzing={r.toewijzing} />
                    </td>
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
                    <td className="max-w-[280px]">
                      {(r.signalen ?? []).length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span
                          className={
                            'text-xs px-2 py-0.5 rounded-full ' +
                            (r.signalen.some((s) => s.ernst === 'waarschuwing')
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-blue-100 text-blue-700')
                          }
                          title={r.signalen.map((s) => s.omschrijving).join('\n')}
                        >
                          {r.signalen.length === 1 ? 'R8' : `R8 ×${r.signalen.length}`}
                        </span>
                      )}
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
