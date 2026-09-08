import Link from 'next/link'
import { getDossierParkeerkosten } from '@/lib/dossiers/parkeerkosten'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { fmt, TH, TD } from './tab-ui'

/**
 * Parkeerkosten die op dit project zijn geparkeerd.
 *
 * Rendert niets als er geen toewijzingen zijn — een leeg blok op elk dossier is
 * ruis. De kop zegt expliciet dat deze kosten nog niet in Bouw7 staan, zodat
 * niemand ze optelt bij de bewakingscijfers hierboven: daar zitten ze nog in de
 * algemene kosten van de ULU-verzamelfactuur.
 */
export default async function ParkeerkostenBlok({ dossierId }: { dossierId: string }) {
  const data = await getDossierParkeerkosten(dossierId)
  if (data.regels.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span>Parkeerkosten</span>
          <span style={{ fontWeight: 700 }}>{fmt(data.totaal, true)}</span>
        </span>
      </CardHeader>
      <CardBody>
        <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', marginBottom: 10, lineHeight: 1.5 }}>
          Toegewezen op basis van de rit, de planning en de afstand tot het werkadres.
          Deze bedragen staan <strong>nog niet in Bouw7</strong> — daar vallen ze onder de
          algemene kosten van de parkeerfactuur.
          {data.openVoorstellen > 0 && (
            <>
              {' '}
              <Link
                href="/wagenpark/parkeren/toewijzen"
                style={{ color: 'var(--primary-700, #1d4ed8)', textDecoration: 'underline' }}
              >
                {data.openVoorstellen === 1
                  ? '1 voorstel wacht nog op bevestiging'
                  : `${data.openVoorstellen} voorstellen wachten nog op bevestiging`}
                {' '}({fmt(data.openBedrag, true)})
              </Link>
              .
            </>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH>Datum</TH>
              <TH>Kenteken</TH>
              <TH>Bestuurder</TH>
              <TH>Locatie</TH>
              <TH right>Bedrag</TH>
            </tr>
          </thead>
          <tbody>
            {data.regels.map((r) => (
              <tr key={r.id} style={{ opacity: r.status === 'voorstel' ? 0.55 : 1 }}>
                <TD>
                  {new Date(r.starttijd).toLocaleString('nl-NL', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {r.status === 'voorstel' && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--warning-800, #7a5a17)' }}>
                      voorstel
                    </span>
                  )}
                </TD>
                <TD>{r.kenteken}</TD>
                <TD>{r.bestuurder ?? '—'}</TD>
                <TD>{r.locatie ?? '—'}</TD>
                <TD right>
                  {fmt(r.bedrag, true)}
                  {r.aandeel < 1 && (
                    <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>
                      {' '}({Math.round(r.aandeel * 100)}%)
                    </span>
                  )}
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}
