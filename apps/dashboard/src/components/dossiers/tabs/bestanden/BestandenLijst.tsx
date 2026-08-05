'use client'

/**
 * Eén bestandenlijst voor het hele dossier: Bouw7 en SharePoint door elkaar, met een
 * kolom die vertelt waar het bestand staat. Eerder waren dit twee losse tabellen,
 * waardoor je twee keer moest zoeken naar iets waarvan je de bewaarplek niet weet.
 *
 * Afbeeldingen zitten hier niet in — die staan in de fotogalerij.
 */

import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Mail, Search } from 'lucide-react'
import { bestandUrl, formatteerGrootte, type BestandRij } from '@/lib/dossiers/bestand-rijen'

type SorteerVeld = 'naam' | 'extensie' | 'bron' | 'grootte' | 'datum' | 'door'
type Richting = 'op' | 'af'

type Kolom = {
  veld: SorteerVeld
  label: string
  /** Tekstuitlijning van de cellen; koppen volgen automatisch. */
  rechts?: boolean
  /** Deze kolom rekt op; de rest krimpt tot de inhoud. */
  breed?: boolean
  titel?: string
}

const KOLOMMEN: Kolom[] = [
  { veld: 'naam', label: 'Naam', breed: true },
  { veld: 'extensie', label: 'Type' },
  { veld: 'bron', label: 'Opgeslagen in' },
  { veld: 'grootte', label: 'Grootte', rechts: true },
  { veld: 'datum', label: 'Datum' },
  { veld: 'door', label: 'Door' },
]

// Compacte cel- en kopklassen — de kolommen staan bewust dicht op elkaar.
const CEL = 'px-1.5 py-[3px] align-middle whitespace-nowrap'
const KOP = 'px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.03em] text-neutral-400 whitespace-nowrap'

function sorteerWaarde(rij: BestandRij, veld: SorteerVeld): string | number {
  switch (veld) {
    case 'grootte': return rij.grootte ?? -1
    case 'naam': return rij.naam.toLowerCase()
    case 'extensie': return rij.extensie ?? ''
    case 'bron': return rij.bron
    case 'datum': return rij.datum ?? ''
    case 'door': return rij.door ?? ''
  }
}

/**
 * De bestandsnaam ís de actie. Een aparte actiekolom bood nooit een keuze — er stond
 * altijd precies één ding in — en kostte wel breedte, die in een halve kolom schaars is.
 *
 * Een mail opent in het leesvenster, de rest in de bron (SharePoint/Office online) of,
 * als die er niet is, als download.
 */
function BestandsnaamActie({ rij, onOpenMail }: { rij: BestandRij; onOpenMail: (r: BestandRij) => void }) {
  const stijl = 'block text-left text-neutral-800 hover:text-brand-700 hover:underline'

  if (rij.soort === 'mail') {
    return (
      <button onClick={() => onOpenMail(rij)} title={`${rij.naam} — lezen`} className={stijl}>
        {rij.naam}
      </button>
    )
  }

  return (
    <a
      href={rij.openUrl ?? bestandUrl(rij, { download: true })}
      target="_blank"
      rel="noopener noreferrer"
      title={`${rij.naam} — ${rij.openUrl ? 'openen' : 'downloaden'}`}
      className={stijl}
    >
      {rij.naam}
    </a>
  )
}

const BRON_STIJL: Record<BestandRij['bron'], string> = {
  Bouw7: 'bg-brand-50 text-brand-700',
  SharePoint: 'bg-neutral-100 text-neutral-600',
}

export default function BestandenLijst({ rijen, inApp, onToggleApp, onOpenMail, voettekst, legeTekst }: {
  rijen: BestandRij[]
  /** Bouw7-bestanden die de buitendienst in de mobiele app ziet (opt-in). */
  inApp: Set<number>
  onToggleApp: (bestandId: number, zichtbaar: boolean) => void
  onOpenMail: (rij: BestandRij) => void
  voettekst: React.ReactNode
  /** Tekst als er niets te tonen valt — zoeken levert iets anders op dan een lege lijst. */
  legeTekst?: string
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

  const toonAppKolom = rijen.some(r => r.bouw7Id != null)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            placeholder="Zoek op naam, categorie of persoon"
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
            <tr className="border-y border-neutral-200 bg-neutral-50/70 text-left">
              {KOLOMMEN.map(k => (
                <th
                  key={k.veld}
                  className={`${KOP} ${k.rechts ? 'text-right' : ''} ${k.breed ? 'w-full' : ''}`}
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
              {toonAppKolom && (
                <th className={`${KOP} text-center`} title="Zichtbaar in de mobiele app voor de buitendienst">
                  In app
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {zichtbaar.map(r => (
              <tr key={r.sleutel} className="border-b border-neutral-100 hover:bg-neutral-50/70">
                <td className={`${CEL} pl-3 whitespace-normal`}>
                  <span className="flex items-center gap-1.5">
                    {r.soort === 'mail' && <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                    <span className="min-w-0">
                      <BestandsnaamActie rij={r} onOpenMail={onOpenMail} />
                      {r.omschrijving && (
                        <span className="block text-[10px] text-neutral-400">{r.omschrijving}</span>
                      )}
                    </span>
                  </span>
                </td>
                <td className={`${CEL} uppercase text-neutral-500`}>{r.extensie ?? '—'}</td>
                <td className={CEL}>
                  <span className={`rounded px-1.5 py-[1px] text-[10.5px] font-medium ${BRON_STIJL[r.bron]}`}>
                    {r.bron}
                  </span>
                </td>
                <td className={`${CEL} text-right tabular-nums text-neutral-500`}>{formatteerGrootte(r.grootte)}</td>
                <td className={`${CEL} tabular-nums text-neutral-500`}>{r.datum ?? '—'}</td>
                <td className={`${CEL} text-neutral-500`}>{r.door ?? '—'}</td>
                {toonAppKolom && (
                  <td className={`${CEL} text-center`}>
                    {r.bouw7Id != null ? (
                      <input
                        type="checkbox"
                        checked={inApp.has(r.bouw7Id)}
                        onChange={e => onToggleApp(r.bouw7Id!, e.target.checked)}
                        aria-label={`${r.naam} zichtbaar in de app`}
                        className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                      />
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {zichtbaar.length === 0 && (
              <tr>
                <td colSpan={KOLOMMEN.length + (toonAppKolom ? 1 : 0)} className="px-3 py-6 text-center text-[12.5px] text-neutral-500">
                  {rijen.length === 0 ? (legeTekst ?? 'Geen bestanden.') : 'Geen bestanden gevonden.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {voettekst}
    </>
  )
}
