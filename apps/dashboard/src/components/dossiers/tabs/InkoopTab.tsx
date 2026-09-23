import { Suspense } from 'react'
import { getDossierInkoop, type InkoopSignaal } from '@/lib/dossiers/actions'
import { getOpleverBetaalsignaal } from '@/lib/dossiers/oplevering'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, TH, TD, LegeRij, LegeNotitie, ROOD } from './tab-ui'
import GeboekteKostenTabel from './GeboekteKostenTabel'
import { Bouw7StandStrip } from '../Bouw7StandStrip'

/** Eén regel in de tabel Inkooporders en onderaanneming — order en contract zijn hier gelijk. */
type UitgezetRegel = {
  soort: 'order' | 'onderaanneming'
  nummer: string | null
  partij: string | null
  omschrijving: string | null
  status: string | null
  bedrag: number
  geboekt: number
  nogVerwacht: number
  uitEva: boolean
}

const SOORT_LABEL: Record<UitgezetRegel['soort'], string> = {
  order: 'Order', onderaanneming: 'Onderaanneming',
}

/**
 * Alles wat er bij een derde is uitgezet, in één tabel.
 *
 * Het waren er twee — Inkooporders en Onderaannemerscontracten — met precies dezelfde zeven
 * kolommen onder andere namen: Orderbedrag naast Contractbedrag, Leverancier naast
 * Onderaannemer, Naam naast Omschrijving. Voor de vraag die je hier stelt ("wat hebben we
 * uitgezet en hoeveel is daarvan binnen?") is dat onderscheid bijzaak; het stond alleen maar
 * twee keer hetzelfde te zeggen en dwong je te scrollen tussen twee totaalregels.
 *
 * Vijf kolommen in plaats van zeven: nummer en omschrijving staan als onderregel bij de partij.
 * Daarmee past de tabel op een halve pagina en blijven de drie bedragen naast elkaar in beeld —
 * op een breed scherm liepen zeven kolommen zo ver uit elkaar dat je bij het laatste bedrag niet
 * meer wist van wie het was. De soort staat als tag bij de partij, zodat je nog steeds kunt zien
 * of iets een order of een opdracht is.
 */
function UitgezetTabel({ regels, subtotalen }: {
  regels: UitgezetRegel[]
  subtotalen: { label: string; aantal: number; bedrag: number; geboekt: number; nogVerwacht: number }[]
}) {
  // Een subtotaal per soort heeft alleen zin als er van beide iets is; anders herhaalt het de
  // totaalregel eronder woordelijk.
  const gevuld = subtotalen.filter(s => s.aantal > 0)
  const toonSubtotalen = gevuld.length > 1
  const totaal = subtotalen.reduce(
    (a, s) => ({
      bedrag: a.bedrag + s.bedrag, geboekt: a.geboekt + s.geboekt,
      nogVerwacht: a.nogVerwacht + s.nogVerwacht,
    }),
    { bedrag: 0, geboekt: 0, nogVerwacht: 0 },
  )

  return (
    <Card style={{ maxWidth: 820 }}>
      <CardHeader>Inkooporders en onderaanneming</CardHeader>
      <CardBody style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH>Partij</TH><TH>Status</TH>
              <TH right>Bedrag</TH><TH right>Geboekt</TH><TH right>Nog verwacht</TH>
            </tr>
          </thead>
          <tbody>
            {regels.length === 0 && (
              <LegeRij velden={['tekst', 'tekst', 'bedrag', 'bedrag', 'bedrag']} />
            )}
            {regels.map((r, i) => (
              <tr key={i}>
                <TD wrap>
                  <span style={{ color: 'var(--neutral-900)' }}>{r.partij ?? '—'}</span>
                  <span style={{
                    marginLeft: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
                    color: 'var(--neutral-500)',
                  }}>
                    {SOORT_LABEL[r.soort]}
                  </span>
                  {r.uitEva && <EvaMerk />}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--neutral-500)', marginTop: 1 }}>
                    {[r.nummer, r.omschrijving].filter(Boolean).join(' · ') || '—'}
                  </span>
                </TD>
                <TD>{r.status ?? '—'}</TD>
                <TD right>{fmt(r.bedrag)}</TD>
                <TD right>{fmt(r.geboekt)}</TD>
                <TD right kleur={r.nogVerwacht < 0 ? ROOD : undefined}>{fmt(r.nogVerwacht)}</TD>
              </tr>
            ))}

            {toonSubtotalen && gevuld.map(s => (
              <tr key={s.label} style={{ background: 'var(--neutral-50)' }}>
                <TD kleur="var(--neutral-500)">{s.label} ({s.aantal})</TD>
                <TD>{''}</TD>
                <TD right kleur="var(--neutral-500)">{fmt(s.bedrag, true)}</TD>
                <TD right kleur="var(--neutral-500)">{fmt(s.geboekt, true)}</TD>
                <TD right kleur={s.nogVerwacht < 0 ? ROOD : 'var(--neutral-500)'}>{fmt(s.nogVerwacht, true)}</TD>
              </tr>
            ))}

            <tr style={{ background: 'var(--neutral-50)' }}>
              <TD vet>Totaal uitgezet</TD>
              <TD>{''}</TD>
              <TD right vet>{fmt(totaal.bedrag, true)}</TD>
              <TD right vet>{fmt(totaal.geboekt, true)}</TD>
              <TD right vet kleur={totaal.nogVerwacht < 0 ? ROOD : undefined}>{fmt(totaal.nogVerwacht, true)}</TD>
            </tr>
          </tbody>
        </table>
        {regels.length === 0 && (
          <LegeNotitie>Nog niets uitgezet bij een leverancier of onderaannemer.</LegeNotitie>
        )}
      </CardBody>
    </Card>
  )
}

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

  // Zonder gegevens blijft de opmaak staan — kaarten, kolomkoppen en nulbedragen. Alleen de
  // reden waarom er niets staat komt erboven. "Nog niet opgehaald" is iets anders dan "niets
  // besteld"; in het eerste geval helpt de knop Vernieuwen.
  const nooitOpgehaald = data.stand.opgehaaldOp == null && data.stand.ontbreekt.length > 0
  const uitleg = !data.beschikbaar
    ? nooitOpgehaald
      ? 'Nog niet opgehaald uit Bouw7. Deze gegevens worden twee keer per dag opgehaald; klik Vernieuwen om ze nu binnen te halen.'
      : 'Nog geen inkoopgegevens: dit dossier heeft geen Bouw7-koppeling, of er zijn nog geen inkooporders, onderaannemerscontracten of geboekte kosten.'
    : null

  const t = data.totalen
  const ordersGeboekt = data.inkooporders.reduce((s, r) => s + r.geboekt, 0)
  const ordersVerwacht = data.inkooporders.reduce((s, r) => s + r.nogVerwacht, 0)
  const oaGeboekt = data.onderaannemers.reduce((s, c) => s + c.geboekt, 0)
  const oaVerwacht = data.onderaannemers.reduce((s, c) => s + c.nogVerwacht, 0)

  /**
   * Eén lijst van alles wat er bij een derde is uitgezet. Inkooporders eerst, daarna de
   * onderaanneming: dat is de volgorde waarin de twee tabellen stonden, en binnen een soort
   * houden de regels de volgorde die Bouw7 teruggaf.
   */
  const uitgezet: UitgezetRegel[] = [
    ...data.inkooporders.map((r): UitgezetRegel => ({
      soort: 'order', nummer: r.nummer, partij: r.leverancier, omschrijving: r.omschrijving,
      status: r.status, bedrag: r.contractbedrag, geboekt: r.geboekt,
      nogVerwacht: r.nogVerwacht, uitEva: r.uitEva,
    })),
    ...data.onderaannemers.map((c): UitgezetRegel => ({
      soort: 'onderaanneming', nummer: c.nummer, partij: c.onderaannemer, omschrijving: c.omschrijving,
      status: c.status, bedrag: c.contractbedrag, geboekt: c.geboekt,
      nogVerwacht: c.nogVerwacht, uitEva: c.uitEva,
    })),
  ]

  const orderOpties = data.inkooporders
    .filter((o) => o.orderId != null)
    .map((o) => ({ orderId: o.orderId as number, nummer: o.nummer, leverancier: o.leverancier, omschrijving: o.omschrijving }))
  const contractOpties = data.onderaannemers
    .filter((c) => c.contractId != null)
    .map((c) => ({ contractId: c.contractId as number, onderaannemer: c.onderaannemer, omschrijving: c.omschrijving }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Bouw7StandStrip
        dossierId={dossierId}
        tab="inkoop"
        opgehaaldOp={data.stand.opgehaaldOp}
        ontbreekt={data.stand.ontbreekt}
        fout={data.stand.fout}
      />
      {uitleg && <LegeNotitie losstaand>{uitleg}</LegeNotitie>}
      <SignaalBlok signalen={data.signalen} />
      <BetaalSignaal dossierId={dossierId} />

      {/* Inkooporders en onderaanneming — één tabel; zie UitgezetTabel. */}
      <UitgezetTabel
        regels={uitgezet}
        subtotalen={[
          { label: 'Inkooporders', aantal: data.inkooporders.length,
            bedrag: t.besteld, geboekt: ordersGeboekt, nogVerwacht: ordersVerwacht },
          { label: 'Onderaanneming', aantal: data.onderaannemers.length,
            bedrag: t.onderaanneming, geboekt: oaGeboekt, nogVerwacht: oaVerwacht },
        ]}
      />

      {/* Geboekte kosten — compacte, sorteerbare tabel met zoekbalk + correctie-acties */}
      <Card>
        <CardHeader>Geboekte kosten</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <GeboekteKostenTabel
            dossierId={dossierId}
            data={data.geboekteKosten}
            orders={orderOpties}
            contracten={contractOpties}
            projectcodes={data.projectcodes}
          />
          {data.geboekteKosten.length === 0 && (
            <LegeNotitie>Nog geen geboekte inkoopkosten (met inkoopfactuur) op dit dossier.</LegeNotitie>
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
