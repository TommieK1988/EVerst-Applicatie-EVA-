import { isWerkomschrijvingKopje, werkafsprakenAlsZinnen, type Werkplan } from '@/lib/dossiers/werkplan-types'
import type { Betrokkene } from '@/lib/dossiers/betrokkenen-types'

const GRIJS = 'var(--fg-muted)'
const RAND = 'var(--border)'
const TEKST = 'var(--fg)'
const OPPERVLAK = 'var(--bg-elev)'

const kaart = { background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14, padding: 14, marginBottom: 12 } as const
const kop = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: GRIJS } as const

/**
 * Het werkplan op de telefoon: alleen-lezen. Per werkafspraak alleen de gekozen zin, met de
 * ingevulde waarde erin — de monteur hoeft niet te zien wat er níet geldt.
 */
export default function WerkplanWeergave({ werkplan, betrokkenen }: {
  werkplan: Werkplan | null
  betrokkenen: Betrokkene[]
}) {
  if (!werkplan) {
    return (
      <div style={{ padding: '14px 16px 24px' }}>
        <p style={{ margin: 0, fontSize: 14, color: GRIJS }}>Er is nog geen werkplan voor dit dossier.</p>
      </div>
    )
  }

  const regels = werkplan.werkomschrijving.split(/\r?\n/)

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <section style={kaart}>
        <h2 style={kop}>Werkomschrijving</h2>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: TEKST }}>
          {regels.map((r, i) =>
            isWerkomschrijvingKopje(r)
              ? <div key={i} style={{ fontWeight: 700, marginTop: i === 0 ? 0 : 8 }}>{r.trim()}</div>
              : <div key={i} style={{ whiteSpace: 'pre-wrap', minHeight: r.trim() ? undefined : 4 }}>{r}</div>,
          )}
        </div>
      </section>

      {betrokkenen.length > 0 && (
        <section style={kaart}>
          <h2 style={kop}>Overige betrokkenen</h2>
          {betrokkenen.map((b, i) => (
            <div key={b.sleutel} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${RAND}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEKST }}>{b.naam}</div>
              {(b.rol || b.organisatie) && (
                <div style={{ fontSize: 12.5, color: GRIJS }}>
                  {[b.rol, b.organisatie?.naam !== b.naam ? b.organisatie?.naam : null].filter(Boolean).join(' · ')}
                </div>
              )}
              {b.telefoon && (
                <a href={`tel:${b.telefoon}`} style={{ display: 'inline-block', marginTop: 4, fontSize: 14, color: 'var(--brand-600, #007530)', minHeight: 24 }}>
                  {b.telefoon}
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      <section style={kaart}>
        <h2 style={kop}>Werkafspraken</h2>
        {werkafsprakenAlsZinnen(werkplan).map((a, i) => (
          <div key={a.titel} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${RAND}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: TEKST }}>{a.titel}</div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: TEKST, marginTop: 2 }}>{a.zin}</div>
          </div>
        ))}
      </section>

      {werkplan.kleuren_materialen.length > 0 && (
        <section style={kaart}>
          <h2 style={kop}>Kleuren en materialen</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: TEKST }}>
            <tbody>
              {werkplan.kleuren_materialen.map((r, i) => (
                <tr key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${RAND}` }}>
                  <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, verticalAlign: 'top', width: '45%' }}>{r.onderdeel || '—'}</td>
                  <td style={{ padding: '6px 0', verticalAlign: 'top' }}>{r.waarde || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
