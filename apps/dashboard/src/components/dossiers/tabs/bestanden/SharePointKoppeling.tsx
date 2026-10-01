'use client'

import React, { useState } from 'react'
import type { DossierSharePointData } from '@/lib/dossiers/sharepoint-bestanden'
import OpenInVerkenner from '../OpenInVerkenner'

/* ─── SharePoint-koppeling ──────────────────────────────────────────────────── */

/** Acties bij een gekoppelde map. Ontkoppelen raakt SharePoint niet aan — alleen de koppeling in EVA. */
function MapActies({ onKies, onOntkoppel, bezig }: { onKies: () => void; onOntkoppel: () => void; bezig: boolean }) {
  const [bevestig, setBevestig] = useState(false)

  if (bevestig) {
    return (
      <span className="flex items-center gap-2 text-[11px]">
        <span className="text-neutral-600">Koppeling weghalen? De map blijft in SharePoint staan.</span>
        <button onClick={() => { setBevestig(false); onOntkoppel() }} disabled={bezig}
          className="font-medium text-red-600 hover:underline disabled:opacity-60">
          Ontkoppelen
        </button>
        <button onClick={() => setBevestig(false)} className="text-neutral-500 hover:underline">Annuleren</button>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-3 text-[11px]">
      <button onClick={onKies} disabled={bezig} className="font-medium text-brand-600 hover:underline disabled:opacity-60">
        Andere map kiezen
      </button>
      <button onClick={() => setBevestig(true)} disabled={bezig} className="text-neutral-500 hover:underline disabled:opacity-60">
        Ontkoppelen
      </button>
    </span>
  )
}

/**
 * Herkomst van de lijst plus de acties op de SharePoint-map. Dit stond eerder in een
 * eigen kaart; nu de bestanden in één lijst staan hoort het bij de voetregel.
 */
export default function SharePointKoppeling({
  data, dossierId, bouw7Beschikbaar, readOnly, bezig, onKies, onOntkoppel, onOpnieuw, onKiesKandidaat,
}: {
  data: DossierSharePointData | null
  dossierId: string
  bouw7Beschikbaar?: boolean
  readOnly: boolean
  bezig: boolean
  onKies: () => void
  onOntkoppel: () => void
  onOpnieuw: () => void
  onKiesKandidaat: (itemId: string) => void
}) {
  // Niet geconfigureerd → alleen over Bouw7 iets zeggen.
  if (!data || !data.geconfigureerd) {
    return <span className="text-[11px] text-neutral-500">Live uit Bouw7 — openen via een beveiligde EVA-proxy.</span>
  }

  if (data.status === 'gematcht') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <span className="text-[11px] text-neutral-500">
          Live uit {bouw7Beschikbaar === false ? '' : 'Bouw7 en '}SharePoint
          ({data.handmatig ? 'handmatig' : 'automatisch'} gekoppelde dossiermap).
        </span>
        <span className="flex items-center gap-3">
          {!readOnly && <MapActies onKies={onKies} onOntkoppel={onOntkoppel} bezig={bezig} />}
          {data.mapUrl && <OpenInVerkenner dossierId={dossierId} mapUrl={data.mapUrl} />}
          {data.mapUrl && (
            <a href={data.mapUrl} target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-medium text-brand-600 hover:underline">
              Open map in SharePoint
            </a>
          )}
        </span>
      </div>
    )
  }

  // niet_gevonden / meerdere / fout → zelf een map kiezen of aanmaken.
  return (
    <div className="space-y-2">
      {data.melding && <p className="text-[11.5px] text-neutral-600">{data.melding}</p>}
      <p className="text-[11.5px] text-neutral-500">
        {data.status === 'meerdere'
          ? 'Meerdere SharePoint-mappen komen in aanmerking — kies de juiste.'
          : data.status === 'niet_gevonden'
            ? 'Geen SharePoint-map gekoppeld. Nieuwe aanvragen krijgen die automatisch; ' +
              'voor oudere dossiers kies je de juiste map, of maak je hem aan.'
            : 'SharePoint is nu niet bereikbaar.'}
      </p>

      {data.fout && (
        <p className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 break-words">
          {data.fout}
        </p>
      )}

      {/* Bij 'meerdere' de kandidaten direct tonen: één klik i.p.v. de picker openen. */}
      {!readOnly && !!data.kandidaten?.length && (
        <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
          {data.kandidaten.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-neutral-800">{m.naam}</span>
                <span className="block text-[10.5px] text-neutral-500">
                  {m.aantalItems ?? 0} item{m.aantalItems === 1 ? '' : 's'}
                  {m.gewijzigd ? ` · gewijzigd ${m.gewijzigd}` : ''}
                </span>
              </span>
              <button onClick={() => onKiesKandidaat(m.id)} disabled={bezig}
                className="shrink-0 rounded border border-neutral-300 px-2 py-[3px] text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
                Koppelen
              </button>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <button onClick={onKies} disabled={bezig}
            className="rounded bg-brand-600 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            Map kiezen of aanmaken
          </button>
          <button onClick={onOpnieuw} disabled={bezig}
            className="rounded border border-neutral-300 px-2.5 py-1 text-[11.5px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-60">
            Opnieuw zoeken
          </button>
        </div>
      )}
    </div>
  )
}
