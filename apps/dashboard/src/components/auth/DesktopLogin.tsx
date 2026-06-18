'use client'
import React from 'react'
import { createClient } from '@everts/database/client'

const HERO_BG =
  "url(\"/polygon-bg.png\"), linear-gradient(160deg, #009439 0%, #054f2e 100%)"

export default function DesktopLogin({ fout }: { fout?: string }) {
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
    <div className="eva" style={{
      display: 'flex', height: '100dvh', overflow: 'hidden',
      background: 'var(--bg)', fontFamily: 'var(--font-ui)',
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* Links — brand panel */}
      <div style={{
        width: 480, flexShrink: 0,
        backgroundImage: HERO_BG,
        backgroundSize: 'cover', backgroundPosition: 'center',
        display: 'flex', flexDirection: 'column',
        padding: '48px 52px',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 32, letterSpacing: '0.06em', color: 'white',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>EVERTS.</div>
          <div style={{
            marginTop: 8, fontSize: 11, fontWeight: 600,
            color: 'rgba(255,255,255,0.65)', letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>EVA · Everts Platform</div>
        </div>

        <div>
          <div style={{
            display: 'inline-block',
            padding: '4px 10px',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 6,
            fontSize: 9, fontWeight: 800, color: 'white',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            marginBottom: 20,
          }}>EVA Pro · Alle bronnen</div>

          <blockquote style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 22, fontWeight: 400,
            lineHeight: 1.45, letterSpacing: '-0.02em',
            color: 'rgba(255,255,255,0.92)',
          }}>
            "Alle projectinformatie,<br/>financiën en documenten<br/>op één plek."
          </blockquote>
          <div style={{
            marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.6)',
            fontWeight: 500,
          }}>Everts Groep · Enschede</div>
        </div>
      </div>

      {/* Rechts — login */}
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px',
        background: 'var(--bg)',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          <div style={{ marginBottom: 36 }}>
            <h1 style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 28, fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'var(--fg)',
            }}>Inloggen</h1>
            <p style={{
              margin: '6px 0 0',
              fontFamily: 'var(--font-ui)', fontSize: 14,
              color: 'var(--fg-muted)',
            }}>Gebruik je Everts Microsoft-account om in te loggen.</p>
          </div>

          {fout === 'geen-toegang' && (
            <div style={{
              marginBottom: 20,
              padding: '12px 16px',
              background: '#fff2f0',
              border: '1px solid #ffc9c0',
              borderRadius: 8,
              fontFamily: 'var(--font-ui)', fontSize: 13,
              color: '#c0392b',
            }}>
              Je account heeft geen toegang tot EVA. Neem contact op met je beheerder.
            </div>
          )}

          <button
            onClick={loginMetMicrosoft}
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px 20px',
              background: loading ? '#f0f0f0' : 'white',
              color: loading ? '#999' : '#1a1a1a',
              border: '1px solid #d0d0d0',
              borderRadius: 10,
              fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'background 0.15s, border-color 0.15s',
              boxShadow: loading ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid #ccc',
                  borderTopColor: '#666',
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
            marginTop: 32,
            fontFamily: 'var(--font-ui)', fontSize: 11,
            color: 'var(--fg-muted)', textAlign: 'center',
          }}>
            Toegang via je @everts.chat account.
          </div>

        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
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
