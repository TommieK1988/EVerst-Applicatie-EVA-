'use client'

/**
 * Het venster dat opengaat vóór een opdracht of bestelling naar Bouw7 gaat.
 *
 * Waarom een venster en niet de drie velden die eerder in de voorstelkaart stonden: een opdracht
 * aan een onderaannemer is een overeenkomst. Daar horen een start- en opleverdatum bij, een
 * betaalschema, specifieke afspraken en soms een afwijkend werkadres — bij een dossier met
 * meerdere locaties slaat één opdracht vaak op één huisadres. Dat is te veel om tussen de regels
 * van een lijst in te vullen, en te belangrijk om achteraf in Bouw7 te moeten bijwerken.
 *
 * Het venster wijzigt zelf niets: het verzamelt de gegevens en geeft ze terug aan het paneel, dat
 * ze meestuurt bij het aanmaken. Zo blijft er één plek waar de poortwachters draaien.
 *
 * Het termijnschema is bewust EVA-data en géén Bouw7-contracttermijnen: die zijn daar bezet door
 * de bestelregels (één regel kan aan maar één termijn hangen). Het schema komt op het document en
 * gaat als tekst mee in de betaalafspraak — precies zoals een uitvoerder het in Bouw7 met de hand
 * invulde.
 *
 * Er is bewust géén standaardschema. Wat je met een onderaannemer afspreekt verschilt per opdracht
 * (omvang, doorlooptijd, hoeveel er vooruit betaald wordt), en een voorgevulde staffel wordt
 * ongelezen meegestuurd. Je kiest er dus zelf een uit de gangbare afspraken, of stelt er een samen.
 */

import { useMemo, useState } from 'react'
import { X, HardHat, Truck, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { formatEuro } from '@/lib/everts-calc/calculations'

export type Termijn = { omschrijving: string; pct: number }

export type OpdrachtGegevens = {
  omschrijving: string
  leveringTekst: string
  leveringDatum: string
  opleverDatum: string
  werkadres: string
  betaalafspraak: string
  termijnschema: Termijn[] | null
  inhoudingPct: number | null
  boeteTekst: string
  afspraken: string
  interneNotitie: string
  sjabloonId: string | null
}

/**
 * De gangbare betaalafspraken om uit te kiezen. Geen van alle is de standaard: de keuze begint
 * leeg, zodat er alleen een schema op de opdracht komt als iemand er bewust een aanwijst.
 * Na het kiezen zijn de regels gewoon te bewerken — de lijst is een startpunt, geen keurslijf.
 */
export const TERMIJNSCHEMAS: { id: string; naam: string; termijnen: Termijn[] }[] = [
  {
    id: '30-30-30-10',
    naam: '30% opdracht · 30% start · 30% bij 50% gereed · 10% oplevering',
    termijnen: [
      { omschrijving: '1e termijn — bij opdracht', pct: 30 },
      { omschrijving: '2e termijn — bij start', pct: 30 },
      { omschrijving: '3e termijn — bij 50% gereed', pct: 30 },
      { omschrijving: 'Oplevertermijn — na oplevering', pct: 10 },
    ],
  },
  {
    id: '20-20-50-10',
    naam: '20% opdracht · 20% start · 50% naar rato · 10% oplevering',
    termijnen: [
      { omschrijving: '1e termijn — bij opdracht', pct: 20 },
      { omschrijving: '2e termijn — bij start', pct: 20 },
      { omschrijving: 'Termijnen naar rato', pct: 50 },
      { omschrijving: 'Oplevertermijn — na oplevering', pct: 10 },
    ],
  },
  {
    id: '50-50',
    naam: '50% bij start · 50% na oplevering',
    termijnen: [
      { omschrijving: '1e termijn — bij start', pct: 50 },
      { omschrijving: 'Oplevertermijn — na oplevering', pct: 50 },
    ],
  },
  {
    id: '100-oplevering',
    naam: '100% na oplevering',
    termijnen: [{ omschrijving: 'Na oplevering', pct: 100 }],
  },
]

interface Props {
  soort: 'oa_contract' | 'inkooporder'
  /** Naam van de onderaannemer/leverancier, als kop boven het venster. */
  relatieNaam: string
  aantalRegels: number
  totaal: number
  sjablonen: { id: string; naam: string }[]
  begin: OpdrachtGegevens
  bezig: boolean
  onSluit: () => void
  onBevestig: (gegevens: OpdrachtGegevens) => void
}

const veld = 'mt-1 w-full text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40 focus:ring-1 focus:ring-everts/20'
const label = 'block text-xs font-semibold text-slate-600'

export default function OpdrachtVenster({
  soort, relatieNaam, aantalRegels, totaal, sjablonen, begin, bezig, onSluit, onBevestig,
}: Props) {
  const isOa = soort === 'oa_contract'
  const [g, setG] = useState<OpdrachtGegevens>(begin)
  const [termijnen, setTermijnen] = useState<Termijn[]>(begin.termijnschema ?? [])
  /** '' = nog geen schema gekozen, 'eigen' = handmatig samengesteld. */
  const [schemaKeuze, setSchemaKeuze] = useState<string>(begin.termijnschema?.length ? 'eigen' : '')

  const zet = <K extends keyof OpdrachtGegevens>(sleutel: K, waarde: OpdrachtGegevens[K]) =>
    setG(p => ({ ...p, [sleutel]: waarde }))

  const somPct = useMemo(() => termijnen.reduce((s, t) => s + (Number(t.pct) || 0), 0), [termijnen])
  /** Alleen waarschuwen, niet blokkeren: soms is een schema bewust geen 100% (bijv. bij stelposten). */
  const somAfwijkend = termijnen.length > 0 && Math.abs(somPct - 100) > 0.01

  const bewerkTermijn = (i: number, wijziging: Partial<Termijn>) => {
    setTermijnen(p => p.map((t, j) => (j === i ? { ...t, ...wijziging } : t)))
    // Zodra er met de hand aan gesleuteld wordt is het niet meer de gekozen afspraak.
    setSchemaKeuze('eigen')
  }

  const kiesSchema = (id: string) => {
    setSchemaKeuze(id)
    if (id === '') setTermijnen([])
    else if (id !== 'eigen') setTermijnen(TERMIJNSCHEMAS.find(x => x.id === id)?.termijnen ?? [])
  }

  const bevestig = () => {
    if (!g.omschrijving.trim() || bezig) return
    onBevestig({
      ...g,
      omschrijving: g.omschrijving.trim(),
      // Niets gekozen = geen termijnen op de opdracht. Er is geen stille terugval: een schema dat
      // niemand heeft aangewezen hoort niet op papier bij een onderaannemer te belanden.
      termijnschema: isOa
        ? (termijnen.filter(t => t.omschrijving.trim() || t.pct).length > 0
            ? termijnen.filter(t => t.omschrijving.trim() || t.pct)
            : null)
        : null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isOa ? <HardHat className="w-5 h-5 text-violet-600 shrink-0" /> : <Truck className="w-5 h-5 text-sky-600 shrink-0" />}
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-800 truncate">
                {isOa ? 'Opdracht aan onderaannemer' : 'Bestelling bij leverancier'}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {relatieNaam} · {aantalRegels} regel(s) · {formatEuro(totaal)}
              </p>
            </div>
          </div>
          <button onClick={onSluit} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <label className={label}>
            Omschrijving *
            <input value={g.omschrijving} onChange={e => zet('omschrijving', e.target.value)}
              placeholder="bijv. Gevelonderhoud Dorpsweg 40 conform offerte 2026-0002" className={veld} />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className={label}>
              {isOa ? 'Start werk' : 'Levering'}
              <input value={g.leveringDatum} onChange={e => zet('leveringDatum', e.target.value)} type="date" className={veld} />
            </label>
            <label className={label}>
              …of in woorden
              <input value={g.leveringTekst} onChange={e => zet('leveringTekst', e.target.value)}
                placeholder="week 34" className={veld} />
            </label>
            <label className={label}>
              Verwachte oplevering
              <input value={g.opleverDatum} onChange={e => zet('opleverDatum', e.target.value)} type="date" className={veld} />
            </label>
          </div>

          <label className={label}>
            {isOa ? 'Werkadres' : 'Afleveradres'}
            <input value={g.werkadres} onChange={e => zet('werkadres', e.target.value)}
              placeholder="Leeg = het werkadres van het dossier"
              className={veld} />
            <span className="mt-1 block text-[11px] font-normal text-slate-400">
              Alleen invullen als deze {isOa ? 'opdracht' : 'bestelling'} op een ander adres slaat dan het dossier.
            </span>
          </label>

          {isOa && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">Termijnschema</p>
                {termijnen.length > 0 && (
                  <p className={`text-xs ${somAfwijkend ? 'text-amber-600' : 'text-slate-400'}`}>
                    samen {somPct.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}%
                  </p>
                )}
              </div>
              <select value={schemaKeuze} onChange={e => kiesSchema(e.target.value)}
                className="mt-2 w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40">
                <option value="">Geen termijnschema op de opdracht</option>
                {TERMIJNSCHEMAS.map(x => <option key={x.id} value={x.id}>{x.naam}</option>)}
                <option value="eigen">Zelf samenstellen…</option>
              </select>
              <div className="mt-2 space-y-1.5">
                {termijnen.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={t.omschrijving} onChange={e => bewerkTermijn(i, { omschrijving: e.target.value })}
                      placeholder="bijv. bij start" className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40" />
                    <div className="flex items-center gap-1 shrink-0">
                      <input value={String(t.pct)} onChange={e => bewerkTermijn(i, { pct: Number(e.target.value.replace(',', '.')) || 0 })}
                        inputMode="decimal" className="w-14 text-xs text-right px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40" />
                      <span className="text-xs text-slate-400">%</span>
                    </div>
                    <span className="w-24 text-right text-xs tabular-nums text-slate-500 shrink-0">
                      {formatEuro((totaal * (Number(t.pct) || 0)) / 100)}
                    </span>
                    <button onClick={() => { setTermijnen(p => p.filter((_, j) => j !== i)); setSchemaKeuze('eigen') }}
                      title="Termijn verwijderen" className="text-slate-300 hover:text-red-500 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {(schemaKeuze !== '' || termijnen.length > 0) && (
                <div className="mt-2">
                  <button
                    onClick={() => { setTermijnen(p => [...p, { omschrijving: '', pct: 0 }]); setSchemaKeuze('eigen') }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-everts hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Termijn toevoegen
                  </button>
                </div>
              )}
              {somAfwijkend && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                  De termijnen tellen niet op tot 100%. De laatste termijn krijgt op het document het restant.
                </p>
              )}
            </div>
          )}

          {isOa && (
            <div className="grid grid-cols-3 gap-3">
              <label className={label}>
                Inhouding
                <div className="flex items-center gap-1">
                  <input value={g.inhoudingPct == null ? '' : String(g.inhoudingPct)}
                    onChange={e => {
                      const v = e.target.value.replace(',', '.').trim()
                      zet('inhoudingPct', v === '' ? null : (Number(v) || 0))
                    }}
                    inputMode="decimal" placeholder="5" className={veld} />
                  <span className="mt-1 text-xs text-slate-400">%</span>
                </div>
              </label>
              <label className={`${label} col-span-2`}>
                Boete bij te late oplevering
                <input value={g.boeteTekst} onChange={e => zet('boeteTekst', e.target.value)}
                  placeholder="bijv. € 250 per werkdag" className={veld} />
              </label>
            </div>
          )}

          <label className={label}>
            Betaalafspraak
            <textarea value={g.betaalafspraak} onChange={e => zet('betaalafspraak', e.target.value)} rows={2}
              placeholder="bijv. Factuur met BTW verlegd, o.v.v. opdrachtnummer en werkadres, mailen naar inkoop@everts.chat"
              className={veld} />
          </label>

          <label className={label}>
            Opmerkingen en specifieke afspraken
            <textarea value={g.afspraken} onChange={e => zet('afspraken', e.target.value)} rows={3}
              placeholder="Wat er verder is afgesproken — komt op de opdracht die de partij krijgt."
              className={veld} />
          </label>

          <label className={label}>
            Interne notitie
            <textarea value={g.interneNotitie} onChange={e => zet('interneNotitie', e.target.value)} rows={2}
              placeholder="Blijft binnenshuis; staat niet op de opdracht." className={veld} />
          </label>

          {sjablonen.length > 0 && (
            <label className={label}>
              Opmaak van het document
              <select value={g.sjabloonId ?? ''} onChange={e => zet('sjabloonId', e.target.value || null)} className={veld}>
                {sjablonen.map(s => <option key={s.id} value={s.id}>{s.naam}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-200 shrink-0">
          <p className="text-xs text-slate-400">
            Wordt als concept in Bouw7 gezet. Versturen doe je daarna.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onSluit} className="text-sm px-4 py-2 text-slate-600 hover:text-slate-800">Annuleren</button>
            <button onClick={bevestig} disabled={bezig || !g.omschrijving.trim()}
              className="text-sm px-4 py-2 bg-everts text-white rounded-lg hover:bg-everts/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold">
              {isOa ? 'Opdracht aanmaken' : 'Bestelling aanmaken'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
