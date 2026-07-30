'use client'
import React from 'react'
import { createClient } from '@everts/database/client'
import { wachtwoordLogin, stuurHerstelLink } from '@/app/(auth)/login/actions'

const HERO_BG =
  "url(\"/polygon-bg.png\"), linear-gradient(160deg, #009439 0%, #054f2e 100%)"

const veldStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', fontSize: 15,
  border: '1px solid #d0d0d0', borderRadius: 12,
  background: '#fff', color: '#1a1a1a',
  WebkitTapHighlightColor: 'transparent',
}

/**
 * Mobiele inlogpagina — los van de desktop-login. Full-bleed merkkop bovenaan,
 * grote touch-knop, veilige-zone (notch/home-indicator) gerespecteerd.
 *
 * Twee wegen naar binnen: Microsoft (@everts.chat) én e-mail + wachtwoord voor
 * medewerkers zonder Microsoft-account (app-gebruikers). Desktop kent alleen
 * Microsoft — platformgebruikers hebben altijd een @everts.chat-account.
 */
export default function MobielLogin({ fout }: { fout?: string }) {
  const [loading, setLoading] = React.useState(false)
  const [email, setEmail] = React.useState('')
  const [wachtwoord, setWachtwoord] = React.useState('')
  const [bezig, setBezig] = React.useState(false)
  const [wwFout, setWwFout] = React.useState<string | null>(null)
  const [melding, setMelding] = React.useState<string | null>(null)

  async function loginMetMicrosoft() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'openid email profile',
      },
    })
  }

  async function loginMetWachtwoord(e: React.FormEvent) {
    e.preventDefault()
    setWwFout(null); setMelding(null); setBezig(true)
    const res = await wachtwoordLogin({ email, wachtwoord })
    if (!res.ok) { setWwFout(res.error); setBezig(false); return }
    window.location.assign('/m')
  }

  async function wachtwoordVergeten() {
    setWwFout(null); setMelding(null)
    if (!email) { setWwFout('Vul eerst je e-mailadres in.'); return }
    setBezig(true)
    await stuurHerstelLink({ email })
    setBezig(false)
    setMelding('Als dit account bestaat, is er een link verstuurd om een wachtwoord in te stellen.')
  }

  return (
    <div
      className="eva"
      // Zelfde keuze als de mobiele shell (/m): mobiel blijft licht.
      data-theme="light"
      style={{
        display: 'flex', flexDirection: 'column',
        minHeight: '100dvh',
        background: 'var(--neutral-0, #fff)',
        fontFamily: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Merkkop */}
      <div style={{
        backgroundImage: HERO_BG,
        backgroundSize: 'cover', backgroundPosition: 'center',
        padding: 'calc(48px + env(safe-area-inset-top, 0px)) 28px 40px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{
          fontWeight: 800, fontSize: 30, letterSpacing: '0.06em', color: 'white',
          textShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>EVERTS.</div>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>EVA · Mobiel</div>
      </div>

      {/* Inhoud */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '32px 24px calc(28px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: 24, fontWeight: 700,
            letterSpacing: '-0.02em', color: 'var(--neutral-900, #161b20)',
          }}>Inloggen</h1>
          <p style={{
            margin: '8px 0 0', fontSize: 14, lineHeight: 1.5,
            color: 'var(--neutral-500, #6b757c)',
          }}>Log in met je Microsoft-account of met e-mail en wachtwoord.</p>

          {fout === 'geen-toegang' && (
            <div style={{
              marginTop: 20,
              padding: '12px 14px',
              background: '#fff2f0', border: '1px solid #ffc9c0',
              borderRadius: 10, fontSize: 13, color: '#c0392b',
            }}>
              Je account heeft geen toegang tot EVA. Neem contact op met je beheerder.
            </div>
          )}

          {/* E-mail + wachtwoord (medewerkers zonder Microsoft-account) */}
          <form onSubmit={loginMetWachtwoord} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="E-mailadres"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={veldStyle}
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Wachtwoord"
              value={wachtwoord}
              onChange={e => setWachtwoord(e.target.value)}
              style={veldStyle}
              required
            />

            {wwFout && (
              <div style={{
                padding: '10px 14px', background: '#fff2f0', border: '1px solid #ffc9c0',
                borderRadius: 10, fontSize: 13, color: '#c0392b',
              }}>{wwFout}</div>
            )}
            {melding && (
              <div style={{
                padding: '10px 14px', background: '#eefaf0', border: '1px solid #b8e6c4',
                borderRadius: 10, fontSize: 13, color: '#1f7a3a',
              }}>{melding}</div>
            )}

            <button
              type="submit"
              disabled={bezig}
              style={{
                width: '100%', padding: '16px 20px',
                background: bezig ? '#a7d3b6' : '#009439',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 700,
                cursor: bezig ? 'default' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {bezig ? 'Bezig…' : 'Inloggen'}
            </button>

            <button
              type="button"
              onClick={wachtwoordVergeten}
              disabled={bezig}
              style={{
                background: 'none', border: 'none', padding: 4,
                fontSize: 13, color: 'var(--neutral-500, #6b757c)',
                textDecoration: 'underline', cursor: 'pointer',
                alignSelf: 'center',
              }}
            >
              Wachtwoord vergeten of instellen
            </button>
          </form>

          {/* Scheiding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 4px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--neutral-200, #e5e8ea)' }} />
            <span style={{ fontSize: 11, color: 'var(--neutral-400, #9aa4ab)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>of</span>
            <div style={{ flex: 1, height: 1, background: 'var(--neutral-200, #e5e8ea)' }} />
          </div>
        </div>

        <div>
          <button
            onClick={loginMetMicrosoft}
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px 20px',
              background: loading ? '#f0f0f0' : '#fff',
              color: loading ? '#999' : '#1a1a1a',
              border: '1px solid #d0d0d0',
              borderRadius: 12,
              fontSize: 15, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: loading ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: '2px solid #ccc', borderTopColor: '#666',
                  animation: 'spin 0.7s linear infinite',
                  display: 'inline-block', flexShrink: 0,
                }}/>
                Doorsturen naar Microsoft…
              </>
            ) : (
              <>
                <MicrosoftLogo />
                Inloggen met Microsoft
              </>
            )}
          </button>

          <div style={{
            marginTop: 20, fontSize: 11, textAlign: 'center',
            color: 'var(--neutral-400, #9aa4ab)',
          }}>
            Geen toegang? Neem contact op met je beheerder.
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  )
}
