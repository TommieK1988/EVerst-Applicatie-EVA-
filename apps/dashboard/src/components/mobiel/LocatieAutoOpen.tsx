'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusBadge from './StatusBadge'
import { dossierBijLocatie, type LocatieDossier, type LocatieResultaat } from '@/lib/dossiers/locatie'
import { haalLocatie, leesStatus } from '@/lib/locatie/toestemming'

/**
 * Automatisch dossier openen op locatie (mobiele buitendienst).
 *
 * Draait bij het openen van de mobiele home: vraagt één keer de GPS-positie op
 * en matcht die tegen de werkadressen van de eigen dossiers.
 *  - één dossier op die plek  → afbreekbare banner, opent dan vanzelf;
 *  - meerdere op diezelfde plek → keuzelijst;
 *  - niets in de buurt         → geen melding.
 *
 * Bewuste keuzes:
 *  - één keer per sessie (sessionStorage) — niet bij elke terugkeer naar home;
 *  - uit te zetten via de toggle op "Mijn gegevens" (localStorage-vlag);
 *  - afbreekbaar, zodat wie de app aan kantoor opent niet wordt weggestuurd;
 *  - **vraagt zelf nooit om toestemming**. Dit draaide ongevraagd bij het openen
 *    van de mobiele home, en omdat EVA elke werkdag opnieuw laat inloggen kwam de
 *    toestemmingsvraag dus telkens terug — precies de klacht "hij blijft het
 *    vragen". Staat de toestemming nog niet vast, dan gebeurt hier niets en
 *    regelt de monteur het één keer rustig via het Toestemmingen-blok op
 *    "Mijn gegevens".
 */

/** localStorage-sleutel: staat de automatische detectie aan? ('uit' = uit) */
export const LOCATIE_AUTO_KEY = 'eva_auto_locatie'
/** sessionStorage-sleutel: al gedraaid deze sessie? */
const SESSIE_KEY = 'eva_loc_gedaan'
/** Aftel-seconden voordat één treffer automatisch opent. */
const AFTEL_S = 4

function isUitgeschakeld(): boolean {
  try {
    return localStorage.getItem(LOCATIE_AUTO_KEY) === 'uit'
  } catch {
    return false
  }
}

export default function LocatieAutoOpen() {
  const router = useRouter()
  const [res, setRes] = useState<LocatieResultaat | null>(null)
  const [aftel, setAftel] = useState(AFTEL_S)
  const gestart = useRef(false)

  // GPS opvragen + matchen — één keer per sessie.
  useEffect(() => {
    if (gestart.current) return
    gestart.current = true

    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    if (isUitgeschakeld()) return
    try {
      if (sessionStorage.getItem(SESSIE_KEY) === '1') return
      sessionStorage.setItem(SESSIE_KEY, '1')
    } catch {
      /* private mode e.d. — dan gewoon draaien */
    }

    void (async () => {
      // Alleen doorgaan als de toestemming al vaststaat. Anders zou dit scherm
      // de vraag stellen op het moment dat de monteur er het minst op zit te
      // wachten — bij het openen van de app.
      if ((await leesStatus()) !== 'toegestaan') return
      try {
        const fix = await haalLocatie({ maxLeeftijdMs: 60_000, timeoutMs: 8000 })
        const r = await dossierBijLocatie(fix.lat, fix.lng)
        if (r.status === 'een' || r.status === 'meerdere') setRes(r)
      } catch {
        /* geweigerd of geen fix — stil */
      }
    })()
  }, [])

  const open = (id: string) => router.replace(`/m/dossiers/${id}`)

  // Aftellen + automatisch openen bij precies één treffer.
  useEffect(() => {
    if (res?.status !== 'een') return
    setAftel(AFTEL_S)
    const dossierId = res.dossier.id
    const tik = setInterval(() => setAftel((s) => s - 1), 1000)
    const timer = setTimeout(() => open(dossierId), AFTEL_S * 1000)
    return () => {
      clearInterval(tik)
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res])

  if (!res) return null

  if (res.status === 'een') {
    const d = res.dossier
    return (
      <div style={bannerWrap}>
        <div style={bannerCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={pinBadge} aria-hidden>📍</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#6b757c', marginBottom: 2 }}>
                Dossier bij jouw locatie · {d.afstand_m} m
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.titel}
              </div>
              {d.klant_naam && (
                <div style={{ fontSize: 12, color: '#6b757c', marginTop: 1 }}>{d.klant_naam}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setRes(null)} style={btnSecundair}>
              Annuleren
            </button>
            <button onClick={() => open(d.id)} style={btnPrimair}>
              Openen ({aftel})
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (res.status !== 'meerdere') return null

  // meerdere
  return (
    <div style={overlayWrap} onClick={() => setRes(null)}>
      <div style={overlaySheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--fg)' }}>Dossiers op deze locatie</div>
          <button onClick={() => setRes(null)} style={sluitKnop} aria-label="Sluiten">✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: '#6b757c', marginBottom: 12 }}>
          Kies het dossier waar je aan werkt.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {res.dossiers.map((d: LocatieDossier) => (
            <button key={d.id} onClick={() => open(d.id)} style={keuzeKaart}>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ marginBottom: 6 }}>
                  <StatusBadge label={d.statusLabel} color={d.statusColor} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.titel}
                </div>
                {d.klant_naam && (
                  <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2 }}>{d.klant_naam}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                {d.dossiernummer && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: '#9aa4ab' }}>{d.dossiernummer}</span>
                )}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa4ab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const bannerWrap: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
  padding: '0 12px calc(12px + env(safe-area-inset-bottom))',
  pointerEvents: 'none',
}
const bannerCard: React.CSSProperties = {
  pointerEvents: 'auto',
  background: 'var(--bg-elev)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 14, boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
}
const pinBadge: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
  display: 'grid', placeItems: 'center', fontSize: 18,
  background: 'color-mix(in srgb, #009439 14%, transparent)',
}
const btnSecundair: React.CSSProperties = {
  flex: '0 0 auto', padding: '11px 16px', borderRadius: 10,
  background: '#f1f4f5', color: '#6b757c', border: 'none',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
}
const btnPrimair: React.CSSProperties = {
  flex: 1, padding: '11px 16px', borderRadius: 10,
  background: '#009439', color: '#fff', border: 'none',
  fontSize: 14, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
}
const overlayWrap: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 60,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'flex-end',
}
const overlaySheet: React.CSSProperties = {
  width: '100%', background: 'var(--bg)',
  borderTopLeftRadius: 18, borderTopRightRadius: 18,
  padding: '18px 16px calc(18px + env(safe-area-inset-bottom))',
  maxHeight: '80vh', overflowY: 'auto',
}
const sluitKnop: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: 'none',
  background: '#f1f4f5', color: '#6b757c', fontSize: 15,
  cursor: 'pointer', flexShrink: 0,
}
const keuzeKaart: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10,
  padding: 14, background: 'var(--bg-elev)',
  border: '1px solid var(--border)', borderRadius: 12,
  cursor: 'pointer', width: '100%', WebkitTapHighlightColor: 'transparent',
}
