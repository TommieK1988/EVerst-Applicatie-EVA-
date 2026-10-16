'use client'

/**
 * Een submap van de SharePoint-dossiermap in de bestandenlijst, plus de twee
 * hulpregels die in een opengeklapte map kunnen staan: de verwijzing naar de foto's
 * (die staan in de galerij, niet in de lijst) en "lege map".
 */

import React from 'react'
import { ChevronRight, ExternalLink, Folder, FolderOpen, Image as ImageIcon } from 'lucide-react'
import type { MapKnoop } from '@/lib/dossiers/bestand-boom'
import { AANTAL_KOLOMMEN, BREED, CEL, CEL_BASIS, INSPRING_PX, PIJL_PX } from './lijst-cellen'

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`

/** "3 bestanden · 12 foto's", inclusief submappen. */
function telling(map: MapKnoop): string {
  const delen = [
    map.aantalBestanden > 0 ? meervoud(map.aantalBestanden, 'bestand', 'bestanden') : null,
    map.aantalFotos > 0 ? meervoud(map.aantalFotos, 'foto', "foto's") : null,
  ].filter(Boolean)
  return delen.length ? delen.join(' · ') : 'leeg'
}

/** Lege cellen voor de vinkkolommen: een map zelf gaat niet in de app of het portaal. */
function VinkCellen({ app, portaal }: { app: boolean; portaal: boolean }) {
  return (
    <>
      {app && <td className={CEL} />}
      {portaal && <td className={CEL} />}
    </>
  )
}

export function MapRegel({ map, diepte, open, onWissel, toonApp, toonPortaal }: {
  map: MapKnoop
  diepte: number
  open: boolean
  onWissel: (pad: string) => void
  toonApp: boolean
  toonPortaal: boolean
}) {
  const Icoon = open ? FolderOpen : Folder
  return (
    <tr
      onClick={() => onWissel(map.pad)}
      className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50/70 [&>td:first-child]:pl-3"
    >
      <VinkCellen app={toonApp} portaal={toonPortaal} />
      <td className={`${CEL_BASIS} break-words`}>
        <span className="flex items-center gap-1" style={diepte ? { paddingLeft: diepte * INSPRING_PX } : undefined}>
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
            <Icoon className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <button
              type="button"
              aria-expanded={open}
              onClick={e => { e.stopPropagation(); onWissel(map.pad) }}
              className="text-left font-medium text-neutral-800 hover:underline"
            >
              {map.naam}
            </button>
            <span className="text-[10.5px] text-neutral-400">{telling(map)}</span>
            {map.webUrl && (
              <a
                href={map.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                title="Map openen in SharePoint"
                aria-label={`${map.naam} openen in SharePoint`}
                className="text-neutral-400 hover:text-brand-600"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </span>
        </span>
      </td>
      {/* Soort, type, opgeslagen in, grootte, datum: zeggen niets over een map. */}
      <td className={CEL} />
      <td className={CEL} />
      <td className={CEL} />
      <td className={`${CEL} ${BREED}`} />
      <td className={CEL} />
    </tr>
  )
}

export function MapHintRegel({ soort, map, diepte, onToonFotos, toonApp, toonPortaal }: {
  soort: 'fotos' | 'leeg'
  map: MapKnoop
  diepte: number
  onToonFotos?: (pad: string) => void
  toonApp: boolean
  toonPortaal: boolean
}) {
  return (
    <tr className="border-b border-neutral-100 [&>td:first-child]:pl-3">
      <VinkCellen app={toonApp} portaal={toonPortaal} />
      <td colSpan={AANTAL_KOLOMMEN} className={`${CEL_BASIS} text-[11px] text-neutral-400`}>
        <span className="flex items-center gap-1.5" style={{ paddingLeft: diepte * INSPRING_PX + PIJL_PX }}>
          {soort === 'leeg' ? (
            'Lege map'
          ) : (
            <>
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
              {meervoud(map.fotosHier, 'foto', "foto's")} in deze map — die staan in de fotogalerij.
              {onToonFotos && (
                <button
                  type="button"
                  onClick={() => onToonFotos(map.pad)}
                  className="font-medium text-brand-600 hover:underline"
                >
                  Bekijken
                </button>
              )}
            </>
          )}
        </span>
      </td>
    </tr>
  )
}
