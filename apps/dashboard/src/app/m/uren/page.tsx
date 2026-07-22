import { createAdminClient } from '@everts/database/server'
import Link from 'next/link'
import { format, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'

export const metadata = { title: 'Uren · EVA Mobiel' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * Mobiel Uren-scherm: de werkbonnen van de INGELOGDE medewerker (per-user filter
 * op `planning_items.medewerker_id` — de desktop `mijn-werkbonnen` is org-breed).
 * Toont een venster rond vandaag; tikken opent de werkbon-flow (`/m/uren/[id]`).
 */
export default async function MobielUrenPage() {
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

  const supabase = db()
  const vandaag = new Date()
  const van = new Date(vandaag); van.setDate(van.getDate() - 7)
  const tot = new Date(vandaag); tot.setDate(tot.getDate() + 14)

  const { data: rawEntries } = await supabase
    .from('planning_items')
    .select(`
      *,
      planning_activiteiten (
        titel, omschrijving, locatie_adres, dossier_id,
        dossiers ( titel, dossiernummer, relaties!klant_id ( naam ) )
      ),
      werkbonnen ( id, start_dt, eind_dt, gewerkte_uren, klaar_gemeld_op )
    `)
    .eq('medewerker_id', medewerker.id)
    .gte('start_dt', van.toISOString().slice(0, 10))
    .lte('start_dt', tot.toISOString().slice(0, 10))
    .order('start_dt', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (rawEntries ?? []) as any[]

  const gegroepeerd: Record<string, any[]> = {}
  for (const entry of entries) {
    const dag = entry.start_dt.slice(0, 10)
    if (!gegroepeerd[dag]) gegroepeerd[dag] = []
    gegroepeerd[dag].push(entry)
  }
  const dagen = Object.keys(gegroepeerd).sort()

  return (
    <>
      <AppHeader title="Uren" sub="Mijn werkbonnen" backHref="/m" />
      <MobielPullToRefresh />
      {dagen.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          Er staan geen werkbonnen voor jou in deze periode.
        </div>
      ) : (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {dagen.map(dag => {
            const datum = parseISO(dag)
            const dagLabel = isToday(datum) ? 'Vandaag'
              : isTomorrow(datum) ? 'Morgen'
              : isYesterday(datum) ? 'Gisteren'
              : format(datum, 'EEEE d MMMM', { locale: nl })

            return (
              <div key={dag}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b757c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  {dagLabel}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gegroepeerd[dag].map((entry: any) => {
                    const activiteit = entry.planning_activiteiten
                    const dossier = activiteit?.dossiers
                    const klant = dossier?.relaties?.naam ?? '—'
                    const werkbon = entry.werkbonnen?.[0]
                    const afgerond = !!werkbon?.klaar_gemeld_op
                    const actief = !!werkbon && !afgerond

                    return (
                      <Link key={entry.id} href={`/m/uren/${entry.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{
                          padding: '14px 16px',
                          background: 'var(--bg-elev)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          borderLeft: `4px solid ${afgerond ? '#8a8c86' : actief ? '#009439' : '#e3e8ea'}`,
                          opacity: afgerond ? 0.65 : 1,
                        }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                            {activiteit?.titel ?? '—'}
                          </div>
                          <div style={{ fontSize: 12, color: '#6b757c', marginTop: 3 }}>
                            {klant}{activiteit?.locatie_adres ? ` · ${activiteit.locatie_adres}` : ''}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                            <span style={{ fontSize: 11, color: '#6b757c' }}>
                              {format(parseISO(entry.start_dt), 'HH:mm')}{entry.uren ? ` – ${entry.uren}u` : ''}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                              color: afgerond ? '#8a8c86' : actief ? '#009439' : '#9aa4ab',
                            }}>
                              {afgerond ? `Klaar${werkbon?.gewerkte_uren ? ` · ${werkbon.gewerkte_uren}u` : ''}` : actief ? 'Bezig' : 'Gepland'}
                            </span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
