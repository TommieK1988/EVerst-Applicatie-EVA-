import { magCorrecties } from '@/lib/dossiers/correctie-bewakingscode'
import { getResultaatPerPost } from '@/lib/dossiers/resultaat-per-code-laden'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { LegeNotitie } from './tab-ui'
import { TH } from './financieel-ui'
import { GroepKop, PostRij, SubtotaalRij, TOTAAL_GRIJS } from './resultaat-rijen'
import HoofdopdrachtRijen from './HoofdopdrachtRijen'

/**
 * Verwacht resultaat per post: de hoofdopdracht met daaronder de stelposten die erin zitten,
 * dan elke meerwerkregel en elke aanvullende stelpost, met subtotalen en het projecttotaal.
 */

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
                  <GroepKop>Hoofdopdracht</GroepKop>
                  {a.regie && <PostRij post={a.regie} />}
                  {a.hoofd && <HoofdopdrachtRijen post={a.hoofd} />}
                  {a.stelposten.map(p => <PostRij key={p.sleutel} post={p} inspringen metLabel />)}
                  {a.stelposten.length > 0 && <SubtotaalRij label="Subtotaal stelposten" s={a.subtotaalStelposten} inspringen />}
                  {a.opties.map(p => <PostRij key={p.sleutel} post={p} metLabel />)}
                  <SubtotaalRij label="Subtotaal hoofdopdracht" s={a.subtotaal} />
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
          onder 20 % staat in rood, tussen 20 en 25 % in oranje. Klap de Hoofdopdracht uit om te zien uit
          welke bewakingscodes zijn prognose bestaat: eerst de codes die je in de werkbegroting aan de
          Hoofdopdracht hebt gekoppeld, dan de codes die nog niet gekoppeld zijn. Koppelen verandert geen
          bedrag.
          {zonderPrognose > 0 && <>
            {' '}{zonderPrognose === 1 ? 'Eén post heeft' : `${zonderPrognose} posten hebben`} geen eigen
            bewakingscode en dus geen prognose (—): die kosten staan op de gewone codes en tellen mee in de
            hoofdopdracht. Subtotalen rekenen resultaat en marge alleen over posten mét prognose; het
            totaal is het resultaat van het hele project. Kies op het tabblad Meerwerk op welke code de
            kosten staan, dan krijgt de regel een eigen prognose.
          </>}
        </div>
      </CardBody>
    </Card>
  )
}
