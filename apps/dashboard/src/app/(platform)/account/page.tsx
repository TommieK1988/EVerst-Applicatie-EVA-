import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@everts/database/server'
import { type Medewerker, NOTIFICATIE_DEFAULTS } from '@everts/database/platform-types'
import AvatarBeheer from './AvatarBeheer'
import ProfielForm from './ProfielForm'
import BeveiligingForm from './BeveiligingForm'
import NotificatieVoorkeurenForm from './NotificatieVoorkeuren'
import HandtekeningBeheer from '@/components/medewerkers/HandtekeningBeheer'
import { PageHeader, Card, CardBody } from '@/components/ui'

export const metadata = { title: 'Mijn account' }

const sectionKicker: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: 'var(--accent)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: 6,
}

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--fg)',
  margin: '0 0 4px',
}

const sectionDesc: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  color: 'var(--fg-muted)',
  margin: '0 0 22px',
}

function Section({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardBody style={{ padding: '24px 28px' }}>
        <p style={sectionKicker}>{kicker}</p>
        <h2 style={sectionTitle}>{title}</h2>
        {description && <p style={sectionDesc}>{description}</p>}
        {children}
      </CardBody>
    </Card>
  )
}

export default async function AccountPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const medewerker: Medewerker | null = await supabase
    .from('medewerkers')
    .select([
      'id', 'voornaam', 'tussenvoegsel', 'achternaam',
      'telefoon', 'functie', 'afdeling',
      'foto_url', 'handtekening_url',
      'notificatie_voorkeuren', 'voorkeuren',
    ].join(', '))
    .eq('auth_user_id', user.id)
    .eq('actief', true)
    .maybeSingle()
    .then((r: { data: Medewerker | null }) => r.data)

  const fullName = medewerker
    ? [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')
    : (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Gebruiker'

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((w: string) => w[0].toUpperCase())
    .slice(0, 2)
    .join('')

  const notificatieVoorkeuren = {
    ...NOTIFICATIE_DEFAULTS,
    ...(medewerker?.notificatie_voorkeuren ?? {}),
  }

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Account" title="Mijn account" />
      <p className="eva-page-desc" style={{ marginTop: -16, marginBottom: 22 }}>
        Beheer je profiel, beveiliging en persoonlijke voorkeuren.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>

        {/* ── Profielfoto ── */}
        <Section
          kicker="Profiel"
          title="Profielfoto"
          description="Wordt getoond in de navigatie en bij berichten."
        >
          {medewerker ? (
            <AvatarBeheer
              medewerker_id={medewerker.id}
              initial_url={medewerker.foto_url}
              initials={initials}
            />
          ) : (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>
              Koppel dit account aan een medewerker-record om een profielfoto in te stellen.
            </p>
          )}
        </Section>

        {/* ── Persoonsgegevens ── */}
        <Section
          kicker="Profiel"
          title="Persoonsgegevens"
          description="Naam en contactgegevens zoals ze in EVA worden weergegeven."
        >
          {medewerker ? (
            <ProfielForm medewerker={medewerker} />
          ) : (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>
              Geen gekoppeld medewerker-record gevonden.
            </p>
          )}
        </Section>

        {/* ── Handtekening ── */}
        {medewerker && (
          <Section
            kicker="Profiel"
            title="Handtekening"
            description="Wordt gebruikt op werkbonnen, offertes en andere documenten."
          >
            <HandtekeningBeheer
              medewerker_id={medewerker.id}
              initial_url={medewerker.handtekening_url}
            />
          </Section>
        )}

        {/* ── Beveiliging ── */}
        <Section
          kicker="Beveiliging"
          title="Inloggegevens"
          description="Wachtwoord, e-mailadres en actieve sessies."
        >
          <BeveiligingForm currentEmail={user.email ?? ''} />
        </Section>

        {/* ── Meldingen ── */}
        <Section
          kicker="Meldingen"
          title="Notificaties"
          description="Kies per categorie of je meldingen in de app en/of per e-mail wilt ontvangen."
        >
          <NotificatieVoorkeurenForm initial={notificatieVoorkeuren} />
        </Section>

      </div>
    </div>
  )
}
