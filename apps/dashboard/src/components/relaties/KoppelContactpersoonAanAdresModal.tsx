'use client'

/**
 * Een contactpersoon aan een factuuradres hangen.
 *
 * Meestal is dat iemand die al bij deze relatie staat — de beheerder die de facturen verwerkt —
 * dus die mensen staan bovenaan als directe keuze. Maar niet altijd: de voorzitter van een VvE of
 * de assetmanager van een portefeuille werkt vaak bij een ánder bedrijf. Daarom kun je hier ook
 * buiten deze relatie zoeken, en anders meteen een nieuwe persoon aanmaken.
 */

import React, { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { zoekContactpersonen } from '@/lib/relaties/contactpersonen-actions'
import { koppelContactpersoonAanFactuuradres } from '@/lib/relaties/factuuradres-contactpersonen'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, Input, FormField, Checkbox, EmptyState, Spinner,
} from '@/components/ui'
import NieuweContactpersoonModal from './NieuweContactpersoonModal'

type Keuze = { id: string; naam: string; email: string | null; toelichting: string | null }

export default function KoppelContactpersoonAanAdresModal({
  factuuradresId,
  adresLabel,
  relatieId,
  alGekoppeld,
  suggesties,
  onSluit,
  onKlaar,
}: {
  factuuradresId: string
  adresLabel: string
  relatieId: string
  /** Personen die al aan dít adres hangen — die hoeven niet nóg een keer in de lijst. */
  alGekoppeld: string[]
  /** De contactpersonen van deze relatie, als directe keuze bovenaan. */
  suggesties: Keuze[]
  onSluit: () => void
  onKlaar: () => void
}) {
  const [term, setTerm] = useState('')
  const [treffers, setTreffers] = useState<Keuze[]>([])
  const [zoekt, setZoekt] = useState(false)
  const [gezocht, setGezocht] = useState(false)
  const [rol, setRol] = useState('')
  const [primair, setPrimair] = useState(false)
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
        setTreffers(res
          .filter(r => !gekoppeld.has(r.id))
          .map(r => ({ id: r.id, naam: r.naam, email: r.email, toelichting: r.organisaties.join(' · ') || null })))
        setGezocht(true)
      } catch {
        if (!afgebroken) toast.error('Zoeken is niet gelukt')
      } finally {
        if (!afgebroken) setZoekt(false)
      }
    }, 250)
    return () => { afgebroken = true; clearTimeout(timer) }
  }, [term, alGekoppeldKey])

  function koppel(keuze: Keuze) {
    startTransition(async () => {
      const res = await koppelContactpersoonAanFactuuradres({
        contactpersoon_id: keuze.id,
        factuuradres_id: factuuradresId,
        rol: rol.trim() || null,
        is_primair: primair,
        relatie_id: relatieId,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`${keuze.naam} gekoppeld aan ${adresLabel}`)
      onKlaar()
      onSluit()
    })
  }

  if (nieuwOpen) {
    return (
      <NieuweContactpersoonModal
        organisatieId={relatieId}
        beginFunctie={rol.trim()}
        onAangemaakt={id => koppel({ id, naam: 'De contactpersoon', email: null, toelichting: null })}
        onSluit={onSluit}
      />
    )
  }

  const gekoppeld = new Set(alGekoppeld)
  const beschikbareSuggesties = suggesties.filter(s => !gekoppeld.has(s.id))
  const lijst = term.trim().length >= 2 ? treffers : beschikbareSuggesties

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contactpersoon bij {adresLabel}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-3.5">
            <FormField label="Rol bij dit adres">
              <Input
                value={rol}
                onChange={e => setRol(e.target.value)}
                placeholder="Voorzitter, Penningmeester, Assetmanager…"
                autoFocus
              />
            </FormField>

            <div className="flex items-center gap-2">
              <Checkbox
                id="adres-cp-primair"
                checked={primair}
                onCheckedChange={checked => setPrimair(checked === true)}
              />
              <label htmlFor="adres-cp-primair" className="cursor-pointer select-none text-[13px] text-neutral-900">
                Eerste aanspreekpunt voor dit adres
              </label>
            </div>

            <FormField label="Zoek buiten deze relatie">
              <Input
                value={term}
                onChange={e => setTerm(e.target.value)}
                placeholder="Jan de Vries, j.vries@…"
              />
            </FormField>

            {/* De dialoog hangt in een portal buiten `.eva`; daar bestaan de DS-variabelen niet
                en valt `var(--border)` stil weg. Vandaar Tailwind-klassen i.p.v. tokens. */}
            <div className="flex min-h-[120px] max-h-[280px] flex-col gap-1.5 overflow-y-auto">
              {term.trim().length < 2 && (
                <span className="px-0.5 pb-1 text-xs text-neutral-500">
                  {beschikbareSuggesties.length > 0
                    ? 'Contactpersonen van deze relatie:'
                    : 'Typ hierboven een naam om iemand te zoeken.'}
                </span>
              )}

              {zoekt && (
                <div className="flex items-center gap-2 px-0.5 py-2.5 text-[13px] text-neutral-500">
                  <Spinner size="sm" /> Zoeken…
                </div>
              )}

              {!zoekt && gezocht && treffers.length === 0 && (
                <EmptyState
                  size="sm"
                  tone="neutral"
                  title="Niemand gevonden"
                  description="Maak hieronder een nieuwe contactpersoon aan."
                />
              )}

              {!zoekt && lijst.map(k => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => !isPending && koppel(k)}
                  disabled={isPending}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-[11px] py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-default disabled:hover:border-neutral-200 disabled:hover:bg-white"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-neutral-900">{k.naam}</span>
                    {k.email && <span className="text-xs text-neutral-500">{k.email}</span>}
                    {k.toelichting && <span className="text-xs text-neutral-500">{k.toelichting}</span>}
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
