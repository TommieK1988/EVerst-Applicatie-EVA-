'use client'
import React from 'react'
import { createClient } from '@everts/database/client'

const HERO_BG =
  "url(\"/polygon-bg.png\"), linear-gradient(160deg, #009439 0%, #054f2e 100%)"

/**
 * Mobiele inlogpagina — los van de desktop-login. Full-bleed merkkop bovenaan,
 * grote touch-knop, veilige-zone (notch/home-indicator) gerespecteerd.
 */
export default function MobielLogin({ fout }: { fout?: string }) {
  const [loading, setLoading] = React.useState(false)

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

  return (
    <div
      className="eva"
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
          }}>Gebruik je Everts Microsoft-account om in te loggen.</p>

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
            Toegang via je @everts.chat account.
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
