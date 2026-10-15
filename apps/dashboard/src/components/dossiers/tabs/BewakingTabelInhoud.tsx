'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BewakingRegel, BewakingTotalen, DossierBewakingData } from '@/lib/dossiers/actions'
import { Button } from '@/components/ui'
import { BewakingProgressCel } from './VoortgangEditors'
import { ROOD, fmt, TH, TD } from './financieel-ui'

/**
 * De tabel van het blok "Bewaking per bewakingscode" op het Financieel-tab. Client-side omdat
 * de vier kostencomponenten (elk Prognose | Geboekt) samen in en uit te klappen zijn: ingeklapt
 * vallen ze weg en krijgt de bewakingscode-kolom die ruimte. De keuze wordt per browser
 * onthouden, zodat je hem niet bij elk dossier opnieuw maakt.
 */

const fmtPctWaarde = (v: number | null): string => {
  if (v == null) return '—'
  return `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(v)} %`
}

/** Subset dat zowel een regel als het totaal deelt — zo werken de selectors op beide. */
type ComponentBron = Pick<BewakingTotalen,
  | 'arbeidPrognose' | 'arbeidskosten'
  | 'onderaannemingPrognose' | 'onderaanneming'
  | 'materiaalPrognose' | 'materiaal'
  | 'inkoopMaterieelAfvalPrognose' | 'inkoopMaterieelAfval'>

type Component = { kop: string; prognose: (r: ComponentBron) => number; geboekt: (r: ComponentBron) => number }

/**
 * De vier kostencomponenten. Elk krijgt twee smalle subkolommen naast elkaar: Prognose
 * (begroot/verwacht) en Geboekt (arbeid + ontvangen inkoopfacturen). De vier geboekt-kolommen
 * tellen per rij exact op tot de kolom Geboekte kosten — openstaande inkooporders en
 * onderaannemerscontracten zitten er bewust niet in (die staan op het Inkoop-tab).
 */
const COMPONENTEN: Component[] = [
  { kop: 'Arbeid',            prognose: (r) => r.arbeidPrognose,               geboekt: (r) => r.arbeidskosten },
  { kop: 'Onderaanneming',    prognose: (r) => r.onderaannemingPrognose,       geboekt: (r) => r.onderaanneming },
  { kop: 'Materiaal',         prognose: (r) => r.materiaalPrognose,            geboekt: (r) => r.materiaal },
  { kop: 'Inkoop/Mat./Afval', prognose: (r) => r.inkoopMaterieelAfvalPrognose, geboekt: (r) => r.inkoopMaterieelAfval },
]

const OPSLAG_SLEUTEL = 'eva.financieel.bewaking.componenten-ingeklapt'
const COMPONENT_BREEDTE = 5.5 // % per subkolom
const CODE_BREEDTE = 13       // % bewakingscode-kolom als alles uitgeklapt is

/** Linker (bewakingscode) cel — naam afgekapt zodat de rest past. */
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
 * Twee smalle cellen (prognose | geboekt) per zichtbare kostencomponent. In een subtotaal- of
 * totaalregel (`vet`) staat er € 0 in plaats van een streepje — net als in de kolommen ernaast,
 * die daar al `showZero` gebruiken.
 */
const ComponentCellen = ({ zichtbaar, bron, vet, kleur }: {
  zichtbaar: Component[]; bron: ComponentBron; vet?: boolean; kleur?: string
}) => (
  <>
    {zichtbaar.map((c) => (
      <Fragment key={c.kop}>
        <TD compact vet={vet} kleur={kleur} groepStart>{fmt(c.prognose(bron), vet || !!kleur)}</TD>
        <TD compact vet={vet} kleur={kleur}>{fmt(c.geboekt(bron), vet || !!kleur)}</TD>
      </Fragment>
    ))}
  </>
)

const NUL_BRON: ComponentBron = {
  arbeidPrognose: 0, arbeidskosten: 0, onderaannemingPrognose: 0, onderaanneming: 0,
  materiaalPrognose: 0, materiaal: 0, inkoopMaterieelAfvalPrognose: 0, inkoopMaterieelAfval: 0,
}

/** Somt een veld over een lijst regels; ook bruikbaar voor de component-selectors. */
const som = (regels: BewakingRegel[], sel: (r: BewakingRegel) => number) => regels.reduce((s, r) => s + sel(r), 0)

const somBron = (regels: BewakingRegel[]): ComponentBron => ({
  arbeidPrognose: som(regels, (r) => r.arbeidPrognose),
  arbeidskosten: som(regels, (r) => r.arbeidskosten),
  onderaannemingPrognose: som(regels, (r) => r.onderaannemingPrognose),
  onderaanneming: som(regels, (r) => r.onderaanneming),
  materiaalPrognose: som(regels, (r) => r.materiaalPrognose),
  materiaal: som(regels, (r) => r.materiaal),
  inkoopMaterieelAfvalPrognose: som(regels, (r) => r.inkoopMaterieelAfvalPrognose),
  inkoopMaterieelAfval: som(regels, (r) => r.inkoopMaterieelAfval),
})

export function BewakingTabelInhoud({ dossierId, data, bewerkbaar, stand }: {
  dossierId: string
  /** De regel "Stand Bouw7: …"; staat links op dezelfde regel als de inklapknop. */
  stand: React.ReactNode
  data: Pick<DossierBewakingData, 'bouw7Id' | 'hoofdstukken' | 'totalen'>
  bewerkbaar: boolean
}) {
  const [ingeklapt, setIngeklapt] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(OPSLAG_SLEUTEL) === '1') setIngeklapt(true)
    } catch { /* geen opslag beschikbaar — uitgeklapt */ }
  }, [])

  const wissel = () => {
    const nieuw = !ingeklapt
    setIngeklapt(nieuw)
    try { localStorage.setItem(OPSLAG_SLEUTEL, nieuw ? '1' : '0') } catch { /* niet erg */ }
  }

  const zichtbaar = ingeklapt ? [] : COMPONENTEN
  const kolomAantal = 1 + 3 + zichtbaar.length * 2 + 3
  // De ruimte van ingeklapte componenten gaat naar de bewakingscode, zodat lange namen leesbaar worden.
  const codeBreedte = CODE_BREEDTE + (COMPONENTEN.length - zichtbaar.length) * 2 * COMPONENT_BREEDTE

  const t = data.totalen
  const subGroen = 'var(--neutral-50, #f8fafa)'
  const grijs = 'var(--neutral-400)'

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        padding: '18px 18px 0',
      }}>
        {stand}
        <Button size="sm" variant="ghost" aria-expanded={!ingeklapt} onClick={wissel} style={{ marginBottom: 8 }}>
          {ingeklapt ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          {ingeklapt ? 'Alles uitklappen' : 'Alles inklappen'}
        </Button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: `${codeBreedte}%` }} />{/* Bewakingscode */}
          <col style={{ width: '7%' }} />{/* Begroot */}
          <col style={{ width: '6%' }} />{/* Meerwerk */}
          <col style={{ width: '7%' }} />{/* Tot. prognose */}
          {zichtbaar.map((c) => (
            <Fragment key={c.kop}>
              <col style={{ width: `${COMPONENT_BREEDTE}%` }} />{/* prognose */}
              <col style={{ width: `${COMPONENT_BREEDTE}%` }} />{/* geboekt */}
            </Fragment>
          ))}
          <col style={{ width: '7%' }} />{/* Geboekte kosten */}
          <col style={{ width: '7%' }} />{/* Nog te verwachten */}
          <col style={{ width: '6%' }} />{/* % gereed */}
        </colgroup>
        <thead>
          {/* Rij 1: losse koppen (rowspan 2) + component-groepskoppen (colspan 2). */}
          <tr>
            <TH rowSpan={zichtbaar.length ? 2 : 1}>Bewakingscode</TH>
            <TH rowSpan={zichtbaar.length ? 2 : 1} right compact>Begroot</TH>
            <TH rowSpan={zichtbaar.length ? 2 : 1} right compact>Meerwerk</TH>
            <TH rowSpan={zichtbaar.length ? 2 : 1} right compact>Tot. prognose</TH>
            {zichtbaar.map((c) => (
              <TH key={c.kop} colSpan={2} center compact groepKop groepStart>{c.kop}</TH>
            ))}
            <TH rowSpan={zichtbaar.length ? 2 : 1} right compact groepStart>Geboekte kosten</TH>
            <TH rowSpan={zichtbaar.length ? 2 : 1} right compact>Nog te verwachten</TH>
            <TH rowSpan={zichtbaar.length ? 2 : 1} right compact>% gereed</TH>
          </tr>
          {/* Rij 2: per component de subkoppen Prognose | Geboekt. */}
          {zichtbaar.length > 0 && (
            <tr>
              {zichtbaar.map((c) => (
                <Fragment key={c.kop}>
                  <TH right compact groepStart>Progn.</TH>
                  <TH right compact>Geboekt</TH>
                </Fragment>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {/* Nulregel zonder codes: de kolommen blijven staan met € 0, zodat een dossier waar nog
              niets op geboekt is dezelfde opmaak houdt als een lopend project. */}
          {data.hoofdstukken.length === 0 && (
            <tr>
              <CodeCel code={null} naam="—" />
              <TD compact kleur={grijs}>{fmt(0, true)}</TD>
              <TD compact kleur={grijs}>{fmt(0, true)}</TD>
              <TD compact kleur={grijs}>{fmt(0, true)}</TD>
              <ComponentCellen zichtbaar={zichtbaar} bron={NUL_BRON} kleur={grijs} />
              <TD compact kleur={grijs} groepStart>{fmt(0, true)}</TD>
              <TD compact kleur={grijs}>{fmt(0, true)}</TD>
              <TD compact kleur={grijs}>0 %</TD>
            </tr>
          )}
          {data.hoofdstukken.map((h) => (
            <Fragment key={`h-${h.id}-${h.naam}`}>
              <tr>
                <td colSpan={kolomAantal} style={{
                  padding: '10px 8px 4px', fontSize: 11, fontWeight: 700,
                  color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '1px solid var(--neutral-200)',
                }}>
                  {h.naam}
                </td>
              </tr>
              {h.regels.map((r, i) => (
                <tr key={`${r.hoofdstukId}-${r.code ?? i}`}>
                  <CodeCel code={r.code} naam={r.naam} />
                  <TD compact>{fmt(r.begroot)}</TD>
                  <TD compact>{fmt(r.meerwerk)}</TD>
                  <TD compact>{fmt(r.prognose)}</TD>
                  <ComponentCellen zichtbaar={zichtbaar} bron={r} />
                  <TD compact accent={r.geboekteKosten > 0} groepStart>{fmt(r.geboekteKosten)}</TD>
                  <TD compact kleur={r.prognose - r.geboekteKosten < 0 ? ROOD : undefined}>{fmt(r.prognose - r.geboekteKosten)}</TD>
                  <TD compact>
                    {bewerkbaar && r.code && r.code !== '-'
                      ? <BewakingProgressCel dossierId={dossierId} bouw7Id={data.bouw7Id} code={r.code} hoofdstukId={r.hoofdstukId} initial={r.progress} />
                      : fmtPctWaarde(r.progress)}
                  </TD>
                </tr>
              ))}
              <tr style={{ background: subGroen }}>
                <CodeCel code={null} naam={`Subtotaal ${h.naam}`} vet achtergrond={subGroen} />
                <TD compact vet>{fmt(som(h.regels, (r) => r.begroot), true)}</TD>
                <TD compact vet>{fmt(som(h.regels, (r) => r.meerwerk), true)}</TD>
                <TD compact vet>{fmt(som(h.regels, (r) => r.prognose), true)}</TD>
                <ComponentCellen zichtbaar={zichtbaar} bron={somBron(h.regels)} vet />
                <TD compact vet groepStart>{fmt(som(h.regels, (r) => r.geboekteKosten))}</TD>
                <TD compact vet kleur={som(h.regels, (r) => r.prognose - r.geboekteKosten) < 0 ? ROOD : undefined}>{fmt(som(h.regels, (r) => r.prognose - r.geboekteKosten))}</TD>
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
            <ComponentCellen zichtbaar={zichtbaar} bron={t} vet />
            <TD compact vet accent={t.geboekteKosten > 0} groepStart>{fmt(t.geboekteKosten, true)}</TD>
            <TD compact vet kleur={t.prognose - t.geboekteKosten < 0 ? ROOD : undefined}>{fmt(t.prognose - t.geboekteKosten, true)}</TD>
            <TD compact>—</TD>
          </tr>
        </tbody>
      </table>
    </>
  )
}
