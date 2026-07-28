'use client'

import { useEffect, useState } from 'react'
import { getRegistraties } from '@/services/houtrotherstel/registraties'
import { REGISTRATIE_STATUSSEN, type RepairRegistration } from '@/lib/houtrotherstel/types'
import { formatDateShort, formatCurrency } from '@/lib/houtrotherstel/utils'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

// De bucket `repair-photos` is publiek, dus de URL kan rechtstreeks worden
// samengesteld (geen signed URL nodig).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const fotoPubliekeUrl = (pad: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/repair-photos/${pad}`
const FOTO_VOLGORDE: Record<string, number> = { voor: 0, tijdens: 1, na: 2 }
const FOTO_LABELS: Record<string, string> = { voor: 'Voor', tijdens: 'Tijdens', na: 'Na' }

/** Voor/na-thumbnails van een registratie; klikken opent de foto op ware grootte. */
function FotoStrip({ registratie }: { registratie: RepairRegistration }) {
  const fotos = (registratie.photos ?? [])
    .slice()
    .sort((a, b) => (FOTO_VOLGORDE[a.photo_type] ?? 9) - (FOTO_VOLGORDE[b.photo_type] ?? 9))
  if (fotos.length === 0) return <span className="text-slate-300 text-sm">—</span>
  return (
    <div className="flex items-center gap-1.5">
      {fotos.map(f => (
        <a
          key={f.id}
          href={fotoPubliekeUrl(f.storage_path)}
          target="_blank"
          rel="noopener noreferrer"
          title={FOTO_LABELS[f.photo_type] ?? f.photo_type}
          className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 hover:border-slate-400"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoPubliekeUrl(f.storage_path)}
            alt={FOTO_LABELS[f.photo_type] ?? 'Foto'}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-center text-[8px] font-semibold uppercase leading-[11px] tracking-wide text-white">
            {(FOTO_LABELS[f.photo_type] ?? f.photo_type)?.charAt(0)}
          </span>
        </a>
      ))}
    </div>
  )
}

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

  // Reparatietotaal = som van de werkzaamheden-regels; val terug op de aggregaat-
  // snapshot voor eventuele oude registraties zonder regels.
  const regelTotaal = (r: RepairRegistration) =>
    r.lines && r.lines.length > 0
      ? r.lines.reduce((s, l) => s + Number(l.line_sale_total ?? 0), 0)
      : Number(r.actual_sale_price ?? r.sale_price_snapshot ?? 0)

  const werkzaamhedenTekst = (r: RepairRegistration) =>
    r.lines && r.lines.length > 0
      ? r.lines
          .slice()
          .sort((a, b) => a.volgorde - b.volgorde)
          .map(l => `${Number(l.aantal)}× ${l.repair_name_snapshot ?? 'Werkzaamheid'}`)
          .join(' · ')
      : (r.repair_name_snapshot ?? '—')

  const totaal = (registraties ?? []).reduce((s, r) => s + regelTotaal(r), 0)

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
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Foto's</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Bedrag</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registraties.map(r => {
                const plaats = [r.location_block, r.floor, r.room_or_unit, r.facade_side, r.component_type, r.element_number]
                  .filter(Boolean).join(' · ') || 'Plaats niet opgegeven'
                const bedrag = regelTotaal(r)
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700">{plaats}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDateShort(r.registration_date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden sm:table-cell">{werkzaamhedenTekst(r)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">{r.medewerker_naam ?? '—'}</td>
                    <td className="px-4 py-3"><FotoStrip registratie={r} /></td>
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
