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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Totalen-samenvatting */}
      <Card>
        <CardHeader>Samenvatting</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <table style={tabel}>
            <tbody>
              <tr><TD>Aanneemsom</TD><TD right vet>{fmt(t.aanneemsom, true)}</TD></tr>
              <tr><TD>Gefactureerd</TD><TD right accent={t.gefactureerd > 0}>{fmt(t.gefactureerd, true)}</TD></tr>
              <tr style={{ background: 'var(--neutral-50)' }}><TD vet>Nog te factureren</TD><TD right vet>{fmt(t.openstaand, true)}</TD></tr>
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Termijnen */}
      <Card>
        <CardHeader>Termijnen</CardHeader>
        <CardBody style={{ padding: 0 }}>
          {!data.termijnenBeschikbaar ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Termijnen zijn niet beschikbaar voor dit project.</div>
          ) : data.termijnen.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Geen termijnen ingesteld.</div>
          ) : (
            <table style={tabel}>
              <thead>
                <tr><TH>#</TH><TH>Omschrijving</TH><TH right>%</TH><TH right>Bedrag</TH><TH>Factureerbaar</TH><TH>Status</TH></tr>
              </thead>
              <tbody>
                {data.termijnen.map((tm) => (
                  <tr key={tm.nummer}>
                    <TD>{tm.nummer}</TD>
                    <TD>{tm.omschrijving ?? '—'}</TD>
                    <TD right>{fmtPct(tm.percentage)}</TD>
                    <TD right>{fmt(tm.bedrag)}</TD>
                    <TD>{fmtDatum(tm.invoiceableAt)}</TD>
                    <TD kleur={tm.gefactureerd ? 'var(--accent)' : undefined}>{tm.gefactureerd ? 'Gefactureerd' : 'Open'}</TD>
                  </tr>
                ))}
              </tbody>
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
                <tr><TH>Factuurnr.</TH><TH>Datum</TH><TH>Vervaldatum</TH><TH right>Bedrag</TH><TH>Status</TH></tr>
              </thead>
              <tbody>
                {data.facturen.map((f, i) => (
                  <tr key={i}>
                    <TD>{f.factuurnummer ?? '—'}{f.isCredit ? ' (credit)' : ''}</TD>
                    <TD>{fmtDatum(f.datum)}</TD>
                    <TD>{fmtDatum(f.vervaldatum)}</TD>
                    <TD right kleur={f.isCredit ? 'var(--neutral-500)' : undefined}>{fmt(f.bedrag)}</TD>
                    <TD kleur={f.betaald ? 'var(--accent)' : undefined}>{f.betaald ? 'Betaald' : 'Open'}</TD>
                  </tr>
                ))}
              </tbody>
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
