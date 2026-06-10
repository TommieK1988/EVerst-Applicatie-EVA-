import Link from 'next/link'
import { Users } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import BestuurderBijtellingToggle from '@/components/bestuurders/BestuurderBijtellingToggle'
import BestuurderActiefToggle from '@/components/bestuurders/BestuurderActiefToggle'
import { pgQuery } from '@/lib/db'
import { formatKm } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type BestuurderRij = {
  user_id: number
  volledige_naam: string | null
  email: string | null
  bijtelling_betaald: boolean
  actief: boolean
  prive_limiet_km_jaar: number | null
  zakelijk_verwacht_km_jaar: number | null
  laatst_gezien: string | null
  ritten_ytd: number
  km_zakelijk_ytd: number
  km_prive_ytd: number
  bevindingen_open: number
  laatste_kenteken: string | null
  /** Dagen sinds oudste rit in DB voor deze bestuurder (prognose-basis). */
  dagen_met_data: number | null
}

export default async function BestuurdersPage({
  searchParams,
}: {
  searchParams: { toonGearchiveerd?: string }
}) {
  const toonGearchiveerd = searchParams.toonGearchiveerd === '1'
  const jaar = new Date().getFullYear()
  const startYear = `${jaar}-01-01`

  // Aggregatie per bestuurder, links join met trips (ytd) en compliance bevindingen
  const rijen = await pgQuery<BestuurderRij>(
    `
    with ritten as (
      select
        t.user_id_ulu                                        as user_id,
        count(*)::int                                        as ritten_ytd,
        coalesce(sum(case when coalesce(t.rit_type_override, t.rit_type_berekend) = 'zakelijk' then t.afstand_km else 0 end), 0) as km_zakelijk_ytd,
        coalesce(sum(case when coalesce(t.rit_type_override, t.rit_type_berekend) = 'prive'    then t.afstand_km else 0 end), 0) as km_prive_ytd,
        -- oudste rit → basis voor prognose-factor
        min(t.start_datum)                                   as oudste_rit,
        -- laatste rit voor kenteken-lookup
        (array_agg(t.kenteken order by t.start_datum desc, t.start_tijd desc))[1] as laatste_kenteken
      from public.ulu_trips t
      where t.user_id_ulu is not null
        and t.start_datum >= $1
      group by t.user_id_ulu
    ),
    bev as (
      select
        t.user_id_ulu                              as user_id,
        count(*) filter (where b.status = 'open')  as open_count
      from public.compliance_bevindingen b
      join public.ulu_trips t on t.id = b.trip_id
      where t.user_id_ulu is not null
      group by t.user_id_ulu
    )
    select
      u.id                        as user_id,
      u.volledige_naam,
      u.email,
      u.bijtelling_betaald,
      u.actief,
      u.prive_limiet_km_jaar,
      u.zakelijk_verwacht_km_jaar,
      u.laatst_gezien,
      coalesce(r.ritten_ytd, 0)::int        as ritten_ytd,
      coalesce(r.km_zakelijk_ytd, 0)::float as km_zakelijk_ytd,
      coalesce(r.km_prive_ytd, 0)::float    as km_prive_ytd,
      coalesce(bev.open_count, 0)::int      as bevindingen_open,
      r.laatste_kenteken,
      case when r.oudste_rit is not null
           then greatest(1, (current_date - r.oudste_rit + 1))::int
           else null::int end               as dagen_met_data
    from public.ulu_users u
    left join ritten r on r.user_id = u.id
    left join bev    on bev.user_id = u.id
    where ($2::boolean or u.actief)
    order by u.volledige_naam nulls last, u.id
    `,
    [startYear, toonGearchiveerd],
  )

  return (
    <>
      <PageHeader
        titel="Bestuurders"
        omschrijving="Overzicht van alle ULU-bestuurders. Zet bijtelling per persoon — compliance-regels (R2) gebruiken dit."
      />

      <div className="mb-3 flex gap-2 text-sm">
        <Link
          href="?"
          className={
            !toonGearchiveerd
              ? 'px-3 py-1 rounded-full bg-slate-900 text-white text-xs'
              : 'px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs'
          }
        >
          Actief
        </Link>
        <Link
          href="?toonGearchiveerd=1"
          className={
            toonGearchiveerd
              ? 'px-3 py-1 rounded-full bg-slate-900 text-white text-xs'
              : 'px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs'
          }
        >
          Alles (incl. gearchiveerd)
        </Link>
      </div>

      {rijen.length === 0 ? (
        <EmptyState
          titel="Geen bestuurders"
          omschrijving="Doe een ULU-sync om bestuurders te importeren."
          icon={Users}
        />
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Status</th>
                <th>Huidige auto</th>
                <th>Bijtelling</th>
                <th className="text-right">Zakelijk YTD</th>
                <th className="text-right">Prognose zak.</th>
                <th className="text-right">Privé YTD</th>
                <th className="text-right">Prognose privé</th>
                <th className="text-right">Bevind.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((b) => {
                const priveLimiet = b.bijtelling_betaald
                  ? b.prive_limiet_km_jaar ?? 8000
                  : b.prive_limiet_km_jaar ?? 500
                const zakelijkTarget = b.zakelijk_verwacht_km_jaar ?? 12000
                // Factor per bestuurder: gebaseerd op feitelijk beschikbare data
                const dagenData = b.dagen_met_data ?? 1
                const factor = 365 / dagenData
                const prognoseZakelijk = Math.round(b.km_zakelijk_ytd * factor)
                const prognosePrive = Math.round(b.km_prive_ytd * factor)
                const pctZakelijk = prognoseZakelijk / zakelijkTarget
                const pctPrive = prognosePrive / priveLimiet
                const prognoseBetrouwbaar = dagenData >= 30
                return (
                  <tr key={b.user_id} className={!b.actief ? 'opacity-50' : ''}>
                    <td className="font-medium">
                      <Link href={`/bestuurders/${b.user_id}`} className="hover:underline">
                        {b.volledige_naam ?? `ULU #${b.user_id}`}
                      </Link>
                    </td>
                    <td>
                      <BestuurderActiefToggle
                        userId={b.user_id}
                        initial={b.actief}
                        naam={b.volledige_naam ?? `ULU #${b.user_id}`}
                      />
                    </td>
                    <td className="font-mono text-slate-600">{b.laatste_kenteken ?? '—'}</td>
                    <td>
                      <BestuurderBijtellingToggle
                        userId={b.user_id}
                        initial={b.bijtelling_betaald}
                        naam={b.volledige_naam ?? `ULU #${b.user_id}`}
                      />
                    </td>
                    <td className="text-right">{formatKm(b.km_zakelijk_ytd, 0)}</td>
                    <td
                      className={
                        'text-right ' +
                        (!prognoseBetrouwbaar ? 'text-slate-400 italic' :
                         pctZakelijk < 0.5 ? 'text-amber-700' : pctZakelijk > 1.3 ? 'text-blue-700' : '')
                      }
                      title={`Target ${zakelijkTarget.toLocaleString('nl-NL')} km/jaar. Gebaseerd op ${b.ritten_ytd} ritten over ${dagenData} dagen data.${prognoseBetrouwbaar ? '' : ' ⚠ Weinig data (<30 dagen) — prognose indicatief.'}`}
                    >
                      {formatKm(prognoseZakelijk, 0)}
                    </td>
                    <td className="text-right">{formatKm(b.km_prive_ytd, 0)}</td>
                    <td
                      className={
                        'text-right font-medium ' +
                        (!prognoseBetrouwbaar ? 'text-slate-400 italic' :
                         pctPrive >= 1 ? 'text-red-700' : pctPrive >= 0.8 ? 'text-orange-700' : 'text-green-700')
                      }
                      title={`Limiet ${priveLimiet.toLocaleString('nl-NL')} km/jaar ${b.bijtelling_betaald ? '(bijtelling)' : '(geen bijtelling)'}. Basis: ${dagenData} dagen data.${prognoseBetrouwbaar ? '' : ' ⚠ Prognose indicatief.'}`}
                    >
                      {formatKm(prognosePrive, 0)}
                    </td>
                    <td className="text-right">
                      {b.bevindingen_open > 0 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          {b.bevindingen_open}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Link href={`/bestuurders/${b.user_id}`} className="text-sm text-green-700 hover:underline">
                        Details
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-slate-500">
        <p><strong>Uitleg privé-limiet:</strong> met bijtelling = 8.000 km/jaar (rood als overschreden);
        zonder bijtelling = 500 km/jaar (volgens handboek). Override per bestuurder via
        <code className="px-1 mx-1 rounded bg-slate-100">ulu_users.prive_limiet_km_jaar</code>.</p>
      </div>
    </>
  )
}
