import React from 'react'

/**
 * Een tabel uit het handboek, leesbaar op een telefoon.
 *
 * Een echte `<table>` met vier kolommen past niet op 360 px, en horizontaal
 * scrollen binnen een leesscherm is op `/m` verboden. Daarom twee vormen:
 *
 *  • twee kolommen → definitielijst: label vet, waarde eronder. Zo staat de
 *    functie→auto-tabel er als "Timmerman / Witte werkbus, diesel".
 *  • drie of meer  → een kaartje per rij met label-waardeparen. De functietabel
 *    (code + omschrijving) en de vakantiedagen lezen zo als losse regels.
 *
 * Rijen zonder koppen (de vakantiedagen in het Verlof-hoofdstuk staan in het
 * Word-document als uitgelijnde regels) krijgen de eerste kolom als label.
 */
export default function TabelBlok({
  id, kolommen, rijen,
}: {
  id?: string
  kolommen: string[]
  rijen: string[][]
}) {
  if (!rijen.length) return null

  const breedte = Math.max(kolommen.length, ...rijen.map((r) => r.length))
  const heeftKoppen = kolommen.length > 0

  if (breedte <= 2) {
    return (
      <dl id={id} style={{ scrollMarginTop: 80, margin: '0 0 14px' }}>
        {heeftKoppen && (
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
            {kolommen.filter(Boolean).join(' · ')}
          </div>
        )}
        {rijen.map((rij, n) => (
          <div
            key={n}
            style={{
              display: 'flex', justifyContent: 'space-between', gap: 12,
              padding: '9px 0',
              borderBottom: n < rijen.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <dt style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', flexShrink: 0 }}>
              {rij[0]}
            </dt>
            <dd style={{ fontSize: 15, color: 'var(--fg-muted)', margin: 0, textAlign: 'right' }}>
              {rij[1] ?? ''}
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <div id={id} style={{ scrollMarginTop: 80, display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 14px' }}>
      {rijen.map((rij, n) => (
        <div
          key={n}
          style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--bg-elev)', border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{rij[0]}</div>
          {rij.slice(1).map((cel, k) =>
            cel ? (
              <div key={k} style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 2 }}>
                {heeftKoppen && kolommen[k + 1] ? `${kolommen[k + 1]}: ${cel}` : cel}
              </div>
            ) : null,
          )}
        </div>
      ))}
    </div>
  )
}
