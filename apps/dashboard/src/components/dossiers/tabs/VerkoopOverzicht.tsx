import { Card, CardHeader, CardBody } from '@/components/ui'
import type { OverzichtRegel } from '@/lib/dossiers/contractwaarde'
import { fmt, fmtPct, TH, TD, LegeRij } from './tab-ui'
import MandaatIndicator from './MandaatIndicator'

const rond = (n: number) => Math.round(n * 100) / 100

export type BtwGroep = { pct: number | null; grondslag: number; btw: number }

/** Tel grondslag en BTW per tarief op. Regels zonder bekend tarief komen in een eigen groep. */
export function groepeerBtw(rijen: { pct: number | null; excl: number; btw: number }[]): BtwGroep[] {
  const groepen = new Map<string, BtwGroep>()
  for (const r of rijen) {
    if (r.excl === 0 && r.btw === 0) continue
    const sleutel = r.pct == null ? 'onbekend' : String(r.pct)
    const g = groepen.get(sleutel) ?? { pct: r.pct, grondslag: 0, btw: 0 }
    g.grondslag = rond(g.grondslag + r.excl)
    g.btw = rond(g.btw + r.btw)
    groepen.set(sleutel, g)
  }
  // Hoogste tarief eerst; onbekend tarief onderaan.
  return Array.from(groepen.values()).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
}

/** Kopregel binnen het overzichtsblok — scheidt contractwaarde, BTW en facturatiestand. */
const SectieRij = ({ titel, eerste }: { titel: string; eerste?: boolean }) => (
  <tr>
    <td
      colSpan={4}
      style={{
        padding: eerste ? '10px 12px 4px' : '16px 12px 4px',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        color: 'var(--neutral-500)',
        borderTop: eerste ? undefined : '1px solid var(--neutral-100)',
      }}
    >
      {titel}
    </td>
  </tr>
)

const Leeg = () => <TD right kleur="var(--neutral-400)">—</TD>

/**
 * Het Overzicht op de Verkoop-tab: contractwaarde, BTW-specificatie per tarief en facturatiestand.
 *
 * Alle bedragen worden in `VerkoopTab` uitgerekend; dit blok tekent ze alleen. Welke regels er
 * onder "Contractwaarde" staan bepaalt `overzichtRegels()` — alleen wat in gebruik is, en op een
 * regieopdracht Regiewerkzaamheden in plaats van Aanneemsom.
 */
export default function VerkoopOverzicht(p: {
  regels: OverzichtRegel[]
  contractTotaal: number
  /** Mandaat van een regieopdracht of -bon; komt als plafond bij Regiewerkzaamheden te staan. */
  mandaat: number | null
  btwGroepen: BtwGroep[]
  zonderTarief: number
  totaalExcl: number
  btwTotaal: number
  totaalIncl: number
  geenTermijnstaat: boolean
  /** Komt al het goedgekeurde meerwerk uit de termijnstaat? Zo niet, dan zegt de voetnoot dat. */
  meerwerkUitEva: boolean
  facturatie: { heeftFacturen: boolean; excl: number; btw: number; incl: number; openstaand: number }
}) {
  const btwBekend = p.btwGroepen.length > 0        // is er überhaupt één bedrag met een tarief?
  const btwOnvolledig = p.zonderTarief > 0.5       // centen-verschillen zijn geen echte gaten
  const f = p.facturatie

  return (
    <Card>
      <CardHeader>Overzicht</CardHeader>
      <CardBody style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH />
              <TH right breedte={150}>Excl. BTW</TH>
              <TH right breedte={130}>BTW</TH>
              <TH right breedte={150}>Incl. BTW</TH>
            </tr>
          </thead>
          <tbody>
            <SectieRij titel="Contractwaarde" eerste />
            {p.regels.map(r => {
              const actief = Math.abs(r.bedrag) > 0.005
              const metMandaat = r.sleutel === 'regiewerk' && p.mandaat != null && p.mandaat > 0
              return (
                <tr key={r.sleutel}>
                  <TD wrap>
                    {r.label}
                    {r.route && <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>{r.route}</span>}
                    {metMandaat && (
                      <span style={{ marginLeft: 8, display: 'inline-flex', verticalAlign: 'middle' }}>
                        <MandaatIndicator mandaat={p.mandaat!} geboekt={r.bedrag} />
                      </span>
                    )}
                  </TD>
                  <TD right accent={actief && r.sleutel !== 'aanneemsom'} kleur={actief ? undefined : 'var(--neutral-400)'}>
                    {fmt(r.bedrag, true)}
                  </TD>
                  <Leeg />
                  <Leeg />
                </tr>
              )
            })}
            <tr style={{ borderTop: '1px solid var(--neutral-100)' }}>
              <TD vet wrap>Contracttotaal</TD>
              <TD right vet>{fmt(p.contractTotaal, true)}</TD>
              <Leeg />
              <Leeg />
            </tr>

            <SectieRij titel="BTW-specificatie" />
            {/* Nog geen enkel tarief bekend: een nulregel in plaats van een kopje met niets
                eronder, zodat de specificatie dezelfde vorm houdt als straks. */}
            {p.btwGroepen.length === 0 && !btwOnvolledig && (
              <LegeRij velden={['tekst', 'bedrag', 'bedrag', 'bedrag']} label="Nog geen BTW-tarief bekend" />
            )}
            {p.btwGroepen.map((g) => (
              <tr key={g.pct ?? 'onbekend'}>
                <TD wrap>{g.pct != null ? `BTW ${fmtPct(g.pct)}` : 'Tarief onbekend'}</TD>
                <TD right>{fmt(g.grondslag, true)}</TD>
                <TD right>{fmt(g.btw, true)}</TD>
                <TD right>{fmt(rond(g.grondslag + g.btw), true)}</TD>
              </tr>
            ))}
            {btwOnvolledig && (
              <tr>
                <TD wrap kleur="var(--amber-700, #b45309)">
                  Nog geen BTW-tarief bekend
                  <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>
                    {p.geenTermijnstaat ? 'geen termijnstaat' : 'niet in de termijnstaat'}
                  </span>
                </TD>
                <TD right>{fmt(p.zonderTarief, true)}</TD>
                <Leeg />
                <Leeg />
              </tr>
            )}
            <tr style={{ background: 'var(--neutral-50)' }}>
              <TD vet wrap>Totaal</TD>
              <TD right vet>{fmt(p.totaalExcl, true)}</TD>
              <TD right vet={btwBekend} kleur={btwBekend ? undefined : 'var(--neutral-400)'}>{btwBekend ? fmt(p.btwTotaal, true) : '—'}</TD>
              <TD right vet={btwBekend} accent={btwBekend} kleur={btwBekend ? undefined : 'var(--neutral-400)'}>{btwBekend ? fmt(p.totaalIncl, true) : '—'}</TD>
            </tr>

            <SectieRij titel="Facturatiestand" />
            <tr>
              <TD wrap>Gefactureerd</TD>
              <TD right accent={f.excl > 0}>{fmt(f.excl, true)}</TD>
              <TD right kleur={f.heeftFacturen ? undefined : 'var(--neutral-400)'}>{f.heeftFacturen ? fmt(f.btw, true) : '—'}</TD>
              <TD right kleur={f.heeftFacturen ? undefined : 'var(--neutral-400)'}>{f.heeftFacturen ? fmt(f.incl, true) : '—'}</TD>
            </tr>
            <tr style={{ background: 'var(--neutral-50)' }}>
              <TD vet wrap>Nog te factureren</TD>
              <TD right vet>{fmt(f.openstaand, true)}</TD>
              <Leeg />
              <Leeg />
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11.5, color: 'var(--neutral-500)', padding: '8px 12px', lineHeight: 1.5 }}>
          {!btwBekend
            ? 'Er staan nog geen bedragen met een BTW-tarief in de termijnstaat, dus de BTW en het totaal incl. BTW zijn nog niet te bepalen.'
            : btwOnvolledig
              ? `De BTW-tarieven komen uit de termijnstaat. Over ${fmt(p.zonderTarief)} van het contract is nog geen tarief bekend, dus het totaal incl. BTW is een ondergrens.`
              : `De BTW-tarieven komen uit de termijnstaat${p.meerwerkUitEva ? ', aangevuld met het goedgekeurde meerwerk uit EVA' : ''}.`}
        </div>
      </CardBody>
    </Card>
  )
}
