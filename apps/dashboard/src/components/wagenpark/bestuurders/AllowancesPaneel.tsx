'use client'

import { useTransition } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { removeAllowanceAction } from '@/app/(platform)/wagenpark/actions/allowances'

export type AllowanceRij = {
  id: string
  regel_code: string
  categorie: string | null
  reden: string | null
  aangemaakt_op: string
}

export default function AllowancesPaneel({
  allowances,
}: {
  allowances: AllowanceRij[]
}) {
  const [pending, startTransition] = useTransition()

  function intrekken(id: string) {
    startTransition(async () => {
      try {
        await removeAllowanceAction(id)
        toast.success('Allowance ingetrokken — volgende compliance-run toont bevindingen weer')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Fout')
      }
    })
  }

  if (allowances.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Geen actieve allowances. Op een bevinding kun je "Altijd toestaan" kiezen
        om hier een regel toe te voegen.
      </p>
    )
  }

  return (
    <ul className="divide-y">
      {allowances.map((a) => (
        <li key={a.id} className="py-3 flex items-start gap-3">
          <div className="p-1.5 rounded bg-green-50 flex-shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-700">{a.regel_code}</span>
              {a.categorie && (
                <>
                  <span>•</span>
                  <span className="text-slate-700">categorie: {a.categorie}</span>
                </>
              )}
              <span>•</span>
              <span>sinds {new Date(a.aangemaakt_op).toLocaleDateString('nl-NL')}</span>
            </div>
            {a.reden && <p className="text-sm text-slate-700 mt-1">{a.reden}</p>}
          </div>
          <button
            type="button"
            onClick={() => intrekken(a.id)}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline disabled:opacity-50"
          >
            <X className="w-3 h-3" />
            Intrekken
          </button>
        </li>
      ))}
    </ul>
  )
}
