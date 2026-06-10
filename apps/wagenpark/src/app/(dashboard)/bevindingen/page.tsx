import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { pgQuery } from '@/lib/db'
import BevindingRij from '@/components/bevindingen/BevindingRij'
import RunComplianceButton from '@/components/bevindingen/RunComplianceButton'

export const dynamic = 'force-dynamic'

type BevindingRijData = {
  id: string
  regel_code: string
  voertuig_id: string | null
  medewerker_id: string | null
  trip_id: string | null
  periode_start: string | null
  periode_eind: string | null
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  omschrijving: string
  data: unknown
  status: string
  gegenereerd_op: string
  bestuurder_naam: string | null
  kenteken: string | null
  ulu_user_id: number | null
}

type Tellingen = {
  open_overtreding: number
  open_waarschuwing: number
  open_info: number
  open_totaal: number
  uitzonderingen: number
  afgewezen: number
}

type RegelTelling = { regel_code: string; n: number }
type BestuurderTelling = { user_id: number; volledige_naam: string | null; n: number }

export default async function BevindingenPage({
  searchParams,
}: {
  searchParams: { status?: string; ernst?: string; regel?: string; bestuurder?: string }
}) {
  const statusFilter = searchParams.status ?? 'open'
  const ernstFilter = searchParams.ernst ?? ''
  const regelFilter = searchParams.regel ?? ''
  const bestuurderFilter = searchParams.bestuurder ?? ''
  const bestuurderIdNum = bestuurderFilter ? Number(bestuurderFilter) : null

  // Parallel: data + tellingen
  const [bevindingen, tellingenRijen, regelTellingen, bestuurderTellingen] = await Promise.all([
    pgQuery<BevindingRijData>(
      `
      select
        b.id, b.regel_code, b.voertuig_id, b.medewerker_id, b.trip_id,
        b.periode_start::text, b.periode_eind::text,
        b.ernst::text as ernst, b.omschrijving, b.data,
        b.status::text as status, b.gegenereerd_op::text,
        coalesce(
          -- 1. Via trip_id → ulu_trips → ulu_users (R1, R3, R6 per rit)
          (select u.volledige_naam from public.ulu_trips t
             left join public.ulu_users u on u.id = t.user_id_ulu
            where t.id = b.trip_id limit 1),
          -- 2. Via data.user_id_ulu → ulu_users (R2-aggregaten, R6-weekaggregaat)
          (select u.volledige_naam from public.ulu_users u
            where u.id = (b.data->>'user_id_ulu')::bigint),
          -- 3. Label uit data (voor R2 direct gezet)
          b.data->>'label',
          -- 4. Bestuurder als string (R8 parking-match)
          b.data->>'bestuurder',
          -- 5. Via voertuig → actieve bestuurder-koppeling
          (select u.volledige_naam from public.voertuig_bestuurders vb
             join public.ulu_users u on u.id = vb.ulu_user_id
            where vb.voertuig_id = b.voertuig_id and vb.eind_datum is null
            limit 1)
        ) as bestuurder_naam,
        coalesce(
          v.kenteken,
          (select t2.kenteken from public.ulu_trips t2 where t2.id = b.trip_id limit 1)
        ) as kenteken,
        coalesce(
          (b.data->>'user_id_ulu')::bigint,
          (select t4.user_id_ulu from public.ulu_trips t4 where t4.id = b.trip_id limit 1)
        )::int as ulu_user_id
      from public.compliance_bevindingen b
      left join public.voertuigen v on v.id = b.voertuig_id
      where ($1 = 'alle' or b.status::text = $1)
        and ($2 = '' or b.ernst::text = $2)
        and ($3 = '' or b.regel_code = $3)
        and (
          $4::bigint is null
          or (select t3.user_id_ulu from public.ulu_trips t3 where t3.id = b.trip_id limit 1) = $4::bigint
          or (b.data->>'user_id_ulu')::bigint = $4::bigint
        )
      -- Feitelijke datum van de overtreding bepaalt de sortering, niet de sync-tijd
      order by coalesce(b.periode_eind, b.periode_start, b.gegenereerd_op::date) desc,
               b.gegenereerd_op desc
      limit 200
      `,
      [statusFilter, ernstFilter, regelFilter, bestuurderIdNum],
    ),
    pgQuery<Tellingen>(
      `
      select
        count(*) filter (where status = 'open' and ernst = 'overtreding')::int  as open_overtreding,
        count(*) filter (where status = 'open' and ernst = 'waarschuwing')::int as open_waarschuwing,
        count(*) filter (where status = 'open' and ernst = 'info')::int         as open_info,
        count(*) filter (where status = 'open')::int                            as open_totaal,
        count(*) filter (where status = 'geaccepteerd_uitzondering')::int       as uitzonderingen,
        count(*) filter (where status = 'afgewezen')::int                       as afgewezen
      from public.compliance_bevindingen
      `,
    ),
    pgQuery<RegelTelling>(
      `
      select regel_code, count(*)::int as n
      from public.compliance_bevindingen
      where status = 'open'
      group by regel_code
      order by regel_code
      `,
    ),
    pgQuery<BestuurderTelling>(
      `
      with bev_user as (
        select
          b.id,
          coalesce(
            (select t.user_id_ulu from public.ulu_trips t where t.id = b.trip_id limit 1),
            (b.data->>'user_id_ulu')::bigint
          ) as user_id
        from public.compliance_bevindingen b
        where b.status = 'open'
      )
      select bu.user_id::int as user_id, u.volledige_naam, count(*)::int as n
      from bev_user bu
      join public.ulu_users u on u.id = bu.user_id
      where bu.user_id is not null
      group by bu.user_id, u.volledige_naam
      order by n desc, u.volledige_naam
      limit 30
      `,
    ),
  ])

  const t = tellingenRijen[0] ?? {
    open_overtreding: 0, open_waarschuwing: 0, open_info: 0,
    open_totaal: 0, uitzonderingen: 0, afgewezen: 0,
  }

  function qs(patch: Record<string, string | undefined>): string {
    const p = new URLSearchParams()
    const merged: Record<string, string | undefined> = {
      status: statusFilter === 'open' ? undefined : statusFilter,
      ernst: ernstFilter || undefined,
      regel: regelFilter || undefined,
      bestuurder: bestuurderFilter || undefined,
      ...patch,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== '') p.set(k, v)
    }
    const s = p.toString()
    return s ? '?' + s : '?'
  }

  return (
    <>
      <PageHeader
        titel="Compliance-bevindingen"
        omschrijving="Afwijkingen ten opzichte van het werknemers handboek."
        actions={<RunComplianceButton />}
      />

      {/* Ernst-filters — primaire filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <ErnstCard
          label="Open totaal"
          aantal={t.open_totaal}
          kleur="slate"
          href={qs({ ernst: undefined, status: 'open' })}
          actief={statusFilter === 'open' && !ernstFilter}
        />
        <ErnstCard
          label="Overtredingen"
          aantal={t.open_overtreding}
          kleur="rood"
          icon={AlertCircle}
          href={qs({ ernst: 'overtreding', status: 'open' })}
          actief={ernstFilter === 'overtreding' && statusFilter === 'open'}
        />
        <ErnstCard
          label="Waarschuwingen"
          aantal={t.open_waarschuwing}
          kleur="oranje"
          icon={AlertTriangle}
          href={qs({ ernst: 'waarschuwing', status: 'open' })}
          actief={ernstFilter === 'waarschuwing' && statusFilter === 'open'}
        />
        <ErnstCard
          label="Info"
          aantal={t.open_info}
          kleur="blauw"
          icon={Info}
          href={qs({ ernst: 'info', status: 'open' })}
          actief={ernstFilter === 'info' && statusFilter === 'open'}
        />
      </div>

      {/* Status-filters */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs items-center">
        <span className="text-slate-500 pr-1">Status:</span>
        <FilterChip label="Open" href={qs({ status: 'open' })} actief={statusFilter === 'open'} badge={t.open_totaal} />
        <FilterChip label="Uitzonderingen" href={qs({ status: 'geaccepteerd_uitzondering' })} actief={statusFilter === 'geaccepteerd_uitzondering'} badge={t.uitzonderingen} />
        <FilterChip label="Afgewezen" href={qs({ status: 'afgewezen' })} actief={statusFilter === 'afgewezen'} badge={t.afgewezen} />
        <FilterChip label="Alle" href={qs({ status: 'alle' })} actief={statusFilter === 'alle'} />
      </div>

      {/* Regel-filters */}
      {regelTellingen.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs items-center">
          <span className="text-slate-500 pr-1">Regel:</span>
          <FilterChip label="Alle regels" href={qs({ regel: undefined })} actief={!regelFilter} />
          {regelTellingen.map((r) => (
            <FilterChip
              key={r.regel_code}
              label={r.regel_code}
              href={qs({ regel: r.regel_code })}
              actief={regelFilter === r.regel_code}
              badge={r.n}
            />
          ))}
        </div>
      )}

      {/* Bestuurder-filter */}
      {bestuurderTellingen.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs items-center">
          <span className="text-slate-500 pr-1">Bestuurder:</span>
          <FilterChip
            label="Alle bestuurders"
            href={qs({ bestuurder: undefined })}
            actief={!bestuurderFilter}
          />
          {bestuurderTellingen.map((b) => (
            <FilterChip
              key={b.user_id}
              label={b.volledige_naam ?? `ULU #${b.user_id}`}
              href={qs({ bestuurder: String(b.user_id) })}
              actief={bestuurderFilter === String(b.user_id)}
              badge={b.n}
            />
          ))}
        </div>
      )}

      {bevindingen.length === 0 ? (
        <EmptyState
          titel="Geen bevindingen"
          omschrijving="Pas filters aan of draai de compliance-check."
          icon={CheckCircle2}
        />
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {bevindingen.map((b) => (
            <BevindingRij key={b.id} bevinding={b} />
          ))}
          {bevindingen.length === 200 && (
            <div className="px-5 py-3 text-xs text-slate-500 text-center">
              Eerste 200 resultaten — verfijn de filters om minder te zien.
            </div>
          )}
        </div>
      )}
    </>
  )
}

/* -------- UI-subcomponenten -------- */

const kleurMap = {
  slate:  { bg: 'bg-slate-50',   ring: 'ring-slate-200',   text: 'text-slate-700',  active: 'bg-slate-900 text-white ring-slate-900' },
  rood:   { bg: 'bg-red-50',     ring: 'ring-red-200',     text: 'text-red-700',    active: 'bg-red-600 text-white ring-red-600' },
  oranje: { bg: 'bg-orange-50',  ring: 'ring-orange-200',  text: 'text-orange-700', active: 'bg-orange-600 text-white ring-orange-600' },
  blauw:  { bg: 'bg-blue-50',    ring: 'ring-blue-200',    text: 'text-blue-700',   active: 'bg-blue-600 text-white ring-blue-600' },
} as const

function ErnstCard({
  label,
  aantal,
  kleur,
  icon: Icon,
  href,
  actief,
}: {
  label: string
  aantal: number
  kleur: keyof typeof kleurMap
  icon?: React.ElementType
  href: string
  actief: boolean
}) {
  const k = kleurMap[kleur]
  const cls = actief
    ? `${k.active} ring-2 shadow-sm`
    : `bg-white ${k.text} ring-1 ${k.ring} hover:shadow-sm`
  return (
    <a
      href={href}
      className={`rounded-lg p-4 transition-all flex items-start gap-3 ${cls}`}
    >
      {Icon && (
        <div className={actief ? 'p-1.5 rounded-md bg-white/20' : `p-1.5 rounded-md ${k.bg}`}>
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={`text-xs uppercase tracking-wide ${actief ? 'text-white/80' : 'text-slate-500'}`}>
          {label}
        </div>
        <div className={`text-2xl font-semibold ${actief ? 'text-white' : ''}`}>
          {aantal}
        </div>
      </div>
    </a>
  )
}

function FilterChip({
  label,
  href,
  actief,
  badge,
}: {
  label: string
  href: string
  actief: boolean
  badge?: number
}) {
  return (
    <a
      href={href}
      className={
        actief
          ? 'px-3 py-1 rounded-full bg-slate-900 text-white inline-flex items-center gap-1.5'
          : 'px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center gap-1.5'
      }
    >
      {label}
      {badge != null && badge > 0 && (
        <span className={actief ? 'text-white/70' : 'text-slate-400'}>
          {badge}
        </span>
      )}
    </a>
  )
}
