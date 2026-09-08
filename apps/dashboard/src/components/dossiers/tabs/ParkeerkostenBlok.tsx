import Link from 'next/link'
import { getDossierParkeerkosten } from '@/lib/dossiers/parkeerkosten'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { fmt, TH, TD } from './tab-ui'

/**
 * Parkeerkosten die bij dit project horen — puur ter informatie.
 *
 * Staat bovenaan het Financieel-tab, bewust bóven de bewakingstabel en niet
 * erin: die telt per rij exact op tot Geboekte kosten, en deze bedragen staan
 * niet in Bouw7 — daar vallen ze onder de algemene kosten van de
 * parkeerfactuur.
 *
 * Dit is nadrukkelijk GEEN boeking en GEEN factuurregel. Ze tellen niet mee in
 * de cijfers eronder en komen ook niet vanzelf op een regiefactuur terecht. Wie
 * ze wil doorbelasten, zet ze zelf op de factuur. Bewuste keuze: eerst zien of
 * de toewijzing klopt, daarna pas automatiseren.
 *
 * Rendert niets als er geen toewijzingen zijn — een leeg blok op elk dossier is ruis.
 */
export default async function ParkeerkostenBlok({ dossierId }: { dossierId: string }) {
  const data = await getDossierParkeerkosten(dossierId)
  if (data.regels.length === 0) return null

  // Alleen bevestigde regels in de tabel. Voorstellen zijn nog geen kosten en
  // staan hierboven al als één samenvattingsregel met een link naar de
  // werkvoorraad; ze er ook los bij zetten maakt het blok lang en wekt de indruk
  // dat de bedragen al vaststaan.
  const bevestigd = data.regels.filter((r) => r.status === 'bevestigd')

  return (
    <div style={{ marginBottom: 16 }}>
    <Card>
      <CardHeader>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span>
            Parkeerkosten
            <span style={{ fontWeight: 400, color: 'var(--neutral-500)', marginLeft: 8, fontSize: 12 }}>
              ter informatie
            </span>
          </span>
          <span style={{ fontWeight: 700 }}>{fmt(data.totaal, true)}</span>
        </span>
      </CardHeader>
      <CardBody>
        <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', marginBottom: 10, lineHeight: 1.5 }}>
          Toegewezen op basis van de rit, de planning en de afstand tot het werkadres.
          Deze bedragen zijn <strong>niet geboekt op dit project</strong> — in Bouw7 vallen ze
          onder de algemene kosten van de parkeerfactuur. Ze tellen dus niet mee in de cijfers
          hieronder en komen niet vanzelf op een factuur: wil je ze doorbelasten, zet ze er dan
          zelf op.
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

        {bevestigd.length > 0 && (
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
            {bevestigd.map((r) => (
              <tr key={r.id}>
                <TD>
                  {new Date(r.starttijd).toLocaleString('nl-NL', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
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
        )}
      </CardBody>
    </Card>
    </div>
  )
}
