'use client'

import { useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { LegeStaat, fmt, fmtUren, fmtDatum } from '@/components/dossiers/tabs/tab-ui'
import UrenDetailTable, { OVERZICHT_KOLOMMEN } from '@/components/uren/UrenDetailTable'
import type { UrenOverzichtData } from '@/lib/uren/actions'
import { UREN_PERIODES, type UrenPeriode } from '@/lib/uren/types'

/**
 * Boven de 1.000 regels rendert de tabel eerst een deel, met een "toon alles"-knop. Een heel jaar
 * is ruim 5.000 regels × 15 kolommen; alles ineens in de DOM maakt sorteren merkbaar traag.
 */
const MAX_RIJEN = 1000

export default function UrenOverzicht({
  data, periode,
}: {
  data: UrenOverzichtData
  periode: UrenPeriode
}) {
  const router = useRouter()
  const [bezig, start] = useTransition()

  const nietGeaccordeerd = useMemo(
    () => data.regels.filter((r) => !r.geaccordeerd).length,
    [data.regels],
  )

  function kiesPeriode(p: UrenPeriode) {
    start(() => router.push(`/uren?periode=${p}`))
  }

  return (
    <div className="eva-page-full" style={{ paddingTop: 18, paddingBottom: 28 }}>
      {/* Kop: titel + periodekiezer + kerncijfers op één regel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)' }}>Financieel</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.01em' }}>Uren</h1>
        </div>

        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--bg-subtle)', borderRadius: 9, width: 'fit-content' }}>
          {UREN_PERIODES.map((p) => (
            <button
              key={p.key}
              onClick={() => kiesPeriode(p.key)}
              disabled={bezig}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: 7,
                cursor: bezig ? 'progress' : 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600,
                background: periode === p.key ? 'white' : 'transparent',
                color: periode === p.key ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: periode === p.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Stat label="Regels" value={String(data.regels.length)} />
        <Stat label="Uren" value={fmtUren(data.totalen.uren, true)} />
        <Stat label="Arbeidskosten" value={fmt(data.totalen.bedrag, true)} />
        <Stat
          label="Niet geaccordeerd"
          value={String(nietGeaccordeerd)}
          tone={nietGeaccordeerd > 0 ? '#dc2626' : undefined}
        />
      </div>

      {data.fout ? (
        <LegeStaat
          titel="Uren niet op te halen"
          tekst={`Bouw7 gaf geen antwoord: ${data.fout}`}
        />
      ) : data.regels.length === 0 ? (
        <LegeStaat
          titel="Geen uren in deze periode"
          tekst={`Tussen ${fmtDatum(data.van)} en ${fmtDatum(data.tot)} zijn er geen uren geboekt. Kies een andere periode.`}
        />
      ) : (
        <Card>
          <CardHeader>Geboekte uren detail</CardHeader>
          <CardBody style={{ padding: 0, opacity: bezig ? 0.6 : 1 }}>
            <UrenDetailTable
              regels={data.regels}
              totalen={data.totalen}
              perMedewerker
              kolommen={OVERZICHT_KOLOMMEN}
              maxRijen={MAX_RIJEN}
            />
            <div style={{ padding: '10px 12px', fontSize: 11.5, color: 'var(--neutral-500)', borderTop: '1px solid var(--neutral-100)', lineHeight: 1.5 }}>
              Live uit Bouw7 — alle geboekte uren van interne en externe medewerkers van{' '}
              {fmtDatum(data.van)} t/m {fmtDatum(data.tot)}. Sorteer op Medewerker, Dossier,
              Dienstverband of Geaccordeerd voor subtotalen per groep. Accorderen zelf gebeurt in Bouw7.
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--fg-soft)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone ?? 'var(--fg)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
