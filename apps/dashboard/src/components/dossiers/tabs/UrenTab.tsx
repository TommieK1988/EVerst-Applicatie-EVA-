import { Suspense } from 'react'
import {
  getDossierUrenBewaking,
  getDossierUren,
  getBewakingscodesVoorUurlog,
} from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, fmtUren, fmtTarief, fmtPct, TH, TD, LegeStaat, ROOD, GROEN } from './tab-ui'
import UrenDetailTable from './UrenDetailTable'

const KLEUR_SALDO = (v: number) => (v >= 0 ? GROEN : ROOD)

async function UrenBewakingInhoud({ dossierId }: { dossierId: string }) {
  const data = await getDossierUrenBewaking(dossierId)

  if (!data.beschikbaar) {
    return (
      <LegeStaat
        titel="Geen uren per bewakingscode"
        tekst="Dit dossier heeft geen Bouw7-koppeling of er zijn nog geen arbeidsurenboekingen."
      />
    )
  }

  const { regels, totalen, heeftWerkbegroting } = data
  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }

  return (
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
        {!heeftWerkbegroting && (
          <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--neutral-500)', borderTop: '1px solid var(--neutral-100)' }}>
            Geen gesynchroniseerde werkbegroting gevonden — begrote uren en saldo worden niet getoond.
          </div>
        )}
      </CardBody>
    </Card>
  )
}

async function UrenDetailInhoud({ dossierId }: { dossierId: string }) {
  const [data, bewakingscodes] = await Promise.all([
    getDossierUren(dossierId),
    getBewakingscodesVoorUurlog(dossierId),
  ])

  if (!data.beschikbaar) return null

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
          {perMedewerker
            ? 'Live uit Bouw7 — geboekte uren per medewerker. Bewakingscode aanpassen werkt direct terug in Bouw7.'
            : 'Per-medewerker detail niet beschikbaar; weergave per bewakingscode uit de projectbewaking.'}
        </div>
      </CardBody>
    </Card>
  )
}

export function UrenTab({ dossierId }: { dossierId: string }) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Suspense fallback={<SkeletonCard />}>
        <UrenBewakingInhoud dossierId={dossierId} />
      </Suspense>
      <Suspense fallback={<SkeletonCard />}>
        <UrenDetailInhoud dossierId={dossierId} />
      </Suspense>
    </div>
  )
}
