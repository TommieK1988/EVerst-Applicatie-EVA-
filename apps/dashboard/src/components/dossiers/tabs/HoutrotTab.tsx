'use client'

import { useEffect, useState } from 'react'
import { getRegistraties } from '@/services/houtrotherstel/registraties'
import { REGISTRATIE_STATUSSEN, type RepairRegistration } from '@/lib/houtrotherstel/types'
import { formatDateShort, formatCurrency } from '@/lib/houtrotherstel/utils'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Houtrot binnen een dossier (desktop). Zichtbaar zodra de dossier-toggle
 * `houtrot_registreren` aanstaat. Registreren gebeurt in het veld op de telefoon
 * (dossier → Houtrot); hier staat het overzicht.
 */
export default function HoutrotTab({ dossierId }: { dossierId: string }) {
  const [registraties, setRegistraties] = useState<RepairRegistration[] | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    getRegistraties({ dossier_id: dossierId })
      .then(setRegistraties)
      .catch(e => setFout(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [dossierId])

  const totaal = (registraties ?? []).reduce(
    (s, r) => s + Number(r.actual_sale_price ?? r.sale_price_snapshot ?? 0), 0)

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-800">Houtrotregistraties</h2>
        {registraties && registraties.length > 0 && (
          <span className="text-sm text-slate-500">
            {registraties.length} registratie{registraties.length !== 1 ? 's' : ''} · {formatCurrency(totaal)}
          </span>
        )}
      </CardHeader>

      {fout && <div className="p-5 text-sm text-red-600">{fout}</div>}
      {!fout && registraties === null && <div className="p-5 text-sm text-slate-400">Laden…</div>}
      {!fout && registraties?.length === 0 && (
        <EmptyState
          title="Nog geen registraties"
          description="Registraties worden in het veld op de telefoon vastgelegd: open dit dossier in de mobiele app en kies Houtrot."
          tone="neutral"
          size="sm"
        />
      )}

      {registraties && registraties.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Plaats</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Datum</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs hidden sm:table-cell">Reparatie</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs hidden md:table-cell">Medewerker</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Bedrag</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registraties.map(r => {
                const plaats = [r.location_block, r.floor, r.room_or_unit, r.facade_side, r.component_type, r.element_number]
                  .filter(Boolean).join(' · ') || 'Plaats niet opgegeven'
                const bedrag = Number(r.actual_sale_price ?? r.sale_price_snapshot ?? 0)
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700">{plaats}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDateShort(r.registration_date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden sm:table-cell">{r.repair_name_snapshot ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">{r.medewerker_naam ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right">{bedrag > 0 ? formatCurrency(bedrag) : '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} size="sm" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
