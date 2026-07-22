import { Suspense } from 'react'
import { getDossierInkoop, type InkoopSignaal } from '@/lib/dossiers/actions'
import { getOpleverBetaalsignaal } from '@/lib/dossiers/oplevering'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, TH, TD, LegeStaat, ROOD } from './tab-ui'
import GeboekteKostenTabel from './GeboekteKostenTabel'

/**
 * Afwijkingen die opvolging vragen: te veel gefactureerd (→ creditnota opvragen) en facturen die
 * aan geen enkele bestelling gekoppeld konden worden. Staat bovenaan omdat het de reden is om de
 * tab te openen; de tabellen eronder onderbouwen het.
 */
function SignaalBlok({ signalen }: { signalen: InkoopSignaal[] }) {
  if (signalen.length === 0) return null

  const overfacturatie = signalen.filter(s => s.soort === 'overfacturatie')
  const zonderBon = signalen.filter(s => s.soort === 'factuur_zonder_bon')

  const Groep = ({ titel, uitleg, items, kleur }: {
    titel: string; uitleg: string; items: InkoopSignaal[]; kleur: 'rood' | 'oranje'
  }) => {
    if (items.length === 0) return null
    const rand = kleur === 'rood' ? '#dc2626' : 'var(--warning-300, #e6b96a)'
    const vlak = kleur === 'rood' ? 'color-mix(in srgb, #dc2626 6%, var(--bg))' : 'var(--warning-50, #fdf6e9)'
    const tekst = kleur === 'rood' ? '#b91c1c' : 'var(--warning-800, #7a5a17)'
    const totaal = items.reduce((s, i) => s + i.bedrag, 0)
    return (
      <div style={{ border: `1px solid ${rand}`, background: vlak, borderRadius: 10, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: tekst }}>
            {titel} ({items.length})
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: tekst }}>{fmt(totaal)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', marginBottom: 8 }}>{uitleg}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {items.map((s, i) => (
              <tr key={i}>
                <TD>{s.partij ?? '—'}</TD>
                <TD>{s.referentie ?? '—'}</TD>
                <TD>{s.toelichting}</TD>
                <TD right vet kleur={tekst}>{fmt(s.bedrag)}</TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Groep
        kleur="rood"
        titel="Meer gefactureerd dan besteld"
        uitleg="Er is meer in rekening gebracht dan er aan opdracht ligt — vraag om een creditnota."
        items={overfacturatie}
      />
      <Groep
        kleur="oranje"
        titel="Factuur zonder leverbon"
        uitleg="Deze facturen staan op het project maar hangen aan geen enkele bestelling, bijvoorbeeld omdat de leverbon al volledig was ingeboekt."
        items={zonderBon}
      />
    </div>
  )
}

/** Merkje bij een order/contract dat vanuit een EVA-bestelling is aangemaakt. */
function EvaMerk() {
  return (
    <span
      title="Aangemaakt vanuit een EVA-bestelling (werkbegroting)"
      style={{
        marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 600,
        background: 'var(--neutral-100, #f1f5f9)', color: 'var(--neutral-500, #64748b)',
      }}
    >
      EVA
    </span>
  )
}

/** Signaleringsbanner (alleen informatief): partijen met nog niet-geaccepteerde opleverpunten. */
async function BetaalSignaal({ dossierId }: { dossierId: string }) {
  const signaal = (await getOpleverBetaalsignaal(dossierId).catch(() => [])).filter(s => s.open > 0)
  if (signaal.length === 0) return null
  return (
    <div style={{
      border: '1px solid var(--warning-200, #f4d9a8)', background: 'var(--warning-50, #fdf6e9)',
      borderRadius: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--warning-800, #7a5a17)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Betaling nog niet vrijgeven — openstaande opleverpunten
      </div>
      <div style={{ fontSize: 12, color: 'var(--warning-800, #7a5a17)' }}>
        {signaal.map(s => (
          <span key={s.relatieId} style={{ marginRight: 14 }}>
            <strong>{s.naam ?? 'Onbekende partij'}</strong>: {s.open} van {s.totaal} punt{s.totaal > 1 ? 'en' : ''} nog niet afgemeld
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>
        Puur informatief — betalingen worden niet automatisch geblokkeerd.
      </div>
    </div>
  )
}

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
      <SignaalBlok signalen={data.signalen} />
      <BetaalSignaal dossierId={dossierId} />

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
                  <TH>Nummer</TH><TH>Leverancier</TH><TH>Naam</TH><TH>Status</TH>
                  <TH right>Orderbedrag</TH><TH right>Geboekt</TH><TH right>Nog verwacht</TH>
                </tr>
              </thead>
              <tbody>
                {data.inkooporders.map((r, i) => (
                  <tr key={i}>
                    <TD>{r.nummer ?? '—'}{r.uitEva && <EvaMerk />}</TD>
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
                    <TD>{c.nummer ?? '—'}{c.uitEva && <EvaMerk />}</TD>
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
        Het merkje <strong>EVA</strong> betekent: aangemaakt vanuit een bestelling in de werkbegroting.
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
