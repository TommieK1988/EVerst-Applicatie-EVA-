'use client'

import { useState } from 'react'
import { RefreshCw, AlertTriangle, GitMerge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'

interface Props {
  onKies: (modus: 'volledig' | 'gewijzigd') => void
  onSluit: () => void
  isBezig: boolean
}

export default function HeroverhaalModal({ onKies, onSluit, isBezig }: Props) {
  const [gekozen, setGekozen] = useState<'volledig' | 'gewijzigd' | null>(null)

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isBezig) onSluit() }}>
      <DialogContent size="sm" hideClose>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-everts" />
            <DialogTitle>Calculatie opnieuw overhalen</DialogTitle>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {/* Optie: Gewijzigd */}
          <button
            onClick={() => setGekozen('gewijzigd')}
            disabled={isBezig}
            className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
              gekozen === 'gewijzigd'
                ? 'border-everts bg-everts-50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <GitMerge className={`w-4 h-4 mt-0.5 flex-shrink-0 ${gekozen === 'gewijzigd' ? 'text-everts' : 'text-slate-400'}`} />
              <div>
                <p className="text-sm font-semibold text-slate-800">Alleen gewijzigde regels</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nieuwe calculatieregels worden toegevoegd. Gewijzigde hoeveelheden, omschrijvingen
                  en kostengroepen worden bijgewerkt. Jouw aanpassingen in tarieven en leveranciers blijven behouden.
                </p>
              </div>
            </div>
          </button>

          {/* Optie: Volledig */}
          <button
            onClick={() => setGekozen('volledig')}
            disabled={isBezig}
            className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
              gekozen === 'volledig'
                ? 'border-red-400 bg-red-50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${gekozen === 'volledig' ? 'text-red-500' : 'text-slate-400'}`} />
              <div>
                <p className="text-sm font-semibold text-slate-800">Volledig opnieuw overnemen</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verwijdert alle bestaande werkbegrotingsregels en kopieert de volledige calculatie opnieuw.
                  <span className="font-semibold text-red-600"> Alle aanpassingen in tarieven, leveranciers en offertenummers gaan verloren.</span>
                </p>
              </div>
            </div>
          </button>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="md" onClick={onSluit} disabled={isBezig}>
            Annuleren
          </Button>
          <Button
            variant={gekozen === 'volledig' ? 'destructive' : 'primary'}
            size="md"
            onClick={() => gekozen && onKies(gekozen)}
            disabled={!gekozen || isBezig}
            loading={isBezig}
          >
            Uitvoeren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
