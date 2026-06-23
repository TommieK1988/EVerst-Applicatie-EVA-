import { Suspense } from 'react'
import { getDossierInkoop } from '@/lib/dossiers/actions'
import { laadLayouts } from '@/app/actions/layouts'
import { createClient as createServerClient } from '@everts/database/server'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, TH, TD, LegeStaat } from './tab-ui'
import GeboekteKostenTabel from './GeboekteKostenTabel'

async function InkoopInhoud({ dossierId }: { dossierId: string }) {
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [data, layouts] = await Promise.all([
    getDossierInkoop(dossierId),
    user_id ? laadLayouts(user_id, 'inkoop-geboekt') : Promise.resolve([]),
  ])

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
    .map((o) => ({ orderId: o.orderId as number, code: o.code, omschrijving: o.omschrijving, relatie: o.relatie }))
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
                  <TH>Code</TH><TH>Omschrijving</TH><TH>Leverancier</TH><TH>Soort</TH>
                  <TH right>Aantal</TH><TH right>Prijs</TH><TH right>Totaal</TH>
                  <TH right>Geboekt</TH><TH right>Nog verwacht</TH>
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
                    <TD right>{fmt(r.geboekt)}</TD>
                    <TD right>{fmt(r.nogVerwacht)}</TD>
                  </tr>
                ))}
                <tr style={{ background: 'var(--neutral-50)' }}>
                  <TD vet>Totaal besteld</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
                  <TD right vet>{fmt(t.besteld, true)}</TD>
                  <TD right vet>{fmt(ordersGeboekt, true)}</TD>
                  <TD right vet>{fmt(ordersVerwacht, true)}</TD>
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
                  <TH right>Contractbedrag</TH><TH right>Geboekt</TH><TH right>Nog verwacht</TH>
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
                    <TD right>{fmt(c.geboekt)}</TD>
                    <TD right>{fmt(c.nogVerwacht)}</TD>
                  </tr>
                ))}
                <tr style={{ background: 'var(--neutral-50)' }}>
                  <TD vet>Totaal onderaanneming</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
                  <TD right vet>{fmt(t.onderaanneming, true)}</TD>
                  <TD right vet>{fmt(oaGeboekt, true)}</TD>
                  <TD right vet>{fmt(oaVerwacht, true)}</TD>
                </tr>
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Geboekte kosten — filterbaar/sorteerbaar/aanpasbaar met correctie-acties */}
      <Card>
        <CardHeader>Geboekte kosten</CardHeader>
        <CardBody style={{ padding: data.geboekteKosten.length === 0 ? undefined : 0 }}>
          {data.geboekteKosten.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '12px' }}>Nog geen geboekte inkoopkosten (met inkoopfactuur).</div>
          ) : (
            <GeboekteKostenTabel
              dossierId={dossierId}
              data={data.geboekteKosten}
              layouts={layouts}
              user_id={user_id}
              orders={orderOpties}
              contracten={contractOpties}
              projectcodes={data.projectcodes}
            />
          )}
        </CardBody>
      </Card>

      <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', lineHeight: 1.5 }}>
        Live uit Bouw7. Inkooporders = ingevoerde bestelregels (verwachte kosten); geboekte kosten = inkoop
        mét ontvangen inkoopfactuur. <strong>Geboekt</strong> bij orders telt kosten die je hier hebt toegewezen;
        bij onderaannemerscontracten is dat Bouw7&apos;s geboekt (contractbedrag − openstaand). Correcties
        (toewijzen / hercoderen) zijn EVA-only en wijzigen niets in Bouw7.
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
