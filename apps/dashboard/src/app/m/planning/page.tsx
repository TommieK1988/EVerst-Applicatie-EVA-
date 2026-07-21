import { createAdminClient } from '@everts/database/server'
import Link from 'next/link'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'

export const metadata = { title: 'Planning · EVA Mobiel' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * Mobiel Planning-scherm: read-only persoonlijke agenda van de ingelogde
 * medewerker (per-user filter op `planning_items.medewerker_id`). Toont de
 * komende weken per dag; locatie is aantikbaar naar Maps.
 */
export default async function MobielPlanningPage() {
  const medewerker = await getCurrentMedewerker()

  if (!medewerker) {
    return (
      <>
        <AppHeader title="Planning" backHref="/m" />
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          Geen medewerker-koppeling gevonden voor dit account.
        </div>
      </>
    )
  }

  const supabase = db()
  const vandaag = new Date()
  const tot = new Date(vandaag); tot.setDate(tot.getDate() + 28)

  const { data: rawEntries } = await supabase
    .from('planning_items')
    .select(`
      *,
      planning_activiteiten (
        titel, omschrijving, locatie_adres, dossier_id,
        dossiers ( id, titel, dossiernummer, relaties!klant_id ( naam ) )
      )
    `)
    .eq('medewerker_id', medewerker.id)
    .gte('start_dt', vandaag.toISOString().slice(0, 10))
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
      <AppHeader title="Planning" sub="Mijn agenda" backHref="/m" />
      <MobielPullToRefresh />
      {dagen.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          Geen planning in de komende weken.
        </div>
      ) : (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {dagen.map(dag => {
            const datum = parseISO(dag)
            const dagLabel = isToday(datum) ? 'Vandaag'
              : isTomorrow(datum) ? 'Morgen'
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
                    const adres = activiteit?.locatie_adres as string | null

                    return (
                      <div key={entry.id} style={{
                        padding: '14px 16px', background: '#fff',
                        border: '1px solid #e3e8ea', borderRadius: 12,
                        borderLeft: '4px solid #009439',
                      }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#009439', flexShrink: 0 }}>
                            {format(parseISO(entry.start_dt), 'HH:mm')}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#161b20' }}>
                              {activiteit?.titel ?? '—'}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2 }}>
                              {klant}{entry.uren ? ` · ${entry.uren}u` : ''}
                            </div>
                            {adres && (
                              <a
                                href={`https://maps.google.com/?q=${encodeURIComponent(adres)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 12, color: '#009439', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
                              >
                                📍 {adres}
                              </a>
                            )}
                            {dossier?.id && (
                              <div style={{ marginTop: 6 }}>
                                <Link href={`/m/dossiers/${dossier.id}`} style={{ fontSize: 12, color: '#6b757c', textDecoration: 'underline' }}>
                                  Naar dossier
                                </Link>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
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
