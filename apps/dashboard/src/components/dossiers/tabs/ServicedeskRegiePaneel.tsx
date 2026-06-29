'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Button, Input } from '@/components/ui'
import {
  getServicedeskRegie, bewaarRegieRegel, maakRegieFactuurInBouw7,
  type RegieFactuurRegel,
} from '@/lib/dossiers/servicedesk'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

export default function ServicedeskRegiePaneel({ dossierId }: { dossierId: string }) {
  const router = useRouter()
  const [regels, setRegels] = useState<RegieFactuurRegel[] | null>(null)
  const [bezig, setBezig]   = useState(false)

  function herlaad() {
    getServicedeskRegie(dossierId).then(d => setRegels(d.regels)).catch(() => setRegels([]))
  }
  useEffect(herlaad, [dossierId])

  function patchLokaal(i: number, patch: Partial<RegieFactuurRegel>) {
    setRegels(prev => {
      if (!prev) return prev
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  async function bewaar(r: RegieFactuurRegel) {
    await bewaarRegieRegel(dossierId, {
      bronType: r.bronType,
      bronBouw7Id: r.bronBouw7Id,
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      eenheid: r.eenheid,
      inkoopBedrag: r.inkoopBedrag,
      opslagPct: r.opslagPct,
      verkoopTarief: r.verkoopTarief,
      verkoopBedrag: r.verkoopBedrag,
      bewakingscode: r.bewakingscode,
      uitgesloten: r.uitgesloten,
    })
  }

  // Verkoopbedrag herberekenen wanneer tarief (uren) of opslag (kosten) wijzigt.
  function herbereken(r: RegieFactuurRegel): number {
    if (r.bronType === 'uur' && r.verkoopTarief != null && r.aantal != null) {
      return Math.round(r.aantal * r.verkoopTarief * 100) / 100
    }
    if (r.bronType === 'kost' && r.opslagPct != null) {
      return Math.round(r.inkoopBedrag * (1 + r.opslagPct / 100) * 100) / 100
    }
    return r.verkoopBedrag
  }

  async function naarBouw7() {
    setBezig(true)
    const r = await maakRegieFactuurInBouw7(dossierId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(`Concept-factuur in Bouw7 aangemaakt (${r.aantal} regels)`)
    herlaad()
    router.refresh()
  }

  if (regels == null) {
    return <div className="px-8 py-7 text-[13px] text-neutral-500">Regie-regels laden…</div>
  }

  const actief = regels.filter(r => !r.uitgesloten)
  const totVerkoop = actief.reduce((s, r) => s + (r.verkoopBedrag || 0), 0)
  const totInkoop  = actief.reduce((s, r) => s + (r.inkoopBedrag || 0), 0)
  const teFactureren = actief.filter(r => r.status !== 'gefactureerd').length

  return (
    <div className="px-8 py-7">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Regie — geboekte uren &amp; kosten</span>
            <Button variant="primary" onClick={naarBouw7} disabled={bezig || teFactureren === 0}>
              {bezig ? 'Bezig…' : `Naar Bouw7 (${teFactureren})`}
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {regels.length === 0 ? (
            <p className="text-[13px] text-neutral-500">Nog geen geboekte uren of kosten op dit dossier.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
                  <th className="py-1.5 pr-2">Omschrijving</th>
                  <th className="py-1.5 px-2 text-right">Aantal</th>
                  <th className="py-1.5 px-2 text-right">Inkoop</th>
                  <th className="py-1.5 px-2 text-right">Tarief / opslag</th>
                  <th className="py-1.5 px-2 text-right">Verkoop</th>
                  <th className="py-1.5 pl-2 text-center">Mee</th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r, i) => (
                  <tr key={`${r.bronType}:${r.bronBouw7Id}`} className="border-b border-neutral-100 text-[12.5px]" style={{ opacity: r.uitgesloten ? 0.45 : 1 }}>
                    <td className="py-1.5 pr-2">
                      <div className="text-neutral-800">{r.omschrijving}</div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                        {r.bronType === 'uur' ? 'uren' : 'kosten'}{r.bewakingscode ? ` · ${r.bewakingscode}` : ''}
                        {r.status === 'gefactureerd' ? ' · gefactureerd' : ''}
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.aantal ?? '—'}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmt(r.inkoopBedrag)}</td>
                    <td className="py-1.5 px-2 text-right">
                      {r.bronType === 'uur' ? (
                        <Input
                          value={r.verkoopTarief != null ? String(r.verkoopTarief) : ''}
                          onChange={e => patchLokaal(i, { verkoopTarief: e.target.value ? Number(e.target.value.replace(',', '.')) : null })}
                          onBlur={() => { const v = herbereken(regels[i]); patchLokaal(i, { verkoopBedrag: v }); bewaar({ ...regels[i], verkoopBedrag: v }) }}
                          className="w-20 text-right tabular-nums"
                          inputMode="decimal"
                          placeholder="€/u"
                          disabled={r.status === 'gefactureerd'}
                          title={r.tariefUitRelatie ? 'Standaard uit relatie-tarief' : 'Geen relatie-tarief — handmatig'}
                        />
                      ) : (
                        <Input
                          value={r.opslagPct != null ? String(r.opslagPct) : ''}
                          onChange={e => patchLokaal(i, { opslagPct: e.target.value ? Number(e.target.value.replace(',', '.')) : null })}
                          onBlur={() => { const v = herbereken(regels[i]); patchLokaal(i, { verkoopBedrag: v }); bewaar({ ...regels[i], verkoopBedrag: v }) }}
                          className="w-16 text-right tabular-nums"
                          inputMode="decimal"
                          placeholder="%"
                          disabled={r.status === 'gefactureerd'}
                        />
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-neutral-900">{fmt(r.verkoopBedrag)}</td>
                    <td className="py-1.5 pl-2 text-center">
                      <input
                        type="checkbox"
                        checked={!r.uitgesloten}
                        disabled={r.status === 'gefactureerd'}
                        onChange={e => { const uit = !e.target.checked; patchLokaal(i, { uitgesloten: uit }); bewaar({ ...regels[i], uitgesloten: uit }) }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[12.5px] font-bold text-neutral-900">
                  <td className="pt-2.5" colSpan={2}>Totaal (meegerekend)</td>
                  <td className="pt-2.5 px-2 text-right tabular-nums text-neutral-500">{fmt(totInkoop)}</td>
                  <td />
                  <td className="pt-2.5 px-2 text-right tabular-nums">{fmt(totVerkoop)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
