'use client'

import React, { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import {
  koppelContactpersoonAanOrganisatie,
  zoekContactpersonen,
} from '@/lib/relaties/contactpersonen-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, Input, FormField, EmptyState, Spinner,
} from '@/components/ui'
import NieuweContactpersoonModal from './NieuweContactpersoonModal'

type Treffer = { id: string; naam: string; email: string | null; organisaties: string[] }

/**
 * Contactpersoon aan een relatie hangen. Eerst zoeken: dezelfde persoon werkt vaak bij meerdere
 * organisaties en hoort dan één rij in EVA te blijven. Levert dat niets op, dan maakt de knop
 * onderin een nieuwe persoon aan die meteen aan deze relatie hangt.
 */
export default function KoppelContactpersoonModal({
  relatieId,
  alGekoppeld,
  onSluit,
  onKlaar,
}: {
  relatieId: string
  /** Ids die al aan deze relatie hangen — die hoeven niet nóg een keer in de lijst. */
  alGekoppeld: string[]
  onSluit: () => void
  onKlaar: () => void
}) {
  const [term, setTerm] = useState('')
  const [treffers, setTreffers] = useState<Treffer[]>([])
  const [zoekt, setZoekt] = useState(false)
  const [gezocht, setGezocht] = useState(false)
  const [functie, setFunctie] = useState('')
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // De prop is elke render een nieuwe array; als sleutel zou dat de zoek-effect eindeloos
  // opnieuw laten draaien. De inhoud is wat telt.
  const alGekoppeldKey = alGekoppeld.join(',')

  useEffect(() => {
    const schoon = term.trim()
    if (schoon.length < 2) { setTreffers([]); setGezocht(false); return }
    // Tikken gaat sneller dan de query; pas na een korte stilte zoeken scheelt een stroom
    // half-afgemaakte zoektermen.
    let afgebroken = false
    setZoekt(true)
    const timer = setTimeout(async () => {
      try {
        const res = await zoekContactpersonen(schoon)
        if (afgebroken) return
        const gekoppeld = new Set(alGekoppeldKey ? alGekoppeldKey.split(',') : [])
        setTreffers(res.filter(r => !gekoppeld.has(r.id)))
        setGezocht(true)
      } catch {
        if (!afgebroken) toast.error('Zoeken is niet gelukt')
      } finally {
        if (!afgebroken) setZoekt(false)
      }
    }, 250)
    return () => { afgebroken = true; clearTimeout(timer) }
  }, [term, alGekoppeldKey])

  function koppel(treffer: Treffer) {
    startTransition(async () => {
      const res = await koppelContactpersoonAanOrganisatie(treffer.id, relatieId, functie.trim() || null)
      if (!res.ok) { toast.error(res.error); return }
      if (res.waarschuwing) toast(res.waarschuwing)
      else toast.success(`${treffer.naam} gekoppeld`)
      onKlaar()
      onSluit()
    })
  }

  if (nieuwOpen) {
    return (
      <NieuweContactpersoonModal
        organisatieId={relatieId}
        beginFunctie={functie.trim()}
        onAangemaakt={() => onKlaar()}
        onSluit={onSluit}
      />
    )
  }

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contactpersoon koppelen</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-3.5">
            <FormField label="Zoek op naam of e-mail">
              <Input
                value={term}
                onChange={e => setTerm(e.target.value)}
                placeholder="Jan de Vries, j.vries@…"
                autoFocus
              />
            </FormField>

            <FormField label="Functie bij deze relatie">
              <Input
                value={functie}
                onChange={e => setFunctie(e.target.value)}
                placeholder="Projectmanager, Inkoper…"
              />
            </FormField>

            {/* De dialoog hangt in een portal buiten `.eva`; daar bestaan de DS-variabelen niet
                en valt `var(--border)` stil weg. Vandaar Tailwind-klassen i.p.v. tokens. */}
            <div className="flex min-h-[120px] max-h-[280px] flex-col gap-1.5 overflow-y-auto">
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
                  title="Niemand gevonden"
                  description="Maak hieronder een nieuwe contactpersoon aan."
                />
              )}

              {!zoekt && treffers.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => !isPending && koppel(t)}
                  disabled={isPending}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-[11px] py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-default disabled:hover:border-neutral-200 disabled:hover:bg-white"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-neutral-900">{t.naam}</span>
                    {t.email && <span className="text-xs text-neutral-500">{t.email}</span>}
                    {t.organisaties.length > 0 && (
                      <span className="text-xs text-neutral-500">{t.organisaties.join(' · ')}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-brand-600">Koppelen</span>
                </button>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onSluit} disabled={isPending}>Annuleer</Button>
          <Button type="button" variant="primary" onClick={() => setNieuwOpen(true)} disabled={isPending}>
            Nieuwe contactpersoon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
