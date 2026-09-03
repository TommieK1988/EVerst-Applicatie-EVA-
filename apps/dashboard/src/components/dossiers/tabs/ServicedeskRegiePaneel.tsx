'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Input, Button, useDialogen } from '@/components/ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import {
  getServicedeskRegie, bewaarRegieRegel, getRegieFactuurvoorstel, maakRegieFactuurInBouw7,
  type RegieFactuurRegel, type RegieVoorstel,
} from '@/lib/dossiers/servicedesk'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

export default function ServicedeskRegiePaneel({ dossierId, verbergAlsLeeg }: {
  dossierId: string
  /** Op een opdracht-dossier is regiewerk de uitzondering; toon het blok dan alleen als er iets is. */
  verbergAlsLeeg?: boolean
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()
  const [regels, setRegels] = useState<RegieFactuurRegel[] | null>(null)
  const [voorstel, setVoorstel] = useState<RegieVoorstel | null>(null)
  const [samenvoegen, setSamenvoegen] = useState(false)
  const [tarieven, setTarieven] = useState<BtwTariefKeuze[]>([])
  const [tariefId, setTariefId] = useState<number | null>(null)
  const [bezig, start] = useTransition()

  function herlaad() {
    getServicedeskRegie(dossierId).then(d => setRegels(d.regels)).catch(() => setRegels([]))
  }
  useEffect(herlaad, [dossierId])

  // Het factuurvoorstel is de samengevatte weergave: de klant ziet niet elke boeking, maar één
  // regel per uursoort en per kostensoort.
  useEffect(() => {
    getRegieFactuurvoorstel(dossierId, { kostenSamenvoegen: samenvoegen })
      .then(setVoorstel).catch(() => setVoorstel(null))
  }, [dossierId, samenvoegen, regels])

  useEffect(() => {
    laadBtwTarieven().then(t => {
      setTarieven(t)
      // 21% niet-verlegd als startpunt; btw blijft een bewuste keuze van de gebruiker.
      const standaard = t.find(x => !x.verlegd && Math.abs(x.percentage - 21) < 0.01) ?? t[0]
      if (standaard) setTariefId(standaard.bouw7_id ?? null)
    }).catch(() => setTarieven([]))
  }, [])

  async function klaarzetten() {
    if (!voorstel || tariefId == null) return
    const tarief = tarieven.find(t => t.bouw7_id === tariefId)
    const ja = await bevestig({
      titel: 'Conceptfactuur klaarzetten in Bouw7?',
      omschrijving: `${voorstel.groepen.length} factuurregel${voorstel.groepen.length === 1 ? '' : 's'} `
        + `van samen ${fmt(voorstel.totaal)} excl. btw${tarief ? ` (${tarief.label})` : ''}. `
        + 'De factuur krijgt nog geen factuurnummer; de administratie verstuurt hem in Bouw7.',
      bevestigLabel: 'Klaarzetten',
    })
    if (!ja) return
    start(async () => {
      const r = await maakRegieFactuurInBouw7(dossierId, {
        btwTariefBouw7Id: tariefId,
        kostenSamenvoegen: samenvoegen,
      })
      if (!r.ok) { toast.error(r.error, { duration: 9000 }); herlaad(); return }
      toast.success(`Conceptfactuur klaargezet in Bouw7 — ${r.aantal} regels, ${fmt(r.totaal)} excl. btw.`)
      herlaad()
      router.refresh()
    })
  }

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


  if (regels == null) {
    return verbergAlsLeeg ? null : <div className="px-8 py-7 text-[13px] text-neutral-500">Regie-regels laden…</div>
  }
  if (verbergAlsLeeg && regels.length === 0) return null

  const actief = regels.filter(r => !r.uitgesloten)
  const totVerkoop = actief.reduce((s, r) => s + (r.verkoopBedrag || 0), 0)
  const totInkoop  = actief.reduce((s, r) => s + (r.inkoopBedrag || 0), 0)

  return (
    <div className="px-8 py-7">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Regie — geboekte uren &amp; kosten</span>
            <span className="text-[11.5px] text-neutral-500">
              onderbouwing — het factuurvoorstel staat eronder
            </span>
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

      {/* Factuurvoorstel — wat de klant straks op de factuur ziet. */}
      {voorstel && voorstel.groepen.length > 0 && (
        <Card className="mt-4">
          <CardHeader>Factuurvoorstel</CardHeader>
          <CardBody>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
                  <th className="py-1.5 pr-2">Omschrijving</th>
                  <th className="py-1.5 px-2 text-right">Aantal</th>
                  <th className="py-1.5 px-2 text-right">Stukprijs</th>
                  <th className="py-1.5 pl-2 text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {voorstel.groepen.map(g => (
                  <tr key={g.sleutel} className="border-b border-neutral-100 text-[12.5px]">
                    <td className="py-1.5 pr-2">
                      <div className="text-neutral-800">{g.omschrijving}</div>
                      <div className="text-[10px] text-neutral-400">
                        {g.aantalBoekingen} {g.soort === 'uren' ? 'urenboeking' : 'kostenpost'}{g.aantalBoekingen === 1 ? '' : 'en'} samengevat
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {g.soort === 'uren' ? `${g.aantal} ${g.eenheid ?? ''}` : '1 post'}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmt(g.stukprijs)}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-neutral-900">{fmt(g.bedrag)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[12.5px] font-bold text-neutral-900">
                  <td className="pt-2.5" colSpan={3}>Totaal excl. btw</td>
                  <td className="pt-2.5 pl-2 text-right tabular-nums">{fmt(voorstel.totaal)}</td>
                </tr>
              </tfoot>
            </table>

            {!readOnly && (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
                <label className="flex items-center gap-1.5 text-[11.5px] text-neutral-600">
                  <input
                    type="checkbox"
                    checked={samenvoegen}
                    onChange={e => setSamenvoegen(e.target.checked)}
                    disabled={bezig}
                  />
                  <span title="Standaard staan materiaal, onderaanneming en inkoop als aparte regels op de factuur.">
                    Kosten samenvoegen tot één regel
                  </span>
                </label>
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
                <Button
                  variant="primary"
                  onClick={klaarzetten}
                  disabled={bezig || tariefId == null || voorstel.groepen.length === 0}
                >
                  {bezig ? 'Bezig…' : 'Klaarzetten in Bouw7'}
                </Button>
              </div>
            )}
            {voorstel.alGefactureerd > 0 && (
              <p className="mt-2 text-[10.5px] text-neutral-400">
                {voorstel.alGefactureerd} regel{voorstel.alGefactureerd === 1 ? '' : 's'} is al gefactureerd en valt buiten dit voorstel.
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
