'use client'

/**
 * Picker voor het invoerveld van type `houtrot_opties`: welke registraties mee
 * gaan, waarop het totaalblad groepeert en hoeveel er op een pagina passen.
 *
 * De waarde is één JSON-tekst (zie `lib/documenten/houtrot-opties.ts`), zodat er
 * geen kolommen bij hoeven en "Opnieuw opstellen" de keuzes vanzelf herstelt.
 *
 * Telt live mee hoeveel registraties er overblijven — dat is de enige manier om
 * vóór het renderen te zien of het filter scherp genoeg is.
 */

import { useEffect, useMemo, useState } from 'react'
import { getRegistraties } from '@/services/houtrotherstel/registraties'
import { getLocatieBoom } from '@/services/houtrotherstel/locatie-config'
import { cascadeRijen, platteBoom, selectieVanLocatie, subtreeIds, MAX_DIEPTE } from '@/lib/houtrotherstel/locatie-boom'
import { REGISTRATIE_STATUSSEN, type LocatieBoom, type RepairRegistration } from '@/lib/houtrotherstel/types'
import {
  parseRapportOpties, serialiseerRapportOpties, MAX_REGISTRATIES, WAARSCHUW_REGISTRATIES, MAX_PER_PAGINA,
  type HoutrotRapportOpties,
} from '@/lib/documenten/houtrot-opties'

const invoerCls =
  'w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export default function HoutrotOptiesVeld({ dossierId, waarde, onChange }: {
  dossierId: string
  waarde: string
  onChange: (v: string) => void
}) {
  const opties = useMemo(() => parseRapportOpties(waarde), [waarde])
  const zet = (wijziging: Partial<HoutrotRapportOpties>) =>
    onChange(serialiseerRapportOpties({ ...opties, ...wijziging }))

  const [boom, setBoom] = useState<LocatieBoom>({ labels: [], nodes: [] })
  const [registraties, setRegistraties] = useState<RepairRegistration[] | null>(null)

  useEffect(() => {
    getLocatieBoom(dossierId).then(setBoom).catch(() => setBoom({ labels: [], nodes: [] }))
    getRegistraties({ dossier_id: dossierId }).then(setRegistraties).catch(() => setRegistraties([]))
  }, [dossierId])

  // Diepten die de boom werkelijk heeft — groeperen op een leeg niveau heeft geen zin.
  const diepten = useMemo(() => {
    const gevonden = new Set(platteBoom(boom.nodes).map(k => k.diepte))
    return [...gevonden].filter(d => d < MAX_DIEPTE).sort((a, b) => a - b)
  }, [boom])

  const niveauNaam = (d: number) => (boom.labels[d] || '').trim() || `Niveau ${d + 1}`

  // Statussen die in dit dossier daadwerkelijk voorkomen; de legacy-waarden tonen
  // we niet als ze nergens gebruikt worden.
  const statusOpties = useMemo(() => {
    const gevonden = new Set((registraties ?? []).map(r => r.status))
    return [...gevonden].map(s => ({ waarde: s, label: REGISTRATIE_STATUSSEN[s] ?? s }))
  }, [registraties])

  // Live telling met exact dezelfde filterregels als de server.
  const telling = useMemo(() => {
    if (!registraties) return null
    const tak = opties.tak_node_id ? subtreeIds(boom.nodes, opties.tak_node_id) : null
    return registraties.filter(r => {
      if (opties.statussen.length > 0 && !opties.statussen.includes(r.status)) return false
      if (tak) {
        const ids = selectieVanLocatie(boom.nodes, r.locatie ?? [])
        if (!ids.some(id => tak.has(id))) return false
      }
      return true
    }).length
  }, [registraties, boom, opties.statussen, opties.tak_node_id])

  const paginas = telling == null ? null : Math.ceil(telling / Math.max(1, opties.per_pagina))
  // De gekozen tak als pad van knoop-ids, zodat de cascade de juiste rijen toont.
  const gekozenTak = opties.tak_node_id ? padNaarWortel(boom, opties.tak_node_id) : []
  const cascade = cascadeRijen(boom.nodes, gekozenTak)

  return (
    <div className="space-y-3 rounded border border-neutral-200 bg-neutral-50/60 p-3">
      {/* Statusfilter */}
      <div>
        <span className="mb-1 block text-[11px] font-medium text-neutral-500">Welke registraties</span>
        {statusOpties.length === 0 ? (
          <p className="text-[11.5px] text-neutral-400">
            {registraties === null ? 'Laden…' : 'Dit dossier heeft nog geen houtrotregistraties.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
              <input
                type="checkbox"
                checked={opties.statussen.length === 0}
                onChange={() => zet({ statussen: [] })}
              />
              Alle
            </label>
            {statusOpties.map(s => (
              <label key={s.waarde} className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                <input
                  type="checkbox"
                  checked={opties.statussen.includes(s.waarde)}
                  onChange={e => zet({
                    statussen: e.target.checked
                      ? [...opties.statussen, s.waarde]
                      : opties.statussen.filter(x => x !== s.waarde),
                  })}
                />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Tak van de locatieboom */}
      {boom.nodes.length > 0 && (
        <div>
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Beperken tot een deel van het werk</span>
          <div className="flex flex-wrap gap-2">
            {cascade.map(rij => (
              <select
                key={rij.diepte}
                value={gekozenTak[rij.diepte] ?? ''}
                onChange={e => zet({ tak_node_id: e.target.value || (rij.diepte === 0 ? null : gekozenTak[rij.diepte - 1] ?? null) })}
                className={`${invoerCls} w-auto min-w-[9rem] flex-1`}
              >
                <option value="">Alle {niveauNaam(rij.diepte).toLowerCase()}</option>
                {rij.opties.map(n => <option key={n.id} value={n.id}>{n.naam}</option>)}
              </select>
            ))}
          </div>
        </div>
      )}

      {/* Groepering totaalblad */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Totaalblad groeperen op</span>
          <select value={String(opties.niveau)} onChange={e => zet({ niveau: Number(e.target.value) })} className={invoerCls}>
            <option value="-1">Niet groeperen — één lijst</option>
            {diepten.map(d => <option key={d} value={d}>{niveauNaam(d)}</option>)}
          </select>
        </label>
        <label className="w-32">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Per pagina</span>
          <input
            type="number" min={1} max={MAX_PER_PAGINA}
            value={opties.per_pagina}
            onChange={e => zet({ per_pagina: Number(e.target.value) || 1 })}
            className={invoerCls}
          />
        </label>
      </div>
      <p className="text-[10.5px] text-neutral-400">
        &laquo;Per pagina&raquo; moet overeenkomen met de indeling van dit Word-sjabloon: het sjabloon heeft
        precies zoveel registratieblokken op een pagina staan.
      </p>

      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
          <input type="checkbox" checked={opties.toon_prijzen} onChange={e => zet({ toon_prijzen: e.target.checked })} />
          Verkoopprijzen tonen
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
          <input
            type="checkbox"
            disabled={opties.niveau < 0}
            checked={opties.pagina_per_groep}
            onChange={e => zet({ pagina_per_groep: e.target.checked })}
          />
          Elke groep op een nieuwe pagina
        </label>
      </div>

      {/* Telling */}
      {telling != null && (
        <p className={`text-[11.5px] ${
          telling > MAX_REGISTRATIES ? 'text-red-600'
          : telling > WAARSCHUW_REGISTRATIES ? 'text-amber-700'
          : 'text-neutral-500'
        }`}>
          {telling === 0
            ? 'Geen registraties met dit filter.'
            : `${telling} registratie${telling === 1 ? '' : 's'} · ${paginas} pagina${paginas === 1 ? '' : '’s'}`}
          {telling > MAX_REGISTRATIES && ` — meer dan het maximum van ${MAX_REGISTRATIES}; scherp het filter aan.`}
          {telling > WAARSCHUW_REGISTRATIES && telling <= MAX_REGISTRATIES && ' — dit duurt even.'}
        </p>
      )}
    </div>
  )
}

/** Het pad van knoop-ids van de wortel tot en met `nodeId` (voor de cascade-selectie). */
function padNaarWortel(boom: LocatieBoom, nodeId: string): string[] {
  const uit: string[] = []
  let huidig = boom.nodes.find(n => n.id === nodeId)
  let vangnet = 0
  while (huidig && vangnet++ <= MAX_DIEPTE) {
    uit.unshift(huidig.id)
    huidig = huidig.parent_id ? boom.nodes.find(n => n.id === huidig!.parent_id) : undefined
  }
  return uit
}
