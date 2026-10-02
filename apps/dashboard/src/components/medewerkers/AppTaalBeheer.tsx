'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { TALEN, TAAL_NAAM_NL, naarTaal, type Taal } from '@/i18n/talen'
import { zetAppTaalVanMedewerker } from '@/lib/taal/actions'

/**
 * Taal van EVA Mobiel voor deze medewerker. De medewerker kan het ook zelf wijzigen
 * (Profiel → Instellingen in de app); dit is voor kantoor, bijvoorbeeld bij indiensttreding.
 */
export default function AppTaalBeheer({
  medewerker_id,
  taal: begin,
  magWijzigen,
}: {
  medewerker_id: string
  taal: string | null | undefined
  magWijzigen: boolean
}) {
  const [taal, setTaal] = useState<Taal>(naarTaal(begin))
  const [bezig, start] = useTransition()

  const wijzig = (nieuw: Taal) => {
    const vorige = taal
    setTaal(nieuw)
    start(async () => {
      const res = await zetAppTaalVanMedewerker(medewerker_id, nieuw)
      if (!res.ok) { setTaal(vorige); toast.error(res.error); return }
      toast.success(`App-taal: ${TAAL_NAAM_NL[nieuw]}`)
    })
  }

  return (
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
      }}>
        Taal van de app
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TALEN.map((t) => (
          <button
            key={t}
            type="button"
            disabled={!magWijzigen || bezig}
            onClick={() => t !== taal && wijzig(t)}
            aria-pressed={t === taal}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8, fontSize: 13,
              cursor: magWijzigen ? 'pointer' : 'default',
              border: t === taal ? '1px solid #009439' : '1px solid var(--border)',
              background: t === taal ? 'rgba(0,148,57,0.08)' : 'var(--bg-elev)',
              color: 'var(--fg)', fontWeight: t === taal ? 700 : 500,
            }}
          >
            {TAAL_NAAM_NL[t]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 8, lineHeight: 1.5 }}>
        Alleen de app op de telefoon wordt vertaald. Teksten van kantoor (taken, notities,
        handboek) ziet de medewerker automatisch vertaald.
      </div>
    </div>
  )
}
