import { Suspense } from 'react'
import { getDossierInkoop } from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, TH, TD, LegeStaat, ROOD } from './tab-ui'
import GeboekteKostenTabel from './GeboekteKostenTabel'

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
  const ordersGeboekt = data.inkooporders.reduce((s, r) => s + r.geboekt, 0)
  const ordersVerwacht = data.inkooporders.reduce((s, r) => s + r.nogVerwacht, 0)
  const oaGeboekt = data.onderaannemers.reduce((s, c) => s + c.geboekt, 0)
  const oaVerwacht = data.onderaannemers.reduce((s, c) => s + c.nogVerwacht, 0)

  const orderOpties = data.inkooporders
    .filter((o) => o.orderId != null)
    .map((o) => ({ orderId: o.orderId as number, nummer: o.nummer, leverancier: o.leverancier, omschrijving: o.omschrijving }))
  const contractOpties = data.onderaannemers
    .filter((c) => c.contractId != null)
    .map((c) => ({ contractId: c.contractId as number, onderaannemer: c.onderaannemer, omschrijving: c.omschrijving }))

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
                  <TH>Nummer</TH><TH>Leverancier</TH><TH>Omschrijving</TH><TH>Status</TH>
                  <TH right>Orderbedrag</TH><TH right>Geboekt</TH><TH right>Nog verwacht</TH>
                </tr>
              </thead>
              <tbody>
                {data.inkooporders.map((r, i) => (
                  <tr key={i}>
                    <TD>{r.nummer ?? '—'}</TD>
                    <TD>{r.leverancier ?? '—'}</TD>
                    <TD>{r.omschrijving ?? '—'}</TD>
                    <TD>{r.status ?? '—'}</TD>
                    <TD right>{fmt(r.contractbedrag)}</TD>
                    <TD right>{fmt(r.geboekt)}</TD>
                    <TD right kleur={r.nogVerwacht < 0 ? ROOD : undefined}>{fmt(r.nogVerwacht)}</TD>
                  </tr>
                ))}
                <tr style={{ background: 'var(--neutral-50)' }}>
                  <TD vet>Totaal besteld</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
                  <TD right vet>{fmt(t.besteld, true)}</TD>
                  <TD right vet>{fmt(ordersGeboekt, true)}</TD>
                  <TD right vet kleur={ordersVerwacht < 0 ? ROOD : undefined}>{fmt(ordersVerwacht, true)}</TD>
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
                  <TH>Nummer</TH><TH>Onderaannemer</TH><TH>Omschrijving</TH><TH>Status</TH>
                  <TH right>Contractbedrag</TH><TH right>Geboekt</TH><TH right>Nog verwacht</TH>
                </tr>
              </thead>
              <tbody>
                {data.onderaannemers.map((c, i) => (
                  <tr key={i}>
                    <TD>{c.nummer ?? '—'}</TD>
                    <TD>{c.onderaannemer ?? '—'}</TD>
                    <TD>{c.omschrijving ?? '—'}</TD>
                    <TD>{c.status ?? '—'}</TD>
                    <TD right>{fmt(c.contractbedrag)}</TD>
                    <TD right>{fmt(c.geboekt)}</TD>
                    <TD right kleur={c.nogVerwacht < 0 ? ROOD : undefined}>{fmt(c.nogVerwacht)}</TD>
                  </tr>
                ))}
                <tr style={{ background: 'var(--neutral-50)' }}>
                  <TD vet>Totaal onderaanneming</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
                  <TD right vet>{fmt(t.onderaanneming, true)}</TD>
                  <TD right vet>{fmt(oaGeboekt, true)}</TD>
                  <TD right vet kleur={oaVerwacht < 0 ? ROOD : undefined}>{fmt(oaVerwacht, true)}</TD>
                </tr>
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Geboekte kosten — compacte, sorteerbare tabel met zoekbalk + correctie-acties */}
      <Card>
        <CardHeader>Geboekte kosten</CardHeader>
        <CardBody style={{ padding: data.geboekteKosten.length === 0 ? undefined : 0 }}>
          {data.geboekteKosten.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Nog geen geboekte inkoopkosten (met inkoopfactuur).</div>
          ) : (
            <GeboekteKostenTabel
              dossierId={dossierId}
              data={data.geboekteKosten}
              orders={orderOpties}
              contracten={contractOpties}
              projectcodes={data.projectcodes}
            />
          )}
        </CardBody>
      </Card>

      <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', lineHeight: 1.5 }}>
        Live uit Bouw7. <strong>Geboekt</strong> = echte inkoopfacturen gekoppeld via het bonnummer of een handmatige EVA-toewijzing.
        Rood = overschrijding. Correcties zijn EVA-only en wijzigen niets in Bouw7.
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
