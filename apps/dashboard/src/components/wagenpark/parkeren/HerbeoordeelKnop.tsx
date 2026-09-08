'use client'

import { useTransition } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw } from 'lucide-react'
import { runParkeerToewijzingAction } from '@/app/(platform)/wagenpark/actions/parkeer-toewijzing'

/**
 * Laat de toewijzing opnieuw over de openstaande parkeerkosten lopen.
 *
 * Nuttig zodra er nieuwe planning of uren zijn ingevoerd: onbesliste regels
 * kunnen dan alsnog een duidelijk project krijgen. Al bevestigde regels blijven
 * ongemoeid — dat bewaakt de engine zelf.
 */
export default function HerbeoordeelKnop() {
  const [bezig, start] = useTransition()

  return (
    <button
      onClick={() =>
        start(async () => {
          const res = await runParkeerToewijzingAction()
          if (!res.ok) {
            toast.error(res.error ?? 'Opnieuw beoordelen is mislukt.')
            return
          }
          const r = res.resultaat!
          toast.success(
            `${r.bekeken} bekeken · ${r.automatisch} automatisch toegewezen · ${r.werkvoorraad} te beoordelen`,
          )
        })
      }
      disabled={bezig}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-md border bg-white text-sm hover:bg-slate-50 disabled:opacity-50"
    >
      <RefreshCw className={'w-4 h-4' + (bezig ? ' animate-spin' : '')} />
      {bezig ? 'Bezig…' : 'Opnieuw beoordelen'}
    </button>
  )
}
