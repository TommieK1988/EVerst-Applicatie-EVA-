import Link from 'next/link'
import { ArrowLeft, ParkingCircle } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import ToewijzingLijst, {
  type ToewijzingRij,
} from '@/components/wagenpark/parkeren/ToewijzingLijst'
import HerbeoordeelKnop from '@/components/wagenpark/parkeren/HerbeoordeelKnop'
import { pgQuery } from '@/lib/wagenpark/db'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'voorstel', label: 'Te beoordelen' },
  { key: 'bevestigd', label: 'Toegewezen' },
  { key: 'geen_kandidaat', label: 'Geen project gevonden' },
  { key: 'prive', label: 'Privé' },
  { key: 'afgewezen', label: 'Niet doorbelasten' },
] as const

type Telling = { status: string; aantal: number; bedrag: number }

export default async function ParkerenToewijzenPage(props: {
  searchParams: Promise<{ status?: string; kenteken?: string }>
}) {
  const searchParams = await props.searchParams
  const status = TABS.some((t) => t.key === searchParams.status)
    ? (searchParams.status as string)
    : 'voorstel'
  const filterKenteken = searchParams.kenteken?.trim() ?? ''
  const magPrive = await magPriveRittenZien()

  const [rijen, tellingen] = await Promise.all([
    pgQuery<ToewijzingRij>(
      `
      select
        t.id,
        t.parking_id,
        t.status,
        t.zekerheid,
        t.score,
        t.bedrag::float                                    as bedrag,
        t.aandeel::float                                   as aandeel,
        t.datum::text                                      as datum,
        t.signalen,
        t.bevestiging_bron,
        t.toelichting,
        p.kenteken,
        p.parkeer_starttijd::text                          as parkeer_starttijd,
        p.parkeerlocatie,
        p.parkeerkosten::float                             as parkeerkosten,
        p.duur_seconden,
        -- Zonder het recht op privacygevoelige wagenparkdata blijft de naam weg.
        -- Bewust niet als "onbekend" tonen: dan lijkt het alsof de koppeling
        -- mislukt is, terwijl hij er wel degelijk is.
        case when $3::boolean then trim(concat_ws(' ', m.voornaam, m.tussenvoegsel, m.achternaam))
             else null end                                 as bestuurder,
        not $3::boolean and t.medewerker_id is not null    as bestuurder_afgeschermd,
        d.id                                               as dossier_id,
        d.dossiernummer,
        d.titel                                            as dossier_titel
      from public.parkeer_toewijzingen t
      join public.ulu_parking p on p.id = t.parking_id
      left join public.medewerkers m on m.id = t.medewerker_id
      left join public.dossiers d on d.id = t.dossier_id
      where t.status = $1
        and ($2 = '' or p.kenteken ilike '%' || $2 || '%')
      order by p.parkeer_starttijd desc
      limit 300
      `,
      [status, filterKenteken, magPrive],
    ),
    pgQuery<Telling>(
      `select status, count(*)::int as aantal, coalesce(sum(bedrag), 0)::float as bedrag
         from public.parkeer_toewijzingen
        group by status`,
    ),
  ])

  const per = new Map(tellingen.map((t) => [t.status, t]))
  const open = per.get('voorstel')?.aantal ?? 0
  const toegewezenBedrag = per.get('bevestigd')?.bedrag ?? 0

  return (
    <>
      <PageHeader
        titel="Parkeerkosten toewijzen"
        omschrijving={
          `${open} te beoordelen • €${toegewezenBedrag.toFixed(2)} toegewezen aan een project. ` +
          'Voorstellen zijn gebaseerd op de planning, geschreven uren en de afstand tot het werkadres.'
        }
        actions={
          <div className="flex gap-2">
            <HerbeoordeelKnop />
            <Link
              href="/wagenpark/parkeren"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border bg-white text-sm hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Terug
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const n = per.get(t.key)?.aantal ?? 0
          const actief = t.key === status
          const href =
            `/wagenpark/parkeren/toewijzen?status=${t.key}` +
            (filterKenteken ? `&kenteken=${encodeURIComponent(filterKenteken)}` : '')
          return (
            <Link
              key={t.key}
              href={href}
              className={
                'px-3 py-1.5 rounded-md text-sm border ' +
                (actief ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50')
              }
            >
              {t.label}
              <span className={'ml-2 ' + (actief ? 'text-slate-300' : 'text-slate-400')}>{n}</span>
            </Link>
          )
        })}

        <form className="ml-auto flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input
            type="text"
            name="kenteken"
            defaultValue={filterKenteken}
            placeholder="Filter op kenteken…"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <button type="submit" className="px-4 py-2 rounded-md border bg-white text-sm hover:bg-slate-50">
            Filter
          </button>
        </form>
      </div>

      {rijen.length === 0 ? (
        <EmptyState
          titel={status === 'voorstel' ? 'Niets te beoordelen' : 'Geen regels'}
          omschrijving={
            status === 'voorstel'
              ? 'Alle parkeerkosten in deze periode zijn afgehandeld. Nieuwe regels verschijnen hier zodra de dagelijkse export binnenkomt.'
              : 'Er staan geen parkeerkosten met deze status.'
          }
          icon={ParkingCircle}
        />
      ) : (
        <ToewijzingLijst rijen={rijen} status={status} />
      )}
    </>
  )
}
