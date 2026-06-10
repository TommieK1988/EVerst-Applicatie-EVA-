import { Car, AlertTriangle, Route, Users, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import StatCard from '@/components/wagenpark/shared/StatCard'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import Livetracker from '@/components/wagenpark/shared/Livetracker'
import RijscoreRanking from '@/components/wagenpark/dashboard/RijscoreRanking'
import { createClient } from '@/lib/wagenpark/supabase/server'

export const dynamic = 'force-dynamic'

type BevindingRij = {
  id: string
  regel_code: string
  omschrijving: string
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  gegenereerd_op: string
  periode_start: string | null
  periode_eind: string | null
  medewerker_id: string | null
  voertuig_id: string | null
}

export default async function DashboardPage() {
  const supabase = await createClient()

  // Parallel queries
  const [voertuigenRes, bevindingenRes, rittenMaandRes, topBevindingenRes] =
    await Promise.all([
      supabase
        .from('voertuigen')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'actief'),
      supabase
        .from('compliance_bevindingen')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
      supabase
        .from('ulu_trips')
        .select('afstand_km, rit_type_berekend')
        .gte(
          'start_datum',
          new Date(new Date().setDate(1)).toISOString().slice(0, 10),
        ),
      supabase
        .from('compliance_bevindingen')
        .select('id, regel_code, omschrijving, ernst, gegenereerd_op, periode_start, periode_eind, medewerker_id, voertuig_id')
        .eq('status', 'open')
        // Sorteer op ernst (overtreding/waarschuwing eerst), dan echte datum van de overtreding
        .order('ernst', { ascending: true })
        .order('periode_eind', { ascending: false, nullsFirst: false })
        .order('periode_start', { ascending: false, nullsFirst: false })
        .limit(5),
    ])

  const aantalVoertuigen = voertuigenRes.count ?? 0
  const aantalBevindingen = bevindingenRes.count ?? 0

  const ritten = rittenMaandRes.data ?? []
  const kmZakelijk = ritten
    .filter((r) => r.rit_type_berekend === 'zakelijk')
    .reduce((a: number, r) => a + (r.afstand_km ?? 0), 0)
  const kmPrive = ritten
    .filter((r) => r.rit_type_berekend === 'prive')
    .reduce((a: number, r) => a + (r.afstand_km ?? 0), 0)

  const topBevindingen: BevindingRij[] = (topBevindingenRes.data ?? []) as BevindingRij[]

  const dbGereed = !voertuigenRes.error

  return (
    <>
      <PageHeader
        titel="Wagenpark-dashboard"
        omschrijving="Overzicht van voertuigen, rijgedrag en openstaande compliance-bevindingen."
        actions={
          <Link
            href="/wagenpark/ritten/sync"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            ULU sync
          </Link>
        }
      />

      {!dbGereed && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          <strong>Migratie nog niet uitgevoerd.</strong> Run{' '}
          <code className="px-1 rounded bg-amber-100">
            supabase/migrations/20260417_wagenpark.sql
          </code>{' '}
          om de wagenpark-tabellen aan te maken.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Actieve voertuigen"
          waarde={aantalVoertuigen}
          icon={Car}
          kleur="blauw"
        />
        <StatCard
          label="Open bevindingen"
          waarde={aantalBevindingen}
          icon={AlertTriangle}
          kleur={aantalBevindingen > 0 ? 'oranje' : 'groen'}
        />
        <StatCard
          label="Zakelijk (maand)"
          waarde={`${Math.round(kmZakelijk).toLocaleString('nl-NL')} km`}
          icon={Route}
          kleur="groen"
        />
        <StatCard
          label="Privé (maand)"
          waarde={`${Math.round(kmPrive).toLocaleString('nl-NL')} km`}
          icon={Users}
          kleur="grijs"
        />
      </div>

      {/* Livetracker embed */}
      <div className="mb-8">
        <Livetracker />
      </div>

      {/* Rijscore ranking */}
      <RijscoreRanking />

      <div className="bg-white rounded-lg border">
        <div className="px-5 py-3 border-b">
          <h2 className="text-sm font-medium text-slate-700">
            Laatste openstaande bevindingen
          </h2>
        </div>
        {topBevindingen.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Geen open bevindingen op dit moment.
          </div>
        ) : (
          <ul className="divide-y">
            {topBevindingen.map((b) => (
              <li key={b.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                <span
                  className={
                    b.ernst === 'overtreding'
                      ? 'px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700'
                      : 'px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700'
                  }
                >
                  {b.regel_code}
                </span>
                <span className="flex-1 text-slate-700">{b.omschrijving}</span>
                <span
                  className="text-xs text-slate-400"
                  title={`Gegenereerd: ${new Date(b.gegenereerd_op).toLocaleDateString('nl-NL')}`}
                >
                  {new Date(b.periode_eind ?? b.periode_start ?? b.gegenereerd_op)
                    .toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
