import { getDossierFinancieel } from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody } from '@/components/ui'
import type { Bouw7FinancialValue } from '@/lib/bouw7/client'

/* ── helpers ─────────────────────────────────────────────────────────── */

const toNum = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isNaN(n) ? 0 : n
}

const fmt = (v: unknown, showZero = false): string => {
  const n = toNum(v)
  if (n === 0 && !showZero) return '—'
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

const fmtPct = (resultaat: number, omzet: number): string => {
  if (omzet === 0) return '—'
  return `${((resultaat / omzet) * 100).toFixed(2)} %`
}

/* ── sub-components ──────────────────────────────────────────────────── */

const TH = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th style={{
    padding: '7px 12px',
    textAlign: right ? 'right' : 'left',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '2px solid var(--neutral-200, #e3e8ea)',
    whiteSpace: 'nowrap',
  }}>
    {children}
  </th>
)

const TD = ({ children, vet, accent, kleur }: {
  children: React.ReactNode
  vet?: boolean
  accent?: boolean
  kleur?: string
}) => (
  <td style={{
    padding: '6px 12px',
    fontSize: 13,
    textAlign: 'right',
    fontFamily: 'var(--font-mono)',
    fontWeight: vet ? 700 : 400,
    color: kleur ?? (accent ? 'var(--accent)' : vet ? 'var(--neutral-900)' : 'var(--neutral-700)'),
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)',
  }}>
    {children}
  </td>
)

const TDLabel = ({ children, vet, sub }: { children: React.ReactNode; vet?: boolean; sub?: boolean }) => (
  <td style={{
    padding: '6px 12px',
    fontSize: sub ? 11.5 : 13,
    fontWeight: vet ? 700 : 400,
    color: vet ? 'var(--neutral-900)' : sub ? 'var(--neutral-400)' : 'var(--neutral-700)',
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)',
    fontStyle: sub ? 'italic' : undefined,
  }}>
    {children}
  </td>
)

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <tr>
    <td colSpan={5} style={{
      padding: '10px 12px 4px',
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--neutral-400)',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      borderBottom: '1px solid var(--neutral-200)',
    }}>
      {children}
    </td>
  </tr>
)

const TotaalRij = ({ label, b, p, r }: { label: string; b: number; p: number; r: number }) => (
  <tr style={{ background: 'var(--neutral-50, #f8fafa)' }}>
    <TDLabel vet>{label}</TDLabel>
    <TD vet>{fmt(b, true)}</TD>
    <TD vet>{fmt(p, true)}</TD>
    <TD vet accent={r > 0}>{fmt(r, true)}</TD>
  </tr>
)

const InfoRij = ({ label, waarde }: { label: string; waarde: string | null }) => {
  if (!waarde) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--neutral-500)', minWidth: 160 }}>{label}</span>
      <span style={{ color: 'var(--neutral-800)', fontWeight: 500 }}>{waarde}</span>
    </div>
  )
}

/* ── main component ──────────────────────────────────────────────────── */

export async function FinancieelTab({ dossierId }: { dossierId: string }) {
  const { bouw7Financial: f, relatieFacturatie } = await getDossierFinancieel(dossierId)

  if (!f) {
    return (
      <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', maxWidth: 800 }}>
        <div style={{
          padding: '32px 28px',
          border: '1px dashed var(--neutral-200)',
          borderRadius: 10,
          background: 'var(--neutral-50)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          color: 'var(--neutral-500)',
        }}>
          <div style={{ fontSize: 24, opacity: 0.4 }}>◻</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-800)' }}>Geen financiële data beschikbaar</div>
          <div style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', maxWidth: 320 }}>
            Dit dossier heeft geen Bouw7-koppeling. Financiële data wordt beschikbaar zodra het dossier gesynchroniseerd is.
          </div>
        </div>
      </div>
    )
  }

  /* kostentotalen per kolom */
  const kostenTypes: { label: string; key: keyof NonNullable<typeof f.costs> }[] = [
    { label: 'Uren',          key: 'labor'          },
    { label: 'Materialen',    key: 'material'        },
    { label: 'Materieel',     key: 'equipment'       },
    { label: 'Onderaanneming', key: 'subcontracting' },
    { label: 'Inkoop',        key: 'purchaseOrder'   },
    { label: 'Overig',        key: 'other'           },
  ]

  const kostenTotaal = {
    b: kostenTypes.reduce((s, t) => s + toNum(f.costs?.[t.key]?.budgeted), 0),
    p: kostenTypes.reduce((s, t) => s + toNum(f.costs?.[t.key]?.prognosis), 0),
    r: kostenTypes.reduce((s, t) => s + toNum(f.costs?.[t.key]?.realised), 0),
  }

  /* opbrengsten */
  const omzet = {
    b: toNum(f.revenue?.budgeted),
    p: toNum(f.revenue?.prognosis),
    r: toNum(f.revenue?.realised),
  }
  const meerwerk   = toNum(f.additionalWork)
  const opbrTotaal = {
    b: omzet.b + meerwerk,
    r: omzet.r,
  }
  const teFactureren = Math.max(0, omzet.b - omzet.r)

  /* resultaat */
  const res = {
    b: toNum(f.result?.budgeted),
    p: toNum(f.result?.prognosis),
    r: toNum(f.result?.realised),
  }

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  }

  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', maxWidth: 960 }}>

      {/* Kosten */}
      <Card style={{ marginBottom: 16 }}>
        <CardHeader>Kosten</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <TH>Type</TH>
                <TH right>Begroot</TH>
                <TH right>Prognose</TH>
                <TH right>Gerealiseerd</TH>
              </tr>
            </thead>
            <tbody>
              {kostenTypes.map(({ label, key }) => (
                <tr key={key}>
                  <TDLabel>{label}</TDLabel>
                  <TD>{fmt(f.costs?.[key]?.budgeted)}</TD>
                  <TD>{fmt(f.costs?.[key]?.prognosis)}</TD>
                  <TD>{fmt(f.costs?.[key]?.realised)}</TD>
                </tr>
              ))}
              <TotaalRij label="Totaal" b={kostenTotaal.b} p={kostenTotaal.p} r={kostenTotaal.r} />
              {(toNum(f.generalCostsProfit?.budgeted) > 0 || toNum(f.generalCostsProfit?.prognosis) > 0) && (
                <tr>
                  <TDLabel sub>AK + winst</TDLabel>
                  <TD>{fmt(f.generalCostsProfit?.budgeted)}</TD>
                  <TD>{fmt(f.generalCostsProfit?.prognosis)}</TD>
                  <TD>{fmt(f.generalCostsProfit?.realised)}</TD>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Opbrengsten */}
      <Card style={{ marginBottom: 16 }}>
        <CardHeader>Opbrengsten</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <TH>Type</TH>
                <TH right>Aangenomen</TH>
                <TH right>Gefactureerd</TH>
                <TH right>Te factureren</TH>
              </tr>
            </thead>
            <tbody>
              <tr>
                <TDLabel>Aangenomen</TDLabel>
                <TD>{fmt(f.revenue?.budgeted)}</TD>
                <TD accent={omzet.r > 0}>{fmt(f.revenue?.realised)}</TD>
                <TD>{fmt(teFactureren)}</TD>
              </tr>
              <tr>
                <TDLabel>Meerwerk</TDLabel>
                <TD>{fmt(f.additionalWork)}</TD>
                <TD>—</TD>
                <TD>—</TD>
              </tr>
              <tr style={{ background: 'var(--neutral-50)' }}>
                <TDLabel vet>Totaal</TDLabel>
                <TD vet>{fmt(opbrTotaal.b, true)}</TD>
                <TD vet accent={opbrTotaal.r > 0}>{fmt(opbrTotaal.r, true)}</TD>
                <TD vet>{fmt(teFactureren, true)}</TD>
              </tr>
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Resultaat + marge */}
      <Card style={{ marginBottom: 16 }}>
        <CardHeader>Resultaat</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <TH></TH>
                <TH right>Begroot</TH>
                <TH right>Prognose</TH>
                <TH right>Gerealiseerd</TH>
              </tr>
            </thead>
            <tbody>
              <tr>
                <TDLabel>Resultaat</TDLabel>
                <TD vet kleur={res.b >= 0 ? undefined : '#d9534f'}>{fmt(res.b, true)}</TD>
                <TD vet kleur={res.p >= 0 ? undefined : '#d9534f'}>{fmt(res.p, true)}</TD>
                <TD vet kleur={res.r >= 0 ? undefined : '#d9534f'}>{fmt(res.r, true)}</TD>
              </tr>
              <tr style={{ background: 'var(--neutral-50)' }}>
                <TDLabel>Brutowinstmarge</TDLabel>
                <TD vet>{fmtPct(res.b, omzet.b + meerwerk)}</TD>
                <TD vet>{fmtPct(res.p, omzet.p + meerwerk)}</TD>
                <TD vet accent>{fmtPct(res.r, omzet.r)}</TD>
              </tr>
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Facturatie-instellingen klant */}
      {relatieFacturatie && (
        <Card>
          <CardHeader>Facturatie-instellingen klant</CardHeader>
          <CardBody>
            <InfoRij label="Betaaltermijn"      waarde={relatieFacturatie.betaaltermijn_dagen != null ? `${relatieFacturatie.betaaltermijn_dagen} dagen` : null} />
            <InfoRij label="Facturatie-e-mail"  waarde={relatieFacturatie.facturatie_email} />
            <InfoRij label="Inkoopnr. verplicht" waarde={relatieFacturatie.inkoopnummer_verplicht ? 'Ja' : 'Nee'} />
            <InfoRij label="Kredietlimiet"      waarde={relatieFacturatie.kredietlimiet != null ? fmt(relatieFacturatie.kredietlimiet) : null} />
            {relatieFacturatie.g_rekening_tekst && (
              <InfoRij label="G-rekening" waarde={`${relatieFacturatie.g_rekening_tekst}${relatieFacturatie.g_rekening_percentage != null ? ` (${relatieFacturatie.g_rekening_percentage}%)` : ''}`} />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
