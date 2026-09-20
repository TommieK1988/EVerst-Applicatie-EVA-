'use client'

/**
 * Blok Acquisitie op de relatiepagina: de gesprekshistorie met deze opdrachtgever.
 *
 * Dezelfde notities die de mobiele module Commercieel toont en schrijft — wat iemand
 * onderweg vastlegt hoort op kantoor terug te vinden te zijn, en omgekeerd. De
 * server-actions revalideren daarom beide paden (zie `lib/relaties/notities-actions.ts`).
 *
 * Opzet 1-op-1 als `components/dossiers/tabs/DossierNotitiesBlok.tsx`: lijst boven, invoer
 * onderaan vastgezet, optimistisch toevoegen en verwijderen. Eén verschil: je kunt erbij
 * zetten mét wie je sprak. Dat veld is optioneel, want een gesprek gaat vaak over de klant
 * als geheel.
 */

import React from 'react'
import toast from 'react-hot-toast'
import { Trash2 } from 'lucide-react'
import { Card, CardHeader, CardBody, Textarea } from '@/components/ui'
import {
  plaatsRelatieNotitie, verwijderRelatieNotitie,
} from '@/lib/relaties/notities-actions'
import type { RelatieNotitie } from '@/lib/relaties/notities-types'

export type ContactpersoonKeuze = { id: string; naam: string }

function fmtTijd(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function AcquisitieBlok({
  relatieId, notities, contactpersonen, currentMedewerkerId, magSchrijven,
}: {
  relatieId: string
  notities: RelatieNotitie[]
  contactpersonen: ContactpersoonKeuze[]
  currentMedewerkerId: string | null
  magSchrijven: boolean
}) {
  const [items, setItems]     = React.useState<RelatieNotitie[]>(notities)
  const [tekst, setTekst]     = React.useState('')
  const [cpId, setCpId]       = React.useState('')
  const [pending, setPending] = React.useState(false)

  // Server-data is leidend zodra de route revalidatet (router.refresh / navigatie).
  React.useEffect(() => { setItems(notities) }, [notities])

  async function plaats(e: React.FormEvent) {
    e.preventDefault()
    const inhoud = tekst.trim()
    if (!inhoud || pending) return
    setPending(true)
    const res = await plaatsRelatieNotitie(relatieId, inhoud, cpId || null)
    setPending(false)
    if (!res.ok) { toast.error(res.error); return }
    // De action kent de naam van de gekozen contactpersoon niet (die zou een extra query
    // kosten terwijl iemand staat te wachten); hier hebben we de lijst al, dus vullen we
    // hem zelf aan. Bij de volgende server-render komt dezelfde naam uit de database.
    const naam = contactpersonen.find(c => c.id === cpId)?.naam ?? null
    setItems(prev => [{ ...res.notitie, contactpersoon_naam: naam }, ...prev])
    setTekst('')
    setCpId('')
  }

  async function verwijder(id: string) {
    const vorige = items
    setItems(prev => prev.filter(n => n.id !== id)) // optimistisch
    const res = await verwijderRelatieNotitie(id)
    if (!res.ok) { setItems(vorige); toast.error(res.error) }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader><span>Acquisitie · {items.length}</span></CardHeader>

      <CardBody className="flex min-h-0 flex-1 flex-col gap-0 p-0">
        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-3" style={{ maxHeight: 320 }}>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
              <span className="text-[22px] opacity-35">💬</span>
              <span className="text-xs font-medium text-neutral-500">Nog geen gespreksnotities</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map(n => (
                <div key={n.id} className="group">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-neutral-700">{n.auteur_naam}</span>
                    <span className="text-[10.5px] text-neutral-400">{fmtTijd(n.created_at)}</span>
                    {n.contactpersoon_naam && (
                      <span className="text-[10.5px] text-neutral-500">· met {n.contactpersoon_naam}</span>
                    )}
                    {magSchrijven && currentMedewerkerId && n.medewerker_id === currentMedewerkerId && (
                      <button
                        type="button"
                        onClick={() => verwijder(n.id)}
                        title="Notitie verwijderen"
                        className="ml-auto shrink-0 text-neutral-300 opacity-0 transition-colors hover:text-error-700 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[13px] leading-snug text-neutral-800">
                    {n.inhoud}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {magSchrijven && (
          <form onSubmit={plaats} className="flex flex-col gap-2 border-t border-neutral-200 px-[18px] py-3">
            <Textarea
              value={tekst}
              onChange={e => setTekst(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') plaats(e) }}
              rows={2}
              placeholder="Wat is er besproken?"
              className="resize-none text-[13px]"
            />
            <div className="flex items-center gap-2">
              {contactpersonen.length > 0 && (
                <select
                  value={cpId}
                  onChange={e => setCpId(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-[12px] text-neutral-700"
                >
                  <option value="">Geen specifieke contactpersoon</option>
                  {contactpersonen.map(c => (
                    <option key={c.id} value={c.id}>{c.naam}</option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                disabled={!tekst.trim() || pending}
                className="ml-auto shrink-0 rounded-md bg-brand-600 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                Plaatsen
              </button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  )
}
