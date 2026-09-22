import { Fragment, Suspense } from 'react'
import { getDossierFinancieel, getDossierBewaking, type BewakingRegel } from '@/lib/dossiers/actions'
import { Card, CardHeader, CardBody, Skeleton, SkeletonCard } from '@/components/ui'
import { ProjectVoortgangEditor, BewakingProgressCel } from './VoortgangEditors'
import { Bouw7StandStrip } from '../Bouw7StandStrip'
import ParkeerkostenBlok from './ParkeerkostenBlok'
import { LegeNotitie } from './tab-ui'
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

/** AK + winst als opslagpercentage over de kosten van diezelfde kolom, met 2 decimalen. */
const fmtOpslagPct = (bedrag: unknown, kosten: number): string => {
  const b = toNum(bedrag)
  if (kosten === 0 || b === 0) return '—'
  return `${new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format((b / kosten) * 100)} %`
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
 * De vier kostencomponenten. Elk krijgt twee smalle subkolommen naast elkaar: Prognose
 * (begroot/verwacht) en Geboekt (arbeid + ontvangen inkoopfacturen). De vier geboekt-kolommen
 * tellen per rij exact op tot de kolom Geboekte kosten — openstaande inkooporders en
 * onderaannemerscontracten zitten er bewust niet in (die staan op het Inkoop-tab).
 */
const COMPONENTEN: { kop: string; prognose: (r: ComponentBron) => number; geboekt: (r: ComponentBron) => number }[] = [
  { kop: 'Arbeid',            prognose: (r) => r.arbeidPrognose,               geboekt: (r) => r.arbeidskosten },
  { kop: 'Onderaanneming',    prognose: (r) => r.onderaannemingPrognose,       geboekt: (r) => r.onderaanneming },
  { kop: 'Materiaal',         prognose: (r) => r.materiaalPrognose,            geboekt: (r) => r.materiaal },
  { kop: 'Inkoop/Mat./Afval', prognose: (r) => r.inkoopMaterieelAfvalPrognose, geboekt: (r) => r.inkoopMaterieelAfval },
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

/**
 * Twee smalle cellen (prognose | geboekt) voor één kostencomponent. In een subtotaal- of
 * totaalregel (`vet`) staat er € 0 in plaats van een streepje — net als in de kolommen ernaast,
 * die daar al `showZero` gebruiken.
 */
const ComponentCellen = ({ prognose, geboekt, vet }: { prognose: number; geboekt: number; vet?: boolean }) => (
  <>
    <TD compact vet={vet} groepStart>{fmt(prognose, vet)}</TD>
    <TD compact vet={vet}>{fmt(geboekt, vet)}</TD>
  </>
)

/**
 * Nulregel voor een bewakingstabel zonder codes. De kolommen blijven staan met € 0, zodat een
 * dossier waar nog niets op geboekt is dezelfde opmaak houdt als een lopend project.
 */
const LegeBewakingRij = () => {
  const grijs = 'var(--neutral-400)'
  return (
    <tr>
      <CodeCel code={null} naam="—" />
      <TD compact kleur={grijs}>{fmt(0, true)}</TD>
      <TD compact kleur={grijs}>{fmt(0, true)}</TD>
      <TD compact kleur={grijs}>{fmt(0, true)}</TD>
      {COMPONENTEN.map((c) => (
        <Fragment key={c.kop}>
          <TD compact kleur={grijs} groepStart>{fmt(0, true)}</TD>
          <TD compact kleur={grijs}>{fmt(0, true)}</TD>
        </Fragment>
      ))}
      <TD compact kleur={grijs} groepStart>{fmt(0, true)}</TD>
      <TD compact kleur={grijs}>{fmt(0, true)}</TD>
      <TD compact kleur={grijs}>0 %</TD>
    </tr>
  )
}

const BewakingRow = ({ r, dossierId, bouw7Id, bewerkbaar }: {
  r: BewakingRegel; dossierId: string; bouw7Id: string | null; bewerkbaar: boolean
}) => (
  <tr>
    <CodeCel code={r.code} naam={r.naam} />
    <TD compact>{fmt(r.begroot)}</TD>
    <TD compact>{fmt(r.meerwerk)}</TD>
    <TD compact>{fmt(r.prognose)}</TD>
    {COMPONENTEN.map((c) => (
      <ComponentCellen key={c.kop} prognose={c.prognose(r)} geboekt={c.geboekt(r)} />
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

  // Zonder cijfers blijft de tabel staan — koppen, een nulregel en een nultotaal — met de reden
  // eronder. "Nog niet opgehaald" is iets anders dan "geen codes"; alleen bij het eerste helpt
  // de knop Vernieuwen.
  const nooitOpgehaald = data.stand.opgehaaldOp == null && data.stand.ontbreekt.length > 0
  const uitleg = !data.beschikbaar
    ? nooitOpgehaald
      ? 'Deze cijfers zijn nog niet uit Bouw7 opgehaald. Klik Vernieuwen om ze nu binnen te halen.'
      : 'Geen bewakingscodes gevonden voor dit project in Bouw7.'
    : null

  const t = data.totalen
  const sub = (regels: BewakingRegel[], sel: (r: BewakingRegel) => number) => regels.reduce((s, r) => s + sel(r), 0)
  const subGroen = 'var(--neutral-50, #f8fafa)'

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader>Bewaking per bewakingscode</CardHeader>
      <CardBody style={{ paddingBottom: 0 }}>
        <Bouw7StandStrip
          dossierId={dossierId}
          tab="financieel"
          opgehaaldOp={data.stand.opgehaaldOp}
          ontbreekt={data.stand.ontbreekt}
          fout={data.stand.fout}
        />
      </CardBody>
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
                  <TH right compact>Geboekt</TH>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.hoofdstukken.length === 0 && <LegeBewakingRij />}
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
                    <ComponentCellen key={c.kop} vet prognose={sub(h.regels, c.prognose)} geboekt={sub(h.regels, c.geboekt)} />
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
                <ComponentCellen key={c.kop} vet prognose={c.prognose(t)} geboekt={c.geboekt(t)} />
              ))}
              <TD compact vet accent={t.geboekteKosten > 0} groepStart>{fmt(t.geboekteKosten, true)}</TD>
              <TD compact vet kleur={t.prognose - t.geboekteKosten < 0 ? ROOD : undefined}>{fmt(t.prognose - t.geboekteKosten, true)}</TD>
              <TD compact>—</TD>
            </tr>
          </tbody>
        </table>
        {uitleg && (
          <div style={{
            padding: '10px 12px', fontSize: 11.5, color: 'var(--neutral-500)',
            borderTop: '1px solid var(--neutral-100)', lineHeight: 1.5,
          }}>
            {uitleg}
          </div>
        )}
        <div style={{
          padding: '10px 12px', fontSize: 11.5, color: 'var(--neutral-500)',
          borderTop: '1px solid var(--neutral-100)', lineHeight: 1.5,
        }}>
          Live uit Bouw7-projectbewaking. Per component staan <strong>Prognose</strong> (begrote/verwachte
          kosten) en <strong>Geboekt</strong> naast elkaar. Nog te verwachten = Tot. prognose − geboekte
          kosten (rood = overschreden). % gereed = prognose-gewogen gemiddelde over de kostensoorten.
          Uren staan op het Uren-tab.
          <br />
          <strong>Geboekt</strong> is alleen wat écht geboekt is: eigen arbeid plus de <em>ontvangen
          inkoopfacturen</em>. De vier componenten tellen dus precies op tot <strong>Geboekte kosten</strong>.
          Wat al wel besteld of afgeroepen is maar nog niet gefactureerd — inkooporders en
          onderaannemerscontracten — staat op het <strong>Inkoop</strong>-tab.
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

  // Zonder Bouw7-cijfers blijven Kosten en Opbrengsten gewoon staan, met nulbedragen in plaats
  // van streepjes: je ziet dan welke regels er komen te staan zodra het project gaat lopen.
  const geenTotalen = f == null

  const kostenTypes: { label: string; key: keyof NonNullable<NonNullable<typeof f>['costs']> }[] = [
    { label: 'Uren',          key: 'labor'          },
    { label: 'Materialen',    key: 'material'        },
    { label: 'Materieel',     key: 'equipment'       },
    { label: 'Onderaanneming', key: 'subcontracting' },
    { label: 'Inkoop',        key: 'purchaseOrder'   },
    { label: 'Overig',        key: 'other'           },
  ]

  const kostenTotaal = {
    b: kostenTypes.reduce((s, t) => s + toNum(f?.costs?.[t.key]?.budgeted), 0),
    p: kostenTypes.reduce((s, t) => s + toNum(f?.costs?.[t.key]?.prognosis), 0),
    r: kostenTypes.reduce((s, t) => s + toNum(f?.costs?.[t.key]?.realised), 0),
  }

  const omzet = {
    b: toNum(f?.revenue?.budgeted),
    p: toNum(f?.revenue?.prognosis),
    r: toNum(f?.revenue?.realised),
  }
  // Meerwerk-opbrengst: additionalWork is een object; het bedrag zit in de prognose
  // (== expected), niet in een losse waarde. omzet.b + meerwerk == revenue.prognosis.
  const meerwerk   = toNum(f?.additionalWork?.prognosis ?? f?.additionalWork?.expected)
  const opbrTotaal = { b: omzet.b + meerwerk, r: omzet.r }
  const teFactureren = Math.max(0, omzet.b - omzet.r)

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
                  <TD>{fmt(f?.costs?.[key]?.budgeted, geenTotalen)}</TD>
                  <TD>{fmt(f?.costs?.[key]?.prognosis, geenTotalen)}</TD>
                  <TD>{fmt(f?.costs?.[key]?.realised, geenTotalen)}</TD>
                </tr>
              ))}
              <TotaalRij label="Totaal" b={kostenTotaal.b} p={kostenTotaal.p} r={kostenTotaal.r} />
              {(toNum(f?.generalCostsProfit?.budgeted) > 0 || toNum(f?.generalCostsProfit?.prognosis) > 0) && (
                <tr>
                  <TDLabel sub>AK + winst</TDLabel>
                  <TD>{fmtOpslagPct(f?.generalCostsProfit?.budgeted, kostenTotaal.b)}</TD>
                  <TD>{fmtOpslagPct(f?.generalCostsProfit?.prognosis, kostenTotaal.p)}</TD>
                  <TD>{fmtOpslagPct(f?.generalCostsProfit?.realised, kostenTotaal.r)}</TD>
                </tr>
              )}
            </tbody>
          </table>
          {geenTotalen && (
            <LegeNotitie>Nog geen projectkosten: dit dossier heeft geen Bouw7-koppeling of financiële projectdata.</LegeNotitie>
          )}
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
                <TD>{fmt(f?.revenue?.budgeted, geenTotalen)}</TD>
                <TD accent={omzet.r > 0}>{fmt(f?.revenue?.realised, geenTotalen)}</TD>
                <TD>{fmt(teFactureren, geenTotalen)}</TD>
              </tr>
              <tr>
                <TDLabel>Goedgekeurd meerwerk</TDLabel>
                <TD accent={meerwerk > 0}>{fmt(meerwerk, geenTotalen)}</TD>
                <TD>{fmt(toNum(f?.additionalWork?.realised), geenTotalen)}</TD>
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
          {geenTotalen && (
            <LegeNotitie>Nog geen opbrengsten: dit dossier heeft geen Bouw7-koppeling of financiële projectdata.</LegeNotitie>
          )}
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

/**
 * Financieel is overal hetzelfde: begroot versus geboekt per bewakingscode.
 *
 * Servicedesk had hier eerder een eigen weergave die op de facturatiemethode splitste —
 * bij regie het afrekenpaneel, bij aangenomen de orders. Dat verknoopte twee dingen die
 * los horen te staan: hoe je bewaakt (altijd gelijk) en hoe je factureert (termijnen of
 * regie). Het afrekenpaneel staat nu waar het hoort: op het Verkoop-tab, de route naar de
 * verkoopfactuur. Inkopen loopt voor beide methoden via Werkbegroting en Inkoop.
 */
export function FinancieelTab({ dossierId, sectie }: { dossierId: string; sectie?: DossierSectie }) {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)' }}>
      {/* Parkeerkosten — puur informatief en bewust bovenaan, los van de
          bewakingstabel: die telt per rij exact op tot Geboekte kosten en deze
          bedragen staan niet in Bouw7. Rendert niets zonder toewijzingen. */}
      <div style={{ maxWidth: 960 }}>
        <Suspense fallback={null}>
          <ParkeerkostenBlok dossierId={dossierId} />
        </Suspense>
      </div>

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
