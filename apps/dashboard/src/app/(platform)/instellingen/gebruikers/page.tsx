import { createAdminClient } from '@everts/database/server'
import type { MedewerkerAfdeling, GebruikerType, RechtenSet } from '@everts/database/platform-types'
import { PageHeader, Card, Badge, EmptyState } from '@/components/ui'
import AfdelingRechtenBeheer from './AfdelingRechtenBeheer'
import Link from 'next/link'

export const metadata = { title: 'Gebruikers & rechten' }

const GEBRUIKER_TYPE_LABELS: Record<GebruikerType, string> = {
  geen:               'Geen',
  app_gebruiker:      'App',
  platform_gebruiker: 'Platform',
}

const GEBRUIKER_TYPE_TONES: Record<GebruikerType, 'neutral' | 'info' | 'brand'> = {
  geen:               'neutral',
  app_gebruiker:      'info',
  platform_gebruiker: 'brand',
}

type Gebruiker = {
  id: string
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  email: string | null
  afdeling: string | null
  gebruiker_type: GebruikerType
  rechten_override: RechtenSet
  o365_email: string | null
  auth_user_id: string | null
}

export default async function GebruikersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [gebruikersRes, afdelingenRes] = await Promise.all([
    supabase
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam, email, afdeling, gebruiker_type, rechten_override, o365_email, auth_user_id')
      .neq('gebruiker_type', 'geen')
      .eq('actief', true)
      .order('achternaam'),
    supabase
      .from('medewerker_afdelingen')
      .select('id, naam, volgorde, actief, standaard_rechten')
      .eq('actief', true)
      .order('volgorde')
      .order('naam'),
  ])

  const gebruikers = (gebruikersRes.data ?? []) as Gebruiker[]
  const afdelingen = (afdelingenRes.data ?? []) as MedewerkerAfdeling[]

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Instellingen" title="Gebruikers & rechten" />
      <p className="-mt-3 mb-[22px] text-[13.5px] text-neutral-500">
        Overzicht van medewerkers met platformtoegang. Standaard rechten worden ingesteld per afdeling en kunnen per gebruiker worden aangepast.
      </p>

      {/* Gebruikersoverzicht */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
          Gebruikers ({gebruikers.length})
        </div>

        {gebruikers.length === 0 ? (
          <Card>
            <EmptyState
              size="sm"
              title="Nog geen gebruikers ingesteld"
              description={
                <>
                  Ga naar een <Link href="/medewerkers" style={{ color: 'var(--accent)' }}>medewerker</Link> om toegang toe te kennen.
                </>
              }
            />
          </Card>
        ) : (
          <Card>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Naam', 'Afdeling', 'Type', 'Auth', 'O365', 'Rechten override'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gebruikers.map((g, i) => {
                  const naam = [g.voornaam, g.tussenvoegsel, g.achternaam].filter(Boolean).join(' ')
                  const overrideCount = Object.keys(g.rechten_override ?? {}).length
                  return (
                    <tr key={g.id} style={{ borderBottom: i < gebruikers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <Link href={`/medewerkers/${g.id}`} style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                          {naam}
                        </Link>
                        {g.email && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>{g.email}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>
                        {g.afdeling ?? '—'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <Badge tone={GEBRUIKER_TYPE_TONES[g.gebruiker_type]} size="sm">
                          {GEBRUIKER_TYPE_LABELS[g.gebruiker_type]}
                        </Badge>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: g.auth_user_id ? 'var(--accent)' : 'var(--fg-muted)' }}>
                          {g.auth_user_id ? '● Ja' : '○ Nee'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: g.o365_email ? 'var(--accent)' : 'var(--fg-muted)' }}>
                          {g.o365_email ? '● Gekoppeld' : '○ Nee'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
                        {overrideCount > 0 ? `${overrideCount} module${overrideCount !== 1 ? 's' : ''} aangepast` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* Afdeling-rechten */}
      <section>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
          Standaard rechten per afdeling
        </div>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
          Platform gebruikers erven deze rechten. Per medewerker kan je daarna bijsturen via de medewerker-detailpagina.
        </p>
        <AfdelingRechtenBeheer afdelingen={afdelingen} />
      </section>
    </div>
  )
}
