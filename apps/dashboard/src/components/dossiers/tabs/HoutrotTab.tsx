'use client'

import { useCallback, useEffect, useState } from 'react'
import { getRegistraties } from '@/services/houtrotherstel/registraties'
import { getRecepten, type Recept } from '@/services/houtrotherstel/recepten'
import { getLocatieNiveaus } from '@/services/houtrotherstel/locatie-config'
import { type RepairRegistration, type LocatieNiveau } from '@/lib/houtrotherstel/types'
import { formatDateShort, formatCurrency } from '@/lib/houtrotherstel/utils'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import LocatieNiveausEditor from './LocatieNiveausEditor'
import HoutrotRegistratieModal from './HoutrotRegistratieModal'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
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
          onClick={e => e.stopPropagation()}
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

// Aggregaten per registratie: uit de regels (aantal × per-stuk), met terugval op de
// aggregaat-snapshot voor oude registraties zonder regels.
const somRegels = (r: RepairRegistration, veld: 'labor_hours_snapshot' | 'labor_cost_snapshot' | 'material_cost_snapshot' | 'line_sale_total', fallback: number) =>
  r.lines && r.lines.length > 0
    ? r.lines.reduce((s, l) => s + (veld === 'line_sale_total'
        ? Number(l.line_sale_total ?? 0)
        : Number(l.aantal) * Number(l[veld] ?? 0)), 0)
    : fallback

/**
 * Houtrot binnen een dossier (desktop). Zichtbaar zodra de dossier-toggle
 * `houtrot_registreren` aanstaat. Overzicht + volledig bewerken; registreren kan
 * ook in het veld op de telefoon.
 */
export default function HoutrotTab({ dossierId }: { dossierId: string }) {
  const readOnly = useDossierReadOnly()
  const [registraties, setRegistraties] = useState<RepairRegistration[] | null>(null)
  const [recepten, setRecepten] = useState<Recept[]>([])
  const [niveaus, setNiveaus] = useState<LocatieNiveau[]>([])
  const [fout, setFout] = useState<string | null>(null)
  // Modal: undefined = dicht; null = nieuw; object = bewerken.
  const [modal, setModal] = useState<RepairRegistration | null | undefined>(undefined)

  const laad = useCallback(() => {
    getRegistraties({ dossier_id: dossierId })
      .then(setRegistraties)
      .catch(e => setFout(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [dossierId])

  useEffect(() => { laad() }, [laad])
  useEffect(() => {
    getRecepten().then(setRecepten).catch(() => setRecepten([]))
    getLocatieNiveaus(dossierId).then(setNiveaus).catch(() => setNiveaus([]))
  }, [dossierId])

  const regelTotaal = (r: RepairRegistration) =>
    somRegels(r, 'line_sale_total', Number(r.actual_sale_price ?? r.sale_price_snapshot ?? 0))
  const uren = (r: RepairRegistration) => somRegels(r, 'labor_hours_snapshot', Number(r.labor_hours_snapshot ?? 0))
  const arbeid = (r: RepairRegistration) => somRegels(r, 'labor_cost_snapshot', Number(r.labor_cost_snapshot ?? 0))
  const materiaal = (r: RepairRegistration) => somRegels(r, 'material_cost_snapshot', Number(r.material_cost_snapshot ?? 0))

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
    <div className="flex flex-col gap-4">
      <LocatieNiveausEditor dossierId={dossierId} />
      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-slate-800">Houtrotregistraties</h2>
            {registraties && registraties.length > 0 && (
              <span className="text-sm text-slate-500">
                {registraties.length} registratie{registraties.length !== 1 ? 's' : ''} · {formatCurrency(totaal)}
              </span>
            )}
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setModal(null)}
              className="rounded-lg bg-everts px-3 py-2 text-sm font-semibold text-white"
            >
              + Nieuwe registratie
            </button>
          )}
        </CardHeader>

        {fout && <div className="p-5 text-sm text-red-600">{fout}</div>}
        {!fout && registraties === null && <div className="p-5 text-sm text-slate-400">Laden…</div>}
        {!fout && registraties?.length === 0 && (
          <EmptyState
            title="Nog geen registraties"
            description="Registreer in het veld op de telefoon (dossier → Houtrot) of via '+ Nieuwe registratie' hierboven."
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
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Foto&apos;s</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden lg:table-cell">Uren</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden lg:table-cell">Arbeid</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden lg:table-cell">Materiaal</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Bedrag</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registraties.map(r => {
                  const plaats = (r.locatie ?? []).map(l => l.waarde).filter(Boolean).join(' · ') || 'Geen locatie'
                  const bedrag = regelTotaal(r)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => { if (!readOnly) setModal(r) }}
                      className={`hover:bg-slate-50 ${readOnly ? '' : 'cursor-pointer'}`}
                    >
                      <td className="px-4 py-3 text-sm text-slate-700">{plaats}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDateShort(r.registration_date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 hidden sm:table-cell">{werkzaamhedenTekst(r)}</td>
                      <td className="px-4 py-3"><FotoStrip registratie={r} /></td>
                      <td className="px-4 py-3 text-sm text-slate-500 text-right hidden lg:table-cell">{uren(r) > 0 ? uren(r).toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 text-right hidden lg:table-cell">{arbeid(r) > 0 ? formatCurrency(arbeid(r)) : '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 text-right hidden lg:table-cell">{materiaal(r) > 0 ? formatCurrency(materiaal(r)) : '—'}</td>
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

      {modal !== undefined && (
        <HoutrotRegistratieModal
          dossierId={dossierId}
          registratie={modal}
          niveaus={niveaus}
          recepten={recepten}
          onClose={() => setModal(undefined)}
          onSaved={() => { setModal(undefined); setRegistraties(null); laad() }}
        />
      )}
    </div>
  )
}
