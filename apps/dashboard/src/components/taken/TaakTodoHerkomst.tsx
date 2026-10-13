'use client'

import { useState, useTransition } from 'react'
import { ExternalLink, ListChecks } from 'lucide-react'

import DossierKiezer from '@/components/wagenpark/parkeren/DossierKiezer'
import { updateTaak } from '@/app/(platform)/taken/actions/taken'
import { todoWebUrl } from '@/lib/o365/todo-url'

/**
 * Detailpaneel, voor een actie uit Microsoft To Do: waar hij vandaan komt, een link terug
 * naar To Do, en een dossier kiezen. Koppelen gebeurt alleen hier, met de hand: EVA raadt
 * niet aan de hand van de titel bij welk dossier een To Do-taak hoort.
 */
export default function TaakTodoHerkomst({
  taakId, lijstNaam, todoTaakId, dossierId, dossierNaam,
}: {
  taakId: string
  lijstNaam: string
  todoTaakId: string | null
  dossierId: string | null
  dossierNaam: string | null
}) {
  const [label, setLabel] = useState<string | null>(dossierId ? dossierNaam ?? 'Gekoppeld dossier' : null)
  const [, startTransition] = useTransition()

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 space-y-2">
      <div className="flex items-center gap-2 text-xs text-neutral-600">
        <ListChecks className="h-3.5 w-3.5 text-neutral-500" />
        <span>Uit Microsoft To Do · lijst <span className="font-medium text-neutral-800">{lijstNaam}</span></span>
        {todoTaakId && (
          <a
            href={todoWebUrl(todoTaakId)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:underline"
          >
            Openen in To Do <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500 shrink-0">Dossier</span>
        <div className="min-w-0 flex-1 text-neutral-800">
          <DossierKiezer
            huidigLabel={label}
            onKies={d => {
              setLabel(d.label)
              startTransition(() => updateTaak(taakId, { dossier_id: d.id }))
            }}
          />
        </div>
        {label && (
          <button
            onClick={() => {
              setLabel(null)
              startTransition(() => updateTaak(taakId, { dossier_id: null }))
            }}
            className="text-neutral-400 hover:text-neutral-700"
          >
            Loskoppelen
          </button>
        )}
      </div>
    </div>
  )
}
