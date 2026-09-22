import Link from 'next/link'
import { createClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { getEigenGegevens } from '@/lib/medewerker/eigen-gegevens'
import { logout } from '@/app/(auth)/login/actions'
import AppHeader from '@/components/mobiel/AppHeader'
import MedewerkerGegevensBlok from '@/components/mobiel/MedewerkerGegevensBlok'

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
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ textAlign: 'center', color: '#6b757c', padding: '32px 0 8px', fontSize: 14 }}>
            Geen medewerker-koppeling gevonden voor dit account.
          </div>
          {/* Ook zonder koppeling moet je bij de instellingen en bij uitloggen kunnen:
              dat zijn precies de twee dingen die je nodig hebt als er iets misgaat. */}
          <InstellingenKnop />
          <UitlogKnop />
        </div>
      </>
    )
  }

  const naam = volledigeNaam(medewerker)
  const functieAfdeling = [medewerker.functie, medewerker.afdeling].filter(Boolean).join(' · ')
  const gegevens = await getEigenGegevens(medewerker.id)

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

        {gegevens && <MedewerkerGegevensBlok gegevens={gegevens} />}

        <InstellingenKnop />
        <UitlogKnop />
      </div>
    </>
  )
}

/**
 * Naar de app-instellingen (toestemmingen, meldingen, locatie).
 *
 * Staat onderaan, ná de gegevens: dit scherm gaat over wie je bent, de
 * instellingen regel je één keer en daarna niet meer.
 */
function InstellingenKnop() {
  return (
    <Link
      href="/m/profiel/instellingen"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', borderRadius: 14,
        background: 'var(--bg-elev)', border: '1px solid var(--border)',
        color: 'var(--fg)', textDecoration: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#6b757c' }}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Instellingen</div>
        <div style={{ fontSize: 12.5, color: '#6b757c', marginTop: 2 }}>
          Toestemmingen, meldingen en locatie
        </div>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#6b757c' }}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  )
}

function UitlogKnop() {
  return (
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
  )
}
