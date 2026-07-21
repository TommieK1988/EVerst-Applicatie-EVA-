import Link from 'next/link'
import { RefreshCw, Route, Upload } from 'lucide-react'
import { createClient as createServerClient } from '@everts/database/server'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import RittenTabel, { type RitRij } from '@/components/wagenpark/ritten/RittenTabel'
import RunComplianceButton from '@/components/wagenpark/bevindingen/RunComplianceButton'
import { pgQuery } from '@/lib/wagenpark/db'
import { magPriveRittenZien, ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'
import { RIT_REGELS_SQL } from '@/lib/wagenpark/signalen'
import { laadLayouts } from '@/app/actions/layouts'

export const dynamic = 'force-dynamic'

// Max aantal ritten dat we in één keer in de tabel laden. Filteren/sorteren/
// pagineren gebeurt client-side in OverzichtTabel.
const RITTEN_LIMIT = 1000

export default async function RittenPage() {
  const magPrive = await magPriveRittenZien()
  const eff = ritTypeEffectiefSql('t')

  let user_id: string | null = null
  try {
    const sessionClient = await createServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  // Ritten (privacy-gescoped) + het totaal (voor de header) parallel.
  const [ritten, totaal, layouts] = await Promise.all([
    pgQuery<RitRij>(
      `
      select t.id,
             t.start_datum::text,
             t.start_tijd::text,
             t.stop_tijd::text,
             t.kenteken,
             t.bestuurder_naam_raw,
             t.user_id_ulu::int as user_id_ulu,
             t.afstand_km::float,
             (${eff})::text as rit_type_effectief,
             t.rit_type_handmatig,
             t.rit_type_ulu,
             t.score,
             t.adres_start,
             t.adres_stop,
             bev.bevindingen
        from public.ulu_trips t
        -- Open compliance-bevindingen die aan déze rit hangen (R1, R3, R7, R9,
        -- R10, R11). Persoonlijke signalen (privé-km, rijgedrag) en parkeren
        -- horen op de bestuurderspagina — zie lib/wagenpark/signalen.ts.
        left join lateral (
          select coalesce(
                   json_agg(
                     json_build_object(
                       'id',             b.id,
                       'regel_code',     b.regel_code,
                       'ernst',          b.ernst::text,
                       'omschrijving',   b.omschrijving,
                       'status',         b.status::text,
                       'gegenereerd_op', b.gegenereerd_op::text,
                       'periode_start',  b.periode_start::text,
                       'periode_eind',   b.periode_eind::text,
                       'data',           b.data
                     )
                     order by case b.ernst::text
                                when 'overtreding'  then 0
                                when 'waarschuwing' then 1
                                else 2
                              end
                   ),
                   '[]'::json
                 ) as bevindingen
            from public.compliance_bevindingen b
           where b.trip_id = t.id
             and b.status = 'open'
             and b.regel_code ${RIT_REGELS_SQL}
        ) bev on true
       where ($1::boolean or (${eff})::text = 'zakelijk')
       order by t.start_datum desc, t.start_tijd desc
       limit ${RITTEN_LIMIT}
      `,
      [magPrive],
    ),
    pgQuery<{ aantal: number }>(
      `
      select count(*)::int as aantal
        from public.ulu_trips t
       where ($1::boolean or (${eff})::text = 'zakelijk')
      `,
      [magPrive],
    ),
    user_id ? laadLayouts(user_id, 'wagenpark-ritten') : Promise.resolve([]),
  ])

  const totaalAantal = totaal[0]?.aantal ?? 0
  const gekapt = totaalAantal > RITTEN_LIMIT

  return (
    <>
      <PageHeader
        titel="Ritten"
        omschrijving={
          `${totaalAantal.toLocaleString('nl-NL')} ritten` +
          (magPrive ? '' : ' (alleen zakelijk)') +
          (gekapt ? ` — nieuwste ${RITTEN_LIMIT.toLocaleString('nl-NL')} geladen` : '') +
          '.'
        }
        actions={
          <div className="flex gap-2">
            <RunComplianceButton />
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

      {ritten.length === 0 ? (
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
      ) : (
        <RittenTabel data={ritten} layouts={layouts} user_id={user_id} />
      )}
    </>
  )
}
