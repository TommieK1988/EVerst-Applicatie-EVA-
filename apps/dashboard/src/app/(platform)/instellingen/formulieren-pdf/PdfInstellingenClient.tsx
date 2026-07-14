'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { PdfConfig } from './actions'
import { savePdfConfig } from './actions'

type Props = {
  config: PdfConfig
  logoUrl: string | null
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '14px 0' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 2,
          background: checked ? '#009439' : 'var(--border)',
          position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}/>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
      </div>
    </label>
  )
}

export function PdfInstellingenClient({ config, logoUrl }: Props) {
  const [toonLogo, setToonLogo]             = useState(config.toon_logo)
  const [toonInvuller, setToonInvuller]     = useState(config.toon_invuller)
  const [toonProjectRef, setToonProjectRef] = useState(config.toon_project_ref)
  const [koptekst, setKoptekst]             = useState(config.koptekst ?? '')
  const [voettekst, setVoettekst]           = useState(config.voettekst ?? '')
  const [margeBoven, setMargeBoven]         = useState(String(config.briefpapier_marge_boven_mm ?? 42))
  const [margeOnder, setMargeOnder]         = useState(String(config.briefpapier_marge_onder_mm ?? 26))
  const [pending, startTransition]          = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await savePdfConfig({
        toon_logo: toonLogo,
        toon_invuller: toonInvuller,
        toon_project_ref: toonProjectRef,
        koptekst,
        voettekst,
        briefpapier_marge_boven_mm: Number(margeBoven),
        briefpapier_marge_onder_mm: Number(margeOnder),
      })
      if (result.ok) toast.success('PDF-instellingen opgeslagen')
      else toast.error('Opslaan mislukt: ' + result.error)
    })
  }

  const taStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    border: '1px solid var(--border)', fontSize: 14,
    background: 'var(--bg)', color: 'var(--text)',
    boxSizing: 'border-box', outline: 'none', resize: 'vertical',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Logo preview */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '18px 22px', background: 'var(--surface)' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Logo</h2>
        {logoUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Bedrijfslogo" style={{ maxHeight: 48, maxWidth: 160, objectFit: 'contain' }}/>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Logo uit huisstijl-instellingen.{' '}
              <a href="/instellingen/bedrijfsgegevens/huisstijl" style={{ color: '#009439' }}>Aanpassen</a>
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Nog geen logo ingesteld.{' '}
            <a href="/instellingen/bedrijfsgegevens/huisstijl" style={{ color: '#009439' }}>Upload via Huisstijl</a>.
          </p>
        )}
      </div>

      {/* Inhoud */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '18px 22px', background: 'var(--surface)' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Koptekst-inhoud</h2>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--text-muted)' }}>
          Wat er in de koptekst van elke PDF verschijnt.
        </p>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <Toggle checked={toonLogo} onChange={setToonLogo} label="Bedrijfslogo" description="Logo linksboven in de PDF-koptekst." />
          <div style={{ borderTop: '1px solid var(--border)' }}/>
          <Toggle checked={toonInvuller} onChange={setToonInvuller} label="Naam invuller + datum" description="Wie het formulier heeft ingediend en wanneer." />
          <div style={{ borderTop: '1px solid var(--border)' }}/>
          <Toggle checked={toonProjectRef} onChange={setToonProjectRef} label="Projectreferentie" description="Toon de projectreferentie als die is ingevuld." />
        </div>
      </div>

      {/* Vrije teksten */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '18px 22px', background: 'var(--surface)' }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>Kop- en voettekst</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text)' }}>
              Koptekst (onder het logo)
            </label>
            <textarea value={koptekst} onChange={e => setKoptekst(e.target.value)}
              placeholder="Bijv. 'Intern document — niet voor verspreiding'" rows={2} style={taStyle}/>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text)' }}>
              Voettekst (onderaan elke pagina)
            </label>
            <textarea value={voettekst} onChange={e => setVoettekst(e.target.value)}
              placeholder="Bijv. 'Everts Schilderwerken BV — www.everts.nl'" rows={2} style={taStyle}/>
          </div>
        </div>
      </div>

      {/* Briefpapier-marges */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '18px 22px', background: 'var(--surface)' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Marges bij briefpapier</h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Als een formulier een briefpapier-PDF gebruikt, worden het logo en de voettekst van de app verborgen
          (die staan al op het briefpapier). Deze marges houden de inhoud vrij van het briefhoofd en de brief-voet.
          Geldt voor alle formulieren met briefpapier.
        </p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text)' }}>
              Marge boven (mm)
            </label>
            <input
              type="number" min={0} max={120}
              value={margeBoven}
              onChange={e => setMargeBoven(e.target.value)}
              style={{ ...taStyle, width: 120 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text)' }}>
              Marge onder (mm)
            </label>
            <input
              type="number" min={0} max={120}
              value={margeOnder}
              onChange={e => setMargeOnder(e.target.value)}
              style={{ ...taStyle, width: 120 }}
            />
          </div>
        </div>
      </div>

      <div>
        <button type="button" onClick={handleSave} disabled={pending} style={{
          padding: '10px 22px', borderRadius: 8,
          border: 'none', background: '#009439', color: 'white',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>
          {pending ? 'Opslaan...' : 'Instellingen opslaan'}
        </button>
      </div>
    </div>
  )
}
