'use client'

/**
 * Eén bestandenlijst voor het hele dossier: Bouw7 en SharePoint door elkaar, met een
 * kolom die vertelt waar het bestand staat. Eerder waren dit twee losse tabellen,
 * waardoor je twee keer moest zoeken naar iets waarvan je de bewaarplek niet weet.
 *
 * Afbeeldingen zitten hier niet in — die staan in de fotogalerij.
 *
 * Een klik op een regel toont het bestand in het voorvertoningspaneel ernaast;
 * openen en downloaden zitten in de kop van dat paneel.
 */

import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, FileText, Mail, Search } from 'lucide-react'
import { formatteerGrootte, type BestandRij } from '@/lib/dossiers/bestand-rijen'
import { bepaalAutoSoort, type BestandSoortDef } from '@/lib/dossiers/bestand-soort'
import SoortCel from './SoortCel'

type SorteerVeld = 'naam' | 'soort' | 'extensie' | 'bron' | 'grootte' | 'datum'
type Richting = 'op' | 'af'

type Kolom = {
  veld: SorteerVeld
  label: string
  /** Tekstuitlijning van de cellen; koppen volgen automatisch. */
  rechts?: boolean
  /** Deze kolom rekt op; de rest krimpt tot de inhoud. */
  breed?: boolean
  /**
   * Alleen op een breed scherm. De grootte staat ook in het voorvertoningspaneel;
   * naast dat paneel is de ruimte beter besteed aan de bestandsnaam.
   */
  alleenBreed?: boolean
  titel?: string
}

const KOLOMMEN: Kolom[] = [
  { veld: 'naam', label: 'Naam', breed: true },
  { veld: 'soort', label: 'Soort' },
  { veld: 'extensie', label: 'Type' },
  { veld: 'bron', label: 'Opgeslagen in' },
  { veld: 'grootte', label: 'Grootte', rechts: true, alleenBreed: true },
  { veld: 'datum', label: 'Datum' },
]

// Compacte cel- en kopklassen — de kolommen staan bewust dicht op elkaar.
// De naamcel krijgt CEL_BASIS zonder `whitespace-nowrap`: een `whitespace-normal` erachter
// plakken werkt níét — in de gegenereerde CSS staat nowrap later en wint. Daardoor
// braken lange bestandsnamen nooit af en liep de tabel buiten de kaart.
const CEL_BASIS = 'px-1.5 py-[3px] align-middle'
const CEL = `${CEL_BASIS} whitespace-nowrap`
const BREED = 'hidden 2xl:table-cell'
const KOP = 'px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.03em] text-neutral-400 whitespace-nowrap'

function sorteerWaarde(rij: BestandRij, veld: SorteerVeld): string | number {
  switch (veld) {
    case 'grootte': return rij.grootte ?? -1
    case 'naam': return rij.naam.toLowerCase()
    case 'soort': return (rij.soortNaam ?? '').toLowerCase()
    case 'extensie': return rij.extensie ?? ''
    case 'bron': return rij.bron
    case 'datum': return rij.datum ?? ''
  }
}

const BRON_STIJL: Record<BestandRij['bron'], string> = {
  Bouw7: 'bg-brand-50 text-brand-700',
  SharePoint: 'bg-neutral-100 text-neutral-600',
}

export default function BestandenLijst({
  rijen, inApp, onToggleApp, geselecteerd, onSelecteer, voettekst, legeTekst,
  inPortaal, onTogglePortaal, soorten, onZetSoort,
}: {
  rijen: BestandRij[]
  /**
   * Sleutels van bestanden die de buitendienst in de mobiele app ziet (opt-in).
   * Net als de portaalkolom op de bronoverstijgende sleutel, dus ook voor
   * SharePoint-bestanden. Ontbreekt de prop, dan is de kolom er niet.
   */
  inApp?: Set<string>
  onToggleApp?: (rij: BestandRij, zichtbaar: boolean) => void
  /** Sleutel van de regel die in het voorvertoningspaneel staat. */
  geselecteerd: string | null
  onSelecteer: (rij: BestandRij) => void
  /**
   * Soorten uit Instellingen. Zonder `onZetSoort` is de kolom alleen-lezen
   * (afgesloten dossier).
   */
  soorten: BestandSoortDef[]
  onZetSoort?: (rij: BestandRij, soortId: string | null) => void
  voettekst: React.ReactNode
  /** Tekst als er niets te tonen valt — zoeken levert iets anders op dan een lege lijst. */
  legeTekst?: string
  /**
   * Sleutels van bestanden die in het klantportaal staan (opt-in). Ontbreekt de
   * prop, dan is de kolom er niet — bijvoorbeeld voor wie geen recht op het
   * klantportaal heeft.
   */
  inPortaal?: Set<string>
  onTogglePortaal?: (rij: BestandRij, zichtbaar: boolean) => void | Promise<void>
}) {
  const [zoek, setZoek] = useState('')
  const [bronFilter, setBronFilter] = useState<'alle' | BestandRij['bron']>('alle')
  const [veld, setVeld] = useState<SorteerVeld>('datum')
  const [richting, setRichting] = useState<Richting>('af')

  const bronnen = useMemo(() => {
    const set = new Set(rijen.map(r => r.bron))
    return [...set].sort()
  }, [rijen])

  const zichtbaar = useMemo(() => {
    const term = zoek.trim().toLowerCase()
    const gefilterd = rijen.filter(r => {
      if (bronFilter !== 'alle' && r.bron !== bronFilter) return false
      if (!term) return true
      return (
        r.naam.toLowerCase().includes(term) ||
        (r.omschrijving ?? '').toLowerCase().includes(term) ||
        (r.categorie ?? '').toLowerCase().includes(term) ||
        (r.soortNaam ?? '').toLowerCase().includes(term) ||
        (r.door ?? '').toLowerCase().includes(term)
      )
    })

    const factor = richting === 'op' ? 1 : -1
    return [...gefilterd].sort((a, b) => {
      const av = sorteerWaarde(a, veld)
      const bv = sorteerWaarde(b, veld)
      if (av === bv) return a.naam.localeCompare(b.naam)
      const verschil = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return verschil * factor
    })
  }, [rijen, zoek, bronFilter, veld, richting])

  function sorteerOp(nieuw: SorteerVeld) {
    if (nieuw === veld) setRichting(r => (r === 'op' ? 'af' : 'op'))
    else {
      setVeld(nieuw)
      // Datum en grootte wil je bijna altijd van groot naar klein zien, tekst juist a→z.
      setRichting(nieuw === 'datum' || nieuw === 'grootte' ? 'af' : 'op')
    }
  }

  const toonAppKolom = !!inApp && !!onToggleApp
  const toonPortaalKolom = !!inPortaal && !!onTogglePortaal

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            placeholder="Zoek op naam, soort of persoon"
            className="h-7 w-[264px] rounded border border-neutral-200 pl-7 pr-2 text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:border-brand-400 focus:outline-none"
          />
        </div>

        {bronnen.length > 1 && (
          <div className="flex items-center gap-1">
            {(['alle', ...bronnen] as const).map(b => (
              <button
                key={b}
                onClick={() => setBronFilter(b)}
                className={`rounded px-2 py-[3px] text-[11px] font-medium ${
                  bronFilter === b
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {b === 'alle' ? 'Alle' : b}
              </button>
            ))}
          </div>
        )}

        <span className="ml-auto text-[11px] text-neutral-400">
          {zichtbaar.length === rijen.length
            ? `${rijen.length} bestand${rijen.length === 1 ? '' : 'en'}`
            : `${zichtbaar.length} van ${rijen.length}`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-neutral-200 bg-neutral-50/70 text-left [&>th:first-child]:pl-3">
              {/* De vinkjes staan vooraan: het zijn de enige kolommen waarin je iets
                  doet, en je loopt de lijst af om te bepalen wat mee moet naar de
                  telefoon of naar de opdrachtgever. Achteraan schoven ze op met de
                  breedte van de bestandsnamen en was er telkens opnieuw naar zoeken. */}
              {toonAppKolom && (
                <th className={`${KOP} text-center`} title="Zichtbaar in de mobiele app voor de buitendienst">
                  In app
                </th>
              )}
              {toonPortaalKolom && (
                <th className={`${KOP} text-center`} title="Zichtbaar voor de opdrachtgever in het klantportaal">
                  In portaal
                </th>
              )}
              {KOLOMMEN.map(k => (
                <th
                  key={k.veld}
                  className={`${KOP} ${k.rechts ? 'text-right' : ''} ${k.breed ? 'w-full min-w-[160px]' : ''} ${k.alleenBreed ? BREED : ''}`}
                >
                  <button
                    onClick={() => sorteerOp(k.veld)}
                    className={`inline-flex items-center gap-0.5 hover:text-neutral-700 ${k.rechts ? 'flex-row-reverse' : ''}`}
                  >
                    {k.label}
                    {veld === k.veld && (richting === 'op'
                      ? <ArrowUp className="h-3 w-3" />
                      : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zichtbaar.map(r => (
              <tr
                key={r.sleutel}
                onClick={() => onSelecteer(r)}
                aria-selected={geselecteerd === r.sleutel}
                className={`cursor-pointer border-b border-neutral-100 [&>td:first-child]:pl-3 ${
                  geselecteerd === r.sleutel ? 'bg-brand-50' : 'hover:bg-neutral-50/70'
                }`}
              >
                {toonAppKolom && (
                  <td className={`${CEL} text-center`} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={inApp!.has(r.sleutel)}
                      onChange={e => onToggleApp!(r, e.target.checked)}
                      aria-label={`${r.naam} zichtbaar in de app`}
                      className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                    />
                  </td>
                )}
                {toonPortaalKolom && (
                  <td className={`${CEL} text-center`} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={inPortaal!.has(r.sleutel)}
                      onChange={e => onTogglePortaal!(r, e.target.checked)}
                      aria-label={`${r.naam} zichtbaar in het klantportaal`}
                      className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                    />
                  </td>
                )}
                <td className={`${CEL_BASIS} break-words`}>
                  {/* Vet = staat in het klantportaal. Zo zie je bij het scrollen
                      meteen wat er buiten de deur ligt, zonder de vinkkolom af
                      te speuren. */}
                  <span
                    className={`flex items-center gap-1.5 ${inPortaal?.has(r.sleutel) ? 'font-semibold' : ''}`}
                    title={inPortaal?.has(r.sleutel) ? 'Staat in het klantportaal' : undefined}
                  >
                    {r.soort === 'mail' && <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                    {r.soort === 'markdown' && <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                    <span className="min-w-0">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onSelecteer(r) }}
                        title={r.oorspronkelijkeNaam ? `In Bouw7: ${r.oorspronkelijkeNaam}` : r.naam}
                        className={`block text-left hover:underline ${geselecteerd === r.sleutel ? 'text-brand-700' : 'text-neutral-800 hover:text-brand-700'}`}
                      >
                        {r.naam}
                      </button>
                      {r.omschrijving && (
                        <span className="block text-[10px] text-neutral-400">{r.omschrijving}</span>
                      )}
                    </span>
                  </span>
                </td>
                <td className={CEL} onClick={e => onZetSoort && e.stopPropagation()}>
                  <SoortCel
                    rij={r}
                    soorten={soorten}
                    autoNaam={r.soortHandmatig ? bepaalAutoSoort(r, soorten)?.naam ?? null : r.soortNaam ?? null}
                    bewerkbaar={!!onZetSoort}
                    onKies={(rij, id) => onZetSoort?.(rij, id)}
                  />
                </td>
                <td className={`${CEL} uppercase text-neutral-500`}>{r.extensie ?? '—'}</td>
                <td className={CEL}>
                  <span className={`rounded px-1.5 py-[1px] text-[10.5px] font-medium ${BRON_STIJL[r.bron]}`}>
                    {r.bron}
                  </span>
                </td>
                <td className={`${CEL} ${BREED} text-right tabular-nums text-neutral-500`}>{formatteerGrootte(r.grootte)}</td>
                <td className={`${CEL} tabular-nums text-neutral-500`}>{r.datum ?? '—'}</td>
              </tr>
            ))}
            {/* Nog geen bestanden: de kolommen blijven staan met een nulregel, zodat de lijst
                dezelfde vorm houdt. Levert het zoekfilter niets op, dan is een melding over de
                volle breedte juist duidelijker — dat is geen lege lijst maar een lege selectie. */}
            {zichtbaar.length === 0 && (rijen.length === 0 ? (
              <tr className="border-b border-neutral-100 text-neutral-400 [&>td:first-child]:pl-3">
                {toonAppKolom && <td className={`${CEL} text-center`}>—</td>}
                {toonPortaalKolom && <td className={`${CEL} text-center`}>—</td>}
                <td className={CEL}>—</td>
                <td className={CEL}>—</td>
                <td className={CEL}>—</td>
                <td className={CEL}>—</td>
                <td className={`${CEL} ${BREED} text-right`}>—</td>
                <td className={CEL}>—</td>
              </tr>
            ) : (
              <tr>
                <td colSpan={KOLOMMEN.length + (toonAppKolom ? 1 : 0) + (toonPortaalKolom ? 1 : 0)} className="px-3 py-6 text-center text-[12.5px] text-neutral-500">
                  Geen bestanden gevonden.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rijen.length === 0 && (
        <p className="px-3 py-2.5 text-[11.5px] text-neutral-500">{legeTekst ?? 'Nog geen bestanden bij dit dossier.'}</p>
      )}

      {voettekst}
    </>
  )
}
