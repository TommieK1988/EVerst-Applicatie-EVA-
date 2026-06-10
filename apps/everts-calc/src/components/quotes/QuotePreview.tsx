import type { Quote, QuoteSection, QuoteLine } from '@/lib/types-quotes'

export interface BedrijfsInstellingen {
  naam: string
  adres?: string
  postcode_plaats?: string
  telefoon?: string
  email?: string
  website?: string
  kvk?: string
  btw?: string
  iban?: string
  logo_url?: string
}

interface Props {
  quote: Quote
  bedrijf?: BedrijfsInstellingen | null
  briefpapier?: string | null
}

const BEDRIJF_FALLBACK: BedrijfsInstellingen = {
  naam: 'Everts Groep B.V.',
  adres: 'Voorbeeldstraat 1',
  postcode_plaats: '1234 AB Amstelveen',
  telefoon: '020-1234567',
  email: 'info@evertsgroep.nl',
  kvk: '12345678',
  btw: 'NL123456789B01',
  iban: 'NL00 BANK 0000 0000 00',
}

function euro(n: number) {
  return '\u20ac\u00a0' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function datumNL(iso?: string | null) {
  if (!iso) return '\u2014'
  return new Date(iso).toLocaleDateString('nl-NL')
}

const pagePadding = { padding: '15mm 18mm', boxSizing: 'border-box' as const }

function Briefpapier({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', zIndex: 0, pointerEvents: 'none', opacity: 0.15,
      }}
    />
  )
}

/** Sectie header kleur + stijl op basis van niveau en is_optioneel */
function sectionHeaderStyle(section: QuoteSection): React.CSSProperties {
  if (section.is_optioneel) {
    return { background: '#d97706', color: 'white' }
  }
  if (section.niveau === 3) return { background: '#e2e8f0', color: '#334155' }
  if (section.niveau === 2) return { background: '#475569', color: 'white' }
  return { background: '#1a56db', color: 'white' } // niveau 1
}

/** Displaynaam met nummering prefix */
function sectionDisplayNaam(section: QuoteSection): string {
  return section.nummer ? `${section.nummer}  ${section.naam}` : section.naam
}

function SectionRows({ section, isIntern }: { section: QuoteSection; isIntern: boolean }) {
  const lines = section.lines ?? []
  const toonDetail = section.toon_detail && lines.length > 0
  const headerStyle = sectionHeaderStyle(section)
  const colSpanTotal = isIntern ? 8 : 5

  return (
    <div style={{ marginBottom: '5mm' }}>
      {/* Header */}
      <div style={{
        ...headerStyle,
        padding: '2.5mm 4mm',
        fontWeight: 700, fontSize: '9.5pt',
        borderRadius: '4px 4px 0 0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>
          {section.is_optioneel && (
            <span style={{
              display: 'inline-block', marginRight: '3mm',
              background: 'rgba(255,255,255,0.25)',
              padding: '0 2mm', borderRadius: '3px', fontSize: '7.5pt', letterSpacing: '0.05em',
            }}>OPTIE</span>
          )}
          {sectionDisplayNaam(section)}
        </span>
        {!toonDetail && <span>{euro(section.subtotaal)}</span>}
      </div>

      {toonDetail ? (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', border: '1px solid #e2e8f0', borderTop: 'none' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '2mm 3mm', color: '#64748b', fontWeight: 600, width: '99%' }}>Omschrijving</th>
                <th style={{ textAlign: 'right', padding: '2mm 2mm', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Hoev.</th>
                <th style={{ textAlign: 'left', padding: '2mm 2mm', color: '#64748b', fontWeight: 600, width: '8mm' }}>Eenh.</th>
                <th style={{ textAlign: 'right', padding: '2mm 2mm', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Prijs/eenh</th>
                {isIntern && <th style={{ textAlign: 'right', padding: '2mm 2mm', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>KP/eenh</th>}
                {isIntern && <th style={{ textAlign: 'right', padding: '2mm 2mm', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Uren</th>}
                {isIntern && <th style={{ textAlign: 'right', padding: '2mm 2mm', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Marge%</th>}
                <th style={{ textAlign: 'right', padding: '2mm 3mm', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Totaal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line: QuoteLine, li: number) => {
                const marge = isIntern && line.kostprijs_pe && line.kostprijs_pe > 0
                  ? ((line.eenheidsprijs - line.kostprijs_pe) / line.eenheidsprijs * 100).toFixed(1)
                  : null
                const isEven = li % 2 === 0
                const isStelpost = line.is_stelpost
                const lineColor = isStelpost ? '#92400e' : '#334155'
                const lineBg = isEven ? '#ffffff' : '#f8fafc'
                return (
                  <>
                    <tr key={line.id} style={{ background: lineBg }}>
                      <td style={{ padding: '2mm 3mm', color: lineColor, fontStyle: isStelpost ? 'italic' : 'normal' }}>
                        {isStelpost && (
                          <span style={{ fontSize: '7pt', color: '#b45309', marginRight: '2mm', fontStyle: 'normal', fontWeight: 700 }}>SP</span>
                        )}
                        {line.omschrijving}
                      </td>
                      <td style={{ padding: '2mm 2mm', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap', fontStyle: isStelpost ? 'italic' : 'normal' }}>
                        {line.hoeveelheid.toLocaleString('nl-NL', { maximumFractionDigits: 3 })}
                      </td>
                      <td style={{ padding: '2mm 2mm', color: '#94a3b8' }}>{line.eenheid}</td>
                      <td style={{ padding: '2mm 2mm', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap', fontStyle: isStelpost ? 'italic' : 'normal' }}>
                        {euro(line.eenheidsprijs)}
                      </td>
                      {isIntern && (
                        <td style={{ padding: '2mm 2mm', textAlign: 'right', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {line.kostprijs_pe != null ? euro(line.kostprijs_pe) : '\u2014'}
                        </td>
                      )}
                      {isIntern && (
                        <td style={{ padding: '2mm 2mm', textAlign: 'right', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {line.uren_pe != null ? line.uren_pe.toFixed(3) : '\u2014'}
                        </td>
                      )}
                      {isIntern && (
                        <td style={{ padding: '2mm 2mm', textAlign: 'right', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {marge != null ? `${marge}%` : '\u2014'}
                        </td>
                      )}
                      <td style={{ padding: '2mm 3mm', textAlign: 'right', fontWeight: 600, color: lineColor, whiteSpace: 'nowrap', fontStyle: isStelpost ? 'italic' : 'normal' }}>
                        {euro(line.line_total)}
                      </td>
                    </tr>
                    {line.opmerking && (
                      <tr key={`${line.id}-werk`} style={{ background: lineBg }}>
                        <td
                          colSpan={colSpanTotal}
                          style={{ padding: '0 3mm 2mm 8mm', color: '#64748b', fontSize: '8pt', fontStyle: 'italic', lineHeight: 1.5, whiteSpace: 'pre-line' }}
                        >
                          {line.opmerking}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          <div style={{
            border: '1px solid #e2e8f0', borderTop: 'none',
            padding: '2mm 3mm', display: 'flex', justifyContent: 'flex-end',
            background: '#f1f5f9', fontSize: '8.5pt', fontWeight: 600,
          }}>
            <span style={{ marginRight: '6mm', color: '#64748b' }}>Subtotaal {section.naam}</span>
            <span>{euro(section.subtotaal)}</span>
          </div>
        </>
      ) : (
        <div style={{
          border: '1px solid #e2e8f0', borderTop: 'none',
          padding: '3mm 4mm', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', fontSize: '9pt', background: '#f8fafc',
        }}>
          <span style={{ color: '#64748b', fontStyle: 'italic' }}>
            {lines.length} regel{lines.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontWeight: 600 }}>{euro(section.subtotaal)}</span>
        </div>
      )}
    </div>
  )
}

export default function QuotePreview({ quote, bedrijf, briefpapier }: Props) {
  const b = bedrijf ?? BEDRIJF_FALLBACK
  const isIntern = quote.type === 'interne_calculatie'
  const sections = quote.sections ?? []
  const terms = quote.terms ?? []

  const normaleSections = sections.filter(s => !s.is_optioneel)
  const optieSections = sections.filter(s => s.is_optioneel)

  // Alle stelpost lines uit normale secties
  const stelpostLines: { sectionNaam: string; line: QuoteLine }[] = []
  for (const s of normaleSections) {
    for (const l of (s.lines ?? [])) {
      if (l.is_stelpost) stelpostLines.push({ sectionNaam: s.naam, line: l })
    }
  }

  const voorwaarden   = terms.find(t => t.type === 'voorwaarden')?.inhoud   ?? ''
  const uitsluitingen = terms.find(t => t.type === 'uitsluitingen')?.inhoud ?? ''
  const opmerkingen   = terms.find(t => t.type === 'opmerkingen')?.inhoud   ?? ''
  const heeftTerms    = !!(voorwaarden || uitsluitingen || opmerkingen)

  const heeftStelposten = stelpostLines.length > 0
  const heeftOpties = optieSections.length > 0

  // BTW-breakdown per tarief op basis van per-regel btw_pct
  const btwGroepen: { pct: number; btw: number }[] = (() => {
    const groepen = new Map<number, number>()
    for (const s of normaleSections) {
      for (const l of (s.lines ?? [])) {
        if (!l.is_stelpost || quote.stelposten_in_totaal) {
          const pct = l.btw_pct ?? quote.btw_pct ?? 21
          groepen.set(pct, (groepen.get(pct) ?? 0) + l.line_total)
        }
      }
    }
    if (groepen.size === 0) {
      return [{ pct: quote.btw_pct ?? 21, btw: quote.btw_bedrag }]
    }
    return Array.from(groepen.entries())
      .sort(([a], [b]) => a - b)
      .map(([pct, basis]) => ({ pct, btw: Math.round(basis * pct) / 100 }))
  })()

  const printCSS = `
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page-break { break-before: page; }
    }
    @media screen {
      #quote-preview .page-break { border-top: 6px solid #94a3b8; }
    }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printCSS }} />

      <div
        id="quote-preview"
        className="bg-white font-sans text-slate-800"
        style={{ width: '210mm', margin: '0 auto', fontSize: '10pt' }}
      >
        {/* ══ PAGINA 1 — VOORBLAD ══ */}
        <div style={{
          height: '297mm', ...pagePadding,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', position: 'relative',
        }}>
          {briefpapier && <Briefpapier src={briefpapier} />}

          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Intern banner */}
            {isIntern && (
              <div style={{
                background: '#7c3aed', color: 'white', textAlign: 'center',
                fontSize: '9pt', fontWeight: 700, letterSpacing: '0.1em',
                marginBottom: '4mm', marginLeft: '-18mm', marginRight: '-18mm',
                marginTop: '-15mm', paddingTop: '15mm', paddingBottom: '4px',
              }}>
                INTERN DOCUMENT &mdash; NIET VOOR KLANT
              </div>
            )}

            {/* Briefhoofd */}
            <table style={{ width: '100%', marginBottom: '12mm', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: 'top', width: '60%' }}>
                    {b.logo_url
                      ? <img src={b.logo_url} alt="Logo" style={{ maxHeight: '18mm', maxWidth: '60mm', objectFit: 'contain', marginBottom: '3mm' }} />
                      : <div style={{ fontSize: '15pt', fontWeight: 800, color: '#1a56db', marginBottom: '2mm' }}>{b.naam}</div>
                    }
                    {b.logo_url && <div style={{ fontWeight: 700, marginBottom: '1mm' }}>{b.naam}</div>}
                    <div style={{ color: '#64748b', fontSize: '9pt', lineHeight: 1.6 }}>
                      {b.adres && <div>{b.adres}</div>}
                      {b.postcode_plaats && <div>{b.postcode_plaats}</div>}
                      {b.telefoon && <div>T {b.telefoon}</div>}
                      {b.email && <div>{b.email}</div>}
                      {b.website && <div>{b.website}</div>}
                    </div>
                  </td>
                  <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                    <div style={{ fontSize: '14pt', fontWeight: 800, marginBottom: '3mm', color: '#0f172a' }}>
                      {isIntern ? 'INTERNE BEGROTING' : 'OFFERTE'}
                    </div>
                    <table style={{ marginLeft: 'auto', borderCollapse: 'collapse', fontSize: '9pt' }}>
                      <tbody>
                        <tr>
                          <td style={{ color: '#94a3b8', paddingRight: '6mm', paddingBottom: '1mm' }}>Nummer</td>
                          <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{quote.quote_nummer}</td>
                        </tr>
                        <tr>
                          <td style={{ color: '#94a3b8', paddingRight: '6mm', paddingBottom: '1mm' }}>Datum</td>
                          <td>{datumNL(quote.datum)}</td>
                        </tr>
                        {quote.geldig_tot && (
                          <tr>
                            <td style={{ color: '#94a3b8', paddingRight: '6mm', paddingBottom: '1mm' }}>Geldig tot</td>
                            <td>{datumNL(quote.geldig_tot)}</td>
                          </tr>
                        )}
                        {quote.referentie && (
                          <tr>
                            <td style={{ color: '#94a3b8', paddingRight: '6mm', paddingBottom: '1mm' }}>Referentie</td>
                            <td>{quote.referentie}</td>
                          </tr>
                        )}
                        {b.kvk && (
                          <tr>
                            <td style={{ color: '#94a3b8', paddingRight: '6mm', paddingBottom: '1mm' }}>KvK</td>
                            <td>{b.kvk}</td>
                          </tr>
                        )}
                        {b.btw && (
                          <tr>
                            <td style={{ color: '#94a3b8', paddingRight: '6mm' }}>BTW</td>
                            <td>{b.btw}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Klantadres */}
            {quote.client && (
              <div style={{ marginBottom: '10mm', fontSize: '10pt', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700 }}>{quote.client.bedrijfsnaam ?? quote.client.naam}</div>
                {quote.client.bedrijfsnaam && <div>{quote.client.naam}</div>}
                {quote.client.adres && <div>{quote.client.adres}</div>}
                {(quote.client.postcode || quote.client.plaats) && (
                  <div>{[quote.client.postcode, quote.client.plaats].filter(Boolean).join(' ')}</div>
                )}
              </div>
            )}

            {/* Aanhef + inleiding */}
            <div style={{ marginBottom: '6mm' }}>
              <div style={{ marginBottom: '4mm', fontSize: '10pt' }}>{quote.aanhef}</div>
              {quote.inleiding && (
                <div style={{ whiteSpace: 'pre-line', lineHeight: 1.7, marginBottom: '4mm' }}>{quote.inleiding}</div>
              )}
            </div>

            {/* Totaal samenvatting */}
            <div style={{ marginTop: 'auto', marginBottom: '8mm' }}>
              <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: '6px', padding: '6mm 8mm', maxWidth: '90mm', marginLeft: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '9pt', color: '#475569' }}>
                  <span>Subtotaal ex BTW</span>
                  <span>{euro(quote.subtotaal_ex_btw)}</span>
                </div>
                {heeftStelposten && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '8pt', color: '#92400e', fontStyle: 'italic' }}>
                    <span>w.v. stelposten{!quote.stelposten_in_totaal ? ' (niet meegerekend)' : ''}</span>
                    <span>{euro(quote.stelposten_subtotaal)}</span>
                  </div>
                )}
                {heeftOpties && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '8pt', color: '#b45309', fontStyle: 'italic' }}>
                    <span>Opties (niet inbegrepen)</span>
                    <span>{euro(quote.opties_subtotaal)}</span>
                  </div>
                )}
                {btwGroepen.map(g => (
                  <div key={g.pct} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '9pt', color: '#475569' }}>
                    <span>BTW {g.pct}%</span>
                    <span>{euro(g.btw)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #7dd3fc', paddingTop: '2mm', fontWeight: 800, fontSize: '12pt' }}>
                  <span>Totaal incl BTW</span>
                  <span>{euro(quote.totaal_inc_btw)}</span>
                </div>
              </div>
            </div>

            {/* Slottekst */}
            {quote.slottekst && (
              <div style={{ whiteSpace: 'pre-line', lineHeight: 1.7, fontSize: '9pt', color: '#475569' }}>{quote.slottekst}</div>
            )}
          </div>
        </div>

        {/* ══ PAGINA 2 — SPECIFICATIE ══ */}
        <div className="page-break" style={{ minHeight: '267mm', ...pagePadding, position: 'relative' }}>
          {briefpapier && <Briefpapier src={briefpapier} />}

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '13pt', fontWeight: 800, marginBottom: '6mm', color: '#0f172a', borderBottom: '2px solid #1a56db', paddingBottom: '2mm' }}>
              Specificatie
            </div>

            {/* Normale secties */}
            {normaleSections.map((section) => (
              <SectionRows key={section.id} section={section} isIntern={isIntern} />
            ))}

            {/* Stelposten samenvatting */}
            {heeftStelposten && (
              <div style={{ marginTop: '8mm', marginBottom: '6mm' }}>
                <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: '6px', padding: '4mm 5mm' }}>
                  <div style={{ fontWeight: 700, fontSize: '10pt', color: '#92400e', marginBottom: '3mm' }}>
                    Stelposten
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
                    <tbody>
                      {stelpostLines.map(({ sectionNaam, line }) => (
                        <tr key={line.id}>
                          <td style={{ padding: '1mm 0', color: '#78350f', fontStyle: 'italic', width: '99%' }}>
                            <span style={{ color: '#b45309', marginRight: '2mm', fontSize: '7pt', fontStyle: 'normal', fontWeight: 700 }}>SP</span>
                            {line.omschrijving}
                            <span style={{ color: '#b45309', marginLeft: '2mm', fontSize: '7.5pt' }}>({sectionNaam})</span>
                          </td>
                          <td style={{ padding: '1mm 0', textAlign: 'right', fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                            {euro(line.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop: '1px solid #fed7aa', marginTop: '2mm', paddingTop: '2mm', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '9pt', color: '#92400e' }}>
                    <span>Totaal stelposten{!quote.stelposten_in_totaal ? ' (niet inbegrepen in offertebedrag)' : ''}</span>
                    <span>{euro(quote.stelposten_subtotaal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Opties samenvatting */}
            {heeftOpties && (
              <div style={{ marginTop: heeftStelposten ? '4mm' : '8mm', marginBottom: '6mm' }}>
                <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: '6px', padding: '4mm 5mm' }}>
                  <div style={{ fontWeight: 700, fontSize: '10pt', color: '#b45309', marginBottom: '3mm' }}>
                    Opties
                    <span style={{ fontSize: '8pt', color: '#92400e', fontWeight: 400, marginLeft: '3mm' }}>
                      (niet inbegrepen in offertebedrag)
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
                    <tbody>
                      {optieSections.map((s) => (
                        <tr key={s.id}>
                          <td style={{ padding: '1mm 0', color: '#78350f', width: '99%' }}>
                            {sectionDisplayNaam(s)}
                          </td>
                          <td style={{ padding: '1mm 0', textAlign: 'right', fontWeight: 600, color: '#b45309', whiteSpace: 'nowrap' }}>
                            {euro(s.subtotaal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop: '1px solid #fcd34d', marginTop: '2mm', paddingTop: '2mm', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '9pt', color: '#b45309' }}>
                    <span>Totaal opties</span>
                    <span>{euro(quote.opties_subtotaal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Totaalblok */}
            <div style={{ marginTop: '6mm', borderTop: '2px solid #e2e8f0', paddingTop: '4mm' }}>
              <div style={{ maxWidth: '90mm', marginLeft: 'auto', fontSize: '9pt' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', color: '#475569' }}>
                  <span>Subtotaal ex BTW</span>
                  <span>{euro(quote.subtotaal_ex_btw)}</span>
                </div>
                {heeftStelposten && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', color: '#92400e', fontStyle: 'italic', fontSize: '8pt' }}>
                    <span>w.v. stelposten{!quote.stelposten_in_totaal ? ' (excl.)' : ''}</span>
                    <span>{euro(quote.stelposten_subtotaal)}</span>
                  </div>
                )}
                {btwGroepen.map(g => (
                  <div key={g.pct} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3mm', color: '#475569' }}>
                    <span>BTW {g.pct}%</span>
                    <span>{euro(g.btw)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #334155', paddingTop: '2mm', fontWeight: 800, fontSize: '11pt' }}>
                  <span>Totaal incl BTW</span>
                  <span>{euro(quote.totaal_inc_btw)}</span>
                </div>
                {heeftOpties && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2mm', color: '#b45309', fontStyle: 'italic', fontSize: '8pt' }}>
                    <span>Opties (niet inbegrepen)</span>
                    <span>{euro(quote.opties_subtotaal)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Optie secties detail (op zelfde of volgende pagina) */}
            {heeftOpties && optieSections.some(s => s.toon_detail && (s.lines ?? []).length > 0) && (
              <div style={{ marginTop: '8mm' }}>
                <div style={{ fontSize: '11pt', fontWeight: 800, marginBottom: '4mm', color: '#b45309', borderBottom: '2px solid #fcd34d', paddingBottom: '2mm' }}>
                  Opties — detail
                </div>
                {optieSections.map((section) => (
                  <SectionRows key={section.id} section={section} isIntern={isIntern} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══ PAGINA 3 — VOORWAARDEN ══ */}
        {heeftTerms && (
          <div className="page-break" style={{ minHeight: '267mm', ...pagePadding, position: 'relative' }}>
            {briefpapier && <Briefpapier src={briefpapier} />}

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '13pt', fontWeight: 800, marginBottom: '6mm', color: '#0f172a', borderBottom: '2px solid #1a56db', paddingBottom: '2mm' }}>
                Voorwaarden &amp; opmerkingen
              </div>

              {voorwaarden && (
                <div style={{ marginBottom: '6mm' }}>
                  <div style={{ fontWeight: 700, marginBottom: '2mm', fontSize: '10.5pt' }}>Voorwaarden</div>
                  <div style={{ whiteSpace: 'pre-line', lineHeight: 1.7, color: '#475569', fontSize: '9pt' }}>{voorwaarden}</div>
                </div>
              )}
              {uitsluitingen && (
                <div style={{ marginBottom: '6mm' }}>
                  <div style={{ fontWeight: 700, marginBottom: '2mm', fontSize: '10.5pt' }}>Uitsluitingen</div>
                  <div style={{ whiteSpace: 'pre-line', lineHeight: 1.7, color: '#475569', fontSize: '9pt' }}>{uitsluitingen}</div>
                </div>
              )}
              {opmerkingen && (
                <div style={{ marginBottom: '6mm' }}>
                  <div style={{ fontWeight: 700, marginBottom: '2mm', fontSize: '10.5pt' }}>Opmerkingen</div>
                  <div style={{ whiteSpace: 'pre-line', lineHeight: 1.7, color: '#475569', fontSize: '9pt' }}>{opmerkingen}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
