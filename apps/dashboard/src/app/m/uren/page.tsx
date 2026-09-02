import Link from 'next/link'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import WeekstaatClient from '@/components/mobiel/uren/WeekstaatClient'
import { getWeekstaat, getUursoortOpties } from '@/lib/uren/weekstaat'
import { datumSleutel, weekStartVan } from '@/lib/uren/rooster'

export const metadata = { title: 'Uren · EVA Mobiel' }
export const dynamic = 'force-dynamic'

/**
 * Mobiele weekstaat: de medewerker vult per dag zijn uren in en dient de week in één keer in.
 *
 * Vervangt de oude werkbonnenlijst. Die schreef in `uren_regels` zonder ooit iets naar Bouw7 te
 * sturen; de weekstaat is de echte urenstroom.
 */
export default async function MobielUrenPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) {
    return (
      <>
        <AppHeader title="Uren" backHref="/m" />
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          Geen medewerker-koppeling gevonden voor dit account.
        </div>
      </>
    )
  }

  const { week } = await searchParams
  const gekozen = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : undefined

  const [staat, uursoorten] = await Promise.all([
    getWeekstaat(gekozen),
    getUursoortOpties(),
  ])

  const vandaag = datumSleutel(new Date())
  const verschuif = (dagen: number) => {
    const d = new Date(`${staat.weekStart}T12:00:00`)
    d.setDate(d.getDate() + dagen)
    return datumSleutel(d)
  }
  const dezeWeek = weekStartVan(new Date())

  return (
    <>
      <AppHeader title="Uren" sub={`Week ${staat.weekNr} · ${staat.jaar}`} backHref="/m" />
      <MobielPullToRefresh />

      {/* Weeknavigatie. flexShrink 0 is hier geen detail: zonder dat knijpt de strook zich in een
          scrollende kolom tot een streepje — dat is hier al twee keer misgegaan. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, padding: '10px 12px', flexShrink: 0,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
      }}>
        <Link href={`/m/uren?week=${verschuif(-7)}`} style={navKnop} aria-label="Vorige week">←</Link>
        <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>Week {staat.weekNr}</div>
          {staat.weekStart !== dezeWeek && (
            <Link href="/m/uren" style={{ fontSize: 11, color: '#009439', textDecoration: 'none' }}>
              naar deze week
            </Link>
          )}
        </div>
        <Link href={`/m/uren?week=${verschuif(7)}`} style={navKnop} aria-label="Volgende week">→</Link>
      </div>

      <WeekstaatClient staat={staat} uursoorten={uursoorten} vandaag={vandaag} />
    </>
  )
}

const navKnop: React.CSSProperties = {
  width: 40, height: 40, flexShrink: 0, borderRadius: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--fg)', fontSize: 17, textDecoration: 'none',
}
