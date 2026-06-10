import { createAdminClient } from '@everts/database/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { PageHeader, EmptyState } from '@/components/ui'

export const metadata: Metadata = { title: 'Mijn werkbonnen' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export default async function MijnWerkbonnenPage() {
  const supabase = db()

  // Alle actieve entries voor de komende week (zonder auth-filter in admin client)
  const vandaag = new Date()
  const over7   = new Date(vandaag)
  over7.setDate(over7.getDate() + 7)

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
    .gte('start_dt', vandaag.toISOString().slice(0, 10))
    .lte('start_dt', over7.toISOString().slice(0, 10))
    .order('start_dt', { ascending: true })

  // Filter items met afgesloten werkbon eruit; items zonder werkbon of met lopende werkbon blijven zichtbaar
  const entries = (rawEntries ?? []).filter((e: any) => !e.werkbonnen?.[0]?.klaar_gemeld_op)

  const gegroepeerd: Record<string, any[]> = {}
  for (const entry of entries) {
    const dag = entry.start_dt.slice(0, 10)
    if (!gegroepeerd[dag]) gegroepeerd[dag] = []
    gegroepeerd[dag].push(entry)
  }

  const daggen = Object.keys(gegroepeerd).sort()

  if (daggen.length === 0) {
    return (
      <div className="eva-page" style={{ maxWidth: 480, margin: '0 auto' }}>
        <PageHeader title="Mijn werkbonnen" />
        <EmptyState title="Geen werkbonnen voor de komende week." />
      </div>
    )
  }

  return (
    <div className="eva-page" style={{ maxWidth: 480, margin: '0 auto' }}>
      <PageHeader title="Mijn werkbonnen" eyebrow="Komende 7 dagen" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {daggen.map(dag => {
          const datum = parseISO(dag)
          const dagLabel = isToday(datum) ? 'Vandaag' : isTomorrow(datum) ? 'Morgen'
            : format(datum, 'EEEE d MMMM', { locale: nl })

          return (
            <div key={dag}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                {dagLabel}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {gegroepeerd[dag].map((entry: any) => {
                  const activiteit = entry.planning_activiteiten
                  const dossier    = activiteit?.dossiers
                  const klant      = dossier?.relaties?.naam ?? '—'
                  const werkbon    = entry.werkbonnen?.[0]
                  const afgerond   = !!werkbon?.klaar_gemeld_op
                  const actief     = !!werkbon && !afgerond

                  return (
                    <Link key={entry.id} href={`/planning/werkbon/${entry.id}`} style={{ textDecoration: 'none' }}>
                      <div className="eva-card" style={{
                        padding: '14px 16px',
                        borderLeft: `4px solid ${afgerond ? '#8a8c86' : actief ? 'var(--accent)' : 'var(--border)'}`,
                        opacity: afgerond ? 0.6 : 1,
                      }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                          {activiteit?.titel ?? '—'}
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>
                          {klant}
                          {activiteit?.locatie_adres ? ` · ${activiteit.locatie_adres}` : ''}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
                            {format(parseISO(entry.start_dt), 'HH:mm')} – {entry.uren}u
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            color: afgerond ? 'var(--fg-muted)' : actief ? 'var(--accent)' : 'var(--fg-soft)',
                          }}>
                            {afgerond ? 'Klaar' : actief ? 'Bezig' : 'Gepland'}
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
    </div>
  )
}
