import { Suspense } from 'react'
import { getDossierVerkoop } from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, fmtPct, fmtDatum, TH, TD, LegeStaat } from './tab-ui'

const InfoRij = ({ label, waarde }: { label: string; waarde: string | null }) => {
  if (!waarde) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--neutral-500)', minWidth: 160 }}>{label}</span>
      <span style={{ color: 'var(--neutral-800)', fontWeight: 500 }}>{waarde}</span>
    </div>
  )
}

async function VerkoopInhoud({ dossierId }: { dossierId: string }) {
  const data = await getDossierVerkoop(dossierId)
  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
  const bg = data.betaalgegevens

  if (!data.beschikbaar && !bg) {
    return (
      <LegeStaat
        titel="Geen verkoopgegevens"
        tekst="Dit dossier heeft geen Bouw7-koppeling, of er zijn nog geen termijnen, facturen of betaalgegevens."
      />
    )
  }

  const t = data.totalen
  const dk = data.termijnenDekking

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Totalen-samenvatting */}
      <Card>
        <CardHeader>Samenvatting</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <table style={tabel}>
            <tbody>
              <tr>
                <TD>
                  Aanneemsom
                  <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>excl. BTW</span>
                </TD>
                <TD right>{fmt(t.aanneemsom, true)}</TD>
              </tr>
              {t.meerwerk > 0 && (
                <tr>
                  <TD>
                    Goedgekeurd meerwerk
                    <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>excl. BTW</span>
                  </TD>
                  <TD right accent>{fmt(t.meerwerk, true)}</TD>
                </tr>
              )}
              {t.meerwerk > 0 && (
                <tr style={{ borderTop: '1px solid var(--neutral-100)' }}>
                  <TD vet>
                    Totaal incl. meerwerk
                    <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>excl. BTW</span>
                  </TD>
                  <TD right vet>{fmt(t.contractTotaal, true)}</TD>
                </tr>
              )}
              <tr>
                <TD>
                  Gefactureerd
                  <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>incl. BTW</span>
                </TD>
                <TD right accent={t.gefactureerd > 0}>{fmt(t.gefactureerd, true)}</TD>
              </tr>
              <tr style={{ background: 'var(--neutral-50)' }}>
                <TD vet>Nog te factureren</TD>
                <TD right vet>{fmt(t.openstaand, true)}</TD>
              </tr>
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Termijnen */}
      <Card>
        <CardHeader>Termijnen</CardHeader>
        <CardBody style={{ padding: 0 }}>
          {/* Dekkingcheck-banner */}
          {dk && (
            <div style={{
              margin: '0 0 0 0',
              padding: '8px 12px',
              borderBottom: '1px solid var(--neutral-100)',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: dk.volledig
                ? 'var(--green-50, #f0fdf4)'
                : data.termijnen.length === 0
                  ? 'var(--orange-50, #fff7ed)'
                  : 'var(--amber-50, #fffbeb)',
              color: dk.volledig
                ? 'var(--green-700, #15803d)'
                : data.termijnen.length === 0
                  ? 'var(--orange-700, #c2410c)'
                  : 'var(--amber-700, #b45309)',
            }}>
              {dk.volledig ? (
                <>
                  <span>✓</span>
                  <span>Volledig gedekt — termijnen dekken de volledige aanneemsom van {fmt(t.contractTotaal)}</span>
                </>
              ) : data.termijnen.length === 0 ? (
                <>
                  <span>⚠</span>
                  <span>Geen termijnen aangemaakt voor een aanneemsom van {fmt(t.contractTotaal)}</span>
                </>
              ) : (
                <>
                  <span>⚠</span>
                  <span>
                    Termijnen dekken {fmt(dk.somBedrag)} van {fmt(t.contractTotaal)} aanneemsom
                    {' '}— nog {fmt(dk.ontbreektBedrag)}
                    {dk.ontbreektPct != null ? ` (${fmtPct(dk.ontbreektPct)})` : ''} niet in termijnen opgenomen
                  </span>
                </>
              )}
            </div>
          )}

          {!data.termijnenBeschikbaar ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Termijnen zijn niet beschikbaar voor dit project.</div>
          ) : data.termijnen.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Geen termijnen ingesteld.</div>
          ) : (
            <table style={tabel}>
              <thead>
                <tr>
                  <TH>#</TH>
                  <TH>Omschrijving</TH>
                  <TH right>%</TH>
                  <TH right>Excl. BTW</TH>
                  <TH right>BTW%</TH>
                  <TH right>BTW</TH>
                  <TH right>Incl. BTW</TH>
                  <TH>Factureerbaar</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {data.termijnen.map((tm) => (
                  <tr key={tm.nummer}>
                    <TD>{tm.nummer}</TD>
                    <TD>{tm.omschrijving ?? '—'}</TD>
                    <TD right>{fmtPct(tm.percentage)}</TD>
                    <TD right>{fmt(tm.bedrag)}</TD>
                    <TD right kleur="var(--neutral-500)">{tm.btwPercentage != null ? `${tm.btwPercentage}%` : '—'}</TD>
                    <TD right>{tm.btwBedrag > 0 ? fmt(tm.btwBedrag) : '—'}</TD>
                    <TD right vet>{fmt(tm.bedragIncl)}</TD>
                    <TD>{fmtDatum(tm.invoiceableAt)}</TD>
                    <TD kleur={tm.gefactureerd ? 'var(--accent)' : undefined}>{tm.gefactureerd ? 'Gefactureerd' : 'Open'}</TD>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--neutral-50)', fontWeight: 600, fontSize: 12.5 }}>
                  <td colSpan={3} style={{ padding: '6px 12px', color: 'var(--neutral-600)' }}>Totaal</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.termijnen.reduce((s, tm) => s + tm.bedrag, 0))}
                  </td>
                  <td style={{ padding: '6px 12px' }} />
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.termijnen.reduce((s, tm) => s + tm.btwBedrag, 0))}
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.termijnen.reduce((s, tm) => s + tm.bedragIncl, 0))}
                  </td>
                  <td colSpan={2} style={{ padding: '6px 12px' }} />
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Verkoopfacturen */}
      <Card>
        <CardHeader>Verkoopfacturen</CardHeader>
        <CardBody style={{ padding: 0 }}>
          {data.facturen.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Nog geen verkoopfacturen.</div>
          ) : (
            <table style={tabel}>
              <thead>
                <tr>
                  <TH>Factuurnr.</TH>
                  <TH>Datum</TH>
                  <TH>Vervaldatum</TH>
                  <TH right>Excl. BTW</TH>
                  <TH right>BTW</TH>
                  <TH right>Incl. BTW</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {data.facturen.map((f, i) => (
                  <tr key={i}>
                    <TD>{f.factuurnummer ?? '—'}{f.isCredit ? ' (credit)' : ''}</TD>
                    <TD>{fmtDatum(f.datum)}</TD>
                    <TD>{fmtDatum(f.vervaldatum)}</TD>
                    <TD right kleur={f.isCredit ? 'var(--neutral-500)' : undefined}>{fmt(f.bedragExcl)}</TD>
                    <TD right kleur="var(--neutral-500)">{f.btwBedrag > 0 ? fmt(f.btwBedrag) : '—'}</TD>
                    <TD right kleur={f.isCredit ? 'var(--neutral-500)' : undefined} vet>{fmt(f.bedrag)}</TD>
                    <TD kleur={f.betaald ? 'var(--accent)' : undefined}>{f.betaald ? 'Betaald' : 'Open'}</TD>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--neutral-50)', fontWeight: 600, fontSize: 12.5 }}>
                  <td colSpan={3} style={{ padding: '6px 12px', color: 'var(--neutral-600)' }}>Totaal</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.bedragExcl : f.bedragExcl), 0))}
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.btwBedrag : f.btwBedrag), 0))}
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
                    {fmt(data.facturen.reduce((s, f) => s + (f.isCredit ? -f.bedrag : f.bedrag), 0))}
                  </td>
                  <td style={{ padding: '6px 12px' }} />
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Betaalgegevens klant */}
      {bg && (
        <Card>
          <CardHeader>Betaalgegevens klant</CardHeader>
          <CardBody>
            <InfoRij label="Betaaltermijn" waarde={bg.betaaltermijn_dagen != null ? `${bg.betaaltermijn_dagen} dagen` : null} />
            <InfoRij label="Facturatie-e-mail" waarde={bg.facturatie_email} />
            <InfoRij label="Inkoopnr. verplicht" waarde={bg.inkoopnummer_verplicht ? 'Ja' : 'Nee'} />
            <InfoRij label="Kredietlimiet" waarde={bg.kredietlimiet != null ? fmt(bg.kredietlimiet) : null} />
            {bg.g_rekening_tekst && (
              <InfoRij label="G-rekening" waarde={`${bg.g_rekening_tekst}${bg.g_rekening_percentage != null ? ` (${bg.g_rekening_percentage}%)` : ''}`} />
            )}
          </CardBody>
        </Card>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', lineHeight: 1.5 }}>
        Live uit Bouw7 (termijnen + verkoopfacturen) en EVA (betaalgegevens klant).
      </div>
    </div>
  )
}

export function VerkoopTab({ dossierId }: { dossierId: string }) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', maxWidth: 1100 }}>
      <Suspense fallback={<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><SkeletonCard /><SkeletonCard /></div>}>
        <VerkoopInhoud dossierId={dossierId} />
      </Suspense>
    </div>
  )
}
