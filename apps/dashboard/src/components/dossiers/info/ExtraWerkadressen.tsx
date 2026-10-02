'use client'

/**
 * Extra werkadressen in de Werkadres-kaart van de Informatie-tab. Het hoofdadres staat erboven en
 * gaat two-way met Bouw7; deze adressen zijn EVA-eigen, voor opdrachten op meerdere locaties
 * (vestigingen, verspreid bezit). De prikklok, "openen op locatie" en de Navigeren-knoppen op de
 * telefoon werken op elk van deze adressen.
 */

import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, useDialogen } from '@/components/ui'
import {
  haalExtraWerkadressen, verwijderWerkadres, type ExtraWerkadres,
} from '@/lib/dossiers/werkadressen-actions'
import { adresRegel } from '@/lib/dossiers/werkpunten'
import WerkadresDialog from './WerkadresDialog'

function LocatieBadge({ w }: { w: ExtraWerkadres }) {
  if (w.geocode_status === 'ok') return <Badge tone="success" size="sm">Locatie bekend</Badge>
  if (w.geocode_status === 'geen_match') {
    return (
      <Badge tone="warning" size="sm" title="Dit adres is niet op de kaart gevonden. Inklokken en openen op locatie werken hier niet tot het adres klopt.">
        Locatie niet gevonden
      </Badge>
    )
  }
  return <Badge tone="neutral" size="sm" title="De locatie wordt bij de volgende synchronisatie opgezocht.">Locatie volgt</Badge>
}

export default function ExtraWerkadressen({ dossierId, readOnly, initieel }: {
  dossierId: string
  readOnly: boolean
  /** Al opgehaalde adressen; zonder deze haalt het blok ze zelf op. */
  initieel?: ExtraWerkadres[]
}) {
  const { bevestig } = useDialogen()
  const [lijst, setLijst] = useState<ExtraWerkadres[] | null>(initieel ?? null)
  const [bewerk, setBewerk] = useState<ExtraWerkadres | 'nieuw' | null>(null)

  useEffect(() => {
    if (initieel) return
    let actief = true
    haalExtraWerkadressen(dossierId)
      .then(r => { if (actief) setLijst(r) })
      .catch(() => { if (actief) setLijst([]) })
    return () => { actief = false }
  }, [dossierId, initieel])

  const verwijder = async (w: ExtraWerkadres) => {
    const ok = await bevestig({
      titel: 'Werkadres verwijderen?',
      omschrijving: [w.naam, adresRegel(w.straat, w.huisnummer, w.stad)].filter(Boolean).join(' — '),
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (!ok) return
    const res = await verwijderWerkadres(w.id)
    if (!res.ok) { toast.error(res.error); return }
    setLijst(l => (l ?? []).filter(x => x.id !== w.id))
  }

  const opgeslagen = (w: ExtraWerkadres) => {
    setLijst(l => {
      const rest = (l ?? []).filter(x => x.id !== w.id)
      return [...rest, w].sort((a, b) => a.volgorde - b.volgorde)
    })
    setBewerk(null)
  }

  if (lijst == null) return null
  if (readOnly && lijst.length === 0) return null

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          Extra werkadressen
        </span>
        {!readOnly && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setBewerk('nieuw')}>
            <Plus size={12} strokeWidth={2.5} />
            Werkadres toevoegen
          </Button>
        )}
      </div>

      {lijst.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Werkt de opdracht op meerdere locaties? Voeg ze hier toe, dan werken de prikklok en de navigatie op elk adres.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lijst.map(w => {
            const regel = [adresRegel(w.straat, w.huisnummer, null), [w.postcode, w.stad].filter(Boolean).join(' ')]
              .filter(Boolean).join(', ')
            const contact = [w.contact_naam, w.contact_telefoon].filter(Boolean).join(' · ')
            return (
              <li key={w.id} className="flex items-start gap-3 rounded-md border border-[var(--border)] px-3 py-2">
                <MapPin size={14} className="mt-0.5 shrink-0 text-neutral-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-neutral-900">{w.naam || regel || 'Werkadres'}</span>
                    <LocatieBadge w={w} />
                  </div>
                  {w.naam && regel && <div className="text-xs text-neutral-600">{regel}</div>}
                  {contact && <div className="text-xs text-neutral-500">{contact}</div>}
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" title="Wijzigen" onClick={() => setBewerk(w)}>
                      <Pencil size={13} />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" title="Verwijderen" onClick={() => verwijder(w)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {bewerk && (
        <WerkadresDialog
          dossierId={dossierId}
          bestaand={bewerk === 'nieuw' ? null : bewerk}
          onOpgeslagen={opgeslagen}
          onSluit={() => setBewerk(null)}
        />
      )}
    </div>
  )
}
