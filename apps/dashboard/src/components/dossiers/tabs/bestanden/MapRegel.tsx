'use client'

/**
 * Een submap van de SharePoint-dossiermap in de bestandenlijst, plus de twee
 * hulpregels die in een opengeklapte map kunnen staan: de verwijzing naar de foto's
 * (die staan in de galerij, niet in de lijst) en "lege map".
 *
 * Een mapregel loopt over de hele breedte en begint helemaal links, vóór de
 * vinkkolommen: een map is een kop boven zijn bestanden, geen bestand. De kolommen
 * (soort, type, datum…) zeggen over een map ook niets.
 *
 * `data-map-pad` vertelt de upload waar iets landt dat je hier loslaat.
 */

import React from 'react'
import { ChevronRight, ExternalLink, Folder, FolderOpen, Image as ImageIcon, Upload } from 'lucide-react'
import type { MapKnoop } from '@/lib/dossiers/bestand-boom'
import { CEL_BASIS, DOELWIT, INSPRING_PX, PIJL_PX } from './lijst-cellen'

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`

/** "3 bestanden · 12 foto's", inclusief submappen. */
function telling(map: MapKnoop): string {
  const delen = [
    map.aantalBestanden > 0 ? meervoud(map.aantalBestanden, 'bestand', 'bestanden') : null,
    map.aantalFotos > 0 ? meervoud(map.aantalFotos, 'foto', "foto's") : null,
  ].filter(Boolean)
  return delen.length ? delen.join(' · ') : 'leeg'
}

export function MapRegel({ map, diepte, open, onWissel, onUpload, doelwit, kolommen }: {
  map: MapKnoop
  diepte: number
  open: boolean
  onWissel: (pad: string) => void
  /** Bestandskiezer voor deze map; ontbreekt = alleen-lezen, geen knop. */
  onUpload?: (pad: string) => void
  /** Er wordt boven deze map gesleept. */
  doelwit: boolean
  /** Alle kolommen van de tabel: de regel spant ze allemaal. */
  kolommen: number
}) {
  const Icoon = open ? FolderOpen : Folder
  return (
    <tr
      data-map-pad={map.pad}
      onClick={() => onWissel(map.pad)}
      className={`cursor-pointer border-b border-neutral-100 ${doelwit ? DOELWIT : 'hover:bg-neutral-50/70'}`}
    >
      <td colSpan={kolommen} className={`${CEL_BASIS} break-words pl-3`}>
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
            {doelwit ? (
              <span className="text-[10.5px] font-medium text-brand-700">Laat los om in deze map te zetten</span>
            ) : (
              <span className="text-[10.5px] text-neutral-400">{telling(map)}</span>
            )}
            {onUpload && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onUpload(map.pad) }}
                title="Bestanden in deze map zetten"
                aria-label={`Bestanden in ${map.naam} zetten`}
                className="text-neutral-400 hover:text-brand-600"
              >
                <Upload className="h-3 w-3" />
              </button>
            )}
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
    </tr>
  )
}

export function MapHintRegel({ soort, map, diepte, onToonFotos, doelwit, kolommen }: {
  soort: 'fotos' | 'leeg'
  map: MapKnoop
  diepte: number
  onToonFotos?: (pad: string) => void
  doelwit: boolean
  kolommen: number
}) {
  return (
    <tr data-map-pad={map.pad} className={`border-b border-neutral-100 ${doelwit ? DOELWIT : ''}`}>
      <td colSpan={kolommen} className={`${CEL_BASIS} pl-3 text-[11px] text-neutral-400`}>
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
