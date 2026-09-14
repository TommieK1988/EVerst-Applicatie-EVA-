import React from 'react'
import Link from 'next/link'

/**
 * Mobiele scherm-header (DS "AppHeader"): polygon-achtergrond + donkere scrim,
 * witte titel (800/-0.02em) + optionele subtitel en terug-link.
 *
 * Bewust compact gehouden: op een telefoon is verticale ruimte schaars en de
 * header mag niet meer wegnemen dan nodig. De top-padding houdt rekening met de
 * statusbalk (`env(safe-area-inset-top)`), met een ondergrens voor toestellen
 * die die waarde niet leveren.
 */
export default function AppHeader({
  title, sub, backHref, ongelezenMeldingen,
}: {
  title: string
  sub?: string
  backHref?: string
  /**
   * Aantal ongelezen meldingen. Geef dit mee om het belletje te tonen; `undefined`
   * laat het weg. Nul is een geldige waarde: het belletje blijft dan staan, zonder
   * stip — anders verspringt de balk zodra je alles gelezen hebt.
   */
  ongelezenMeldingen?: number
}) {
  return (
    <div
      style={{
        backgroundImage: 'url("/polygon-bg.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: backHref ? 12 : 14,
        color: '#fff',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Donkere scrim voor leesbaarheid */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(160deg,rgba(0,0,0,.18) 0%,rgba(1,42,21,.55) 100%)',
        }}
      />
      {/* Titel links, terugknop rechts: met de telefoon in één hand is de
          rechterbovenhoek beter bereikbaar dan links, en een vierkant vlak is
          een ruimer trefgebied dan een tekstlink. */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Alleen de E met punt, in wit. Bewust NIET /logo-beeldmerk.svg met
                een invert-filter: dat beeldmerk is een groene tegel MET een witte E,
                en alles-wit-maken kleurt die tegel mee — de E verdwijnt er dan in en
                je houdt een wit vlakje over. De paden hieronder komen uit datzelfde
                beeldmerk, met de tegel eraf en de viewBox strak om de letter. */}
            <svg
              viewBox="63.387 17.23 46.34 42.942"
              aria-hidden
              fill="currentColor"
              style={{ height: backHref ? 19 : 22, width: 'auto', flexShrink: 0, display: 'block' }}
            >
              <path
                transform="translate(97.4484,17.23)"
                d="M0,42.417L-0.001,33.146L-22.185,33.146L-22.185,25.39L-3.584,25.446L-3.584,16.421L-19.441,16.421L-19.441,16.432L-34.061,16.432L-34.061,42.417L0,42.417ZM-19.441,9.271L-0.001,9.273L-0.001,0L-34.061,0L-34.061,9.26L-19.441,9.26L-19.441,9.271Z"
              />
              <path
                transform="translate(104.8394,50.524)"
                d="M0,9.648C1.4,9.648 2.565,9.191 3.495,8.276C4.423,7.361 4.888,6.203 4.888,4.802C4.888,3.373 4.431,2.216 3.516,1.329C2.601,0.443 1.429,0 0,0C-1.401,0 -2.566,0.443 -3.495,1.329C-4.424,2.216 -4.888,3.373 -4.888,4.802C-4.888,6.203 -4.417,7.361 -3.473,8.276C-2.53,9.191 -1.372,9.648 0,9.648"
              />
            </svg>
            <div style={{
              fontSize: backHref ? 17 : 19, fontWeight: 800, letterSpacing: '-0.02em',
              lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {title}
            </div>
          </div>
          {sub && (
            <div style={{
              fontSize: 12, opacity: 0.82, marginTop: 3, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sub}
            </div>
          )}
        </div>

        {ongelezenMeldingen !== undefined && (
          <Link
            href="/m/notificaties"
            aria-label={ongelezenMeldingen > 0 ? `Meldingen (${ongelezenMeldingen} ongelezen)` : 'Meldingen'}
            style={{
              flexShrink: 0, position: 'relative',
              width: 48, height: 48, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,.18)',
              border: '1px solid rgba(255,255,255,.28)',
              color: '#fff', textDecoration: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9.6a6 6 0 0 1 12 0v4.8l1.8 3H4.2l1.8-3V9.6ZM9.6 19.2a2.4 2.4 0 0 0 4.8 0" />
            </svg>
            {ongelezenMeldingen > 0 && (
              <span
                style={{
                  position: 'absolute', top: 6, right: 6,
                  minWidth: 18, height: 18, padding: '0 5px',
                  borderRadius: 9, background: '#ef4444', color: '#fff',
                  fontSize: 11, fontWeight: 700, lineHeight: '18px',
                  textAlign: 'center',
                  // Randje in de headerkleur: zonder scheiding loopt rood weg in
                  // de donkere polygon-achtergrond.
                  boxShadow: '0 0 0 2px rgba(1,42,21,.85)',
                }}
              >
                {ongelezenMeldingen > 9 ? '9+' : ongelezenMeldingen}
              </span>
            )}
          </Link>
        )}

        {backHref && (
          <Link
            href={backHref}
            aria-label="Terug"
            style={{
              flexShrink: 0,
              width: 48, height: 48, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,.18)',
              border: '1px solid rgba(255,255,255,.28)',
              color: '#fff', textDecoration: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  )
}
