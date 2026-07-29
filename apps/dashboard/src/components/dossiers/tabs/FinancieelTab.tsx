import { Fragment, Suspense } from 'react'
import { createAdminClient } from '@everts/database/server'
import { getDossierFinancieel, getDossierBewaking, type BewakingRegel } from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody, Skeleton, SkeletonCard } from '@/components/ui'
import { InkoopTab } from './InkoopTab'
import { VerkoopTab } from './VerkoopTab'
import { UrenTab } from './UrenTab'
import ServicedeskRegiePaneel from './ServicedeskRegiePaneel'
import { ProjectVoortgangEditor, BewakingProgressCel } from './VoortgangEditors'
import type { DossierSectie } from '../types'

/* ── helpers ─────────────────────────────────────────────────────────── */

const ROOD = '#d9534f'

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

const fmtPctWaarde = (v: number | null): string => {
  if (v == null) return '—'
  return `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(v)} %`
}

const fmtPct = (resultaat: number, omzet: number): string => {
  if (omzet === 0) return '—'
  return `${((resultaat / omzet) * 100).toFixed(2)} %`
}

/* ── gedeelde cel-componenten ────────────────────────────────────────── */

const TH = ({ children, right, center, compact, groepKop, groepStart, rowSpan, colSpan }: {
  children?: React.ReactNode
  right?: boolean
  center?: boolean
  compact?: boolean
  groepKop?: boolean    // component-kop over 2 subkolommen — geen onderrand (loopt door naar de subkoppen)
  groepStart?: boolean  // eerste kolom van een groep — verticale scheidingslijn links
  rowSpan?: number
  colSpan?: number
}) => (
  <th rowSpan={rowSpan} colSpan={colSpan} style={{
    padding: compact ? '6px 6px' : '7px 12px',
    textAlign: center ? 'center' : right ? 'right' : 'left',
    fontSize: compact ? 10 : 11,
    fontWeight: 700,
    color: 'var(--neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: groepKop ? 'none' : '2px solid var(--border)',
    borderLeft: groepStart ? '1px solid var(--neutral-200)' : undefined,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }}>
    {children}
  </th>
)

const TD = ({ children, vet, accent, kleur, compact, groepStart }: {
  children: React.ReactNode
  vet?: boolean
  accent?: boolean
  kleur?: string
  compact?: boolean
  groepStart?: boolean  // eerste kolom van een groep — verticale scheidingslijn links
}) => (
  <td style={{
    padding: compact ? '5px 6px' : '6px 12px',
    fontSize: compact ? 11.5 : 13,
    textAlign: 'right',
    fontWeight: vet ? 700 : 400,
    color: kleur ?? (accent ? 'var(--accent)' : vet ? 'var(--neutral-900)' : 'var(--neutral-700)'),
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)',
    borderLeft: groepStart ? '1px solid var(--neutral-200)' : undefined,
    whiteSpace: 'nowrap',
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
    whiteSpace: 'nowrap',
  }}>
    {children}
  </td>
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

/* ── bewaking per bewakingscode (hoofdweergave) ──────────────────────── */

/** Subset dat zowel een regel als het totaal deelt — zo werken de selectors op beide. */
type ComponentBron = {
  arbeidPrognose: number; arbeidskosten: number
  onderaannemingPrognose: number; onderaanneming: number
  materiaalPrognose: number; materiaal: number
  inkoopMaterieelAfvalPrognose: number; inkoopMaterieelAfval: number
}

/**
 * De vier kostencomponenten. Elk krijgt twee smalle subkolommen naast elkaar:
 * Prognose (begroot/verwacht, uit Bouw7 `prognosisAmount`) en Besteed (geboekt bij
 * leveranciers, uit `costAmount`). Voorheen toonde de tabel alléén besteed, waardoor de
 * prognose van OA/materiaal/inkoop enkel in het projecttotaal zichtbaar was.
 */
const COMPONENTEN: { kop: string; prognose: (r: ComponentBron) => number; besteed: (r: ComponentBron) => number }[] = [
  { kop: 'Arbeid',            prognose: (r) => r.arbeidPrognose,               besteed: (r) => r.arbeidskosten },
  { kop: 'Onderaanneming',    prognose: (r) => r.onderaannemingPrognose,       besteed: (r) => r.onderaanneming },
  { kop: 'Materiaal',         prognose: (r) => r.materiaalPrognose,            besteed: (r) => r.materiaal },
  { kop: 'Inkoop/Mat./Afval', prognose: (r) => r.inkoopMaterieelAfvalPrognose, besteed: (r) => r.inkoopMaterieelAfval },
]

/** Totaal aantal kolommen incl. bewakingscode (voor de hoofdstuk-header colSpan). */
const KOLOM_AANTAL = 1 + 3 /* begroot, meerwerk, tot. prognose */ + COMPONENTEN.length * 2 + 3 /* geboekt, nog te verwachten, % gereed */

/** Linker (bewakingscode) cel — vaste breedte, naam afgekapt zodat de rest past. */
const CodeCel = ({ code, naam, vet, achtergrond }: { code: string | null; naam: string | null; vet?: boolean; achtergrond?: string }) => (
  <td style={{
    padding: '5px 8px', fontSize: 12, color: 'var(--neutral-800)', fontWeight: vet ? 700 : 400,
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis', background: achtergrond,
  }}>
    {code && <span style={{ fontWeight: 600 }}>{code}</span>}
    {naam && <span style={{ color: 'var(--neutral-500)', marginLeft: code ? 8 : 0 }}>{naam}</span>}
  </td>
)

/** Twee smalle cellen (prognose | besteed) voor één kostencomponent. */
const ComponentCellen = ({ prognose, besteed, vet }: { prognose: number; besteed: number; vet?: boolean }) => (
  <>
    <TD compact vet={vet} groepStart>{fmt(prognose)}</TD>
    <TD compact vet={vet}>{fmt(besteed)}</TD>
  </>
)

const BewakingRow = ({ r, dossierId, bouw7Id, bewerkbaar }: {
  r: BewakingRegel; dossierId: string; bouw7Id: string | null; bewerkbaar: boolean
}) => (
  <tr>
    <CodeCel code={r.code} naam={r.naam} />
    <TD compact>{fmt(r.begroot)}</TD>
    <TD compact>{fmt(r.meerwerk)}</TD>
    <TD compact>{fmt(r.prognose)}</TD>
    {COMPONENTEN.map((c) => (
      <ComponentCellen key={c.kop} prognose={c.prognose(r)} besteed={c.besteed(r)} />
    ))}
    <TD compact accent={r.geboekteKosten > 0} groepStart>{fmt(r.geboekteKosten)}</TD>
    <TD compact kleur={r.prognose - r.geboekteKosten < 0 ? ROOD : undefined}>{fmt(r.prognose - r.geboekteKosten)}</TD>
    <TD compact>
      {bewerkbaar && r.code && r.code !== '-'
        ? <BewakingProgressCel dossierId={dossierId} bouw7Id={bouw7Id} code={r.code} hoofdstukId={r.hoofdstukId} initial={r.progress} />
        : fmtPctWaarde(r.progress)}
    </TD>
  </tr>
)

async function BewakingTabel({ dossierId, sectie }: { dossierId: string; sectie?: DossierSectie }) {
  const data = await getDossierBewaking(dossierId)
  // Standopname per bewakingscode is alleen bij Opdrachten bewerkbaar.
  const bewerkbaar = sectie === 'opdracht' && !!data.bouw7Id

  if (!data.beschikbaar) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <CardHeader>Bewaking per bewakingscode</CardHeader>
        <CardBody>
          <div style={{ fontSize: 13, color: 'var(--neutral-500)', padding: '8px 0' }}>
            Geen bewakingscodes gevonden voor dit project in Bouw7.
          </div>
        </CardBody>
      </Card>
    )
  }

  const t = data.totalen
  const sub = (regels: BewakingRegel[], sel: (r: BewakingRegel) => number) => regels.reduce((s, r) => s + sel(r), 0)
  const subGroen = 'var(--neutral-50, #f8fafa)'

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader>Bewaking per bewakingscode</CardHeader>
      <CardBody style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '13%' }} />{/* Bewakingscode */}
            <col style={{ width: '7%' }} />{/* Begroot */}
            <col style={{ width: '6%' }} />{/* Meerwerk */}
            <col style={{ width: '7%' }} />{/* Tot. prognose */}
            {COMPONENTEN.map((c) => (
              <Fragment key={c.kop}>
                <col style={{ width: '5.5%' }} />{/* prognose */}
                <col style={{ width: '5.5%' }} />{/* besteed */}
              </Fragment>
            ))}
            <col style={{ width: '7%' }} />{/* Geboekte kosten */}
            <col style={{ width: '7%' }} />{/* Nog te verwachten */}
            <col style={{ width: '6%' }} />{/* % gereed */}
          </colgroup>
          <thead>
            {/* Rij 1: losse koppen (rowspan 2) + component-groepskoppen (colspan 2). */}
            <tr>
              <TH rowSpan={2}>Bewakingscode</TH>
              <TH rowSpan={2} right compact>Begroot</TH>
              <TH rowSpan={2} right compact>Meerwerk</TH>
              <TH rowSpan={2} right compact>Tot. prognose</TH>
              {COMPONENTEN.map((c) => (
                <TH key={c.kop} colSpan={2} center compact groepKop groepStart>{c.kop}</TH>
              ))}
              <TH rowSpan={2} right compact groepStart>Geboekte kosten</TH>
              <TH rowSpan={2} right compact>Nog te verwachten</TH>
              <TH rowSpan={2} right compact>% gereed</TH>
            </tr>
            {/* Rij 2: per component de subkoppen Prognose | Besteed. */}
            <tr>
              {COMPONENTEN.map((c) => (
                <Fragment key={c.kop}>
                  <TH right compact groepStart>Progn.</TH>
                  <TH right compact>Best.</TH>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.hoofdstukken.map((h) => (
              <Fragment key={`h-${h.id}-${h.naam}`}>
                <tr>
                  <td colSpan={KOLOM_AANTAL} style={{
                    padding: '10px 8px 4px', fontSize: 11, fontWeight: 700,
                    color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em',
                    borderBottom: '1px solid var(--neutral-200)',
                  }}>
                    {h.naam}
                  </td>
                </tr>
                {h.regels.map((r, i) => (
                  <BewakingRow
                    key={`${r.hoofdstukId}-${r.code ?? i}`}
                    r={r}
                    dossierId={dossierId}
                    bouw7Id={data.bouw7Id}
                    bewerkbaar={bewerkbaar}
                  />
                ))}
                <tr style={{ background: subGroen }}>
                  <CodeCel code={null} naam={`Subtotaal ${h.naam}`} vet achtergrond={subGroen} />
                  <TD compact vet>{fmt(sub(h.regels, (r) => r.begroot), true)}</TD>
                  <TD compact vet>{fmt(sub(h.regels, (r) => r.meerwerk), true)}</TD>
                  <TD compact vet>{fmt(sub(h.regels, (r) => r.prognose), true)}</TD>
                  {COMPONENTEN.map((c) => (
                    <ComponentCellen key={c.kop} vet prognose={sub(h.regels, c.prognose)} besteed={sub(h.regels, c.besteed)} />
                  ))}
                  <TD compact vet groepStart>{fmt(sub(h.regels, (r) => r.geboekteKosten))}</TD>
                  <TD compact vet kleur={sub(h.regels, (r) => r.prognose - r.geboekteKosten) < 0 ? ROOD : undefined}>{fmt(sub(h.regels, (r) => r.prognose - r.geboekteKosten))}</TD>
                  <TD compact>—</TD>
                </tr>
              </Fragment>
            ))}
            {/* Eindtotaal */}
            <tr style={{ background: 'var(--neutral-100, #eef2f3)' }}>
              <CodeCel code={null} naam="Totaal" vet achtergrond="var(--neutral-100, #eef2f3)" />
              <TD compact vet>{fmt(t.begroot, true)}</TD>
              <TD compact vet>{fmt(t.meerwerk, true)}</TD>
              <TD compact vet>{fmt(t.prognose, true)}</TD>
              {COMPONENTEN.map((c) => (
                <ComponentCellen key={c.kop} vet prognose={c.prognose(t)} besteed={c.besteed(t)} />
              ))}
              <TD compact vet accent={t.geboekteKosten > 0} groepStart>{fmt(t.geboekteKosten)}</TD>
              <TD compact vet kleur={t.prognose - t.geboekteKosten < 0 ? ROOD : undefined}>{fmt(t.prognose - t.geboekteKosten)}</TD>
              <TD compact>—</TD>
            </tr>
          </tbody>
        </table>
        <div style={{
          padding: '10px 12px', fontSize: 11.5, color: 'var(--neutral-500)',
          borderTop: '1px solid var(--neutral-100)', lineHeight: 1.5,
        }}>
          Live uit Bouw7-projectbewaking. Per component staan <strong>Prognose</strong> (begrote/verwachte
          kosten) en <strong>Besteed</strong> naast elkaar. Nog te verwachten = Tot. prognose − geboekte
          kosten (rood = overschreden). % gereed = prognose-gewogen gemiddelde over de kostensoorten.
          Uren staan op het Uren-tab.
          <br />
          <strong>Besteed</strong> (per component) telt ook <em>afgeroepen maar nog niet gefactureerde</em>
          leverbonnen mee — dus wat er vastligt bij leveranciers. <strong>Geboekte kosten</strong> telt
          alleen arbeid + inkoop mét inkoopfactuur — dus wat écht geboekt is.
        </div>
      </CardBody>
    </Card>
  )
}

/** Skeleton terwijl de (trage) bewaking-fetch loopt. */
function BewakingSkeleton() {
  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader>Bewaking per bewakingscode</CardHeader>
      <CardBody style={{ padding: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} style={{ height: i === 0 ? 14 : 24, width: i === 0 ? '40%' : '100%' }} />
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

function ProjecttotalenSkeleton() {
  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase',
        letterSpacing: '0.07em', margin: '24px 0 10px',
      }}>
        Projecttotalen
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </>
  )
}

/* ── projecttotalen (Athena project-financial) ───────────────────────── */

async function Projecttotalen({ dossierId }: { dossierId: string }) {
  const { bouw7Financial: f, relatieFacturatie } = await getDossierFinancieel(dossierId)

  const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }

  if (!f) {
    return (
      <div style={{
        padding: '32px 28px',
        border: '1px dashed var(--neutral-200)',
        borderRadius: 10,
        background: 'var(--neutral-50)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        color: 'var(--neutral-500)',
      }}>
        <div style={{ fontSize: 24, opacity: 0.4 }}>◻</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-800)' }}>Geen projecttotalen beschikbaar</div>
        <div style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', maxWidth: 320 }}>
          Dit dossier heeft geen Bouw7-koppeling of financiële projectdata.
        </div>
      </div>
    )
  }

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

  const omzet = {
    b: toNum(f.revenue?.budgeted),
    p: toNum(f.revenue?.prognosis),
    r: toNum(f.revenue?.realised),
  }
  // Meerwerk-opbrengst: additionalWork is een object; het bedrag zit in de prognose
  // (== expected), niet in een losse waarde. omzet.b + meerwerk == revenue.prognosis.
  const meerwerk   = toNum(f.additionalWork?.prognosis ?? f.additionalWork?.expected)
  const opbrTotaal = { b: omzet.b + meerwerk, r: omzet.r }
  const teFactureren = Math.max(0, omzet.b - omzet.r)

  const res = {
    b: toNum(f.result?.budgeted),
    p: toNum(f.result?.prognosis),
    r: toNum(f.result?.realised),
  }

  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--neutral-400)', textTransform: 'uppercase',
        letterSpacing: '0.07em', margin: '24px 0 10px',
      }}>
        Projecttotalen
      </div>

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
                <TDLabel>Goedgekeurd meerwerk</TDLabel>
                <TD accent={meerwerk > 0}>{fmt(meerwerk)}</TD>
                <TD>{fmt(toNum(f.additionalWork?.realised))}</TD>
                <TD>—</TD>
              </tr>
              <tr style={{ background: 'var(--neutral-50)' }}>
                <TDLabel vet>Totaal incl. meerwerk</TDLabel>
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
                <TD vet kleur={res.b >= 0 ? undefined : ROOD}>{fmt(res.b, true)}</TD>
                <TD vet kleur={res.p >= 0 ? undefined : ROOD}>{fmt(res.p, true)}</TD>
                <TD vet kleur={res.r >= 0 ? undefined : ROOD}>{fmt(res.r, true)}</TD>
              </tr>
              <tr style={{ background: 'var(--neutral-50)' }}>
                <TDLabel>Brutowinstmarge</TDLabel>
                {/* Begroot = omzet excl. meerwerk; prognose-omzet bevat meerwerk al (niet nogmaals optellen). */}
                <TD vet>{fmtPct(res.b, omzet.b)}</TD>
                <TD vet>{fmtPct(res.p, omzet.p)}</TD>
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
    </>
  )
}

/* ── project-niveau % gereed (Opdrachten + Servicedesk) ──────────────── */

/**
 * Render de (read-only) project-% gereed. Waarde: EVA-overlay (handmatige override) >
 * de live prognose-gewogen rollup van de bewakingscodes (`getDossierBewaking().projectProgress`,
 * exact gelijk aan de getoonde code-%'en). Toont niets zonder Bouw7-koppeling.
 */
async function ProjectVoortgangBlok({ dossierId }: { dossierId: string }) {
  const data = await getDossierBewaking(dossierId)
  if (!data.bouw7Id) return null

  // Project-% = altijd de berekende rollup van de bewakingscodes (geen handmatige override).
  return <ProjectVoortgangEditor dossierId={dossierId} bouw7Id={data.bouw7Id} initial={data.projectProgress} readOnly />
}

/* ── main component ──────────────────────────────────────────────────── */

export function FinancieelTab({ dossierId, sectie }: { dossierId: string; sectie?: DossierSectie }) {
  // Servicedesk voegt Inkoop/Verkoop/Financieel samen tot één tab, met een aparte
  // weergave voor regie vs. aangenomen (op basis van de facturatiemethode).
  if (sectie === 'servicedesk') {
    return (
      <Suspense fallback={<div style={{ padding: 28 }}><BewakingSkeleton /></div>}>
        <ServicedeskFinancieel dossierId={dossierId} />
      </Suspense>
    )
  }

  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)' }}>
      {/* Project-brede % gereed (bewerkbaar) */}
      <div style={{ maxWidth: 960 }}>
        <Suspense fallback={null}>
          <ProjectVoortgangBlok dossierId={dossierId} />
        </Suspense>
      </div>

      {/* Bewaking per bewakingscode — volledige breedte, hoofdweergave */}
      <Suspense fallback={<BewakingSkeleton />}>
        <BewakingTabel dossierId={dossierId} sectie={sectie} />
      </Suspense>

      {/* Projecttotalen — smaller blok eronder */}
      <div style={{ maxWidth: 960 }}>
        <Suspense fallback={<ProjecttotalenSkeleton />}>
          <Projecttotalen dossierId={dossierId} />
        </Suspense>
      </div>
    </div>
  )
}

/** Servicedesk Financieel-tab: regie (bewerkbare factuurregels) of aangenomen (orders/uren/termijnen). */
async function ServicedeskFinancieel({ dossierId }: { dossierId: string }) {
  const supabase = createAdminClient() as any
  const { data } = await supabase.from('dossiers').select('facturatiemethode').eq('id', dossierId).single()
  const methode = (data?.facturatiemethode as 'regie' | 'termijnen') ?? 'regie'

  return (
    <>
      {/* Project-brede % gereed (bewerkbaar) — boven beide weergaven */}
      <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px) 0' }}>
        <div style={{ maxWidth: 960 }}>
          <Suspense fallback={null}>
            <ProjectVoortgangBlok dossierId={dossierId} />
          </Suspense>
        </div>
      </div>

      {methode === 'regie' ? (
        <ServicedeskRegiePaneel dossierId={dossierId} />
      ) : (
        // Aangenomen: opdracht & orders, geboekte kosten/uren, en verkooptermijnen.
        <>
          <InkoopTab dossierId={dossierId} />
          <UrenTab dossierId={dossierId} />
          <VerkoopTab dossierId={dossierId} />
        </>
      )}
    </>
  )
}
