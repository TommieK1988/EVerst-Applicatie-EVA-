import { Car, AlertTriangle, Route, Users, RefreshCw, Clock, LogOut } from 'lucide-react'
import Link from 'next/link'
import StatCard from '@/components/wagenpark/shared/StatCard'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import Livetracker from '@/components/wagenpark/shared/Livetracker'
import RijscoreRanking from '@/components/wagenpark/dashboard/RijscoreRanking'
import RitDekkingWaarschuwing from '@/components/wagenpark/shared/RitDekkingWaarschuwing'
import WerktijdenRanglijst from '@/components/wagenpark/dashboard/WerktijdenRanglijst'
import PeriodeKiezer from '@/components/wagenpark/werktijden/PeriodeKiezer'
import { createClient } from '@/lib/wagenpark/supabase/server'
import { createClient as createServerClient } from '@everts/database/server'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import { bepaalPeriode, datumKort } from '@/lib/wagenpark/periode'
import { laadWerktijdGegevens } from '@/lib/wagenpark/werktijd-bevindingen'
import { laadRitDekking } from '@/lib/wagenpark/rit-dekking'
import { bouwSamenvatting } from '@/lib/wagenpark/werktijd-samenvatting'
import { minutenLabel, teltMee } from '@/lib/wagenpark/werktijd'
import { laadLayouts } from '@/app/actions/layouts'

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; van?: string; tot?: string }>
}) {
  const supabase = await createClient()
  const magPrive = await magPriveRittenZien()

  // Eén periode voor de hele pagina. Alleen "Actieve voertuigen" staat er
  // buiten: dat is een momentopname van het wagenpark, geen periodecijfer.
  const periode = bepaalPeriode(await searchParams)

  let user_id: string | null = null
  try {
    const sessionClient = await createServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar
  }

  const [
    voertuigenRes,
    bevindingenRes,
    rittenRes,
    topBevindingenRes,
    werktijden,
    layoutsSamenvatting,
    dekking,
  ] = await Promise.all([
    supabase
      .from('voertuigen')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'actief'),
    supabase
      .from('compliance_bevindingen')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('periode_start', periode.van)
      .lte('periode_start', periode.tot),
    supabase
      .from('ulu_trips')
      .select('afstand_km, rit_type_berekend')
      .gte('start_datum', periode.van)
      .lte('start_datum', periode.tot),
    supabase
      .from('compliance_bevindingen')
      .select('id, regel_code, omschrijving, ernst, gegenereerd_op, periode_start, periode_eind, medewerker_id, voertuig_id')
      .eq('status', 'open')
      .gte('periode_start', periode.van)
      .lte('periode_start', periode.tot)
      // Sorteer op ernst (overtreding/waarschuwing eerst), dan echte datum van de overtreding
      .order('ernst', { ascending: true })
      .order('periode_eind', { ascending: false, nullsFirst: false })
      .order('periode_start', { ascending: false, nullsFirst: false })
      .limit(5),
    // Werktijden alleen ophalen als de gebruiker ze mag zien — anders is het een
    // dure query voor gegevens die toch niet op het scherm komen.
    magPrive
      ? laadWerktijdGegevens(periode.van, periode.tot)
      : Promise.resolve(null),
    magPrive && user_id
      ? laadLayouts(user_id, 'wagenpark-werktijden-samenvatting')
      : Promise.resolve([]),
    // Zonder ritten is elk cijfer op deze pagina stilzwijgend nul; zie
    // lib/wagenpark/rit-dekking.ts.
    laadRitDekking(periode.van, periode.tot),
  ])

  const aantalVoertuigen = voertuigenRes.count ?? 0
  const aantalBevindingen = bevindingenRes.count ?? 0

  const ritten = rittenRes.data ?? []
  const kmZakelijk = ritten
    .filter((r) => r.rit_type_berekend === 'zakelijk')
    .reduce((a: number, r) => a + (r.afstand_km ?? 0), 0)
  const kmPrive = ritten
    .filter((r) => r.rit_type_berekend === 'prive')
    .reduce((a: number, r) => a + (r.afstand_km ?? 0), 0)

  // Werktijd-totalen over de hele periode. Verklaarde dagen tellen niet mee —
  // zelfde rekenregel als in de tabel eronder, zodat de tegels en de lijst niet
  // uiteen kunnen lopen.
  const werktijdRijen = werktijden?.rijen ?? []
  const werktijdTotalen = bouwSamenvatting(werktijdRijen).reduce(
    (t, r) => ({
      minutenLaat: t.minutenLaat + r.minutenLaat,
      dagenLaat: t.dagenLaat + r.dagenLaat,
      minutenVroeg: t.minutenVroeg + r.minutenVroeg,
      dagenVroeg: t.dagenVroeg + r.dagenVroeg,
    }),
    { minutenLaat: 0, dagenLaat: 0, minutenVroeg: 0, dagenVroeg: 0 },
  )
  const werktijdDagen = werktijdRijen.filter((r) => teltMee(r.status)).length

  const topBevindingen: BevindingRij[] = (topBevindingenRes.data ?? []) as BevindingRij[]

  const dbGereed = !voertuigenRes.error

  return (
    <>
      <PageHeader
        titel="Wagenpark-dashboard"
        omschrijving={
          `Voertuigen, rijgedrag, werktijden en openstaande compliance-bevindingen. ` +
          `${periode.label} — ${datumKort(periode.van)} t/m ${datumKort(periode.tot)}.`
        }
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

      <PeriodeKiezer periode={periode} pad="/wagenpark/dashboard" />

      <RitDekkingWaarschuwing dekking={dekking} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Actieve voertuigen"
          waarde={aantalVoertuigen}
          icon={Car}
          kleur="blauw"
          subtekst="nu in het wagenpark"
        />
        <StatCard
          label="Open bevindingen"
          waarde={aantalBevindingen}
          icon={AlertTriangle}
          kleur={aantalBevindingen > 0 ? 'oranje' : 'groen'}
          subtekst="uit deze periode"
        />
        <StatCard
          label="Zakelijk"
          waarde={`${Math.round(kmZakelijk).toLocaleString('nl-NL')} km`}
          icon={Route}
          kleur="groen"
          subtekst={periode.label.split(' · ')[0].toLowerCase()}
        />
        {magPrive && (
          <StatCard
            label="Privé"
            waarde={`${Math.round(kmPrive).toLocaleString('nl-NL')} km`}
            icon={Users}
            kleur="grijs"
            subtekst={periode.label.split(' · ')[0].toLowerCase()}
          />
        )}

        {magPrive && (
          <>
            <StatCard
              label="Te laat"
              waarde={minutenLabel(werktijdTotalen.minutenLaat)}
              icon={Clock}
              kleur="oranje"
              subtekst={`${werktijdTotalen.dagenLaat} ${werktijdTotalen.dagenLaat === 1 ? 'dag' : 'dagen'}`}
            />
            <StatCard
              label="Te vroeg weg"
              waarde={minutenLabel(werktijdTotalen.minutenVroeg)}
              icon={LogOut}
              kleur="grijs"
              subtekst={`${werktijdTotalen.dagenVroeg} ${werktijdTotalen.dagenVroeg === 1 ? 'dag' : 'dagen'}`}
            />
            <StatCard
              label="Werktijd-afwijking"
              waarde={minutenLabel(werktijdTotalen.minutenLaat + werktijdTotalen.minutenVroeg)}
              icon={Clock}
              kleur="grijs"
              subtekst={`${werktijdDagen} gemarkeerde dagen`}
            />
          </>
        )}
      </div>

      {/* Livetracker embed — externe ULU-kaart toont álle voertuigen, dus alleen Directie/beheerder */}
      {magPrive && (
        <div className="mb-8">
          <Livetracker />
        </div>
      )}

      {/* Werktijden per medewerker — wie springt eruit? Klik door naar de
          bestuurder voor de dagen zelf en de uitdraai. */}
      {magPrive && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-slate-700 mb-2">
            Werktijden per medewerker
          </h2>
          {werktijden?.urenFout && (
            <p className="text-xs text-amber-700 mb-2">
              De geboekte uren konden niet uit Bouw7 worden opgehaald ({werktijden.urenFout}).
            </p>
          )}
          {werktijdRijen.length === 0 ? (
            <p className="text-sm text-slate-500 bg-white rounded-lg border p-5">
              Geen te late aankomsten of vroege vertrekken in deze periode.
            </p>
          ) : (
            <WerktijdenRanglijst
              data={werktijdRijen}
              periode={periode}
              layouts={layoutsSamenvatting}
              user_id={user_id}
            />
          )}
        </div>
      )}

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
            Geen open bevindingen in deze periode.
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
