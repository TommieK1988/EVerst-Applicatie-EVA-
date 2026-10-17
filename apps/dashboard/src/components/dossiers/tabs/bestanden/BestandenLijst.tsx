'use client'

/**
 * Eén bestandenlijst voor het hele dossier: Bouw7 en SharePoint door elkaar, met een
 * kolom die vertelt waar het bestand staat. Eerder waren dit twee losse tabellen,
 * waardoor je twee keer moest zoeken naar iets waarvan je de bewaarplek niet weet.
 *
 * De submappen van de SharePoint-dossiermap staan erin als uitklapbare regels, met de
 * bestanden eronder — dezelfde indeling als in SharePoint zelf. Bij zoeken staat de
 * lijst plat: dan wil je de treffers zien, niet eerst mappen openklikken; elke treffer
 * zegt dan zelf in welke map hij staat.
 *
 * Afbeeldingen zitten hier niet in — die staan in de fotogalerij.
 *
 * Een klik op een regel toont het bestand in het voorvertoningspaneel ernaast;
 * openen en downloaden zitten in de kop van dat paneel.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react'
import { Button } from '@/components/ui'
import type { BestandRij } from '@/lib/dossiers/bestand-rijen'
import type { BestandSoortDef } from '@/lib/dossiers/bestand-soort'
import { allePaden, bouwBoom, vlakAf, type BoomRegel } from '@/lib/dossiers/bestand-boom'
import BestandRegel from './BestandRegel'
import { MapHintRegel, MapRegel } from './MapRegel'
import { BREED, CEL, KOP } from './lijst-cellen'

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

export default function BestandenLijst({
  rijen, inApp, onToggleApp, geselecteerd, onSelecteer, voettekst, legeTekst,
  inPortaal, onTogglePortaal, soorten, onZetSoort, mappen, fotos, onToonFotos,
  onUploadNaar, sleepDoel, openNaar,
}: {
  rijen: BestandRij[]
  /** Submappen van de SharePoint-dossiermap, ook lege. */
  mappen?: { pad: string; webUrl: string | null }[]
  /** Alleen om per map te tellen: de foto's zelf staan in de galerij. */
  fotos?: BestandRij[]
  /** Springt in de fotogalerij naar de foto's van deze map. */
  onToonFotos?: (pad: string) => void
  /** Bestandskiezer voor uploaden in een map. Ontbreekt = geen uploadknop op de mapregels. */
  onUploadNaar?: (pad: string) => void
  /** Tijdens slepen: de map onder de muis ('' = de dossiermap); null = er wordt niet gesleept. */
  sleepDoel?: string | null
  /** Na een upload in een map: die map (en zijn ouders) openklappen. */
  openNaar?: { pad: string; keer: number } | null
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
  // Dichtgeklapt beginnen, zoals in SharePoint: de mapregel zegt al hoeveel erin zit.
  const [open, setOpen] = useState<Set<string>>(new Set())

  const zoekt = zoek.trim() !== ''

  useEffect(() => {
    if (!openNaar?.pad) return
    const delen = openNaar.pad.split('/')
    setOpen(vorig => {
      const nieuw = new Set(vorig)
      for (let i = 1; i <= delen.length; i++) nieuw.add(delen.slice(0, i).join('/'))
      return nieuw
    })
  }, [openNaar])

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
        (r.door ?? '').toLowerCase().includes(term) ||
        (r.map ?? '').toLowerCase().includes(term)
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

  // Bouw7 kent geen mappen: met dat filter aan blijft de lijst plat.
  const boom = useMemo(() => {
    if (zoekt) return null
    return bouwBoom(
      zichtbaar,
      (fotos ?? []).filter(f => bronFilter === 'alle' || f.bron === bronFilter),
      bronFilter === 'Bouw7' ? [] : mappen ?? [],
    )
  }, [zoekt, zichtbaar, fotos, mappen, bronFilter])

  const paden = useMemo(() => (boom ? allePaden(boom) : []), [boom])
  const inBoom = paden.length > 0
  const regels: BoomRegel[] = boom
    ? vlakAf(boom, open)
    : zichtbaar.map(rij => ({ soort: 'bestand', rij, diepte: 0 }))
  const allesOpen = inBoom && paden.every(p => open.has(p))

  function wissel(pad: string) {
    setOpen(vorig => {
      const nieuw = new Set(vorig)
      if (nieuw.has(pad)) nieuw.delete(pad); else nieuw.add(pad)
      return nieuw
    })
  }

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
  const kolommen = KOLOMMEN.length + (toonAppKolom ? 1 : 0) + (toonPortaalKolom ? 1 : 0)
  // Alleen een submap licht op; de dossiermap zelf krijgt de overlay over alles.
  const doelwit = (pad: string) => !!sleepDoel && sleepDoel === pad

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

        {inBoom && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(allesOpen ? new Set() : new Set(paden))}>
            {allesOpen ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
            {allesOpen ? 'Mappen inklappen' : 'Mappen uitklappen'}
          </Button>
        )}

        <span className="ml-auto text-[11px] text-neutral-400">
          {zichtbaar.length === rijen.length
            ? `${rijen.length} bestand${rijen.length === 1 ? '' : 'en'}`
            : `${zichtbaar.length} van ${rijen.length}`}
          {inBoom && ` · ${paden.length} map${paden.length === 1 ? '' : 'pen'}`}
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
            {regels.map(regel => {
              switch (regel.soort) {
                case 'map':
                  return (
                    <MapRegel
                      key={`map:${regel.map.pad}`}
                      map={regel.map}
                      diepte={regel.diepte}
                      open={regel.open}
                      onWissel={wissel}
                      onUpload={onUploadNaar}
                      doelwit={doelwit(regel.map.pad)}
                      kolommen={kolommen}
                    />
                  )
                case 'fotos':
                case 'leeg':
                  return (
                    <MapHintRegel
                      key={`${regel.soort}:${regel.map.pad}`}
                      soort={regel.soort}
                      map={regel.map}
                      diepte={regel.diepte}
                      onToonFotos={onToonFotos}
                      doelwit={doelwit(regel.map.pad)}
                      kolommen={kolommen}
                    />
                  )
                case 'bestand':
                  return (
                    <BestandRegel
                      key={regel.rij.sleutel}
                      rij={regel.rij}
                      diepte={regel.diepte}
                      inBoom={inBoom}
                      toonMap={zoekt}
                      doelwit={inBoom && !zoekt && doelwit(regel.rij.map ?? '')}
                      geselecteerd={geselecteerd === regel.rij.sleutel}
                      onSelecteer={onSelecteer}
                      inApp={inApp}
                      onToggleApp={onToggleApp}
                      inPortaal={inPortaal}
                      onTogglePortaal={onTogglePortaal}
                      soorten={soorten}
                      onZetSoort={onZetSoort}
                    />
                  )
              }
            })}
            {/* Nog geen bestanden: de kolommen blijven staan met een nulregel, zodat de lijst
                dezelfde vorm houdt. Levert het zoekfilter niets op, dan is een melding over de
                volle breedte juist duidelijker — dat is geen lege lijst maar een lege selectie. */}
            {regels.length === 0 && (rijen.length === 0 ? (
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
                <td colSpan={kolommen} className="px-3 py-6 text-center text-[12.5px] text-neutral-500">
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
