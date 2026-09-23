'use client'

/**
 * "Onderaannemerscontract maken" op een servicedeskbon: regels typen en versturen, in één venster.
 *
 * Hiervóór sprong die knop naar de werkbegroting. Daar stel je regels samen in een grid dat voor
 * een opdracht van drie ton is gebouwd — kolommen voor normuren, opslagen, hoofdstukken — terwijl
 * een bon meestal één regel heeft: "lekkage dakgoot verhelpen, € 450". Dat grid is niet te klein
 * te maken zonder het voor opdrachten onbruikbaar te maken, dus staat er hier een eigen venster.
 *
 * **Onder water blijft het dezelfde weg.** De getypte regels worden gewone werkbegrotingregels op
 * de vaste kostengroep van de bon, gaan via `stuurWerkbegrotingBestelregelsBouw7` als bestelregels
 * naar Bouw7 en worden daarna met `maakBestellingInBouw7` een contract. Geen tweede route naar
 * Bouw7 dus, en geen tweede plek waar de poortwachters (accorderen, verouderd, al besteld) langs
 * moeten komen. Open je later de werkbegroting, dan staan de regels er gewoon in.
 *
 * Drie stappen in één venster: regels → opdracht (het bestaande `OpdrachtVenster`, met datums,
 * betaalschema en de regieoptie) → mail. De middelste is bewust niet nagebouwd: een opdracht aan
 * een onderaannemer is een overeenkomst, en die afspraken horen overal hetzelfde te zijn.
 */

import React, { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import RelatieZoekveld from '@/components/everts-calc/werkbegroting/RelatieZoekveld'
import OpdrachtVenster, { type OpdrachtGegevens } from '@/components/everts-calc/werkbegroting/OpdrachtVenster'
import { nieuweId } from '@/lib/everts-calc/utils'
import { parseGetal, formatEuro } from '@/lib/everts-calc/calculations'
import {
  maakStandaardScenario, maakWerkbegrotingVanCalculatie,
  slaWerkbegrotingRegelOp, slaWerkbegrotingComponentOp, slaBestellingOp,
  getWerkbegrotingRegels, getWerkbegrotingComponenten, getWerkbegrotingWijzigingen,
} from '@/lib/everts-calc/local-store'
import type { WerkbegrotingBestelling } from '@/lib/everts-calc/types'
import { stuurWerkbegrotingBestelregelsBouw7 } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import {
  maakBestellingInBouw7, getBestellingMailConcept, verstuurBestelling,
} from '@/app/(platform)/everts-calc/actions/bestellingen'

type Soort = 'oa_contract' | 'inkooporder'
type Regel = { id: string; omschrijving: string; aantal: string; eenheid: string; prijs: string }

const nieuweRegel = (): Regel => ({ id: nieuweId(), omschrijving: '', aantal: '1', eenheid: 'post', prijs: '' })

const veld = 'w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm ' +
  'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100'
const kop = 'mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500'

export default function BestelVenster({
  dossierId, calcProjectId, kostengroep, onSluit, onKlaar,
}: {
  dossierId: string
  /** Het gekoppelde calculatieproject, of null: dan krijgt de bon zijn eigen lege werkbegroting. */
  calcProjectId: string | null
  /** De vaste kostengroep van de bon; hierop landen de regels. */
  kostengroep: { code: string; naam: string } | null
  onSluit: () => void
  onKlaar: () => void
}) {
  const [stap, setStap] = useState<'regels' | 'mail'>('regels')
  const [opdrachtOpen, setOpdrachtOpen] = useState(false)
  const [bezig, setBezig] = useState(false)

  const [soort, setSoort] = useState<Soort>('oa_contract')
  const [relatie, setRelatie] = useState<{ id: string; naam: string } | null>(null)
  const [regels, setRegels] = useState<Regel[]>([nieuweRegel()])

  const [bestelling, setBestelling] = useState<WerkbegrotingBestelling | null>(null)
  const [mail, setMail] = useState({ to: '', cc: '', onderwerp: '', bericht: '' })

  const gevuld = useMemo(
    () => regels.filter(r => r.omschrijving.trim() && parseGetal(r.prijs) !== 0),
    [regels],
  )
  const totaal = useMemo(
    () => gevuld.reduce((s, r) => s + parseGetal(r.aantal) * parseGetal(r.prijs), 0),
    [gevuld],
  )

  const zetRegel = (id: string, veldNaam: keyof Regel, waarde: string) =>
    setRegels(rs => rs.map(r => (r.id === id ? { ...r, [veldNaam]: waarde } : r)))

  function naarOpdracht() {
    if (!relatie) { toast.error(soort === 'oa_contract' ? 'Kies een onderaannemer.' : 'Kies een leverancier.'); return }
    if (gevuld.length === 0) { toast.error('Vul minstens één regel met een omschrijving en een bedrag in.'); return }
    if (!kostengroep) {
      toast.error('Deze bon heeft nog geen kostengroep. Ververs het dossier vanuit Bouw7 en probeer het opnieuw.')
      return
    }
    setOpdrachtOpen(true)
  }

  /**
   * De regels vastleggen en er een concept-contract van maken in Bouw7.
   *
   * Drie stappen die niet los van elkaar kunnen: de regels moeten in de werkbegroting staan vóór
   * ze als bestelregel naar Bouw7 kunnen, en ze moeten dáár staan vóór er een contract omheen kan
   * — Bouw7 hangt een contracttermijn aan een bestaande bestelregel.
   */
  async function maakOpdracht(g: OpdrachtGegevens) {
    if (!relatie || !kostengroep) return
    setBezig(true)
    try {
      // 1. Werkbegroting van de bon: de bestaande bij een gekoppelde calculatie, anders de eigen
      //    lege op een synthetisch project — hetzelfde id dat het Werkbegroting-scherm gebruikt,
      //    zodat het daar dezelfde begroting is en geen tweede.
      const projectId = calcProjectId ?? `wb-direct-${dossierId}`
      const scenario = maakStandaardScenario(projectId)
      const wb = maakWerkbegrotingVanCalculatie(projectId, scenario.id)

      // 2. Eén regel met de opdracht erop, en daaronder een component per getypte regel. De
      //    hoeveelheid van de regel blijft 1: het aantal staat op de component, en de bestelregel
      //    rekent aantal × prijs uit regel.hoeveelheid × component.norm_hoeveelheid.
      const bestaandeRegels = getWerkbegrotingRegels(wb.id)
      const wbRegelId = nieuweId()
      slaWerkbegrotingRegelOp({
        id: wbRegelId,
        werkbegroting_id: wb.id,
        source_calculatieregel_id: null,
        groep_id: '',
        omschrijving: g.omschrijving.trim() || relatie.naam,
        hoeveelheid: 1,
        eenheid: 'post',
        kostengroep: `${kostengroep.code} — ${kostengroep.naam}`,
        volgorde: bestaandeRegels.length + 1,
      })

      const componentIds: string[] = []
      for (const r of gevuld) {
        const id = nieuweId()
        componentIds.push(id)
        slaWerkbegrotingComponentOp({
          id,
          werkbegroting_regel_id: wbRegelId,
          source_component_id: null,
          // Onderaanneming en materiaal zijn in Bouw7 verschillende kostensoorten én verschillende
          // documenten; `maakBestellingInBouw7` leidt daar het soort uit af.
          type: soort === 'oa_contract' ? 'onderaanneming' : 'materieel',
          norm_hoeveelheid: parseGetal(r.aantal) || 1,
          eenheid: r.eenheid.trim() || 'post',
          tarief: parseGetal(r.prijs),
          omschrijving: r.omschrijving.trim(),
          relatie_id: relatie.id,
          leverancier_naam: relatie.naam,
        })
      }

      const payload = {
        wb,
        regels: getWerkbegrotingRegels(wb.id),
        componenten: getWerkbegrotingComponenten().filter(c =>
          getWerkbegrotingRegels(wb.id).some(r => r.id === c.werkbegroting_regel_id)),
        wijzigingen: getWerkbegrotingWijzigingen().filter(w => w.werkbegroting_id === wb.id),
        dossierId,
      }

      // 3. Bestelregels naar Bouw7. Ontbrekende PSL's maakt deze stap zelf aan.
      const push = await stuurWerkbegrotingBestelregelsBouw7(dossierId, payload)
      if (!push.ok) { toast.error(`Bestelregels naar Bouw7 sturen mislukt: ${push.error}`); return }

      const b: WerkbegrotingBestelling = {
        id: nieuweId(),
        werkbegroting_id: wb.id,
        omschrijving: g.omschrijving.trim() || relatie.naam,
        status: 'concept',
        relatie_id: relatie.id,
        component_ids: componentIds,
        soort,
        levering_datum: g.leveringDatum.trim() || null,
        levering_tekst: g.leveringTekst.trim() || null,
        oplever_datum: g.opleverDatum.trim() || null,
        betaalafspraak: g.betaalafspraak.trim() || null,
        termijnschema: g.termijnschema,
        afspraken: g.afspraken.trim() || null,
        inhouding_pct: g.inhoudingPct,
        boete_tekst: g.boeteTekst.trim() || null,
        werkadres: g.werkadres.trim() || null,
        interne_notitie: g.interneNotitie.trim() || null,
        sjabloon_id: g.sjabloonId,
        is_reservering: false,
      }
      slaBestellingOp(b)

      const res = await maakBestellingInBouw7(dossierId, b, payload)
      if (!res.ok) {
        if (res.reden === 'niet_goedgekeurd') toast.error(`Niet geaccordeerd: ${(res.regels ?? []).join(', ')}`)
        else toast.error(res.error, { duration: 8000 })
        return
      }

      const metContract = { ...b, bouw7_contract_id: res.contractId, bouw7_nummer: res.nummer }
      slaBestellingOp(metContract)
      setBestelling(metContract)
      setOpdrachtOpen(false)
      toast.success(`${res.nummer ?? 'Opdracht'} staat als concept in Bouw7 — verstuur hem nu`)

      // Mailconcept meteen ophalen; faalt dat, dan blijft de stap gewoon staan met lege velden.
      try {
        const c = await getBestellingMailConcept(dossierId, metContract.id, metContract.sjabloon_id ?? null)
        setMail({ to: c.to, cc: '', onderwerp: c.onderwerp, bericht: c.bericht })
      } catch { /* leeg concept is werkbaar */ }
      setStap('mail')
      onKlaar()
    } finally {
      setBezig(false)
    }
  }

  async function verstuur() {
    if (!bestelling) return
    if (!mail.to.trim()) { toast.error('Vul het e-mailadres van de partij in.'); return }
    setBezig(true)
    try {
      const res = await verstuurBestelling(dossierId, bestelling.id, { ...mail, sjabloonId: bestelling.sjabloon_id ?? null })
      if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
      slaBestellingOp({ ...bestelling, status: 'verzonden', verstuurd_op: new Date().toISOString(), bouw7_bonnummer: res.bonnummer })
      toast.success(res.bonWaarschuwing
        ? `Verstuurd, maar de leverbon niet aangemaakt: ${res.bonWaarschuwing}`
        : 'Verstuurd')
      onKlaar()
      onSluit()
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={onSluit}>
        <div
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl rounded-xl border border-neutral-200 bg-white p-5 shadow-lg
                     dark:border-neutral-700 dark:bg-neutral-900"
        >
          <h2 className="mb-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {stap === 'mail' ? 'Opdracht versturen' : 'Opdracht uitzetten'}
          </h2>
          <p className="mb-4 text-[11.5px] text-neutral-500">
            {stap === 'mail'
              ? `${bestelling?.bouw7_nummer ?? 'De opdracht'} staat als concept in Bouw7.`
              : kostengroep
                ? `De regels komen op kostengroep ${kostengroep.code} van deze bon.`
                : 'Deze bon heeft nog geen kostengroep.'}
          </p>

          {stap === 'regels' ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <label>
                  <span className={kop}>Soort</span>
                  <select
                    value={soort}
                    onChange={e => { setSoort(e.target.value as Soort); setRelatie(null) }}
                    className={veld}
                  >
                    <option value="oa_contract">Opdracht aan onderaannemer</option>
                    <option value="inkooporder">Bestelling bij leverancier</option>
                  </select>
                </label>
                <div>
                  <span className={kop}>{soort === 'oa_contract' ? 'Onderaannemer' : 'Leverancier'}</span>
                  <RelatieZoekveld
                    type={soort === 'oa_contract' ? 'onderaannemer' : 'leverancier'}
                    relatieId={relatie?.id}
                    relatieNaam={relatie?.naam}
                    onSelecteer={(id, naam) => setRelatie({ id, naam })}
                    onWis={() => setRelatie(null)}
                  />
                </div>
              </div>

              <span className={kop}>Regels</span>
              <div className="mb-2 space-y-1.5">
                {regels.map(r => (
                  <div key={r.id} className="grid grid-cols-[1fr_70px_80px_100px_28px] items-center gap-1.5">
                    <input
                      value={r.omschrijving} onChange={e => zetRegel(r.id, 'omschrijving', e.target.value)}
                      placeholder="Wat doet de partij?" className={veld}
                    />
                    <input
                      value={r.aantal} onChange={e => zetRegel(r.id, 'aantal', e.target.value)}
                      inputMode="decimal" className={`${veld} text-right`} aria-label="Aantal"
                    />
                    <input
                      value={r.eenheid} onChange={e => zetRegel(r.id, 'eenheid', e.target.value)}
                      className={veld} aria-label="Eenheid"
                    />
                    <input
                      value={r.prijs} onChange={e => zetRegel(r.id, 'prijs', e.target.value)}
                      inputMode="decimal" placeholder="prijs" className={`${veld} text-right`} aria-label="Stukprijs"
                    />
                    <button
                      type="button"
                      onClick={() => setRegels(rs => (rs.length === 1 ? [nieuweRegel()] : rs.filter(x => x.id !== r.id)))}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                      aria-label="Regel verwijderen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setRegels(rs => [...rs, nieuweRegel()])}
                  className="flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Regel erbij
                </button>
                <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                  {formatEuro(totaal)}
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onSluit} disabled={bezig}>Annuleren</Button>
                <Button variant="primary" onClick={naarOpdracht} disabled={bezig}>Volgende</Button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <label>
                  <span className={kop}>Aan</span>
                  <input value={mail.to} onChange={e => setMail(m => ({ ...m, to: e.target.value }))} className={veld} />
                </label>
                <label>
                  <span className={kop}>Cc</span>
                  <input value={mail.cc} onChange={e => setMail(m => ({ ...m, cc: e.target.value }))} className={veld} />
                </label>
              </div>
              <label className="mb-3 block">
                <span className={kop}>Onderwerp</span>
                <input value={mail.onderwerp} onChange={e => setMail(m => ({ ...m, onderwerp: e.target.value }))} className={veld} />
              </label>
              <label className="mb-4 block">
                <span className={kop}>Bericht</span>
                <textarea
                  value={mail.bericht} onChange={e => setMail(m => ({ ...m, bericht: e.target.value }))}
                  rows={6} className={veld}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onSluit} disabled={bezig}>Later versturen</Button>
                <Button variant="primary" onClick={verstuur} loading={bezig} disabled={bezig}>Versturen</Button>
              </div>
            </>
          )}
        </div>
      </div>

      {opdrachtOpen && (
        <OpdrachtVenster
          soort={soort}
          relatieNaam={relatie?.naam ?? ''}
          aantalRegels={gevuld.length}
          totaal={totaal}
          sjablonen={[]}
          bezig={bezig}
          begin={{
            omschrijving: gevuld[0]?.omschrijving.trim() ?? '',
            leveringTekst: '', leveringDatum: '', opleverDatum: '', werkadres: '',
            betaalafspraak: '', termijnschema: null, inhoudingPct: null, boeteTekst: '',
            afspraken: '', interneNotitie: '', sjabloonId: null,
          }}
          onSluit={() => setOpdrachtOpen(false)}
          onBevestig={maakOpdracht}
        />
      )}
    </>
  )
}
