'use client'

/**
 * De bestandsnamen naast de grote foto, als navigatie: klikken zet de preview op die
 * foto. Staan er foto's in submappen van de dossiermap, dan krijgt elke map een kopje
 * — de galerij volgt zo dezelfde indeling als de bestandenlijst erboven. Wat niet in
 * een submap staat komt eerst, zonder kopje.
 */

import React, { useEffect, useRef } from 'react'
import { Folder } from 'lucide-react'
import { formatteerGrootte, type BestandRij } from '@/lib/dossiers/bestand-rijen'
import { mapLabel } from '@/lib/dossiers/bestand-boom'

export default function FotoNavigatie({
  fotos, index, onKies, onVergroot, inApp, onToggleApp, inPortaal, onTogglePortaal,
}: {
  /** Al gesorteerd per map (zie `sorteerFotos`). */
  fotos: BestandRij[]
  index: number
  onKies: (i: number) => void
  onVergroot: (i: number) => void
  inApp?: Set<string>
  onToggleApp?: (rij: BestandRij, zichtbaar: boolean) => void
  inPortaal?: Set<string>
  onTogglePortaal?: (rij: BestandRij, zichtbaar: boolean) => void | Promise<void>
}) {
  const toonApp = !!inApp && !!onToggleApp
  const toonPortaal = !!inPortaal && !!onTogglePortaal
  const metKopjes = fotos.some(f => f.map)

  // De gekozen foto in beeld houden: na "Bekijken" vanuit een map in de lijst kan hij
  // ver onderaan staan. Bewust alleen deze lijst scrollen en niet `scrollIntoView`:
  // dat schuift ook de pagina zelf naar de galerij, al bij het openen van de tab.
  const lijst = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const doos = lijst.current
    const regel = doos?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    if (!doos || !regel) return
    // Staat er een mapkopje boven, dan dat ook in beeld.
    const kop = regel.previousElementSibling as HTMLElement | null
    const boven = kop?.dataset.kop ? kop.offsetTop : regel.offsetTop
    const onder = regel.offsetTop + regel.offsetHeight
    if (boven < doos.scrollTop) doos.scrollTop = boven
    else if (onder > doos.scrollTop + doos.clientHeight) doos.scrollTop = onder - doos.clientHeight
  }, [index])

  return (
    <div className="border-t border-neutral-100 pt-2 lg:border-t-0 lg:pt-0">
      {/* Twee vinkjes naast elkaar zijn zonder kop niet uit elkaar te houden. */}
      {(toonApp || toonPortaal) && (
        <div className="flex items-center gap-2 px-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.03em] text-neutral-400">
          <span className="flex-1" />
          {toonApp && <span className="w-12 text-center" title="Zichtbaar in de mobiele app voor de buitendienst">In app</span>}
          {toonPortaal && <span className="w-12 text-center" title="Zichtbaar voor de opdrachtgever in het klantportaal">Portaal</span>}
        </div>
      )}
      <div ref={lijst} className="relative max-h-[196px] overflow-y-auto lg:max-h-[60vh]">
        {fotos.map((f, i) => (
          <React.Fragment key={f.sleutel}>
            {metKopjes && f.map && f.map !== fotos[i - 1]?.map && (
              <div data-kop="1" className="flex items-center gap-1.5 px-1.5 pb-1 pt-2 text-[10.5px] font-semibold text-neutral-500">
                <Folder className="h-3 w-3 shrink-0" />
                <span className="truncate">{mapLabel(f.map)}</span>
              </div>
            )}
            <div
              data-index={i}
              className={`flex w-full items-center gap-2 rounded px-1.5 py-[3px] text-[11.5px] ${
                i === index ? 'bg-brand-50 font-medium text-brand-700' : 'text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <button
                onClick={() => onKies(i)}
                onDoubleClick={() => onVergroot(i)}
                title={f.naam}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {/* Vet = staat in het klantportaal, net als in de bestandenlijst. */}
                <span
                  className={`min-w-0 flex-1 truncate ${inPortaal?.has(f.sleutel) ? 'font-semibold' : ''}`}
                  title={inPortaal?.has(f.sleutel) ? 'Staat in het klantportaal' : undefined}
                >
                  {f.naam}
                </span>
                <span className="shrink-0 text-[10px] text-neutral-400">{f.bron}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-neutral-400">{f.datum ?? ''}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-neutral-400">{formatteerGrootte(f.grootte)}</span>
              </button>
              {toonApp && (
                <span className="flex w-12 shrink-0 justify-center">
                  <input
                    type="checkbox"
                    checked={inApp!.has(f.sleutel)}
                    onChange={e => onToggleApp!(f, e.target.checked)}
                    title="Zichtbaar in de mobiele app voor de buitendienst"
                    aria-label={`${f.naam} zichtbaar in de app`}
                    className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                  />
                </span>
              )}
              {toonPortaal && (
                <span className="flex w-12 shrink-0 justify-center">
                  <input
                    type="checkbox"
                    checked={inPortaal!.has(f.sleutel)}
                    onChange={e => onTogglePortaal!(f, e.target.checked)}
                    title="Zichtbaar voor de opdrachtgever in het klantportaal"
                    aria-label={`${f.naam} zichtbaar in het klantportaal`}
                    className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                  />
                </span>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
