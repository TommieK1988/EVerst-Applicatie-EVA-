'use client'

import { ArrowLeft, RefreshCw, Plus, FolderOpen, Printer, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Meetstaat } from '@/lib/everts-calc/types'

/**
 * Kop van de meetstaat, volgens het PageHeader-patroon uit het design system:
 * context (calculatie) als eyebrow, de meetstaat als titel, één statuslabel in
 * gewone taal, en één primaire knop: de wijzigingen naar de calculatie brengen.
 */
export default function MeetstaatKopbalk({
  meetstaat, calculatie, terugLabel, terugTitel, aantalOpen, isSyncing, bevroren, bevrorenMelding,
  meerwerk, versie, onTerug, onVervers, onNieuw, onOpenen, onAfdrukken, onSync,
}: {
  meetstaat: Meetstaat | null
  /** 'Calculatie 2026-114 · VvE …', leeg als onbekend. */
  calculatie: string
  terugLabel: string
  terugTitel: string
  aantalOpen: number
  isSyncing: boolean
  bevroren: boolean
  bevrorenMelding: string
  meerwerk: boolean
  versie: number
  onTerug: () => void
  onVervers: () => void
  onNieuw: () => void
  onOpenen: () => void
  onAfdrukken: () => void
  onSync: () => void
}) {
  return (
    <header className="flex-shrink-0 bg-white border-b border-neutral-200 px-6 py-3 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onTerug} title={terugTitel} className="-ml-2.5 text-neutral-600">
          <ArrowLeft className="w-4 h-4" />
          {terugLabel}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[280px] flex flex-col gap-1">
          {calculatie && (
            <span className="text-[11px] font-bold uppercase tracking-[0.10em] text-neutral-500 truncate">
              {calculatie}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-neutral-900">
              Meetstaat
              {meetstaat && (
                <>
                  <span className="text-neutral-400"> › </span>
                  <span className="tabular-nums">{meetstaat.code}</span> {meetstaat.naam}
                </>
              )}
            </h1>
            {meetstaat && (
              <StatusLabel aantalOpen={aantalOpen} bevroren={bevroren} bevrorenMelding={bevrorenMelding}
                verwerkt={meetstaat.status === 'gesynchroniseerd'} />
            )}
            {meerwerk
              ? <Badge tone="neutral" variant="outline">Meerwerk</Badge>
              : versie > 1 && <Badge tone="neutral" variant="outline">v{versie}</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon-md" onClick={onVervers}
            title="Herlaad schilderbibliotheek en groepsindeling" aria-label="Bibliotheek en groepen herladen">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={onNieuw}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nieuwe meetstaat</span>
          </Button>
          <Button variant="outline" onClick={onOpenen}>
            <FolderOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Openen</span>
          </Button>
          {meetstaat && (
            <Button variant="outline" onClick={onAfdrukken} title="Hele meetstaat afdrukken">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Afdrukken</span>
            </Button>
          )}
          {meetstaat && (
            <Button
              variant="primary"
              onClick={onSync}
              loading={isSyncing}
              disabled={aantalOpen === 0 || bevroren}
              title={bevroren ? bevrorenMelding : aantalOpen === 0 ? 'Alles staat al in de calculatie' : undefined}
            >
              {!isSyncing && <ArrowRight className="w-4 h-4" />}
              Sync naar calculatie
              {aantalOpen > 0 && (
                <span className="ml-0.5 rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">{aantalOpen}</span>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

/** Eén zin over waar de meetstaat staat ten opzichte van de calculatie. */
function StatusLabel({ aantalOpen, bevroren, bevrorenMelding, verwerkt }: {
  aantalOpen: number; bevroren: boolean; bevrorenMelding: string; verwerkt: boolean
}) {
  if (bevroren) return <Badge tone="neutral" title={bevrorenMelding}>Bevroren</Badge>
  if (aantalOpen > 0) {
    return (
      <Badge tone="warning" dot>
        {aantalOpen} {aantalOpen === 1 ? 'wijziging' : 'wijzigingen'} nog niet in calculatie
      </Badge>
    )
  }
  if (verwerkt) return <Badge tone="success" dot>Alles in calculatie</Badge>
  return <Badge tone="neutral">Nog niets verwerkt</Badge>
}
