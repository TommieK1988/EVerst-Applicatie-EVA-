'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, RotateCcw, Send, Loader2, MessageSquare, UserPlus, Share2, Clock, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getGoedkeuring, vraagGoedkeuringAan, keurGoed, keurAf, trekIn,
  draagOver, voegMeekijkerToe, plaatsOpmerking, type GoedkeuringOverzicht,
} from '@/lib/goedkeuring/actions'
import { zoekMedewerkers } from '@/lib/goedkeuring/medewerkers'
import type { GoedkeuringObjectType } from '@/lib/goedkeuring/types'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'

interface Props {
  objectType: GoedkeuringObjectType
  objectId: string
  dossierId: string | null
  totaalBedrag: number
  /**
   * Werkbegroting geeft een eigen accordeer-functie mee (die eerst de payload synct
   * en de regel-snapshots schrijft). Offerte laat dit weg → generieke keurGoed.
   */
  accordeer?: (goedkeuringId: string, opmerking?: string) => Promise<{ ok: boolean; error?: string }>
  /** Werkbegroting geeft een eigen aanvraag-functie mee (sync payload eerst). */
  aanvragen?: (toelichting?: string) => Promise<{ ok: boolean; error?: string; goedkeuringId?: string }>
  onVeranderd?: () => void
}

const euro = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
const datumTijd = (iso: string) => new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  aangevraagd: { label: 'Ter beoordeling', cls: 'bg-blue-100 text-blue-700' },
  goedgekeurd: { label: 'Goedgekeurd', cls: 'bg-green-100 text-green-700' },
  afgekeurd:   { label: 'Teruggestuurd', cls: 'bg-red-100 text-red-700' },
  ingetrokken: { label: 'Ingetrokken', cls: 'bg-slate-100 text-slate-500' },
}

export default function GoedkeuringPaneel({ objectType, objectId, dossierId, totaalBedrag, accordeer, aanvragen, onVeranderd }: Props) {
  const [data, setData] = useState<GoedkeuringOverzicht | null>(null)
  const [laden, setLaden] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [notitie, setNotitie] = useState('')
  const [nieuweOpmerking, setNieuweOpmerking] = useState('')
  const [delegatie, setDelegatie] = useState<'overdragen' | 'meekijken' | null>(null)
  const [medewerkerOpties, setMedewerkerOpties] = useState<ComboboxOption[]>([])

  const objectLabel = objectType === 'werkbegroting' ? 'werkbegroting' : 'offerte'

  const herlaad = useCallback(async () => {
    const res = await getGoedkeuring(objectType, objectId)
    setData(res)
    setLaden(false)
  }, [objectType, objectId])

  useEffect(() => { herlaad() }, [herlaad])

  const zoek = useCallback(async (q: string) => {
    const res = await zoekMedewerkers(q)
    setMedewerkerOpties(res.map(m => ({ value: m.id, label: m.naam, sub: m.afdeling ?? undefined })))
  }, [])

  const naVeranderd = useCallback(async () => {
    await herlaad()
    onVeranderd?.()
  }, [herlaad, onVeranderd])

  const actueel = data?.actueel ?? null
  const isOpen = actueel?.status === 'aangevraagd'
  const magBeoordelen = data?.magBeoordelen ?? false
  const rol = data?.rol ?? 'geen'

  // ── Acties ──
  async function doeAanvragen() {
    setBezig(true)
    try {
      const res = aanvragen
        ? await aanvragen(notitie.trim() || undefined)
        : await vraagGoedkeuringAan({ objectType, objectId, dossierId, toelichting: notitie.trim() || undefined })
      if (res.ok) { toast.success('Goedkeuring aangevraagd'); setNotitie(''); await naVeranderd() }
      else toast.error(res.error ?? 'Aanvragen mislukt')
    } finally { setBezig(false) }
  }

  async function doeGoedkeuren() {
    if (!actueel) return
    setBezig(true)
    try {
      const res = accordeer
        ? await accordeer(actueel.id, notitie.trim() || undefined)
        : await keurGoed(actueel.id, { opmerking: notitie.trim() || undefined })
      if (res.ok) { toast.success(`De ${objectLabel} is goedgekeurd`); setNotitie(''); await naVeranderd() }
      else toast.error(res.error ?? 'Goedkeuren mislukt')
    } finally { setBezig(false) }
  }

  async function doeTerugsturen() {
    if (!actueel) return
    if (!notitie.trim()) { toast.error('Een opmerking is verplicht bij het terugsturen.'); return }
    setBezig(true)
    try {
      const res = await keurAf(actueel.id, notitie.trim())
      if (res.ok) { toast.success('Teruggestuurd naar de indiener'); setNotitie(''); await naVeranderd() }
      else toast.error(res.error ?? 'Terugsturen mislukt')
    } finally { setBezig(false) }
  }

  async function doeIntrekken() {
    if (!actueel) return
    setBezig(true)
    try {
      const res = await trekIn(actueel.id)
      if (res.ok) { toast.success('Aanvraag ingetrokken'); await naVeranderd() }
      else toast.error(res.error ?? 'Intrekken mislukt')
    } finally { setBezig(false) }
  }

  async function doeDelegeren(medewerkerId: string) {
    if (!actueel || !delegatie) return
    setBezig(true)
    try {
      const res = delegatie === 'overdragen'
        ? await draagOver(actueel.id, medewerkerId)
        : await voegMeekijkerToe(actueel.id, medewerkerId)
      if (res.ok) { toast.success(delegatie === 'overdragen' ? 'Overgedragen' : 'Meekijker toegevoegd'); setDelegatie(null); await naVeranderd() }
      else toast.error(res.error ?? 'Mislukt')
    } finally { setBezig(false) }
  }

  async function doeOpmerking() {
    if (!actueel || !nieuweOpmerking.trim()) return
    setBezig(true)
    try {
      const res = await plaatsOpmerking(actueel.id, nieuweOpmerking.trim())
      if (res.ok) { setNieuweOpmerking(''); await naVeranderd() }
      else toast.error(res.error ?? 'Mislukt')
    } finally { setBezig(false) }
  }

  if (laden) {
    return <div className="flex items-center justify-center py-10 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Goedkeuring laden…</div>
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Kop: status + bedrag */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
          <p className="text-xs text-blue-600 font-medium mb-0.5">Totaalbedrag</p>
          <p className="text-xl font-bold text-blue-900">{euro(totaalBedrag)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex flex-col justify-center">
          <p className="text-xs text-slate-500 font-medium mb-1">Status</p>
          {actueel ? (
            <span className={`inline-flex w-fit text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABEL[actueel.status]?.cls ?? ''}`}>
              {STATUS_LABEL[actueel.status]?.label ?? actueel.status}
              {actueel.ronde > 1 && <span className="ml-1 opacity-70">· ronde {actueel.ronde}</span>}
            </span>
          ) : (
            <span className="inline-flex w-fit text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Nog niet aangevraagd</span>
          )}
        </div>
      </div>

      {/* Meekijkers / gedelegeerde */}
      {actueel && (actueel.gedelegeerd_aan_naam || actueel.meekijker_namen.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {actueel.gedelegeerd_aan_naam && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 px-2 py-0.5">
              <Share2 className="w-3 h-3" /> Overgedragen aan {actueel.gedelegeerd_aan_naam}
            </span>
          )}
          {actueel.meekijker_namen.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">
              <UserPlus className="w-3 h-3" /> {n} kijkt mee
            </span>
          ))}
        </div>
      )}

      {/* Opmerkingen-thread van de actuele ronde */}
      {actueel && actueel.opmerkingen.length > 0 && (
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
          {actueel.opmerkingen.map(o => (
            <div key={o.id} className="px-3 py-2 text-sm">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-0.5">
                <span className="font-medium text-slate-600">{o.medewerker_naam ?? 'Onbekend'}</span>
                <span>{datumTijd(o.created_at)}</span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap">{o.tekst}</p>
            </div>
          ))}
        </div>
      )}

      {/* Notitie-veld (aanvragen / goedkeuren / terugsturen) */}
      {(isOpen ? magBeoordelen : !actueel || actueel.status !== 'goedgekeurd') && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {isOpen && magBeoordelen ? 'Opmerking (verplicht bij terugsturen)' : 'Toelichting'} <span className="font-normal text-slate-400">(optioneel bij goedkeuren)</span>
          </label>
          <textarea
            value={notitie}
            onChange={e => setNotitie(e.target.value)}
            rows={2}
            placeholder={isOpen && magBeoordelen ? 'Toelichting voor de indiener…' : 'Toelichting voor de beoordelaar…'}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Actieknoppen */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Aanvragen (geen open aanvraag) */}
        {!isOpen && (
          <button onClick={doeAanvragen} disabled={bezig}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {bezig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {actueel?.status === 'afgekeurd' ? 'Opnieuw ter goedkeuring indienen' : 'Ter goedkeuring indienen'}
          </button>
        )}

        {/* Beoordelen (open aanvraag + bevoegd) */}
        {isOpen && magBeoordelen && (
          <>
            <button onClick={() => setDelegatie(delegatie === 'overdragen' ? null : 'overdragen')} disabled={bezig}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50">
              <Share2 className="w-4 h-4" /> Overdragen
            </button>
            <button onClick={() => setDelegatie(delegatie === 'meekijken' ? null : 'meekijken')} disabled={bezig}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50">
              <UserPlus className="w-4 h-4" /> Laten meekijken
            </button>
            <button onClick={doeTerugsturen} disabled={bezig}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
              <RotateCcw className="w-4 h-4" /> Terugsturen
            </button>
            <button onClick={doeGoedkeuren} disabled={bezig}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
              {bezig ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Accorderen
            </button>
          </>
        )}

        {/* Open aanvraag, niet bevoegd → intrekken (aanvrager) of alleen meekijken */}
        {isOpen && !magBeoordelen && rol === 'aanvrager' && (
          <button onClick={doeIntrekken} disabled={bezig}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50">
            <RotateCcw className="w-4 h-4" /> Aanvraag intrekken
          </button>
        )}
        {isOpen && !magBeoordelen && rol !== 'aanvrager' && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400"><Clock className="w-3.5 h-3.5" /> Wacht op beoordeling door de controller.</span>
        )}
      </div>

      {/* Delegatie-picker */}
      {delegatie && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600 mb-2">
            {delegatie === 'overdragen' ? 'Overdragen aan (deze persoon mag zelf accorderen):' : 'Laten meekijken (mag inzien en opmerken, niet accorderen):'}
          </p>
          <Combobox
            options={medewerkerOpties}
            onSearch={zoek}
            onChange={doeDelegeren}
            placeholder="Zoek medewerker…"
            searchPlaceholder="Naam typen…"
            emptyText="Geen medewerkers gevonden."
          />
        </div>
      )}

      {/* Opmerking plaatsen (meekijker of betrokkene) */}
      {actueel && rol !== 'geen' && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <input
            value={nieuweOpmerking}
            onChange={e => setNieuweOpmerking(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doeOpmerking()}
            placeholder="Opmerking toevoegen…"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
          />
          <button onClick={doeOpmerking} disabled={bezig || !nieuweOpmerking.trim()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50">
            <MessageSquare className="w-4 h-4" /> Plaats
          </button>
        </div>
      )}

      {/* Ronde-historie */}
      {data && data.historie.length > 1 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600">Historie ({data.historie.length} rondes)</summary>
          <div className="mt-2 space-y-2">
            {data.historie.map(g => (
              <div key={g.id} className="rounded border border-slate-100 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Ronde {g.ronde} · {STATUS_LABEL[g.status]?.label ?? g.status}</span>
                  <span>{g.beoordeeld_op ? datumTijd(g.beoordeeld_op) : datumTijd(g.aangevraagd_op)}</span>
                </div>
                {g.beoordeeld_door_naam && <p className="text-slate-400">Door {g.beoordeeld_door_naam}</p>}
                {g.opmerkingen.map(o => <p key={o.id} className="text-slate-500 mt-0.5">“{o.tekst}” — {o.medewerker_naam}</p>)}
              </div>
            ))}
          </div>
        </details>
      )}

      {actueel?.status === 'goedgekeurd' && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
          <span>Deze {objectLabel} is goedgekeurd{actueel.beoordeeld_door_naam ? ` door ${actueel.beoordeeld_door_naam}` : ''}.</span>
        </div>
      )}
    </div>
  )
}
