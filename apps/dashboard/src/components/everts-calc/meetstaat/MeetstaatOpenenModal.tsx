'use client'

import { Clock } from 'lucide-react'
import type { Meetstaat } from '@/lib/everts-calc/types'
import { getMeetstaten } from '@/lib/everts-calc/local-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  scenarioId: string
  onSelecteer: (ms: Meetstaat) => void
  onSluit: () => void
}

export default function MeetstaatOpenenModal({ scenarioId, onSelecteer, onSluit }: Props) {
  const meetstaten = getMeetstaten(scenarioId).sort((a, b) =>
    b.aangepast_op.localeCompare(a.aangepast_op)
  )

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSluit() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Meetstaat openen</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-2 max-h-80 py-4">
          {meetstaten.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-6 h-6" />}
              title="Geen meetstaten gevonden"
              description="Er zijn nog geen meetstaten voor dit scenario"
              tone="neutral"
              size="sm"
            />
          ) : (
            meetstaten.map(ms => (
              <Button
                key={ms.id}
                variant="ghost"
                onClick={() => onSelecteer(ms)}
                className="w-full h-auto flex items-start gap-3 px-4 py-3 rounded-xl border border-slate-200
                           hover:border-everts/40 hover:bg-everts/5 text-left justify-start"
              >
                <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{ms.naam}</span>
                    <span className="text-xs  text-slate-400">{ms.code}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ml-auto ${
                      ms.status === 'gesynchroniseerd'
                        ? 'bg-green-50 text-green-600 border-green-200'
                        : ms.status === 'definitief'
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : 'bg-amber-50 text-amber-600 border-amber-200'
                    }`}>
                      {ms.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Bewerkt: {new Date(ms.aangepast_op).toLocaleDateString('nl-NL', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </Button>
            ))
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onSluit}>
            Annuleren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
