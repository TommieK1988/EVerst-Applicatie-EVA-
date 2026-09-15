'use client'

/**
 * Beheer van de voorbeeldbestanden die EVA in een nieuwe dossiermap zet.
 *
 * Eén regel per bestand. De filters werken als bij de documentsjablonen: niets aangevinkt
 * betekent "geldt voor alles", wat het gangbare geval is en dus geen klikwerk kost.
 */

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Input, useDialogen } from '@/components/ui'
import { Trash2, Upload, ExternalLink } from 'lucide-react'
import type { StandaardbestandRegel } from '@/lib/o365/dossiermap-standaardbestanden'
import {
  uploadStandaardbestand,
  updateStandaardbestand,
  verwijderStandaardbestand,
  getStandaardbestandUrl,
} from './actions'

type Categorie = { id: number; name: string }
type Werkmaatschappij = { id: string; naam: string }

function leesbareGrootte(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function DossiermapBeheer({
  initial,
  categorieen,
  werkmaatschappijen,
}: {
  initial: StandaardbestandRegel[]
  categorieen: Categorie[]
  werkmaatschappijen: Werkmaatschappij[]
}) {
  const [regels, setRegels] = useState(initial)
  const [bezig, start] = useTransition()
  const [uploadt, setUploadt] = useState(false)
  const { bevestig } = useDialogen()

  async function opBestand(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadt(true)
    try {
      const fd = new FormData()
      fd.append('bestand', file)
      const res = await uploadStandaardbestand(fd)
      if (!res.ok) { toast.error(res.error); return }

      setRegels(v => [
        ...v,
        {
          id: res.id,
          naam: file.name,
          bestandsnaam: file.name,
          submap: null,
          storage_path: '',
          content_type: file.type || null,
          grootte: file.size,
          categorie_ids: [],
          werkmaatschappij_ids: [],
          actief: true,
          volgorde: 0,
        },
      ])
      toast.success('Voorbeeldbestand toegevoegd')
    } finally {
      setUploadt(false)
    }
  }

  /** Optimistisch bijwerken; faalt de opslag, dan zetten we de waarde terug. */
  function bewaar(id: string, velden: Partial<StandaardbestandRegel>) {
    const vorig = regels.find(r => r.id === id)
    if (!vorig) return
    setRegels(v => v.map(r => (r.id === id ? { ...r, ...velden } : r)))

    start(async () => {
      const res = await updateStandaardbestand(id, velden as Parameters<typeof updateStandaardbestand>[1])
      if (!res.ok) {
        setRegels(v => v.map(r => (r.id === id ? vorig : r)))
        toast.error(res.error ?? 'Opslaan mislukt')
      }
    })
  }

  async function verwijder(r: StandaardbestandRegel) {
    const akkoord = await bevestig({
      titel: 'Voorbeeldbestand verwijderen?',
      omschrijving: `"${r.bestandsnaam}" wordt niet meer in nieuwe dossiermappen gezet. Bestanden die al in een dossiermap staan blijven staan.`,
      bevestigLabel: 'Verwijderen',
    })
    if (!akkoord) return

    setRegels(v => v.filter(x => x.id !== r.id))
    const res = await verwijderStandaardbestand(r.id)
    if (!res.ok) {
      setRegels(v => [...v, r])
      toast.error(res.error ?? 'Verwijderen mislukt')
    }
  }

  async function bekijk(id: string) {
    const url = await getStandaardbestandUrl(id)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else toast.error('Bestand niet gevonden')
  }

  function toggleCategorie(r: StandaardbestandRegel, id: number) {
    const nieuw = r.categorie_ids.includes(id)
      ? r.categorie_ids.filter(x => x !== id)
      : [...r.categorie_ids, id]
    bewaar(r.id, { categorie_ids: nieuw })
  }

  function toggleWerkmaatschappij(r: StandaardbestandRegel, id: string) {
    const nieuw = r.werkmaatschappij_ids.includes(id)
      ? r.werkmaatschappij_ids.filter(x => x !== id)
      : [...r.werkmaatschappij_ids, id]
    bewaar(r.id, { werkmaatschappij_ids: nieuw })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded bg-brand-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-700">
          <Upload className="h-3.5 w-3.5" />
          {uploadt ? 'Bezig met uploaden…' : 'Bestand toevoegen'}
          <input type="file" className="hidden" onChange={opBestand} disabled={uploadt} />
        </label>
        <span className="text-[12px] text-neutral-500">Maximaal 20 MB per bestand.</span>
      </div>

      {regels.length === 0 ? (
        <p className="text-[13px] text-neutral-500">
          Nog geen voorbeeldbestanden. Wat je hier toevoegt komt automatisch in elke nieuwe dossiermap te staan.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
          {regels.map(r => (
            <li key={r.id} className="space-y-3 px-3 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                  <input
                    type="checkbox"
                    checked={r.actief}
                    onChange={e => bewaar(r.id, { actief: e.target.checked })}
                    disabled={bezig}
                  />
                  Actief
                </label>

                <div className="min-w-[200px] flex-1">
                  <Input
                    value={r.bestandsnaam}
                    onChange={e => setRegels(v => v.map(x => (x.id === r.id ? { ...x, bestandsnaam: e.target.value } : x)))}
                    onBlur={e => bewaar(r.id, { bestandsnaam: e.target.value })}
                    placeholder="naam in de dossiermap"
                  />
                </div>

                <div className="w-[170px]">
                  <Input
                    value={r.submap ?? ''}
                    onChange={e => setRegels(v => v.map(x => (x.id === r.id ? { ...x, submap: e.target.value } : x)))}
                    onBlur={e => bewaar(r.id, { submap: e.target.value })}
                    placeholder="submap (optioneel)"
                  />
                </div>

                <span className="text-[11px] text-neutral-400">{leesbareGrootte(r.grootte)}</span>

                <button
                  onClick={() => bekijk(r.id)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Bekijken
                </button>
                <button
                  onClick={() => verwijder(r)}
                  className="inline-flex items-center gap-1 text-[11.5px] text-red-600 hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> Verwijderen
                </button>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 pl-1">
                <Filterblok
                  label="Categorieën"
                  leeg="alle categorieën"
                  opties={categorieen.map(c => ({ sleutel: c.id, label: c.name }))}
                  gekozen={r.categorie_ids}
                  onToggle={id => toggleCategorie(r, id)}
                />
                <Filterblok
                  label="Werkmaatschappijen"
                  leeg="alle werkmaatschappijen"
                  opties={werkmaatschappijen.map(w => ({ sleutel: w.id, label: w.naam }))}
                  gekozen={r.werkmaatschappij_ids}
                  onToggle={id => toggleWerkmaatschappij(r, id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Niets aangevinkt = geldt voor alles; dat staat er ook letterlijk bij. */
function Filterblok<T extends string | number>({
  label, leeg, opties, gekozen, onToggle,
}: {
  label: string
  leeg: string
  opties: { sleutel: T; label: string }[]
  gekozen: T[]
  onToggle: (sleutel: T) => void
}) {
  if (opties.length === 0) return null
  return (
    <div className="min-w-[240px]">
      <p className="mb-1 text-[11px] font-medium text-neutral-500">
        {label} {gekozen.length === 0 && <span className="font-normal text-neutral-400">— {leeg}</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {opties.map(o => {
          const aan = gekozen.includes(o.sleutel)
          return (
            <button
              key={String(o.sleutel)}
              onClick={() => onToggle(o.sleutel)}
              className={
                'rounded border px-2 py-[2px] text-[11px] ' +
                (aan
                  ? 'border-brand-300 bg-brand-50 font-medium text-brand-700'
                  : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50')
              }
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
