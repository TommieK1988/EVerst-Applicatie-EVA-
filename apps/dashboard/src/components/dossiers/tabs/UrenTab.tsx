import { Suspense } from 'react'
import { getDossierUren } from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody, SkeletonCard } from '@/components/ui'
import { fmt, fmtUren, fmtTarief, fmtDatum, TH, TD, LegeStaat } from './tab-ui'

async function UrenInhoud({ dossierId }: { dossierId: string }) {
  const data = await getDossierUren(dossierId)

  if (!data.beschikbaar) {
    return (
      <LegeStaat
        titel="Geen geboekte uren"
        tekst="Dit dossier heeft geen Bouw7-koppeling of er zijn nog geen uren geboekt."
      />
    )
  }

  const perMedewerker = data.detailNiveau === 'medewerker'
  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }

  return (
    <Card>
      <CardHeader>Geboekte uren</CardHeader>
      <CardBody style={{ padding: 0 }}>
        <table style={tabel}>
          <thead>
            {perMedewerker ? (
              <tr>
                <TH>Medewerker</TH><TH>Datum</TH><TH>Uursoort</TH><TH>Bewakingscode</TH>
                <TH right>Uren</TH><TH right>Uurtarief</TH><TH right>Bedrag</TH>
              </tr>
            ) : (
              <tr>
                <TH>Bewakingscode</TH><TH>Omschrijving</TH>
                <TH right>Geboekte uren</TH><TH right>Gem. tarief</TH><TH right>Arbeidskosten</TH>
              </tr>
            )}
          </thead>
          <tbody>
            {data.regels.map((r, i) =>
              perMedewerker ? (
                <tr key={i}>
                  <TD>{r.medewerker ?? '—'}</TD>
                  <TD>{fmtDatum(r.datum)}</TD>
                  <TD>{r.uursoort ?? '—'}</TD>
                  <TD>{r.code ? `${r.code}${r.codeNaam ? ` · ${r.codeNaam}` : ''}` : '—'}</TD>
                  <TD right>{fmtUren(r.uren)}</TD>
                  <TD right>{fmtTarief(r.uurtarief)}</TD>
                  <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
                </tr>
              ) : (
                <tr key={i}>
                  <TD>{r.code ?? '—'}</TD>
                  <TD>{r.codeNaam ?? '—'}</TD>
                  <TD right>{fmtUren(r.uren)}</TD>
                  <TD right>{fmtTarief(r.uurtarief)}</TD>
                  <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
                </tr>
              ),
            )}
            <tr style={{ background: 'var(--neutral-100, #eef2f3)' }}>
              <TD vet>Totaal</TD>
              {perMedewerker ? (<><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD></>) : (<TD>{''}</TD>)}
              <TD right vet>{fmtUren(data.totalen.uren, true)}</TD>
              <TD>{''}</TD>
              <TD right vet>{fmt(data.totalen.bedrag, true)}</TD>
            </tr>
          </tbody>
        </table>
        <div style={{ padding: '10px 12px', fontSize: 11.5, color: 'var(--neutral-500)', borderTop: '1px solid var(--neutral-100)', lineHeight: 1.5 }}>
          {perMedewerker
            ? 'Live uit Bouw7 — geboekte uren per medewerker. Bedrag = gefactureerd bedrag of uren × uurtarief.'
            : 'Per-medewerker detail niet beschikbaar; weergave per bewakingscode uit de projectbewaking (uren × arbeidskosten).'}
        </div>
      </CardBody>
    </Card>
  )
}

export function UrenTab({ dossierId }: { dossierId: string }) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)' }}>
      <Suspense fallback={<SkeletonCard />}>
        <UrenInhoud dossierId={dossierId} />
      </Suspense>
    </div>
  )
}
