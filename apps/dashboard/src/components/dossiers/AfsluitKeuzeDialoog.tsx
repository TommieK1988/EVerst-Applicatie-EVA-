'use client'

/**
 * De keuze na het slepen naar Afgesloten op het offertebord: gewonnen, verloren of vervallen.
 *
 * Eén kolom voor drie uitkomsten houdt het bord rustig, maar de uitkomst zelf is geen detail:
 * gewonnen maakt er een opdracht van, verloren en vervallen sluiten het dossier af met elk een
 * eigen redenenlijst. Daarom eerst kiezen; verloren en vervallen gaan daarna langs de
 * AfsluitenDialoog voor de reden.
 */

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody,
} from '@/components/ui'
import { AFSLUIT_KEUZES } from './offerte-bord'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "2026-123 — Schilderwerk complex Zuid", of leeg. */
  dossierOmschrijving?: string | null
  onKies: (substatus: (typeof AFSLUIT_KEUZES)[number]['key']) => void
}

export function AfsluitKeuzeDialoog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Hoe is deze offerte afgelopen?</DialogTitle>
            {props.dossierOmschrijving && (
              <DialogDescription>{props.dossierOmschrijving}</DialogDescription>
            )}
          </div>
        </DialogHeader>
        <DialogBody className="grid gap-2">
          {AFSLUIT_KEUZES.map(k => (
            <button
              key={k.key}
              type="button"
              onClick={() => props.onKies(k.key)}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-left hover:border-brand-500 hover:bg-neutral-50"
            >
              <div className="text-sm font-medium text-neutral-900">{k.label}</div>
              <div className="text-xs text-neutral-500">{k.uitleg}</div>
            </button>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
