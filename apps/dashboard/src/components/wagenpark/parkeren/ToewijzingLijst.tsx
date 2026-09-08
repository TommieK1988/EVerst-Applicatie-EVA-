'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronRight, Check, Ban, EyeOff, RotateCcw } from 'lucide-react'
import DossierKiezer from './DossierKiezer'
import {
  bevestigToewijzingAction,
  markeerPriveAction,
  markeerNietDoorbelastenAction,
  heropenToewijzingAction,
} from '@/app/(platform)/wagenpark/actions/parkeer-toewijzing'

/**
 * Werkvoorraad van parkeerkosten die nog aan een dossier moeten worden gekoppeld.
 *
 * Bewust de eenvoudige tabelvorm van de andere wagenpark-schermen en niet
 * OverzichtTabel: dit is een afhandellijst waar beslissnelheid telt, geen breed
 * overzicht met instelbare kolommen.
 */

export type ToewijzingRij = {
  id: string
  parking_id: string
  status: string
  zekerheid: string
  score: number
  bedrag: number
  aandeel: number
  datum: string
  signalen: Signalen | null
  bevestiging_bron: string | null
  toelichting: string | null
  kenteken: string
  parkeer_starttijd: string
  parkeerlocatie: string | null
  parkeerkosten: number | null
  duur_seconden: number | null
  bestuurder: string | null
  bestuurder_afgeschermd: boolean
  dossier_id: string | null
  dossiernummer: string | null
  dossier_titel: string | null
}

type Signalen = {
  bestuurder?: string | null
  bestuurder_bron?: string | null
  minuten_na_rit?: number | null
  rit_type?: string | null
  marge?: number
  reden?: string
  ontbreekt?: string[]
  kandidaten?: {
    dossier_id: string
    dossiernummer: string | null
    score: number
    afstand_m: number | null
    uren: number | null
    redenen: string[]
  }[]
}

const ZEKERHEID_STIJL: Record<string, string> = {
  zeker: 'bg-green-100 text-green-800',
  waarschijnlijk: 'bg-amber-100 text-amber-800',
  onzeker: 'bg-slate-100 text-slate-600',
  geen: 'bg-slate-100 text-slate-400',
}

const ZEKERHEID_LABEL: Record<string, string> = {
  zeker: 'Zeker',
  waarschijnlijk: 'Waarschijnlijk',
  onzeker: 'Onzeker',
  geen: 'Geen aanwijzing',
}

export default function ToewijzingLijst({
  rijen,
  status,
}: {
  rijen: ToewijzingRij[]
  status: string
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [bezig, startTransition] = useTransition()
  const [gekozen, setGekozen] = useState<Record<string, { id: string; label: string }>>({})

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const voerUit = (belofte: Promise<{ ok: boolean; error?: string }>, gelukt: string) => {
    startTransition(async () => {
      const res = await belofte
      if (res.ok) toast.success(gelukt)
      else toast.error(res.error ?? 'Er ging iets mis.')
    })
  }

  const bevestig = (r: ToewijzingRij) => {
    const keuze = gekozen[r.parking_id]
    const dossierId = keuze?.id ?? r.dossier_id
    if (!dossierId) {
      toast.error('Kies eerst een dossier.')
      return
    }
    voerUit(
      bevestigToewijzingAction(r.parking_id, { dossierId }),
      `Parkeerkost van €${r.parkeerkosten?.toFixed(2) ?? '0,00'} toegewezen.`,
    )
  }

  const isAfgehandeld = status !== 'voorstel'

  return (
    <div className="bg-white rounded-lg border overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-8" />
            <th>Wanneer</th>
            <th>Kenteken</th>
            <th>Bestuurder</th>
            <th>Locatie</th>
            <th className="text-right">Bedrag</th>
            <th>Project</th>
            <th>Zekerheid</th>
            <th className="text-right">Actie</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((r) => {
            const uitgeklapt = open.has(r.id)
            const keuze = gekozen[r.parking_id]
            return (
              <FragmentRij
                key={r.id}
                r={r}
                uitgeklapt={uitgeklapt}
                onToggle={() => toggle(r.id)}
                keuze={keuze}
                onKies={(d) => setGekozen((g) => ({ ...g, [r.parking_id]: d }))}
                bezig={bezig}
                isAfgehandeld={isAfgehandeld}
                onBevestig={() => bevestig(r)}
                onPrive={() =>
                  voerUit(markeerPriveAction(r.parking_id), 'Als privé gemarkeerd.')
                }
                onNietDoorbelasten={() =>
                  voerUit(markeerNietDoorbelastenAction(r.parking_id), 'Niet doorbelasten.')
                }
                onHeropen={() =>
                  voerUit(heropenToewijzingAction(r.parking_id), 'Terug in de werkvoorraad.')
                }
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FragmentRij({
  r,
  uitgeklapt,
  onToggle,
  keuze,
  onKies,
  bezig,
  isAfgehandeld,
  onBevestig,
  onPrive,
  onNietDoorbelasten,
  onHeropen,
}: {
  r: ToewijzingRij
  uitgeklapt: boolean
  onToggle: () => void
  keuze?: { id: string; label: string }
  onKies: (d: { id: string; label: string }) => void
  bezig: boolean
  isAfgehandeld: boolean
  onBevestig: () => void
  onPrive: () => void
  onNietDoorbelasten: () => void
  onHeropen: () => void
}) {
  const s = r.signalen ?? {}
  const dossierLabel = keuze
    ? keuze.label
    : r.dossiernummer || r.dossier_titel
      ? [r.dossiernummer, r.dossier_titel].filter(Boolean).join(' — ')
      : null

  return (
    <>
      <tr className={uitgeklapt ? 'bg-slate-50' : undefined}>
        <td>
          <button
            onClick={onToggle}
            className="p-1 text-slate-400 hover:text-slate-700"
            aria-label={uitgeklapt ? 'Inklappen' : 'Onderbouwing tonen'}
          >
            {uitgeklapt ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="whitespace-nowrap">
          {new Date(r.parkeer_starttijd).toLocaleString('nl-NL', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </td>
        <td>{r.kenteken}</td>
        <td className="text-slate-700">
          {r.bestuurder ?? (r.bestuurder_afgeschermd ? <span className="text-slate-400">afgeschermd</span> : '—')}
        </td>
        <td className="max-w-[240px] truncate" title={r.parkeerlocatie ?? undefined}>
          {r.parkeerlocatie ?? '—'}
        </td>
        <td className="text-right whitespace-nowrap">
          €{(r.parkeerkosten ?? 0).toFixed(2)}
          {r.aandeel < 1 && (
            <span className="text-slate-400 text-xs"> ({Math.round(r.aandeel * 100)}%)</span>
          )}
        </td>
        <td className="max-w-[220px]">
          {isAfgehandeld ? (
            <span className="truncate block" title={dossierLabel ?? undefined}>
              {dossierLabel ?? <span className="text-slate-300">—</span>}
            </span>
          ) : (
            <DossierKiezer
              huidigLabel={dossierLabel}
              onKies={onKies}
            />
          )}
        </td>
        <td>
          <span
            className={
              'text-xs px-2 py-0.5 rounded-full ' +
              (ZEKERHEID_STIJL[r.zekerheid] ?? ZEKERHEID_STIJL.geen)
            }
          >
            {ZEKERHEID_LABEL[r.zekerheid] ?? r.zekerheid}
          </span>
          {r.bevestiging_bron === 'automatisch' && (
            <span className="ml-1 text-xs text-slate-400">automatisch</span>
          )}
        </td>
        <td className="text-right whitespace-nowrap">
          {isAfgehandeld ? (
            <button
              onClick={onHeropen}
              disabled={bezig}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-50 disabled:opacity-50"
              title="Terugzetten in de werkvoorraad"
            >
              <RotateCcw className="w-3 h-3" />
              Heropenen
            </button>
          ) : (
            <div className="inline-flex gap-1">
              <button
                onClick={onBevestig}
                disabled={bezig}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                Toewijzen
              </button>
              <button
                onClick={onPrive}
                disabled={bezig}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-50 disabled:opacity-50"
                title="Privé geparkeerd"
              >
                <EyeOff className="w-3 h-3" />
              </button>
              <button
                onClick={onNietDoorbelasten}
                disabled={bezig}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-50 disabled:opacity-50"
                title="Zakelijk, maar niet op een project"
              >
                <Ban className="w-3 h-3" />
              </button>
            </div>
          )}
        </td>
      </tr>

      {uitgeklapt && (
        <tr className="bg-slate-50">
          <td colSpan={9} className="px-6 py-3 text-sm">
            <Onderbouwing r={r} s={s} />
          </td>
        </tr>
      )}
    </>
  )
}

/** Laat zien waaróm dit voorstel er staat — zonder deze uitleg is het niet te beoordelen. */
function Onderbouwing({ r, s }: { r: ToewijzingRij; s: Signalen }) {
  const duur = r.duur_seconden ?? 0
  const duurLabel =
    duur >= 3600 ? `${(duur / 3600).toFixed(1)} uur` : duur >= 60 ? `${Math.round(duur / 60)} min` : `${duur} s`

  return (
    <div className="space-y-2">
      <div className="text-slate-600">
        Geparkeerd voor {duurLabel}
        {s.minuten_na_rit != null && (
          <>
            {' · '}
            {s.minuten_na_rit === 0
              ? 'direct na aankomst'
              : s.minuten_na_rit > 0
                ? `${s.minuten_na_rit} min na aankomst`
                : `${Math.abs(s.minuten_na_rit)} min voor vertrek`}
          </>
        )}
        {s.bestuurder_bron === 'voertuig_bestuurder' && ' · bestuurder afgeleid uit de vaste koppeling, niet uit een rit'}
        {s.rit_type && ` · rit is ${s.rit_type === 'prive' ? 'privé' : 'zakelijk'}`}
      </div>

      {s.reden && <div className="text-slate-600">{s.reden}</div>}

      {(s.kandidaten?.length ?? 0) > 0 ? (
        <table className="text-xs w-full max-w-3xl">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-medium py-1">Project</th>
              <th className="text-left font-medium py-1">Waarom</th>
              <th className="text-right font-medium py-1">Punten</th>
            </tr>
          </thead>
          <tbody>
            {s.kandidaten!.map((k) => (
              <tr key={k.dossier_id} className="border-t border-slate-200">
                <td className="py-1 pr-3 whitespace-nowrap">{k.dossiernummer ?? k.dossier_id.slice(0, 8)}</td>
                <td className="py-1 pr-3 text-slate-600">{k.redenen.join(' · ')}</td>
                <td className="py-1 text-right tabular-nums">{k.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-slate-500">
          Geen enkel project gevonden voor deze dag en plek.
        </div>
      )}

      {(s.ontbreekt?.length ?? 0) > 0 && (
        <div className="text-slate-500">
          Niet automatisch toegewezen omdat: {s.ontbreekt!.join(', ')}.
        </div>
      )}

      {r.toelichting && <div className="text-slate-600">Notitie: {r.toelichting}</div>}
    </div>
  )
}
