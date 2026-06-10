'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { toggleRegelAction, updateRegelConfigAction } from '@/app/actions/regels'

type Props = {
  code: string
  titel: string
  beschrijving: string | null
  actief: boolean
  drempelConfig: unknown
}

export default function RegelEditor({ code, titel, beschrijving, actief, drempelConfig }: Props) {
  const initial = JSON.stringify(drempelConfig ?? {}, null, 2)
  const [json, setJson] = useState(initial)
  const [aanUit, setAanUit] = useState(actief)
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  function opslaan() {
    startTransition(async () => {
      const res = await updateRegelConfigAction(code, json)
      if (res.ok) {
        toast.success(`${code} opgeslagen — volgende compliance-run gebruikt nieuwe waarden`)
        setEditing(false)
      } else {
        toast.error(res.error ?? 'Fout')
      }
    })
  }

  function toggle() {
    const nieuw = !aanUit
    setAanUit(nieuw)
    startTransition(async () => {
      try {
        await toggleRegelAction(code, nieuw)
        toast.success(`${code} ${nieuw ? 'actief' : 'inactief'}`)
      } catch (err) {
        setAanUit(!nieuw)
        toast.error(err instanceof Error ? err.message : 'Fout')
      }
    })
  }

  return (
    <div className={`py-4 ${!aanUit ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-slate-700">{code}</span>
            <span className="text-sm font-medium">{titel}</span>
          </div>
          {beschrijving && <p className="text-xs text-slate-500 mt-1">{beschrijving}</p>}
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={
            aanUit
              ? 'text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50'
              : 'text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 disabled:opacity-50'
          }
        >
          {aanUit ? 'Actief' : 'Uit'}
        </button>
      </div>

      {!editing ? (
        <div className="flex items-start gap-2">
          <pre className="flex-1 text-xs text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto">
            {initial}
          </pre>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-green-700 hover:underline"
          >
            Bewerken
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full font-mono text-xs rounded border px-2 py-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={opslaan}
              disabled={pending}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {pending ? 'Opslaan…' : 'Opslaan'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setJson(initial) }}
              className="text-xs px-3 py-1.5 bg-slate-100 rounded hover:bg-slate-200"
            >
              Annuleren
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Drempelwaardes worden bij de volgende compliance-check meegenomen. Als je structurele
            logica wilt veranderen (bv. nieuwe regel), laat het me weten — dat vereist code-wijziging.
          </p>
        </div>
      )}
    </div>
  )
}
