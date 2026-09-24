import { Suspense } from 'react'
import {
  getDossierUrenBewaking,
  getDossierUren,
  getUrenDoelcodes,
} from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, fmtUren, fmtTarief, fmtPct, TH, TD, LegeRij, LegeNotitie, ROOD, GROEN } from './tab-ui'
import UrenDetailTable from './UrenDetailTable'
import { Bouw7StandStrip } from '../Bouw7StandStrip'

const KLEUR_SALDO = (v: number) => (v >= 0 ? GROEN : ROOD)

async function UrenBewakingInhoud({ dossierId }: { dossierId: string }) {
  const data = await getDossierUrenBewaking(dossierId)

  // Zonder uren blijft de tabel staan: kolomkoppen en een nulregel, zodat je ziet welke cijfers
  // hier komen. De reden waarom er niets staat komt eronder, bij de andere voetnoten.
  const nooitOpgehaald = data.stand.opgehaaldOp == null && data.stand.ontbreekt.length > 0
  const uitleg = !data.beschikbaar
    ? nooitOpgehaald
      ? 'Nog niet opgehaald uit Bouw7. Deze gegevens worden twee keer per dag opgehaald; klik Vernieuwen om ze nu binnen te halen.'
      : 'Nog geen uren per bewakingscode: dit dossier heeft geen Bouw7-koppeling, of er zijn nog geen arbeidsurenboekingen.'
    : null

  const { regels, totalen, heeftWerkbegroting } = data
  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }

  return (
    <div>
      <Bouw7StandStrip
        dossierId={dossierId}
        tab="uren"
        opgehaaldOp={data.stand.opgehaaldOp}
        ontbreekt={data.stand.ontbreekt}
        fout={data.stand.fout}
      />
      <Card>
      <CardHeader>Uren per bewakingscode</CardHeader>
      <CardBody style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tabel}>
            <thead>
              <tr>
                <TH>Bewakingscode</TH>
                <TH right>Prognose uren</TH>
                <TH right>Uurtarief wb</TH>
                <TH right>Prognose bedrag</TH>
                <TH right>Geboekte uren</TH>
                <TH right>Geboekte kosten</TH>
                <TH right>% Gereed</TH>
                <TH right>Uren op 100%</TH>
                <TH right>Kosten op 100%</TH>
                <TH right>Urensaldo</TH>
                <TH right>Kostensaldo</TH>
              </tr>
            </thead>
            <tbody>
              {regels.length === 0 && (
                <LegeRij velden={[
                  'tekst', 'uren', 'bedrag', 'bedrag', 'uren', 'bedrag', 'pct', 'uren', 'bedrag', 'uren', 'bedrag',
                ]} />
              )}
              {regels.map((r, i) => (
                <tr key={i}>
                  <TD>
                    <span style={{ fontWeight: 600 }}>{r.code}</span>
                    {r.naam && (
                      <span style={{ color: 'var(--neutral-500)', marginLeft: 6, fontWeight: 400 }}>
                        {r.naam}
                      </span>
                    )}
                  </TD>
                  <TD right>{fmtUren(r.prognose_uren)}</TD>
                  <TD right>{heeftWerkbegroting ? fmtTarief(r.wb_uurtarief) : '—'}</TD>
                  <TD right accent={r.prognose_bedrag > 0}>{fmt(r.prognose_bedrag)}</TD>
                  <TD right>{fmtUren(r.geboekte_uren)}</TD>
                  <TD right accent={r.geboekte_kosten > 0}>{fmt(r.geboekte_kosten)}</TD>
                  <TD right>{fmtPct(r.standopname_pct)}</TD>
                  <TD
                    right
                    kleur={
                      r.prognose_uren_100 != null && r.prognose_uren_100 > r.prognose_uren
                        ? ROOD
                        : undefined
                    }
                  >
                    {r.prognose_uren_100 != null ? fmtUren(r.prognose_uren_100) : '—'}
                  </TD>
                  <TD right>{r.prognose_kosten_100 != null ? fmt(r.prognose_kosten_100) : '—'}</TD>
                  <TD right kleur={KLEUR_SALDO(r.uren_saldo)}>
                    {fmtUren(r.uren_saldo)}
                  </TD>
                  <TD right kleur={KLEUR_SALDO(r.kosten_saldo)}>
                    {fmt(r.kosten_saldo)}
                  </TD>
                </tr>
              ))}
              <tr style={{ background: 'var(--neutral-100, #eef2f3)' }}>
                <TD vet>Totaal</TD>
                <TD right vet>{fmtUren(totalen.prognose_uren, true)}</TD>
                <TD>{''}</TD>
                <TD right vet>{fmt(totalen.prognose_bedrag, true)}</TD>
                <TD right vet>{fmtUren(totalen.geboekte_uren, true)}</TD>
                <TD right vet>{fmt(totalen.geboekte_kosten, true)}</TD>
                <TD>{''}</TD>
                <TD>{''}</TD>
                <TD>{''}</TD>
                <TD right vet kleur={KLEUR_SALDO(totalen.uren_saldo)}>
                  {fmtUren(totalen.uren_saldo, true)}
                </TD>
                <TD right vet kleur={KLEUR_SALDO(totalen.kosten_saldo)}>
                  {fmt(totalen.kosten_saldo, true)}
                </TD>
              </tr>
            </tbody>
          </table>
        </div>
        {uitleg && <LegeNotitie>{uitleg}</LegeNotitie>}
        {!heeftWerkbegroting && (
          <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--neutral-500)', borderTop: '1px solid var(--neutral-100)' }}>
            Geen gesynchroniseerde werkbegroting gevonden — begrote uren en saldo worden niet getoond.
          </div>
        )}
      </CardBody>
      </Card>
    </div>
  )
}

async function UrenDetailInhoud({ dossierId }: { dossierId: string }) {
  const [data, bewakingscodes] = await Promise.all([
    getDossierUren(dossierId),
    getUrenDoelcodes(dossierId),
  ])

  const perMedewerker = data.detailNiveau === 'medewerker'

  return (
    <Card>
      <CardHeader>Geboekte uren detail</CardHeader>
      <CardBody style={{ padding: 0 }}>
        <UrenDetailTable
          dossierId={dossierId}
          regels={data.regels}
          totalen={data.totalen}
          bewakingscodes={bewakingscodes}
          perMedewerker={perMedewerker}
        />
        <div style={{ padding: '10px 12px', fontSize: 11.5, color: 'var(--neutral-500)', borderTop: '1px solid var(--neutral-100)', lineHeight: 1.5 }}>
          {!data.beschikbaar
            ? 'Nog geen uren geboekt op dit dossier — zodra er uren binnenkomen verschijnen ze hier per medewerker.'
            : perMedewerker
              ? 'Live uit Bouw7 — geboekte uren per medewerker. Bewakingscode aanpassen werkt direct terug in Bouw7.'
              : 'Per-medewerker detail niet beschikbaar; weergave per bewakingscode uit de projectbewaking.'}
        </div>
      </CardBody>
    </Card>
  )
}

export function UrenTab({ dossierId, toonBewaking = true }: {
  dossierId: string
  /**
   * De tabel "Uren per bewakingscode" — begroot, prognose en saldo per code.
   *
   * Staat uit op een servicedeskbon. Die heeft één vaste kostengroep, dus de tabel is er altijd
   * één regel lang, en de kolommen die hem zinvol maken (begrote uren, saldo) komen uit een
   * werkbegroting die een bon niet heeft. Wat overblijft is een rij nullen die de echte
   * urenlijst eronder wegdrukt.
   */
  toonBewaking?: boolean
}) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {toonBewaking && (
        <Suspense fallback={<SkeletonCard />}>
          <UrenBewakingInhoud dossierId={dossierId} />
        </Suspense>
      )}
      <Suspense fallback={<SkeletonCard />}>
        <UrenDetailInhoud dossierId={dossierId} />
      </Suspense>
    </div>
  )
}
