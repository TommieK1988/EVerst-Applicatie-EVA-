'use client'

/**
 * Nacalculatie: de bewakingscodes van dit dossier die op werkelijke kosten afrekenen, en het
 * factuurvoorstel dat daaruit volgt.
 *
 * Wat hier níét in staat is net zo belangrijk als wat er wel in staat: werk dat in de aanneemsom
 * zit is via de termijnen al gefactureerd en hoort hier niet thuis. Alleen regie-meerwerkregels en
 * stelposten komen in aanmerking, en een stelpost die in de aanneemsom zit verrekent alleen zijn
 * verschil — die staat er apart bij, met de reden erbij, zodat zichtbaar is waaróm hij ontbreekt.
 */

import React, { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Button, useDialogen } from '@/components/ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import {
  getRegieFactuurvoorstel, maakRegieFactuurInBouw7,
  type RegieVoorstel, type CodeRegelView,
} from '@/lib/dossiers/servicedesk'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'
import FactuurRegelVenster from './FactuurRegelVenster'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

export default function ServicedeskRegiePaneel({ dossierId, verbergAlsLeeg }: {
  dossierId: string
  /** Op een opdracht-dossier is nacalculatie de uitzondering; toon het blok dan alleen als er iets is. */
  verbergAlsLeeg?: boolean
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()
  const [voorstel, setVoorstel] = useState<RegieVoorstel | null>(null)
  const [tarieven, setTarieven] = useState<BtwTariefKeuze[]>([])
  const [tariefId, setTariefId] = useState<number | null>(null)
  const [open, setOpen] = useState<CodeRegelView | null>(null)
  const [bezig, start] = useTransition()

  function herlaad() {
    getRegieFactuurvoorstel(dossierId).then(setVoorstel).catch(() => setVoorstel(null))
  }
  useEffect(herlaad, [dossierId])

  useEffect(() => {
    laadBtwTarieven().then(t => {
      setTarieven(t)
      const standaard = t.find(x => !x.verlegd && Math.abs(x.percentage - 21) < 0.01) ?? t[0]
      if (standaard) setTariefId(standaard.bouw7_id ?? null)
    }).catch(() => setTarieven([]))
  }, [])

  async function klaarzetten() {
    if (!voorstel || tariefId == null) return
    const tarief = tarieven.find(t => t.bouw7_id === tariefId)
    const ja = await bevestig({
      titel: 'Conceptfactuur klaarzetten in Bouw7?',
      omschrijving: `${voorstel.regels.length} factuurregel${voorstel.regels.length === 1 ? '' : 's'} `
        + `van samen ${fmt(voorstel.totaal)} excl. btw${tarief ? ` (${tarief.label}, tenzij per regel anders)` : ''}. `
        + 'De factuur krijgt nog geen factuurnummer; de administratie verstuurt hem in Bouw7.',
      bevestigLabel: 'Klaarzetten',
    })
    if (!ja) return
    start(async () => {
      const r = await maakRegieFactuurInBouw7(dossierId, { btwTariefBouw7Id: tariefId })
      if (!r.ok) { toast.error(r.error, { duration: 9000 }); herlaad(); return }
      toast.success(`Conceptfactuur klaargezet in Bouw7 — ${r.aantal} regels, ${fmt(r.totaal)} excl. btw.`)
      herlaad()
      router.refresh()
    })
  }

  if (voorstel == null) {
    return verbergAlsLeeg ? null : <div className="px-8 py-7 text-[13px] text-neutral-500">Nacalculatie laden…</div>
  }
  const leeg = voorstel.codes.length === 0 && voorstel.buitenBeschouwing.length === 0
  if (verbergAlsLeeg && leeg) return null

  return (
    <div className="px-8 py-7">
      <Card>
        <CardHeader>Nacalculatie — regie en stelposten</CardHeader>
        <CardBody>
          {leeg ? (
            <p className="text-[13px] text-neutral-500">
              Dit dossier heeft geen bewakingscodes die op nacalculatie afrekenen. Werk in de aanneemsom
              wordt via de termijnen gefactureerd, niet hier.
            </p>
          ) : (
            <>
              {voorstel.codes.length > 0 && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
                      <th className="py-1.5 pr-2">Bewakingscode</th>
                      <th className="py-1.5 px-2 text-right">Kosten</th>
                      <th className="py-1.5 px-2 text-right">Berekend</th>
                      <th className="py-1.5 px-2 text-right">Op de factuur</th>
                      <th className="py-1.5 pl-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {voorstel.codes.map(c => (
                      <tr key={c.bewakingscode}
                          className="border-b border-neutral-100 text-[12.5px]"
                          style={{ opacity: c.meefactureren ? 1 : 0.5 }}>
                        <td className="py-1.5 pr-2">
                          <div className="text-neutral-800">{c.omschrijving}</div>
                          <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                            <span className="font-mono normal-case">{c.bewakingscode}</span>
                            {' · '}{c.bron === 'stelpost' ? 'stelpost' : 'meerwerk (regie)'}
                            {c.aantalBoekingen > 0 ? ` · ${c.aantalBoekingen} boeking${c.aantalBoekingen === 1 ? '' : 'en'}` : ''}
                            {c.vergrendeld ? ' · gefactureerd' : ''}
                            {!c.inBouw7 ? ' · nog niet in Bouw7' : ''}
                            {!c.meefactureren && !c.vergrendeld ? ' · niet meenemen' : ''}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmt(c.inkoop)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmt(c.berekend)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-neutral-900">
                          {c.vergrendeld || !c.meefactureren ? '—' : fmt(c.bedrag)}
                          {c.bedragOverride != null && !c.vergrendeld && (
                            <span className="ml-1 text-[9.5px] font-normal uppercase text-neutral-400">vast</span>
                          )}
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          <button
                            type="button"
                            onClick={() => setOpen(c)}
                            className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-50"
                          >
                            {c.vergrendeld || readOnly ? 'Bekijken' : 'Aanpassen'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-[12.5px] font-bold text-neutral-900">
                      <td className="pt-2.5" colSpan={3}>Totaal excl. btw</td>
                      <td className="pt-2.5 px-2 text-right tabular-nums">{fmt(voorstel.totaal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}

              {voorstel.buitenBeschouwing.length > 0 && (
                <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50/60 p-2.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                    Blijft buiten deze factuur
                  </div>
                  {voorstel.buitenBeschouwing.map(b => (
                    <div key={b.bewakingscode} className="text-[11.5px] text-neutral-600">
                      <span className="font-mono text-[10px] text-neutral-400">{b.bewakingscode}</span>{' '}
                      {b.omschrijving} — {b.reden}
                    </div>
                  ))}
                </div>
              )}

              {!readOnly && voorstel.regels.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
                  <label className="flex items-center gap-1.5 text-[11.5px] text-neutral-600">
                    <span>Btw</span>
                    <select
                      value={tariefId ?? ''}
                      onChange={e => setTariefId(e.target.value ? Number(e.target.value) : null)}
                      disabled={bezig}
                      aria-label="Btw-tarief voor deze factuur"
                      className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11.5px] text-neutral-700 outline-none focus:border-brand-400"
                    >
                      {tarieven.map(t => (
                        <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                  <span className="flex-1" />
                  <Button variant="primary" onClick={klaarzetten} disabled={bezig || tariefId == null}>
                    {bezig ? 'Bezig…' : `Klaarzetten in Bouw7 (${voorstel.regels.length})`}
                  </Button>
                </div>
              )}

              {voorstel.codes.some(c => !c.inBouw7) && (
                <p className="mt-2 text-[10.5px]" style={{ color: 'var(--warning-800, #9a3412)' }}>
                  Een code die nog niet in Bouw7 staat kan geen kosten verzamelen en blijft daarom op nul.
                  Maak hem aan met &quot;Codes toewijzen&quot; bij de stelposten op de Informatie-tab.
                </p>
              )}

              {voorstel.alGefactureerd > 0 && (
                <p className="mt-2 text-[10.5px] text-neutral-400">
                  {voorstel.alGefactureerd} boeking{voorstel.alGefactureerd === 1 ? '' : 'en'} staat al op een factuur
                  en telt hier niet meer mee.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <FactuurRegelVenster
        dossierId={dossierId}
        code={open}
        tarieven={tarieven}
        readOnly={readOnly}
        onSluit={() => setOpen(null)}
        onBewaard={herlaad}
      />
    </div>
  )
}
