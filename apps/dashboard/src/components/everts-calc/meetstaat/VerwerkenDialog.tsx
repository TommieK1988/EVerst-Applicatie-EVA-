'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Groep } from '@/lib/everts-calc/types'
import { getMeetregels, getMeetregelAggregaten, getCalculatieregels } from '@/lib/everts-calc/local-store'
import { teVerwerken } from '@/lib/everts-calc/meetstaat-verwerken'
import { naarCalculatie, type NaarCalculatieRij, type VerwerkStatus } from '@/lib/everts-calc/naar-calculatie'
import { calculatieregelOmschrijving } from '@/lib/everts-calc/meetstaat-utils'
import { ontbrekendeMaat } from '@/lib/everts-calc/maat-rekenen'

const getal = (n: number) => n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const LABEL: Record<VerwerkStatus, { tekst: string; tone: 'error' | 'info' | 'warning' | 'success' }> = {
  vervallen: { tekst: 'Vervallen', tone: 'error' },
  nieuw: { tekst: 'Nieuw', tone: 'info' },
  gewijzigd: { tekst: 'Gewijzigd', tone: 'warning' },
  gelijk: { tekst: 'Bijwerken', tone: 'success' },
}

const GEVOLG: Record<VerwerkStatus, string> = {
  vervallen: 'Calculatieregel naar 0; de regel blijft staan',
  nieuw: 'Nieuwe calculatieregel',
  gewijzigd: 'Hoeveelheid bijwerken',
  gelijk: 'Hoeveelheid gelijk; omschrijving en code bijwerken',
}

/**
 * Controlestap vóór de calculatie verandert: alle openstaande wijzigingen van de
 * hele meetstaat, per groep, met wat er nu staat en wat het wordt. Standaard staat
 * alles aan; vink uit wat nog niet mee mag.
 */
export default function VerwerkenDialog({
  meetstaatId, groepen, bezig, onVerwerk, onSluit,
}: {
  meetstaatId: string
  groepen: Groep[]
  bezig: boolean
  onVerwerk: (aggregaatIds: Set<string>) => void
  onSluit: () => void
}) {
  // Eén keer bij openen bepalen: tijdens het venster verandert de meetstaat niet.
  const { perGroep, alleIds, onvolledig } = useMemo(() => {
    const calcRegels = getCalculatieregels()
    const alle = getMeetregelAggregaten(meetstaatId)
    const open = teVerwerken(alle, new Map(calcRegels.map(r => [r.id, r.hoeveelheid])))
    const openIds = new Set(open.map(a => a.id))
    const rijen = naarCalculatie(open, openIds, new Map(calcRegels.map(r => [r.id, r.hoeveelheid])))

    const naam = new Map(groepen.map(g => [g.id, g.naam]))
    const volgorde = new Map(groepen.map((g, i) => [g.id, i]))
    const perGroep = new Map<string, NaarCalculatieRij[]>()
    for (const r of rijen) {
      const lijst = perGroep.get(r.aggregaat.groep_id) ?? []
      lijst.push(r)
      perGroep.set(r.aggregaat.groep_id, lijst)
    }
    const gesorteerd = Array.from(perGroep, ([id, rs]) => ({ id, naam: naam.get(id) ?? 'Onbekende groep', rijen: rs }))
      .sort((a, b) => (volgorde.get(a.id) ?? 999) - (volgorde.get(b.id) ?? 999))

    const onvolledig = getMeetregels(meetstaatId)
      .filter(r => !r.is_leeg && ontbrekendeMaat(r))
      .map(r => ({ id: r.id, groep: naam.get(r.groep_id) ?? '', omschrijving: [r.element, r.onderdeel].filter(Boolean).join(' · '), mist: ontbrekendeMaat(r) }))

    return { perGroep: gesorteerd, alleIds: rijen.map(r => r.aggregaat.id), onvolledig }
  }, [meetstaatId, groepen])

  const [aan, setAan] = useState<Set<string>>(() => new Set(alleIds))
  const zet = (id: string, waarde: boolean) => setAan(prev => {
    const volgend = new Set(prev)
    if (waarde) volgend.add(id); else volgend.delete(id)
    return volgend
  })
  const allesAan = alleIds.length > 0 && alleIds.every(id => aan.has(id))

  return (
    <Dialog open onOpenChange={o => { if (!o && !bezig) onSluit() }}>
      <DialogContent size="xl" className="max-h-[85vh] flex flex-col">
        <DialogHeader className="pr-14">
          <div>
            <DialogTitle>Verwerk meetstaat in calculatie</DialogTitle>
            <DialogDescription>
              {alleIds.length} {alleIds.length === 1 ? 'wijziging' : 'wijzigingen'} in {perGroep.length} {perGroep.length === 1 ? 'groep' : 'groepen'}.
              Vink uit wat nog niet mee mag.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {onvolledig.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3" role="status">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-warning-700" aria-hidden="true" />
              <div className="text-[13px] leading-5">
                <p className="font-semibold text-warning-700">
                  {onvolledig.length} onvolledige {onvolledig.length === 1 ? 'regel telt' : 'regels tellen'} niet mee
                </p>
                <ul className="mt-1 text-neutral-700">
                  {onvolledig.slice(0, 5).map(r => (
                    <li key={r.id}>{r.groep}{r.omschrijving && ` · ${r.omschrijving}`}: {r.mist} ontbreekt</li>
                  ))}
                  {onvolledig.length > 5 && <li>en nog {onvolledig.length - 5}</li>}
                </ul>
              </div>
            </div>
          )}

          {alleIds.length === 0 ? (
            <p className="text-neutral-500">Alles staat al in de calculatie.</p>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500 border-b border-neutral-200">
                  <th className="w-8 py-2 text-left">
                    <input type="checkbox" checked={allesAan} aria-label="Alles aan of uit"
                      onChange={e => setAan(e.target.checked ? new Set(alleIds) : new Set())}
                      className="w-3.5 h-3.5 rounded border-neutral-300 accent-brand-500" />
                  </th>
                  <th className="py-2 pr-2 text-left w-24">Wijziging</th>
                  <th className="py-2 pr-2 text-left">Code · omschrijving</th>
                  <th className="py-2 pr-2 text-right w-28">Nu</th>
                  <th className="py-2 pr-2 text-right w-28">Wordt</th>
                  <th className="py-2 text-left">Gevolg in calculatie</th>
                </tr>
              </thead>
              {perGroep.map(g => (
                <tbody key={g.id}>
                  <tr>
                    <td colSpan={6} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-[0.10em] text-neutral-600">{g.naam}</td>
                  </tr>
                  {g.rijen.map(({ aggregaat: a, status, nu, wordt }) => (
                    <tr key={a.id} className="border-b border-neutral-100 align-top">
                      <td className="py-2">
                        <input type="checkbox" checked={aan.has(a.id)} onChange={e => zet(a.id, e.target.checked)}
                          aria-label={`${calculatieregelOmschrijving(a.onderdeel, a.type, a.behandeling)} verwerken`}
                          className="w-3.5 h-3.5 rounded border-neutral-300 accent-brand-500" />
                      </td>
                      <td className="py-2 pr-2"><Badge tone={LABEL[status].tone} size="sm">{LABEL[status].tekst}</Badge></td>
                      <td className="py-2 pr-2 text-neutral-800">
                        {a.bestekcode && <span className="mr-1.5 text-xs font-semibold text-info-700">{a.bestekcode}</span>}
                        {calculatieregelOmschrijving(a.onderdeel, a.type, a.behandeling)}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-neutral-600">{nu === null ? '—' : `${getal(nu)} ${a.eenheid}`}</td>
                      <td className="py-2 pr-2 text-right tabular-nums font-semibold text-neutral-900">{getal(wordt)} {a.eenheid}</td>
                      <td className="py-2 text-neutral-600">{GEVOLG[status]}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-neutral-200">
          <Button variant="outline" onClick={onSluit} disabled={bezig}>Annuleren</Button>
          <Button variant="primary" loading={bezig} disabled={aan.size === 0} onClick={() => onVerwerk(new Set(aan))}>
            Verwerk {aan.size} {aan.size === 1 ? 'wijziging' : 'wijzigingen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
