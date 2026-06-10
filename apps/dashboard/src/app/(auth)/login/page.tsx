'use client'
import React from 'react'
import { loginWithEmail } from './actions'

const HERO_BG =
  "url(\"/polygon-bg.png\"), linear-gradient(160deg, #009439 0%, #054f2e 100%)"

export default function LoginPage() {
  const [error, setError]     = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const data   = new FormData(e.currentTarget)
    const result = await loginWithEmail(data)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
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

      {/* Rechts — login formulier */}
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
            }}>Voer je gegevens in om toegang te krijgen.</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Field label="E-mailadres">
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="naam@everts.nl"
                style={inputStyle}
              />
            </Field>

            <Field label="Wachtwoord">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                style={inputStyle}
              />
            </Field>

            {error && (
              <div style={{
                padding: '10px 14px',
                background: '#fff2f0',
                border: '1px solid #ffc9c0',
                borderRadius: 8,
                fontFamily: 'var(--font-ui)', fontSize: 13,
                color: '#c0392b',
              }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                padding: '13px 20px',
                background: loading ? 'var(--fg-muted)' : 'var(--fg)',
                color: 'var(--bg)',
                border: 'none', borderRadius: 10,
                fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }}/>
                  Inloggen…
                </>
              ) : 'Inloggen'}
            </button>

          </form>

          <div style={{
            marginTop: 32,
            fontFamily: 'var(--font-ui)', fontSize: 11,
            color: 'var(--fg-muted)', textAlign: 'center',
          }}>
            Toegang via uitnodiging van je beheerder.
          </div>

        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { outline: none; border-color: var(--accent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent); }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
        color: 'var(--fg-soft)', letterSpacing: '0.02em',
      }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 14px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--fg)',
  fontFamily: 'var(--font-ui)', fontSize: 14,
  transition: 'border-color 0.15s, box-shadow 0.15s',
  width: '100%',
}
