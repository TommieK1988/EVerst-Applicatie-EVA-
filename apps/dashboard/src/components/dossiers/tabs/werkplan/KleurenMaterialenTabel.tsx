'use client'

/** Kleuren en materialen: een tabel met twee vrije tekstkolommen, rijen toevoegen en weghalen. */

import { Plus, Trash2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import type { KleurMateriaal } from '@/lib/dossiers/werkplan-types'

export default function KleurenMaterialenTabel({
  rijen, onChange, disabled,
}: {
  rijen: KleurMateriaal[]
  onChange: (rijen: KleurMateriaal[]) => void
  disabled?: boolean
}) {
  const wijzig = (i: number, veld: keyof KleurMateriaal, waarde: string) =>
    onChange(rijen.map((r, j) => (j === i ? { ...r, [veld]: waarde } : r)))

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border border-neutral-200">
        <table className="w-full text-[13px]">
          <thead className="bg-neutral-50 text-left">
            <tr>
              <th className="w-[40%] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Onderdeel</th>
              <th className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Kleur / materiaal</th>
              {!disabled && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rijen.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-3 text-neutral-400">Nog geen kleuren of materialen.</td>
              </tr>
            )}
            {rijen.map((r, i) => (
              <tr key={i} className="border-t border-neutral-200">
                <td className="px-2 py-1.5">
                  <Input
                    inputSize="sm" value={r.onderdeel} disabled={disabled}
                    placeholder="bv. Kozijnen buiten" aria-label="Onderdeel"
                    onChange={e => wijzig(i, 'onderdeel', e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    inputSize="sm" value={r.waarde} disabled={disabled}
                    placeholder="bv. RAL 9010, Sikkens Rubbol XD" aria-label="Kleur of materiaal"
                    onChange={e => wijzig(i, 'waarde', e.target.value)}
                  />
                </td>
                {!disabled && (
                  <td className="px-1 text-center">
                    <Button
                      type="button" variant="ghost" size="sm" aria-label="Rij verwijderen"
                      onClick={() => onChange(rijen.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...rijen, { onderdeel: '', waarde: '' }])}>
            <Plus className="h-4 w-4" /> Rij toevoegen
          </Button>
        </div>
      )}
    </div>
  )
}
