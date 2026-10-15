import { Suspense } from 'react'
import { getDossierFinancieel, getDossierBewaking } from '@/lib/dossiers/actions'
import { magCorrecties } from '@/lib/dossiers/correctie-bewakingscode'
import { magVoortgangWijzigen } from '@/lib/dossiers/guards'
import { Card, CardHeader, CardBody, Skeleton, SkeletonCard } from '@/components/ui'
import { ProjectVoortgangEditor } from './VoortgangEditors'
import { BewakingTabelInhoud } from './BewakingTabelInhoud'
import { Bouw7StandStrip } from '../Bouw7StandStrip'
import ParkeerkostenBlok from './ParkeerkostenBlok'
import { LegeNotitie } from './tab-ui'
import ResultaatPerPostBlok from './ResultaatPerPostBlok'
import { toNum, fmt, TH, TD } from './financieel-ui'
import type { DossierSectie } from '../types'

/* ── helpers ─────────────────────────────────────────────────────────── */

/** AK + winst als opslagpercentage over de kosten van diezelfde kolom, met 2 decimalen. */
const fmtOpslagPct = (bedrag: unknown, kosten: number): string => {
  const b = toNum(bedrag)
  if (kosten === 0 || b === 0) return '—'
  return `${new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format((b / kosten) * 100)} %`
}

/* ── gedeelde cel-componenten ────────────────────────────────────────── */

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

async function BewakingTabel({ dossierId, sectie }: { dossierId: string; sectie?: DossierSectie }) {
  // De kostengroep Correcties alleen voor wie hem mag zien (Projectbureau/Administratie).
  const data = await getDossierBewaking(dossierId, { verbergCorrecties: !(await magCorrecties()) })
  // Standopname per bewakingscode is alleen bij Opdrachten bewerkbaar, en alleen voor wie een
  // projectrol op het dossier heeft (zelfde check als in `bewaarVoortgang`).
  const bewerkbaar = sectie === 'opdracht' && !!data.bouw7Id && (await magVoortgangWijzigen(dossierId))

  // Zonder cijfers blijft de tabel staan — koppen, een nulregel en een nultotaal — met de reden
  // eronder. "Nog niet opgehaald" is iets anders dan "geen codes"; alleen bij het eerste helpt
  // de knop Synchroniseer in de topbalk.
  const nooitOpgehaald = data.stand.opgehaaldOp == null && data.stand.ontbreekt.length > 0
  const uitleg = !data.beschikbaar
    ? nooitOpgehaald
      ? 'Deze cijfers zijn nog niet uit Bouw7 opgehaald. Klik Synchroniseer rechtsboven om ze nu binnen te halen.'
      : 'Geen bewakingscodes gevonden voor dit project in Bouw7.'
    : null

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
        <BewakingTabelInhoud
          dossierId={dossierId}
          data={{ bouw7Id: data.bouw7Id, hoofdstukken: data.hoofdstukken, totalen: data.totalen }}
          bewerkbaar={bewerkbaar}
        />
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

  // Zonder Bouw7-cijfers blijven de Kosten gewoon staan, met nulbedragen in plaats
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

  // Geen opbrengstenblok meer: contractwaarde, facturen, betaald en nog te ontvangen staan op de
  // Verkoop-tab, uit EVA's eigen meerwerkregels. Hier stonden de Bouw7-aggregaten daarnaast, met
  // andere getallen voor hetzelfde geld.

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

      {/* Verwacht resultaat — hoofdaanneemsom, stelposten en meerwerk per post; volle breedte,
          zoals de bewakingstabel, zodat lange omschrijvingen niet worden afgekapt */}
      <Suspense fallback={<SkeletonCard />}>
        <ResultaatPerPostBlok dossierId={dossierId} />
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
