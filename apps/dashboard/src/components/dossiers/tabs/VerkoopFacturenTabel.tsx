'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { VerkoopFactuur } from '@/lib/dossiers/actions'
import { fmt, fmtDatum, fmtPct, TH, TD, LegeRij } from './tab-ui'

/**
 * De verkoopfacturen van een dossier, met per factuur wat erop staat.
 *
 * Eén post (één termijn, één regiepost) → die omschrijving staat gewoon in de rij. Staan er meer
 * posten op één factuur, dan heet de rij "Samengevoegd" en klap je hem open om de posten te zien.
 * Dat is de enige manier om te zien wélke termijnen samen gefactureerd zijn zonder Bouw7 te openen.
 */
export default function VerkoopFacturenTabel({ facturen }: { facturen: VerkoopFactuur[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const wissel = (i: number) => setOpen((o) => {
    const n = new Set(o)
    if (n.has(i)) n.delete(i)
    else n.add(i)
    return n
  })

  const som = (kies: (f: VerkoopFactuur) => number, lijst = facturen) =>
    lijst.reduce((s, f) => s + (f.isCredit ? -kies(f) : kies(f)), 0)
  const betaald = facturen.filter(f => f.betaald)
  const openstaand = facturen.filter(f => !f.betaald)
  // Totaal = betaald + nog te ontvangen. Een factuur is betaald of open; iets daartussen kent Bouw7 niet.
  const voetRegels: { label: string; lijst: VerkoopFactuur[]; nadruk?: boolean }[] = [
    { label: 'Totaal', lijst: facturen },
    { label: 'Totaal betaald', lijst: betaald },
    { label: 'Nog te ontvangen', lijst: openstaand, nadruk: true },
  ]
  const cel: React.CSSProperties = { padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
      <thead>
        <tr>
          <TH>Factuurnr.</TH>
          <TH>Omschrijving</TH>
          <TH>Datum</TH>
          <TH>Vervaldatum</TH>
          <TH right>Excl. BTW</TH>
          <TH right>BTW</TH>
          <TH right>Incl. BTW</TH>
          <TH>Status</TH>
        </tr>
      </thead>
      <tbody>
        {facturen.length === 0 && (
          <LegeRij velden={['tekst', 'tekst', 'tekst', 'tekst', 'bedrag', 'bedrag', 'bedrag', 'tekst']} />
        )}
        {facturen.map((f, i) => {
          const uitklapbaar = f.regels.length > 1
          const isOpen = uitklapbaar && open.has(i)
          return (
            <React.Fragment key={f.id ?? i}>
              <tr>
                <TD wrap>{f.factuurnummer ?? '—'}{f.isCredit ? ' (credit)' : ''}</TD>
                <TD wrap kleur={f.omschrijving ? undefined : 'var(--neutral-400)'}>
                  {/* Ondergrens voor de breedte: in een smalle kaart zou "Samengevoegd" anders
                      midden in het woord afbreken. De tabel schuift dan liever. */}
                  <div style={{ minWidth: 200 }}>
                  {uitklapbaar ? (
                    <button
                      type="button"
                      onClick={() => wissel(i)}
                      aria-expanded={isOpen}
                      title={isOpen ? 'Inklappen' : `${f.regels.length} posten tonen`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0,
                        border: 'none', background: 'none', cursor: 'pointer',
                        font: 'inherit', color: 'inherit', textAlign: 'left', whiteSpace: 'nowrap',
                      }}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {f.omschrijving}
                      <span style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{f.regels.length} posten</span>
                    </button>
                  ) : (f.omschrijving ?? '—')}
                  </div>
                </TD>
                <TD>{fmtDatum(f.datum)}</TD>
                <TD>{fmtDatum(f.vervaldatum)}</TD>
                <TD right kleur={f.isCredit ? 'var(--neutral-500)' : undefined}>{fmt(f.bedragExcl)}</TD>
                <TD right kleur="var(--neutral-500)">{f.btwBedrag > 0 ? fmt(f.btwBedrag) : '—'}</TD>
                <TD right kleur={f.isCredit ? 'var(--neutral-500)' : undefined} vet>{fmt(f.bedrag)}</TD>
                <TD kleur={f.betaald ? 'var(--accent)' : undefined}>{f.betaald ? 'Betaald' : 'Open'}</TD>
              </tr>
              {isOpen && f.regels.map((r, j) => (
                <tr key={j} style={{ background: 'var(--neutral-50)' }}>
                  <TD>{''}</TD>
                  <TD wrap kleur="var(--neutral-600)">
                    <span style={{ paddingLeft: 18, display: 'inline-block' }}>{r.omschrijving}</span>
                  </TD>
                  <TD colSpan={2} kleur="var(--neutral-400)">{r.btwPct != null ? `BTW ${fmtPct(r.btwPct)}` : ''}</TD>
                  <TD right kleur="var(--neutral-600)">{r.bedragExcl != null ? fmt(r.bedragExcl, true) : '—'}</TD>
                  <TD colSpan={3}>{''}</TD>
                </tr>
              ))}
            </React.Fragment>
          )
        })}
      </tbody>
      <tfoot>
        {voetRegels.map(({ label, lijst, nadruk }) => (
          <tr
            key={label}
            style={{
              background: 'var(--neutral-50)', fontSize: 12.5, fontWeight: nadruk ? 700 : 600,
              borderTop: nadruk ? '1px solid var(--neutral-200)' : undefined,
            }}
          >
            <td colSpan={4} style={{ padding: '6px 12px', color: nadruk ? 'var(--neutral-800)' : 'var(--neutral-600)' }}>{label}</td>
            <td style={cel}>{fmt(som(f => f.bedragExcl, lijst), true)}</td>
            <td style={cel}>{fmt(som(f => f.btwBedrag, lijst), true)}</td>
            <td style={cel}>{fmt(som(f => f.bedrag, lijst), true)}</td>
            <td style={{ padding: '6px 12px' }} />
          </tr>
        ))}
      </tfoot>
    </table>
  )
}
