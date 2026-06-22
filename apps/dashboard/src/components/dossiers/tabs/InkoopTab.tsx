import { Suspense } from 'react'
import { getDossierInkoop } from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, TH, TD, LegeStaat } from './tab-ui'

async function InkoopInhoud({ dossierId }: { dossierId: string }) {
  const data = await getDossierInkoop(dossierId)

  if (!data.beschikbaar) {
    return (
      <LegeStaat
        titel="Geen inkoopgegevens"
        tekst="Dit dossier heeft geen Bouw7-koppeling, of er zijn nog geen inkooporders, onderaannemerscontracten of geboekte kosten."
      />
    )
  }

  const t = data.totalen
  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Inkooporders */}
      <Card>
        <CardHeader>Inkooporders</CardHeader>
        <CardBody style={{ padding: 0 }}>
          {data.inkooporders.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Geen inkooporders.</div>
          ) : (
            <table style={tabel}>
              <thead>
                <tr>
                  <TH>Code</TH><TH>Omschrijving</TH><TH>Leverancier</TH><TH>Soort</TH>
                  <TH right>Aantal</TH><TH right>Prijs</TH><TH right>Totaal</TH>
                </tr>
              </thead>
              <tbody>
                {data.inkooporders.map((r, i) => (
                  <tr key={i}>
                    <TD>{r.code ?? '—'}</TD>
                    <TD>{r.omschrijving ?? '—'}</TD>
                    <TD>{r.relatie ?? '—'}</TD>
                    <TD>{r.type === 'onderaanneming' ? 'Onderaanneming' : 'Inkoop'}</TD>
                    <TD right>{r.aantal != null ? `${r.aantal}${r.eenheid ? ` ${r.eenheid}` : ''}` : '—'}</TD>
                    <TD right>{r.prijs != null ? fmt(r.prijs) : '—'}</TD>
                    <TD right accent={r.totaal > 0}>{fmt(r.totaal)}</TD>
                  </tr>
                ))}
                <tr style={{ background: 'var(--neutral-50)' }}>
                  <TD vet>Totaal besteld</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
                  <TD right vet>{fmt(t.besteld, true)}</TD>
                </tr>
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Onderaannemerscontracten */}
      <Card>
        <CardHeader>Onderaannemerscontracten</CardHeader>
        <CardBody style={{ padding: 0 }}>
          {data.onderaannemers.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Geen onderaannemerscontracten.</div>
          ) : (
            <table style={tabel}>
              <thead>
                <tr>
                  <TH>Code</TH><TH>Onderaannemer</TH><TH>Omschrijving</TH><TH>Status</TH>
                  <TH right>Contractbedrag</TH><TH right>Openstaand</TH>
                </tr>
              </thead>
              <tbody>
                {data.onderaannemers.map((c, i) => (
                  <tr key={i}>
                    <TD>{c.code ?? '—'}</TD>
                    <TD>{c.onderaannemer ?? '—'}</TD>
                    <TD>{c.omschrijving ?? '—'}</TD>
                    <TD>{c.status ?? '—'}</TD>
                    <TD right>{fmt(c.contractbedrag)}</TD>
                    <TD right>{fmt(c.openstaand)}</TD>
                  </tr>
                ))}
                <tr style={{ background: 'var(--neutral-50)' }}>
                  <TD vet>Totaal onderaanneming</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
                  <TD right vet>{fmt(t.onderaanneming, true)}</TD><TD>{''}</TD>
                </tr>
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Geboekte kosten */}
      <Card>
        <CardHeader>Geboekte kosten</CardHeader>
        <CardBody style={{ padding: 0 }}>
          {data.geboekteKosten.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Nog geen geboekte inkoopkosten (met inkoopfactuur).</div>
          ) : (
            <table style={tabel}>
              <thead>
                <tr><TH>Code</TH><TH>Bewakingscode</TH><TH right>Bedrag</TH></tr>
              </thead>
              <tbody>
                {data.geboekteKosten.map((r, i) => (
                  <tr key={i}>
                    <TD>{r.code ?? '—'}</TD>
                    <TD>{r.naam ?? '—'}</TD>
                    <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
                  </tr>
                ))}
                <tr style={{ background: 'var(--neutral-50)' }}>
                  <TD vet>Totaal geboekt</TD><TD>{''}</TD>
                  <TD right vet>{fmt(t.geboekt, true)}</TD>
                </tr>
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', lineHeight: 1.5 }}>
        Live uit Bouw7. Inkooporders = ingevoerde bestelregels (verwachte kosten); geboekte kosten = inkoop
        mét ontvangen inkoopfactuur (deduped per bon).
      </div>
    </div>
  )
}

export function InkoopTab({ dossierId }: { dossierId: string }) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)' }}>
      <Suspense fallback={<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><SkeletonCard /><SkeletonCard /></div>}>
        <InkoopInhoud dossierId={dossierId} />
      </Suspense>
    </div>
  )
}
