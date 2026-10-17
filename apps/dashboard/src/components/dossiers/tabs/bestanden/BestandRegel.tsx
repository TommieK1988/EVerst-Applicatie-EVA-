'use client'

/**
 * Eén bestand in de bestandenlijst. Staat los van de lijst zelf sinds die ook mappen
 * toont; de opmaak is ongewijzigd, alleen springt een regel nu in onder zijn map.
 */

import React from 'react'
import { FileText, Folder, Mail } from 'lucide-react'
import { formatteerGrootte, type BestandRij } from '@/lib/dossiers/bestand-rijen'
import { bepaalAutoSoort, type BestandSoortDef } from '@/lib/dossiers/bestand-soort'
import { mapLabel } from '@/lib/dossiers/bestand-boom'
import SoortCel from './SoortCel'
import { BREED, CEL, CEL_BASIS, DOELWIT, INSPRING_PX } from './lijst-cellen'

const BRON_STIJL: Record<BestandRij['bron'], string> = {
  Bouw7: 'bg-brand-50 text-brand-700',
  SharePoint: 'bg-neutral-100 text-neutral-600',
}

export default function BestandRegel({
  rij: r, diepte, inBoom, toonMap, doelwit, geselecteerd, onSelecteer,
  inApp, onToggleApp, inPortaal, onTogglePortaal, soorten, onZetSoort,
}: {
  rij: BestandRij
  diepte: number
  /** De lijst toont mappen: wat je op dit bestand loslaat, landt in zijn map. */
  inBoom: boolean
  /** Bij zoeken staat de lijst plat; dan zegt de regel zelf in welke map hij staat. */
  toonMap: boolean
  /** Er wordt boven de map van dit bestand gesleept. */
  doelwit: boolean
  geselecteerd: boolean
  onSelecteer: (rij: BestandRij) => void
  inApp?: Set<string>
  onToggleApp?: (rij: BestandRij, zichtbaar: boolean) => void
  inPortaal?: Set<string>
  onTogglePortaal?: (rij: BestandRij, zichtbaar: boolean) => void | Promise<void>
  soorten: BestandSoortDef[]
  onZetSoort?: (rij: BestandRij, soortId: string | null) => void
}) {
  const toonAppKolom = !!inApp && !!onToggleApp
  const toonPortaalKolom = !!inPortaal && !!onTogglePortaal
  // De map staat als kop links boven de bestanden; inspringen per niveau laat zien
  // hoe diep een bestand zit.
  const inspringing = diepte * INSPRING_PX

  return (
    <tr
      onClick={() => onSelecteer(r)}
      aria-selected={geselecteerd}
      data-map-pad={inBoom && !toonMap ? r.map ?? '' : undefined}
      className={`cursor-pointer border-b border-neutral-100 [&>td:first-child]:pl-3 ${
        doelwit ? DOELWIT : geselecteerd ? 'bg-brand-50' : 'hover:bg-neutral-50/70'
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
          style={inspringing ? { paddingLeft: inspringing } : undefined}
          title={inPortaal?.has(r.sleutel) ? 'Staat in het klantportaal' : undefined}
        >
          {r.soort === 'mail' && <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
          {r.soort === 'markdown' && <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
          <span className="min-w-0">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onSelecteer(r) }}
              title={r.oorspronkelijkeNaam ? `In Bouw7: ${r.oorspronkelijkeNaam}` : r.naam}
              className={`block text-left hover:underline ${geselecteerd ? 'text-brand-700' : 'text-neutral-800 hover:text-brand-700'}`}
            >
              {r.naam}
            </button>
            {toonMap && r.map && (
              <span className="flex items-center gap-1 text-[10px] font-normal text-neutral-400">
                <Folder className="h-3 w-3 shrink-0" />
                {mapLabel(r.map)}
              </span>
            )}
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
  )
}
