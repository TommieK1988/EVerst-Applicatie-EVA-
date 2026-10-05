import { magCorrecties } from '@/lib/dossiers/correctie-bewakingscode'
import { getResultaatPerPost } from '@/lib/dossiers/resultaat-per-code-laden'
import type { ResultaatPost, Subtotaal, VerkoopGrondslag } from '@/lib/dossiers/resultaat-per-code'
import { Badge, Card, CardHeader, CardBody } from '@/components/ui'
import { LegeNotitie } from './tab-ui'
import { ROOD, fmt, TH, TD } from './financieel-ui'

/**
 * Verwacht resultaat per post: de hoofdaanneemsom met daaronder de stelposten die erin zitten,
 * dan elke meerwerkregel en elke aanvullende stelpost, met subtotalen en het projecttotaal.
 */

const GRONDSLAG_UITLEG: Record<VerkoopGrondslag, string> = {
  vast:          'Afgesproken bedrag',
  eenheidsprijs: 'Eenheidsprijs × werkelijke hoeveelheid',
  doorgerekend:  'Geboekte verkoopwaarde + nog te verwachten kosten, doorgerekend tegen dezelfde verhouding',
  mandaat:       'Mandaat (doorgerekend komt lager uit)',
  verrekend:     'Stelpostbedrag + de verrekening op het tabblad Meerwerk',
  geboekt:       'Geboekte verkoopwaarde — ligt al boven het stelpostbedrag',
  aanneemsom:    'Aanneemsom zonder de stelposten die erin zitten',
}

const RAND = '1px solid var(--neutral-100, #f4f7f8)'
const SUBTOTAAL_GRIJS = 'var(--neutral-50, #f8fafa)'
const TOTAAL_GRIJS = 'var(--neutral-100, #eef2f3)'

const fmtMarge = (v: number | null): string =>
  v == null ? '—' : `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(v)} %`

const fmtPct = (v: number): string =>
  `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(v * 100)} %`

const resultaatKleur = (v: number | null): string | undefined =>
  v == null ? undefined : v < 0 ? ROOD : v > 0 ? 'var(--success-700, #2e7d4f)' : undefined

/** Marge onder 20 % rood, 20–25 % oranje, daarboven gewoon. */
const margeKleur = (v: number | null): string | undefined =>
  v == null ? undefined : v < 20 ? ROOD : v < 25 ? 'var(--warning-500, #f08000)' : undefined

const leeg = (v: number | null): string => (v == null ? '—' : fmt(v, true))

/** Groepskop over de volle breedte, in de stijl van de veldlabels (UPPERCASE 10,5px). */
function GroepKop({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={5} style={{
        padding: '12px 12px 4px', fontSize: 10.5, fontWeight: 700, color: 'var(--neutral-500)',
        textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: RAND,
      }}>
        {children}
      </td>
    </tr>
  )
}

const LABEL: Partial<Record<ResultaatPost['soort'], string>> = { stelpost: 'Stelpost', optie: 'Optie', regie: 'Regie' }

function PostRij({ post, inspringen, metLabel }: { post: ResultaatPost; inspringen?: boolean; metLabel?: boolean }) {
  const label = metLabel ? LABEL[post.soort] : undefined
  const aandeel = post.kostenAandeel != null && post.code
    ? `${fmtPct(post.kostenAandeel)} van de kosten van ${post.code}`
    : null
  return (
    <tr>
      <td
        title={[post.omschrijving, post.code, aandeel].filter(Boolean).join(' · ')}
        style={{
          padding: `6px 12px 6px ${inspringen ? 28 : 12}px`, fontSize: 13, color: 'var(--neutral-800)',
          borderBottom: RAND, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {label && <span style={{ marginRight: 8 }}><Badge size="sm" tone="info">{label}</Badge></span>}
        {post.omschrijving}
        {post.code && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--neutral-400)', fontFamily: 'var(--font-mono, monospace)' }}>
            {post.code}
          </span>
        )}
        {aandeel && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--neutral-400)' }}>({aandeel})</span>}
      </td>
      <td
        title={GRONDSLAG_UITLEG[post.grondslag]}
        style={{
          padding: '6px 12px', fontSize: 13, textAlign: 'right', color: 'var(--neutral-700)',
          borderBottom: RAND, whiteSpace: 'nowrap', cursor: 'help',
        }}
      >
        {fmt(post.verkoop, true)}
      </td>
      <TD>{leeg(post.prognose)}</TD>
      <TD vet kleur={resultaatKleur(post.resultaat)}>{leeg(post.resultaat)}</TD>
      <TD kleur={margeKleur(post.margePct)}>{fmtMarge(post.margePct)}</TD>
    </tr>
  )
}

function SubtotaalRij({ label, s, inspringen, achtergrond = SUBTOTAAL_GRIJS }: {
  label: string; s: Subtotaal; inspringen?: boolean; achtergrond?: string
}) {
  return (
    <tr style={{ background: achtergrond }}>
      <td style={{
        padding: `6px 12px 6px ${inspringen ? 28 : 12}px`, fontSize: 13, fontWeight: 700,
        color: 'var(--neutral-900)', borderBottom: RAND, whiteSpace: 'nowrap',
      }}>
        {label}
      </td>
      <TD vet>{fmt(s.verkoop, true)}</TD>
      <TD vet>{leeg(s.prognose)}</TD>
      <TD vet kleur={resultaatKleur(s.resultaat)}>{leeg(s.resultaat)}</TD>
      <TD vet kleur={margeKleur(s.margePct)}>{fmtMarge(s.margePct)}</TD>
    </tr>
  )
}

export default async function ResultaatPerPostBlok({ dossierId }: { dossierId: string }) {
  const data = await getResultaatPerPost(dossierId, { verbergCorrecties: !(await magCorrecties()) })
  const { aanneemsom: a, meerwerk: m, totaal: t } = data
  const heeftAanneemsom = !!(a.regie || a.hoofd || a.stelposten.length || a.opties.length)
  const zonderPrognose = a.subtotaal.zonderPrognose + m.subtotaal.zonderPrognose

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader>Verwacht resultaat</CardHeader>
      <CardBody style={{ padding: 0 }}>
        {!heeftAanneemsom && m.posten.length === 0 ? (
          <LegeNotitie>
            Niets om te tonen: dit dossier heeft geen aanneemsom, stelposten, goedgekeurd meerwerk of regie.
          </LegeNotitie>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '52%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <TH>Omschrijving</TH>
                <TH right>Verkoop</TH>
                <TH right>Prognose</TH>
                <TH right>Verwacht resultaat</TH>
                <TH right>Marge</TH>
              </tr>
            </thead>
            <tbody>
              {heeftAanneemsom && (
                <>
                  <GroepKop>Aanneemsom</GroepKop>
                  {a.regie && <PostRij post={a.regie} />}
                  {a.hoofd && <PostRij post={a.hoofd} />}
                  {a.stelposten.map(p => <PostRij key={p.sleutel} post={p} inspringen metLabel />)}
                  {a.stelposten.length > 0 && <SubtotaalRij label="Subtotaal stelposten" s={a.subtotaalStelposten} inspringen />}
                  {a.opties.map(p => <PostRij key={p.sleutel} post={p} metLabel />)}
                  <SubtotaalRij label="Subtotaal aanneemsom" s={a.subtotaal} />
                </>
              )}
              {m.posten.length > 0 && (
                <>
                  <GroepKop>Meerwerk</GroepKop>
                  {m.posten.map(p => <PostRij key={p.sleutel} post={p} metLabel />)}
                  <SubtotaalRij label="Subtotaal meerwerk" s={m.subtotaal} />
                </>
              )}
              <SubtotaalRij
                label="Totaal"
                s={{ ...t, zonderPrognose: 0 }}
                achtergrond={TOTAAL_GRIJS}
              />
            </tbody>
          </table>
        )}
        <div style={{
          padding: '12px', fontSize: 11.5, color: 'var(--neutral-500)',
          borderTop: '1px solid var(--neutral-100)', lineHeight: 1.5,
        }}>
          <strong>Prognose</strong> = {data.prognoseBron === 'werkbegroting'
            ? 'de kosten uit de werkbegroting per bewakingscode (kostprijs, zonder opslag).'
            : 'de prognose uit Bouw7 — dit dossier heeft nog geen werkbegroting.'} Een post krijgt de kosten van de
          bewakingscode waarop hij staat; delen meerdere posten één code, dan naar verhouding van hun
          verkoop. Ga met de muis over een verkoopbedrag om te zien hoe het tot stand kwam. Een marge
          onder 20 % staat in rood, tussen 20 en 25 % in oranje.
          {zonderPrognose > 0 && <>
            {' '}{zonderPrognose === 1 ? 'Eén post heeft' : `${zonderPrognose} posten hebben`} geen eigen
            bewakingscode en dus geen prognose (—): die kosten staan op de gewone codes en tellen mee in de
            hoofdaanneemsom. Subtotalen rekenen resultaat en marge alleen over posten mét prognose; het
            totaal is het resultaat van het hele project. Kies op het tabblad Meerwerk op welke code de
            kosten staan, dan krijgt de regel een eigen prognose.
          </>}
        </div>
      </CardBody>
    </Card>
  )
}
