'use client'

/**
 * Bouwstenen van het venster "Nieuwe aanvraag": de secties met hun gekleurde kop,
 * de zoeklijst onder een zoekveld, en de twee kleine vensters voor een nieuwe
 * opdrachtgever of contactpersoon.
 *
 * Los van `NieuweAanvraagModal` zodat dat bestand over de logica gaat en niet over
 * opmaak. Alles hier draait op de DS-klassen (Tailwind), niet op inline `var(--…)`:
 * de zoeklijst had `background: var(--bg-elev)` en was daardoor doorzichtig — de
 * velden eronder schemerden door de resultaten heen.
 */

import React from 'react'
import { cn } from '@everts/ui'
import {
  Button, Badge, Input, FormField,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui'

/* ─── Sectie met gekleurde kop ──────────────────────────────────────── */

export function Sectie({
  titel, omschrijving, icoon: Icoon, children,
}: {
  titel: string
  omschrijving?: string
  icoon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section className="mb-4 rounded-xl border border-neutral-200 bg-white last:mb-0">
      <div className="flex items-center gap-3 rounded-t-xl border-b border-brand-100 bg-brand-50/60 px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white shadow-sm">
          <Icoon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold leading-tight text-neutral-900">{titel}</h3>
          {omschrijving && <p className="mt-0.5 text-xs leading-tight text-neutral-500">{omschrijving}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  )
}

export function Rij({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>
}

/** Native select met de opmaak van het DS-invoerveld. */
export const selectKlasse =
  'h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-[13px] text-neutral-900 outline-none transition-[border-color,box-shadow] hover:border-neutral-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400'

export function LinkKnop({ children, onClick, gedimd }: { children: React.ReactNode; onClick: () => void; gedimd?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mt-2 self-start text-xs font-semibold text-brand-700 hover:text-brand-600 hover:underline',
        gedimd && 'opacity-50',
      )}
    >
      {children}
    </button>
  )
}

/* ─── Zoeklijst onder een zoekveld ──────────────────────────────────── */

export function Zoeklijst({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-[0_12px_24px_-6px_rgba(16,24,40,0.18),0_4px_6px_-2px_rgba(16,24,40,0.06)]">
      {children}
    </div>
  )
}

export function ZoeklijstItem({
  titel, regels, badge, onKies,
}: {
  titel: string
  regels?: (string | null | undefined)[]
  badge?: string | null
  onKies: () => void
}) {
  return (
    <button
      type="button"
      // mousedown i.p.v. click: de blur van het zoekveld sluit de lijst anders vóór de klik landt.
      onMouseDown={e => { e.preventDefault(); onKies() }}
      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-brand-50"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-semibold text-neutral-900">{titel}</span>
        {regels?.filter(Boolean).map((r, i) => (
          <span key={i} className="truncate text-xs text-neutral-500">{r}</span>
        ))}
      </span>
      {badge && <Badge size="sm" tone={badgeToon(badge)} className="shrink-0 uppercase tracking-[0.06em]">{badge}</Badge>}
    </button>
  )
}

function badgeToon(type: string): 'brand' | 'info' | 'warning' | 'neutral' {
  if (type === 'opdrachtgever') return 'brand'
  if (type === 'onderaannemer') return 'warning'
  if (type === 'leverancier') return 'info'
  return 'neutral'
}

/* ─── Genestelde mini-dialogs (direct in Bouw7 + EVA) ────────────────── */

export function NieuweOrgDialog({ onSluit, onAanmaken, startNaam }: { onSluit: () => void; onAanmaken: (naam: string) => Promise<void>; startNaam?: string }) {
  const [naam, setNaam] = React.useState(startNaam ?? '')
  const [bezig, setBezig] = React.useState(false)
  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Nieuwe opdrachtgever</DialogTitle></DialogHeader>
        <DialogBody>
          <FormField label="Bedrijfsnaam" upper required helper="Wordt direct in Bouw7 én EVA aangemaakt als opdrachtgever.">
            <Input autoFocus value={naam} onChange={e => setNaam(e.target.value)} placeholder="Bedrijfsnaam" />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleer</Button>
          <Button variant="primary" disabled={!naam.trim() || bezig} loading={bezig} onClick={async () => { setBezig(true); try { await onAanmaken(naam) } finally { setBezig(false) } }}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NieuweCpDialog({ onSluit, onAanmaken, orgNaam }: { onSluit: () => void; onAanmaken: (voornaam: string, achternaam: string, functie: string) => Promise<void>; orgNaam?: string }) {
  const [voornaam, setVoornaam] = React.useState('')
  const [achternaam, setAchternaam] = React.useState('')
  const [functie, setFunctie] = React.useState('')
  const [bezig, setBezig] = React.useState(false)
  const geldig = Boolean(voornaam.trim() && achternaam.trim())
  return (
    <Dialog open onOpenChange={o => !o && onSluit()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Nieuwe contactpersoon</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {orgNaam && <div className="text-xs text-neutral-500">Bij: <strong className="text-neutral-900">{orgNaam}</strong></div>}
          <Rij>
            <FormField label="Voornaam" upper required>
              <Input autoFocus value={voornaam} onChange={e => setVoornaam(e.target.value)} />
            </FormField>
            <FormField label="Achternaam" upper required>
              <Input value={achternaam} onChange={e => setAchternaam(e.target.value)} />
            </FormField>
          </Rij>
          <FormField label="Functie" upper>
            <Input value={functie} onChange={e => setFunctie(e.target.value)} placeholder="Bijv. Technisch beheerder" />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleer</Button>
          <Button variant="primary" disabled={!geldig || bezig} loading={bezig} onClick={async () => { setBezig(true); try { await onAanmaken(voornaam, achternaam, functie) } finally { setBezig(false) } }}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
