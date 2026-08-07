import { createClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { logout } from '@/app/(auth)/login/actions'
import AppHeader from '@/components/mobiel/AppHeader'
import LocatieAutoToggle from '@/components/mobiel/LocatieAutoToggle'
import ToestemmingenBlok from '@/components/mobiel/ToestemmingenBlok'
import PushMeldingen from '@/components/eva/PushMeldingen'

export const metadata = { title: 'Profiel · EVA Mobiel' }

function volledigeNaam(m: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ') || 'Onbekend'
}

function initialen(m: { voornaam: string | null; achternaam: string | null }): string {
  const a = m.voornaam?.[0] ?? ''
  const b = m.achternaam?.[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

export default async function MobielProfielPage() {
  const medewerker = await getCurrentMedewerker()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email ?? null

  if (!medewerker) {
    return (
      <>
        <AppHeader title="Mijn gegevens" backHref="/m" />
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          Geen medewerker-koppeling gevonden voor dit account.
        </div>
      </>
    )
  }

  const naam = volledigeNaam(medewerker)
  const functieAfdeling = [medewerker.functie, medewerker.afdeling].filter(Boolean).join(' · ')

  return (
    <>
      <AppHeader title="Mijn gegevens" backHref="/m" />
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Identiteit */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: 16, background: 'var(--bg-elev)',
          border: '1px solid var(--border)', borderRadius: 14,
        }}>
          {medewerker.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={medewerker.foto_url}
              alt={naam}
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
              background: '#009439', color: '#fff',
              display: 'grid', placeItems: 'center',
              fontSize: 20, fontWeight: 700,
            }}>
              {initialen(medewerker)}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.3 }}>{naam}</div>
            {functieAfdeling && (
              <div style={{ fontSize: 13, color: '#6b757c', marginTop: 2 }}>{functieAfdeling}</div>
            )}
            {email && (
              <div style={{ fontSize: 13, color: '#6b757c', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
            )}
          </div>
        </div>

        {/* Toestemmingen — één keer regelen i.p.v. steeds midden in een formulier.
            Staat bewust bóven de toggle: zonder toestemming doet die niets. */}
        <ToestemmingenBlok />

        {/* Instellingen */}
        <PushMeldingen weergave="mobiel" />
        <LocatieAutoToggle />

        {/* Uitloggen */}
        <form action={logout}>
          <button
            type="submit"
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              background: 'var(--bg-elev)', color: '#b42318',
              border: '1px solid #f0c8c2', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            Uitloggen
          </button>
        </form>
      </div>
    </>
  )
}
