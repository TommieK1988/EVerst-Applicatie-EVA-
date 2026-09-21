'use client'

/**
 * Een betrokkene aan het dossier hangen: een persoon óf een organisatie.
 *
 * Beide, omdat beide voorkomen. Meestal is het een mens — de opzichter van de corporatie, de
 * voorzitter van de VvE — maar soms weet je alleen het bureau ("Architectenbureau X doet de
 * tekeningen") en komt de naam later. Een organisatie zonder persoon is dus een geldige keuze,
 * geen half ingevuld formulier.
 */

import React, { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { zoekContactpersonen } from '@/lib/relaties/contactpersonen-actions'
import { zoekRelaties } from '@/lib/dossiers/actions'
import { voegBetrokkeneToe } from '@/lib/dossiers/betrokkenen'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, Input, FormField, EmptyState, Spinner,
} from '@/components/ui'

type Soort = 'persoon' | 'relatie'
type Treffer = { id: string; naam: string; regel: string | null }

export default function BetrokkeneToevoegenModal({
  dossierId,
  alGekoppeldePersonen,
  onSluit,
  onKlaar,
}: {
  dossierId: string
  /** Contactpersonen die al in de lijst staan — die hoeven niet nóg een keer aangeboden. */
  alGekoppeldePersonen: string[]
  onSluit: () => void
  onKlaar: () => void
}) {
  const [soort, setSoort] = useState<Soort>('persoon')
  const [term, setTerm] = useState('')
  const [treffers, setTreffers] = useState<Treffer[]>([])
  const [zoekt, setZoekt] = useState(false)
  const [gezocht, setGezocht] = useState(false)
  const [rol, setRol] = useState('')
  const [isPending, startTransition] = useTransition()

  // De prop is elke render een nieuwe array; als sleutel zou dat de zoek-effect eindeloos
  // opnieuw laten draaien. De inhoud is wat telt.
  const alGekoppeldKey = alGekoppeldePersonen.join(',')

  useEffect(() => {
    const schoon = term.trim()
    if (schoon.length < 2) { setTreffers([]); setGezocht(false); return }
    // Tikken gaat sneller dan de query; pas na een korte stilte zoeken scheelt een stroom
    // half-afgemaakte zoektermen.
    let afgebroken = false
    setZoekt(true)
    const timer = setTimeout(async () => {
      try {
        if (soort === 'persoon') {
          const res = await zoekContactpersonen(schoon)
          if (afgebroken) return
          const gekoppeld = new Set(alGekoppeldKey ? alGekoppeldKey.split(',') : [])
          setTreffers(res
            .filter(r => !gekoppeld.has(r.id))
            .map(r => ({
              id: r.id,
              naam: r.naam,
              regel: [r.email, r.organisaties.join(' · ')].filter(Boolean).join(' — ') || null,
            })))
        } else {
          const res = await zoekRelaties(schoon)
          if (afgebroken) return
          setTreffers(res.map(r => ({
            id: r.id,
            naam: r.naam,
            regel: [r.plaats, (r.types ?? []).join(' · ')].filter(Boolean).join(' — ') || null,
          })))
        }
        setGezocht(true)
      } catch {
        if (!afgebroken) toast.error('Zoeken is niet gelukt')
      } finally {
        if (!afgebroken) setZoekt(false)
      }
    }, 250)
    return () => { afgebroken = true; clearTimeout(timer) }
  }, [term, soort, alGekoppeldKey])

  function voegToe(treffer: Treffer) {
    startTransition(async () => {
      const res = await voegBetrokkeneToe({
        dossier_id: dossierId,
        contactpersoon_id: soort === 'persoon' ? treffer.id : null,
        relatie_id: soort === 'relatie' ? treffer.id : null,
        rol: rol.trim() || null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`${treffer.naam} toegevoegd`)
      onKlaar()
      onSluit()
    })
  }

  function wissel(nieuw: Soort) {
    if (nieuw === soort) return
    setSoort(nieuw)
    setTreffers([])
    setGezocht(false)
  }

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Betrokkene toevoegen</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-3.5">
            {/* De dialoog hangt in een portal buiten `.eva`; daar bestaan de DS-variabelen niet
                en valt `var(--border)` stil weg. Vandaar Tailwind-klassen i.p.v. tokens. */}
            <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
              {([['persoon', 'Contactpersoon'], ['relatie', 'Organisatie']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => wissel(key)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    soort === key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <FormField label="Rol bij deze opdracht">
              <Input
                value={rol}
                onChange={e => setRol(e.target.value)}
                placeholder="Opzichter, Architect, VvE-voorzitter…"
                autoFocus
              />
            </FormField>

            <FormField label={soort === 'persoon' ? 'Zoek een contactpersoon' : 'Zoek een organisatie'}>
              <Input
                value={term}
                onChange={e => setTerm(e.target.value)}
                placeholder={soort === 'persoon' ? 'Jan de Vries, j.vries@…' : 'Architectenbureau, VvE Beheer…'}
              />
            </FormField>

            <div className="flex min-h-[140px] max-h-[280px] flex-col gap-1.5 overflow-y-auto">
              {zoekt && (
                <div className="flex items-center gap-2 px-0.5 py-2.5 text-[13px] text-neutral-500">
                  <Spinner size="sm" /> Zoeken…
                </div>
              )}

              {!zoekt && term.trim().length < 2 && (
                <span className="px-0.5 py-2.5 text-xs text-neutral-500">
                  Typ minimaal twee letters om te zoeken.
                </span>
              )}

              {!zoekt && gezocht && treffers.length === 0 && (
                <EmptyState
                  size="sm"
                  tone="neutral"
                  title="Niets gevonden"
                  description={soort === 'persoon'
                    ? 'Maak de contactpersoon eerst aan bij zijn organisatie in Relatiebeheer.'
                    : 'Staat de organisatie nog niet in EVA? Voeg hem toe in Relatiebeheer.'}
                />
              )}

              {!zoekt && treffers.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => !isPending && voegToe(t)}
                  disabled={isPending}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-[11px] py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-default disabled:hover:border-neutral-200 disabled:hover:bg-white"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-neutral-900">{t.naam}</span>
                    {t.regel && <span className="truncate text-xs text-neutral-500">{t.regel}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-brand-600">Toevoegen</span>
                </button>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onSluit} disabled={isPending}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
