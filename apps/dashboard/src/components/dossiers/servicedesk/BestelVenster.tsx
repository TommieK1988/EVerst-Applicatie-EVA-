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
 * **Mandaat per regel.** Bij een onderaannemer geef je per regel aan of het een vaste prijs is of
 * een mandaat (regie, met het bedrag als bovengrens). Mandaatregels gaan op een eigen opdrachtbon
 * met de vaste mandaatteksten (`lib/everts-calc/mandaat.ts`): één bon die zowel een aanneemsom
 * als een bovengrens bevat, leest een onderaannemer onvermijdelijk als één groot vast bedrag.
 * Staan er beide soorten regels, dan maakt dit venster twee opdrachten na elkaar.
 *
 * Stappen per opdracht: regels → opdracht (het bestaande `OpdrachtVenster`, met datums,
 * betaalschema en regie) → mail. De middelste is bewust niet nagebouwd: een opdracht aan een
 * onderaannemer is een overeenkomst, en die afspraken horen overal hetzelfde te zijn.
 *
 * Dit venster voegt alléén toe aan de werkbegroting en stuurt daarom alleen zijn eigen regel mee
 * naar de server — zie `NIETS_GEZIEN`. Zou het de hele begroting meesturen, dan moest die eerst
 * volledig geladen zijn; een halve lijst zet de rest server-side op verwijderd.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import RelatieZoekveld from '@/components/everts-calc/werkbegroting/RelatieZoekveld'
import OpdrachtVenster, { type OpdrachtGegevens } from '@/components/everts-calc/werkbegroting/OpdrachtVenster'
import { nieuweId } from '@/lib/everts-calc/utils'
import { parseGetal, formatEuro } from '@/lib/everts-calc/calculations'
import { hydrateCalculatie, getScenarios } from '@/lib/everts-calc/local-store'
import type {
  Werkbegroting, WerkbegrotingRegel, WerkbegrotingComponent, WerkbegrotingBestelling,
} from '@/lib/everts-calc/types'
import {
  stuurWerkbegrotingBestelregelsBouw7, laadWerkbegrotingSnapshot, type WerkbegrotingPayload,
} from '@/app/(platform)/everts-calc/actions/werkbegroting'
import { laadCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import {
  maakBestellingInBouw7, getBestellingMailConcept, verstuurBestelling,
} from '@/app/(platform)/everts-calc/actions/bestellingen'
import { getInkoopSjablonen, type SjabloonKeuze } from '@/app/(platform)/everts-calc/actions/bestelling-document'

type Soort = 'oa_contract' | 'inkooporder'
type Regel = { id: string; omschrijving: string; aantal: string; eenheid: string; prijs: string; mandaat: boolean }
type Groep = { sleutel: 'vast' | 'mandaat'; regels: Regel[]; totaal: number }

/**
 * Wat er per opdracht al is vastgelegd. Nodig voor een tweede poging na een fout: dezelfde ids
 * betekenen bijwerken in Bouw7 in plaats van een tweede set bestelregels ernaast.
 */
type Concept = {
  wbRegelId: string
  volgorde: number
  bestellingId: string
  /** Per getypte regel (Regel.id) het component dat ervan is gemaakt, mét zijn bouw7_line_id. */
  componenten: Map<string, WerkbegrotingComponent>
}

/**
 * `geladenOp` voor de sync: "deze client heeft niets van de bestaande werkbegroting gezien".
 * De sync zet alleen rijen op verwijderd die vóór `geladenOp` bestonden en niet in de payload
 * staan; met dit tijdstip zijn dat er nul. Precies waar: dit venster voegt alleen toe.
 */
const NIETS_GEZIEN = '1970-01-01T00:00:00.000Z'

const nieuweRegel = (): Regel => ({
  id: nieuweId(), omschrijving: '', aantal: '1', eenheid: 'post', prijs: '', mandaat: false,
})

const regelBedrag = (r: Regel) => parseGetal(r.aantal) * parseGetal(r.prijs)

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
  const [stap, setStap] = useState<'regels' | 'opdracht' | 'mail'>('regels')
  const [bezig, setBezig] = useState(false)

  const [soort, setSoort] = useState<Soort>('oa_contract')
  const [relatie, setRelatie] = useState<{ id: string; naam: string } | null>(null)
  const [regels, setRegels] = useState<Regel[]>([nieuweRegel()])
  const [sjablonen, setSjablonen] = useState<SjabloonKeuze[]>([])

  /** De opdrachten die uit de regels volgen, vastgezet bij "Volgende". */
  const [groepen, setGroepen] = useState<Groep[]>([])
  const [huidig, setHuidig] = useState(0)

  const [bestelling, setBestelling] = useState<WerkbegrotingBestelling | null>(null)
  const [mail, setMail] = useState({ to: '', cc: '', onderwerp: '', bericht: '' })

  const wbRef = useRef<{ wb: Werkbegroting; volgendeVolgorde: number } | null>(null)
  const concepten = useRef<Partial<Record<Groep['sleutel'], Concept>>>({})
  /** Opdrachten die al in Bouw7 staan; terug naar de regels kan dan niet meer. */
  const aangemaakt = useRef(new Set<Groep['sleutel']>())

  const isOa = soort === 'oa_contract'

  // Sjablonen voor de opmaak van de opdrachtbon. Een mandaatopdracht krijgt het sjabloon met
  // "mandaat" of "regie" in de naam als dat er is — zo kan beheer er een eigen opdrachtbon voor
  // maken zonder dat hier iets verandert.
  useEffect(() => {
    let actief = true
    getInkoopSjablonen(soort, dossierId)
      .then(l => { if (actief) setSjablonen(l.filter(s => s.heeftTemplate)) })
      .catch(() => { if (actief) setSjablonen([]) })
    return () => { actief = false }
  }, [soort, dossierId])

  const gevuld = useMemo(
    () => regels.filter(r => r.omschrijving.trim() && parseGetal(r.prijs) !== 0),
    [regels],
  )
  const totaalVast = useMemo(
    () => gevuld.filter(r => !(isOa && r.mandaat)).reduce((s, r) => s + regelBedrag(r), 0),
    [gevuld, isOa],
  )
  const totaalMandaat = useMemo(
    () => (isOa ? gevuld.filter(r => r.mandaat).reduce((s, r) => s + regelBedrag(r), 0) : 0),
    [gevuld, isOa],
  )
  const heeftMandaat = isOa && gevuld.some(r => r.mandaat)
  const gemengd = heeftMandaat && gevuld.some(r => !r.mandaat)

  const zetRegel = <K extends keyof Regel>(id: string, veldNaam: K, waarde: Regel[K]) =>
    setRegels(rs => rs.map(r => (r.id === id ? { ...r, [veldNaam]: waarde } : r)))

  const groep = groepen[huidig] ?? null
  const volgnummer = groepen.length > 1 ? `${huidig + 1} van ${groepen.length}` : null

  function naarOpdracht() {
    if (!relatie) { toast.error(isOa ? 'Kies een onderaannemer.' : 'Kies een leverancier.'); return }
    if (gevuld.length === 0) { toast.error('Vul minstens één regel met een omschrijving en een bedrag in.'); return }
    if (!kostengroep) {
      toast.error('Deze bon heeft nog geen kostengroep. Ververs het dossier vanuit Bouw7 en probeer het opnieuw.')
      return
    }
    const vast = gevuld.filter(r => !(isOa && r.mandaat))
    const mandaat = isOa ? gevuld.filter(r => r.mandaat) : []
    if (mandaat.length > 0 && totaalMandaat <= 0) { toast.error('Een mandaat moet een positief bedrag hebben.'); return }
    const lijst: Groep[] = [
      ...(vast.length > 0 ? [{ sleutel: 'vast' as const, regels: vast, totaal: totaalVast }] : []),
      ...(mandaat.length > 0 ? [{ sleutel: 'mandaat' as const, regels: mandaat, totaal: totaalMandaat }] : []),
    ]
    setGroepen(lijst)
    setHuidig(0)
    setStap('opdracht')
  }

  /**
   * De werkbegroting van deze bon: de bestaande uit Supabase, of een nieuwe lege. Alleen de kop
   * is nodig — dit venster voegt een regel toe en raakt de rest niet aan.
   */
  async function werkbegroting(): Promise<{ wb: Werkbegroting; volgendeVolgorde: number }> {
    if (wbRef.current) return wbRef.current
    const snap = await laadWerkbegrotingSnapshot(dossierId)
    if (snap) {
      const hoogste = snap.regels.reduce((m, r) => Math.max(m, r.volgorde ?? 0), 0)
      wbRef.current = { wb: snap.wb, volgendeVolgorde: hoogste + 1 }
      return wbRef.current
    }

    // Nog geen werkbegroting. Hang hem aan het scenario van de gekoppelde calculatie als die er
    // is; anders aan het synthetische project dat het Werkbegroting-scherm ook gebruikt.
    const projectId = calcProjectId ?? `wb-direct-${dossierId}`
    let scenarioId = nieuweId()
    if (calcProjectId) {
      try {
        const calc = await laadCalculatieSnapshot(calcProjectId)
        if (calc) {
          hydrateCalculatie(calcProjectId, calc)
          const scenarios = getScenarios(calcProjectId)
          scenarioId = (scenarios.find(s => s.is_standaard) ?? scenarios[0])?.id ?? scenarioId
        }
      } catch { /* zonder calculatie een eigen scenario-id; de werkbegroting werkt net zo */ }
    }
    const nu = new Date().toISOString()
    wbRef.current = {
      wb: {
        id: nieuweId(), project_id: projectId, scenario_id: scenarioId,
        naam: 'Werkbegroting', status: 'concept', aangemaakt_op: nu, bijgewerkt_op: nu,
      },
      volgendeVolgorde: 1,
    }
    return wbRef.current
  }

  /**
   * De regels vastleggen en er een concept-contract van maken in Bouw7.
   *
   * Drie stappen die niet los van elkaar kunnen: de regels moeten in de werkbegroting staan vóór
   * ze als bestelregel naar Bouw7 kunnen, en ze moeten dáár staan vóór er een contract omheen kan
   * — Bouw7 hangt een contracttermijn aan een bestaande bestelregel.
   */
  async function maakOpdracht(g: OpdrachtGegevens) {
    if (!groep || !relatie || !kostengroep) return
    setBezig(true)
    try {
      const { wb, volgendeVolgorde } = await werkbegroting()

      // 1. Eén werkbegrotingregel per opdracht, met een component per getypte regel. De
      //    hoeveelheid van de regel blijft 1: het aantal staat op de component, en de bestelregel
      //    rekent aantal × prijs uit regel.hoeveelheid × component.norm_hoeveelheid.
      let concept = concepten.current[groep.sleutel]
      if (!concept) {
        concept = { wbRegelId: nieuweId(), volgorde: volgendeVolgorde, bestellingId: nieuweId(), componenten: new Map() }
        concepten.current[groep.sleutel] = concept
        wbRef.current = { wb, volgendeVolgorde: volgendeVolgorde + 1 }
      }
      const omschrijving = g.omschrijving.trim() || relatie.naam

      const wbRegel: WerkbegrotingRegel = {
        id: concept.wbRegelId,
        werkbegroting_id: wb.id,
        source_calculatieregel_id: null,
        groep_id: '',
        omschrijving,
        hoeveelheid: 1,
        eenheid: 'post',
        kostengroep: `${kostengroep.code} — ${kostengroep.naam}`,
        volgorde: concept.volgorde,
      }

      const componenten: WerkbegrotingComponent[] = []
      for (const r of groep.regels) {
        const vorig = concept.componenten.get(r.id)
        const comp: WerkbegrotingComponent = {
          id: vorig?.id ?? nieuweId(),
          werkbegroting_regel_id: wbRegel.id,
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
          ...(vorig?.bouw7_line_id != null ? { bouw7_line_id: vorig.bouw7_line_id } : {}),
        }
        concept.componenten.set(r.id, comp)
        componenten.push(comp)
      }
      // Regels die bij een eerdere poging meegingen en nu weg zijn: als verwijderd meesturen, dan
      // zet de push ze in Bouw7 op nul in plaats van ze te laten staan.
      const huidigeIds = new Set(groep.regels.map(r => r.id))
      for (const [regelId, comp] of concept.componenten) {
        if (!huidigeIds.has(regelId)) componenten.push({ ...comp, is_verwijderd: true })
      }

      const payload: WerkbegrotingPayload = {
        wb, regels: [wbRegel], componenten, wijzigingen: [], dossierId, geladenOp: NIETS_GEZIEN,
      }

      // 2. Bestelregels naar Bouw7. Ontbrekende PSL's maakt deze stap zelf aan.
      const push = await stuurWerkbegrotingBestelregelsBouw7(dossierId, payload)

      // De Bouw7-ids terugzetten, óók na een halve mislukking: zonder die ids zou de volgende
      // sync (hieronder, of bij een nieuwe poging) de kolom op leeg zetten.
      for (const c of payload.componenten) {
        const lineId = push.lineIdPerComponent[c.id]
        if (lineId != null) c.bouw7_line_id = lineId
        if (push.gewisteComponenten.includes(c.id)) delete c.bouw7_line_id
      }
      if (!push.ok) { toast.error(`Bestelregels naar Bouw7 sturen mislukt: ${push.error}`, { duration: 8000 }); return }
      if (push.fouten.length > 0) toast.error(push.fouten.join('\n'), { duration: 8000 })

      // 3. Het contract.
      const b: WerkbegrotingBestelling = {
        id: concept.bestellingId,
        werkbegroting_id: wb.id,
        omschrijving,
        status: 'concept',
        relatie_id: relatie.id,
        component_ids: groep.regels.map(r => concept.componenten.get(r.id)!.id),
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
        mandaat_bedrag: g.mandaatBedrag,
      }

      const res = await maakBestellingInBouw7(dossierId, b, payload)
      if (!res.ok) {
        if (res.reden === 'niet_goedgekeurd') toast.error(`Niet geaccordeerd: ${(res.regels ?? []).join(', ')}`, { duration: 8000 })
        else toast.error(res.error, { duration: 8000 })
        return
      }

      aangemaakt.current.add(groep.sleutel)
      const metContract = { ...b, bouw7_contract_id: res.contractId, bouw7_nummer: res.nummer }
      setBestelling(metContract)
      toast.success(`${res.nummer ?? 'Opdracht'} staat als concept in Bouw7 — verstuur hem nu`)

      // Mailconcept meteen ophalen; faalt dat, dan blijft de stap gewoon staan met lege velden.
      try {
        const c = await getBestellingMailConcept(dossierId, metContract.id, metContract.sjabloon_id ?? null)
        setMail({ to: c.to, cc: '', onderwerp: c.onderwerp, bericht: c.bericht })
      } catch {
        setMail({ to: '', cc: '', onderwerp: '', bericht: '' })
      }
      setStap('mail')
      onKlaar()
    } catch (e) {
      toast.error(`Opdracht aanmaken mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}`, { duration: 8000 })
    } finally {
      setBezig(false)
    }
  }

  /** Door naar de volgende opdracht uit dit venster, of klaar. */
  function volgende() {
    if (huidig + 1 < groepen.length) {
      setHuidig(huidig + 1)
      setBestelling(null)
      setStap('opdracht')
    } else {
      onSluit()
    }
  }

  function sluitOpdrachtVenster() {
    // Staat er al een opdracht in Bouw7, dan kunnen de regels niet meer terug: die zijn besteld.
    if (aangemaakt.current.size > 0) {
      if (groep && !aangemaakt.current.has(groep.sleutel)) {
        toast(`De ${groep.sleutel === 'mandaat' ? 'mandaatopdracht' : 'opdracht'} is niet aangemaakt.`)
      }
      onSluit()
      return
    }
    setStap('regels')
  }

  async function verstuur() {
    if (!bestelling) return
    if (!mail.to.trim()) { toast.error('Vul het e-mailadres van de partij in.'); return }
    setBezig(true)
    try {
      const res = await verstuurBestelling(dossierId, bestelling.id, { ...mail, sjabloonId: bestelling.sjabloon_id ?? null })
      if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
      toast.success(res.bonWaarschuwing
        ? `Verstuurd, maar de leverbon niet aangemaakt: ${res.bonWaarschuwing}`
        : 'Verstuurd')
      onKlaar()
      volgende()
    } finally {
      setBezig(false)
    }
  }

  // Een mandaatopdracht krijgt een sjabloon met "mandaat"/"regie" in de naam als dat bestaat.
  const standaardSjabloon = (g: Groep | null): string | null => {
    if (sjablonen.length === 0) return null
    const eigen = g?.sleutel === 'mandaat' ? sjablonen.find(s => /mandaat|regie/i.test(s.naam)) : undefined
    return (eigen ?? sjablonen[0]).id
  }

  if (stap === 'opdracht' && groep) {
    return (
      <OpdrachtVenster
        // Nieuwe sleutel per opdracht: het venster begint voor de tweede opdracht weer leeg.
        key={groep.sleutel}
        soort={soort}
        relatieNaam={relatie?.naam ?? ''}
        aantalRegels={groep.regels.length}
        totaal={groep.totaal}
        sjablonen={sjablonen.map(s => ({ id: s.id, naam: s.naam }))}
        bezig={bezig}
        vastMandaat={groep.sleutel === 'mandaat' ? groep.totaal : null}
        volgnummer={volgnummer}
        begin={{
          omschrijving: groep.regels[0]?.omschrijving.trim() ?? '',
          leveringTekst: '', leveringDatum: '', opleverDatum: '', werkadres: '',
          betaalafspraak: '', termijnschema: null, inhoudingPct: null, boeteTekst: '',
          afspraken: '', interneNotitie: '', sjabloonId: standaardSjabloon(groep),
          mandaatBedrag: null,
        }}
        onSluit={sluitOpdrachtVenster}
        onBevestig={maakOpdracht}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={bezig ? undefined : onSluit}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl rounded-xl border border-neutral-200 bg-white p-5 shadow-lg
                   dark:border-neutral-700 dark:bg-neutral-900"
      >
        <h2 className="mb-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {stap === 'mail'
            ? `${groep?.sleutel === 'mandaat' ? 'Mandaatopdracht' : 'Opdracht'} versturen${volgnummer ? ` (${volgnummer})` : ''}`
            : 'Opdracht uitzetten'}
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
            <div className="mb-4 grid grid-cols-2 gap-3">
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
                <span className={kop}>{isOa ? 'Onderaannemer' : 'Leverancier'}</span>
                <RelatieZoekveld
                  type={isOa ? 'onderaannemer' : 'leverancier'}
                  relatieId={relatie?.id}
                  relatieNaam={relatie?.naam}
                  onSelecteer={(id, naam) => setRelatie({ id, naam })}
                  onWis={() => setRelatie(null)}
                />
              </div>
            </div>

            <div className={`grid items-center gap-2 ${isOa ? 'grid-cols-[1fr_64px_80px_120px_108px_28px]' : 'grid-cols-[1fr_64px_80px_108px_28px]'}`}>
              <span className={kop}>Regels</span>
              <span className={`${kop} text-right`}>Aantal</span>
              <span className={kop}>Eenheid</span>
              {isOa && <span className={kop}>Afspraak</span>}
              <span className={`${kop} text-right`}>Bedrag</span>
              <span />
            </div>
            <div className="mb-2 space-y-2">
              {regels.map(r => (
                <div
                  key={r.id}
                  className={`grid items-center gap-2 ${isOa ? 'grid-cols-[1fr_64px_80px_120px_108px_28px]' : 'grid-cols-[1fr_64px_80px_108px_28px]'}`}
                >
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
                  {isOa && (
                    <select
                      value={r.mandaat ? 'mandaat' : 'vast'}
                      onChange={e => zetRegel(r.id, 'mandaat', e.target.value === 'mandaat')}
                      className={veld} aria-label="Afspraak"
                      title="Vaste prijs: de partij krijgt dit bedrag. Mandaat: regie, tot maximaal dit bedrag."
                    >
                      <option value="vast">Vaste prijs</option>
                      <option value="mandaat">Mandaat</option>
                    </select>
                  )}
                  <input
                    value={r.prijs} onChange={e => zetRegel(r.id, 'prijs', e.target.value)}
                    inputMode="decimal" placeholder={isOa && r.mandaat ? 'max.' : 'prijs'}
                    className={`${veld} text-right`} aria-label={isOa && r.mandaat ? 'Mandaat per eenheid' : 'Stukprijs'}
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

            <div className="mb-4 flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={() => setRegels(rs => [...rs, nieuweRegel()])}
                className="flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Regel erbij
              </button>
              <div className="text-right text-sm tabular-nums text-neutral-900 dark:text-neutral-100">
                {heeftMandaat ? (
                  <>
                    {gemengd && <div>Vaste prijs <span className="font-semibold">{formatEuro(totaalVast)}</span></div>}
                    <div>Mandaat <span className="font-semibold">{formatEuro(totaalMandaat)}</span></div>
                  </>
                ) : (
                  <span className="font-semibold">{formatEuro(totaalVast)}</span>
                )}
              </div>
            </div>

            {heeftMandaat && (
              <p className="mb-4 rounded-md bg-neutral-50 px-3 py-2 text-[11.5px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {gemengd
                  ? 'De mandaatregels krijgen een eigen opdrachtbon, met de mandaatafspraken erop. Je maakt dus twee opdrachten: eerst de vaste prijs, dan het mandaat.'
                  : 'Dit wordt een mandaatopdracht: de partij werkt in regie tot dit bedrag, en de mandaatafspraken komen op de opdrachtbon.'}
              </p>
            )}

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
              <Button variant="secondary" onClick={volgende} disabled={bezig}>
                {huidig + 1 < groepen.length ? 'Later versturen, door naar de volgende' : 'Later versturen'}
              </Button>
              <Button variant="primary" onClick={verstuur} loading={bezig} disabled={bezig}>Versturen</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
