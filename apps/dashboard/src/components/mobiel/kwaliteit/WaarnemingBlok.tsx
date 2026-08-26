'use client'

import React from 'react'
import type { KwaliteitFoto, KwaliteitWaarneming } from '@everts/database/kwaliteit-types'
import { KWALITEIT_WAARNEMING_SUGGESTIES } from '@everts/database/kwaliteit-types'
import { voegWaarnemingToe, verwijderWaarneming } from '@/lib/kwaliteit/inspecties'
import FotoStrook, { type StrookFoto } from './FotoStrook'
import LocatieKiezer from './LocatieKiezer'
import { GRIJS, GROEN, primaireKnop, RAND, ROOD, TEKST, veld, ZACHT } from './stijl'

/**
 * Positieve kwaliteitswaarneming per discipline (§37).
 *
 * Het klantrapport mag niet uitsluitend fouten tonen: dat wat goed gaat hoort er net zo goed in.
 * De knop staat daarom onderaan élke disciplinesectie, niet weggestopt in een apart scherm.
 */
export default function WaarnemingBlok({
  inspectieId,
  disciplineCode,
  disciplineNaam,
  waarnemingen,
  fotos,
  recenteLocaties,
  bewerkbaar,
  onGewijzigd,
}: {
  inspectieId: string
  disciplineCode: string
  disciplineNaam: string
  waarnemingen: KwaliteitWaarneming[]
  fotos: KwaliteitFoto[]
  recenteLocaties: string[]
  bewerkbaar: boolean
  onGewijzigd: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [omschrijving, setOmschrijving] = React.useState('')
  const [locatie, setLocatie] = React.useState('')
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  async function bewaar() {
    if (!omschrijving.trim()) { setFout('Geef een korte omschrijving.'); return }
    setBezig(true); setFout(null)
    const res = await voegWaarnemingToe(inspectieId, {
      disciplineCode, locatie: locatie || null, omschrijving: omschrijving.trim(),
    })
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setOmschrijving(''); setLocatie(''); setOpen(false)
    onGewijzigd()
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {waarnemingen.map(w => (
        <WaarnemingKaart
          key={w.id}
          waarneming={w}
          inspectieId={inspectieId}
          fotos={fotos.filter(f => f.waarneming_id === w.id)}
          bewerkbaar={bewerkbaar}
          onGewijzigd={onGewijzigd}
        />
      ))}

      {bewerkbaar && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: '100%', padding: '11px', borderRadius: 10,
            border: `1px dashed ${GROEN}`, background: 'transparent', color: GROEN,
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          + Positieve kwaliteitswaarneming
        </button>
      )}

      {open && (
        <div style={{
          border: `1px solid ${GROEN}`, borderRadius: 12, padding: 14,
          background: 'rgba(0,148,57,0.05)',
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: GROEN }}>
            Wat gaat er goed bij {disciplineNaam.toLowerCase()}?
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {KWALITEIT_WAARNEMING_SUGGESTIES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setOmschrijving(s)}
                style={{
                  padding: '7px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  border: `1px solid ${omschrijving === s ? GROEN : RAND}`,
                  background: omschrijving === s ? GROEN : 'transparent',
                  color: omschrijving === s ? '#fff' : GRIJS, cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <input
            value={omschrijving}
            onChange={e => setOmschrijving(e.target.value)}
            placeholder="Of typ zelf een korte omschrijving"
            style={{ ...veld, marginBottom: 10 }}
          />

          <div style={{ marginBottom: 10 }}>
            <LocatieKiezer waarde={locatie} onChange={setLocatie} recent={recenteLocaties} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => { setOpen(false); setOmschrijving(''); setLocatie(''); setFout(null) }}
              style={{
                padding: '11px 14px', borderRadius: 10, border: `1px solid ${RAND}`,
                background: 'transparent', color: GRIJS, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => void bewaar()}
              disabled={bezig}
              style={{ ...primaireKnop, flex: 1, padding: '11px 14px', fontSize: 14 }}
            >
              {bezig ? 'Bezig…' : 'Opslaan'}
            </button>
          </div>

          <p style={{ margin: '8px 0 0', fontSize: 11, color: ZACHT }}>
            Foto toevoegen kan zodra de waarneming is opgeslagen.
          </p>
          {fout && <p style={{ margin: '6px 0 0', fontSize: 12, color: ROOD }}>{fout}</p>}
        </div>
      )}
    </div>
  )
}

function WaarnemingKaart({
  waarneming, inspectieId, fotos, bewerkbaar, onGewijzigd,
}: {
  waarneming: KwaliteitWaarneming
  inspectieId: string
  fotos: KwaliteitFoto[]
  bewerkbaar: boolean
  onGewijzigd: () => void
}) {
  const [lokaal, setLokaal] = React.useState<StrookFoto[]>(fotos.map(f => ({ id: f.id, url: f.url })))

  return (
    <div style={{
      border: `1px solid ${GROEN}`, borderRadius: 12, padding: 12, marginBottom: 8,
      background: 'rgba(0,148,57,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: TEKST }}>
            ✓ {waarneming.omschrijving}
          </p>
          {waarneming.locatie && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: GRIJS }}>{waarneming.locatie}</p>
          )}
        </div>
        {bewerkbaar && (
          <button
            type="button"
            onClick={async () => { await verwijderWaarneming(waarneming.id, inspectieId); onGewijzigd() }}
            style={{ background: 'none', border: 'none', color: ROOD, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            Verwijderen
          </button>
        )}
      </div>
      <FotoStrook
        koppelSoort="waarneming"
        koppelId={waarneming.id}
        soort="positief"
        fotos={lokaal}
        onVeranderd={setLokaal}
        compact
      />
    </div>
  )
}
