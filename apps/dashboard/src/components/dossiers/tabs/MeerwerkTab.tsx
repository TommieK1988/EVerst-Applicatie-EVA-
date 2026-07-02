'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Button, Input, Badge } from '@/components/ui'
import { meerwerkStatusLabels, type MeerwerkStatus, type MeerwerkAfrekenwijze, type MeerwerkTermijnWijze } from '@everts/database'
import {
  getDossierMeerwerk, maakMeerwerkRegel, updateMeerwerkRegel, setMeerwerkStatus,
  verwijderMeerwerkRegel, maakMeerwerkCalculatie, getBouw7Meerwerk, importeerBouw7Meerwerk,
  type DossierMeerwerkData, type MeerwerkRegelView, type NieuweMeerwerkData,
  type Bouw7MeerwerkData, type Bouw7MeerwerkPerCode, type Bouw7MeerwerkOfferteRegel,
} from '@/lib/dossiers/meerwerk'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

const STATUS_TONE: Record<MeerwerkStatus, 'neutral' | 'info' | 'success' | 'error' | 'brand'> = {
  aangevraagd: 'neutral', offerte_verstuurd: 'info', akkoord: 'success', afgewezen: 'error', voltooid: 'brand',
}

const selectCls =
  'h-8 rounded-md border border-neutral-300 bg-white px-2 text-[12px] text-neutral-800 outline-none focus:border-brand-500'

const LEGE_NIEUW: NieuweMeerwerkData = {
  omschrijving: '', afrekenwijze: 'aangenomen', is_stelpost: false, stelpost_grondslag: null,
  bedrag_excl_btw: null, eenheid: null, eenheidsprijs: null, hoeveelheid_werkelijk: null,
  btw_pct: null, factuurreferentie: null,
}

export default function MeerwerkTab({ dossierId }: { dossierId: string }) {
  const router = useRouter()
  const [data, setData] = useState<DossierMeerwerkData | null>(null)
  const [bouw7, setBouw7] = useState<Bouw7MeerwerkData | null>(null)
  const [bezig, setBezig] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [nieuw, setNieuw] = useState<NieuweMeerwerkData>(LEGE_NIEUW)

  function herlaad() {
    getDossierMeerwerk(dossierId).then(setData).catch(() => setData({ regels: [], totalen: { aantal: 0, goedgekeurdExcl: 0, goedgekeurdIncl: 0 } }))
    getBouw7Meerwerk(dossierId).then(setBouw7).catch(() => setBouw7({ beschikbaar: false, perCode: [], offerteRegels: [] }))
  }
  useEffect(herlaad, [dossierId])

  async function importCode(r: Bouw7MeerwerkPerCode) {
    setBezig(true)
    const res = await importeerBouw7Meerwerk(dossierId, {
      bron: 'bouw7_code', sleutel: r.sleutel, omschrijving: r.naam || `Meerwerk ${r.code}`,
      bedrag: r.bedrag, bewakingscode: r.code, bouw7ChapterId: r.hoofdstukId,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Geïmporteerd als EVA-regel'); herlaad()
  }

  async function importOfferte(r: Bouw7MeerwerkOfferteRegel) {
    setBezig(true)
    const res = await importeerBouw7Meerwerk(dossierId, {
      bron: 'bouw7_offerte', sleutel: r.sleutel, omschrijving: r.omschrijving,
      bedrag: r.bedrag, eenheid: r.eenheid, eenheidsprijs: r.prijs, aantal: r.aantal, btwPct: r.btwPct,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Geïmporteerd als EVA-regel'); herlaad()
  }

  async function voegToe() {
    if (!nieuw.omschrijving.trim()) { toast.error('Geef een omschrijving op.'); return }
    setBezig(true)
    const r = await maakMeerwerkRegel(dossierId, nieuw)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Meerwerkregel toegevoegd')
    setNieuw(LEGE_NIEUW); setFormOpen(false); herlaad()
  }

  async function wijzigStatus(regel: MeerwerkRegelView, status: MeerwerkStatus) {
    let afgewezenReden: string | null = null
    if (status === 'afgewezen') afgewezenReden = window.prompt('Reden van afwijzing (optioneel):') ?? null
    setBezig(true)
    const r = await setMeerwerkStatus(regel.id, status, { afgewezenReden })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    if (r.waarschuwing) toast(r.waarschuwing, { icon: '⚠️', duration: 6000 })
    else toast.success(`Status: ${meerwerkStatusLabels[status]}`)
    herlaad(); router.refresh()
  }

  async function wijzigVeld(id: string, patch: Partial<NieuweMeerwerkData> & { termijn_wijze?: MeerwerkTermijnWijze | null }) {
    const r = await updateMeerwerkRegel(id, patch)
    if (!r.ok) { toast.error(r.error); return }
    herlaad()
  }

  async function calculatie(regel: MeerwerkRegelView) {
    setBezig(true)
    const r = await maakMeerwerkCalculatie(regel.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Meerwerk offerte aangemaakt')
    router.push(`/everts-calc/quotes/${r.quoteId}?import=1`)
  }

  async function verwijder(regel: MeerwerkRegelView) {
    if (!window.confirm(`Meerwerkregel "${regel.omschrijving}" verwijderen?`)) return
    setBezig(true)
    const r = await verwijderMeerwerkRegel(regel.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Verwijderd'); herlaad()
  }

  if (data == null) return <div className="px-8 py-7 text-[13px] text-neutral-500">Meerwerk laden…</div>

  return (
    <div className="px-8 py-7 space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Meerwerk</span>
            <Button variant="primary" onClick={() => setFormOpen(o => !o)} disabled={bezig}>
              {formOpen ? 'Annuleren' : 'Nieuwe meerwerkregel'}
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {formOpen && (
            <div className="mb-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 text-[12px] font-medium text-neutral-700">
                  Omschrijving
                  <Input value={nieuw.omschrijving} onChange={e => setNieuw({ ...nieuw, omschrijving: e.target.value })} placeholder="Naam van het meerwerk" />
                </label>
                <label className="text-[12px] font-medium text-neutral-700">
                  Afrekenwijze
                  <select className={`${selectCls} mt-1 w-full`} value={nieuw.afrekenwijze}
                    onChange={e => setNieuw({ ...nieuw, afrekenwijze: e.target.value as MeerwerkAfrekenwijze })}>
                    <option value="aangenomen">Aangenomen</option>
                    <option value="regie">Regie</option>
                  </select>
                </label>
                <label className="text-[12px] font-medium text-neutral-700">
                  BTW %
                  <Input inputMode="decimal" value={nieuw.btw_pct ?? ''} placeholder="21"
                    onChange={e => setNieuw({ ...nieuw, btw_pct: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} />
                </label>
                <label className="col-span-2 flex items-center gap-2 text-[12px] font-medium text-neutral-700">
                  <input type="checkbox" checked={nieuw.is_stelpost ?? false}
                    onChange={e => setNieuw({ ...nieuw, is_stelpost: e.target.checked, stelpost_grondslag: e.target.checked ? 'eenheidsprijzen' : null })} />
                  Stelpost
                </label>
                {nieuw.is_stelpost && (
                  <label className="col-span-2 text-[12px] font-medium text-neutral-700">
                    Stelpost-grondslag
                    <select className={`${selectCls} mt-1 w-full`} value={nieuw.stelpost_grondslag ?? 'eenheidsprijzen'}
                      onChange={e => setNieuw({ ...nieuw, stelpost_grondslag: e.target.value as NieuweMeerwerkData['stelpost_grondslag'] })}>
                      <option value="eenheidsprijzen">Op eenheidsprijzen</option>
                      <option value="geboekte_kosten">Op geboekte kosten</option>
                    </select>
                  </label>
                )}
                {nieuw.is_stelpost && nieuw.stelpost_grondslag === 'eenheidsprijzen' ? (
                  <>
                    <label className="text-[12px] font-medium text-neutral-700">
                      Eenheid
                      <Input value={nieuw.eenheid ?? ''} placeholder="m², st, …" onChange={e => setNieuw({ ...nieuw, eenheid: e.target.value || null })} />
                    </label>
                    <label className="text-[12px] font-medium text-neutral-700">
                      Eenheidsprijs (excl. btw)
                      <Input inputMode="decimal" value={nieuw.eenheidsprijs ?? ''}
                        onChange={e => setNieuw({ ...nieuw, eenheidsprijs: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} />
                    </label>
                  </>
                ) : (nieuw.afrekenwijze === 'aangenomen' && !nieuw.is_stelpost) ? (
                  <label className="text-[12px] font-medium text-neutral-700">
                    Bedrag (excl. btw)
                    <Input inputMode="decimal" value={nieuw.bedrag_excl_btw ?? ''}
                      onChange={e => setNieuw({ ...nieuw, bedrag_excl_btw: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} />
                  </label>
                ) : (
                  <div className="text-[11px] text-neutral-500 self-end pb-2">Bedrag wordt live berekend uit geboekte uren/kosten op de bewakingscode.</div>
                )}
                <label className="col-span-2 text-[12px] font-medium text-neutral-700">
                  Factuurreferentie (optioneel)
                  <Input value={nieuw.factuurreferentie ?? ''} onChange={e => setNieuw({ ...nieuw, factuurreferentie: e.target.value || null })} />
                </label>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" onClick={voegToe} disabled={bezig}>Toevoegen</Button>
              </div>
            </div>
          )}

          {data.regels.length === 0 ? (
            <p className="text-[13px] text-neutral-500">Nog geen meerwerkregels op dit dossier.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 px-2">Omschrijving</th>
                  <th className="py-1.5 px-2">Status</th>
                  <th className="py-1.5 px-2">Afreken.</th>
                  <th className="py-1.5 px-2">Bewakingscode</th>
                  <th className="py-1.5 px-2">Termijn</th>
                  <th className="py-1.5 px-2 text-right">Excl. btw</th>
                  <th className="py-1.5 px-2 text-right">Incl. btw</th>
                  <th className="py-1.5 pl-2 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {data.regels.map(r => (
                  <tr key={r.id} className="border-b border-neutral-100 text-[12.5px] align-top">
                    <td className="py-2 pr-2 tabular-nums text-neutral-500">MW{String(r.volgnummer).padStart(2, '0')}</td>
                    <td className="py-2 px-2">
                      <div className="text-neutral-800">{r.omschrijving}</div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                        {r.is_stelpost ? `stelpost · ${r.stelpost_grondslag === 'geboekte_kosten' ? 'geboekte kosten' : 'eenheidsprijzen'}` : ''}
                        {r.factuurreferentie ? `${r.is_stelpost ? ' · ' : ''}ref: ${r.factuurreferentie}` : ''}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex flex-col gap-1">
                        <Badge tone={STATUS_TONE[r.status]} size="sm">{meerwerkStatusLabels[r.status]}</Badge>
                        <select className={selectCls} value={r.status} disabled={bezig}
                          onChange={e => { if (e.target.value !== r.status) wijzigStatus(r, e.target.value as MeerwerkStatus) }}>
                          {(Object.keys(meerwerkStatusLabels) as MeerwerkStatus[]).map(s => (
                            <option key={s} value={s}>{meerwerkStatusLabels[s]}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <select className={selectCls} value={r.afrekenwijze} disabled={bezig}
                        onChange={e => wijzigVeld(r.id, { afrekenwijze: e.target.value as MeerwerkAfrekenwijze })}>
                        <option value="aangenomen">Aangenomen</option>
                        <option value="regie">Regie</option>
                      </select>
                    </td>
                    <td className="py-2 px-2 text-neutral-700">
                      {r.bewakingscode ?? '—'}
                      {r.bewakingscode && r.bouw7_chapter_id == null && (
                        <span className="ml-1 text-[10px] text-warning-700">(nog niet in Bouw7)</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <select className={selectCls} value={r.termijn_wijze ?? ''} disabled={bezig}
                        onChange={e => wijzigVeld(r.id, { termijn_wijze: (e.target.value || null) as MeerwerkTermijnWijze | null })}>
                        <option value="">—</option>
                        <option value="een_regel">1 regel in termijnstaat</option>
                        <option value="eigen_termijnstaat">Eigen termijnstaat</option>
                      </select>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-neutral-900">{fmt(r.effectiefExcl)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-neutral-500">{fmt(r.effectiefIncl)}</td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <button className="text-[11px] font-medium text-brand-600 hover:underline" disabled={bezig}
                        onClick={() => calculatie(r)}>
                        {r.quote_id ? 'Open offerte' : 'Calculatie'}
                      </button>
                      <span className="mx-1 text-neutral-300">·</span>
                      <button className="text-[11px] font-medium text-error-600 hover:underline" disabled={bezig}
                        onClick={() => verwijder(r)}>Verwijder</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[12.5px] font-bold text-neutral-900">
                  <td className="pt-2.5" colSpan={6}>Goedgekeurd meerwerk (akkoord + voltooid)</td>
                  <td className="pt-2.5 px-2 text-right tabular-nums">{fmt(data.totalen.goedgekeurdExcl)}</td>
                  <td className="pt-2.5 px-2 text-right tabular-nums text-neutral-500">{fmt(data.totalen.goedgekeurdIncl)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>

      {bouw7 && bouw7.beschikbaar && (
        <Card>
          <CardHeader>Bestaand meerwerk in Bouw7 (read-only)</CardHeader>
          <CardBody>
            {bouw7.perCode.length > 0 && (
              <div className="mb-4">
                <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">Geboekt per bewakingscode</div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-400">
                      <th className="py-1.5 pr-2">Code</th>
                      <th className="py-1.5 px-2">Omschrijving</th>
                      <th className="py-1.5 px-2 text-right">Meerwerk</th>
                      <th className="py-1.5 pl-2 text-right">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bouw7.perCode.map(r => (
                      <tr key={r.sleutel} className="border-b border-neutral-100 text-[12.5px]">
                        <td className="py-1.5 pr-2 tabular-nums text-neutral-500">{r.code}</td>
                        <td className="py-1.5 px-2 text-neutral-800">{r.naam ?? '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-neutral-900">{fmt(r.bedrag)}</td>
                        <td className="py-1.5 pl-2 text-right">
                          {r.alGeimporteerd
                            ? <span className="text-[11px] text-neutral-400">Geïmporteerd</span>
                            : <button className="text-[11px] font-medium text-brand-600 hover:underline" disabled={bezig} onClick={() => importCode(r)}>Importeer</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bouw7.offerteRegels.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">Meerwerk-offerteregels</div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-400">
                      <th className="py-1.5 pr-2">Offerte</th>
                      <th className="py-1.5 px-2">Omschrijving</th>
                      <th className="py-1.5 px-2 text-right">Aantal</th>
                      <th className="py-1.5 px-2 text-right">Prijs</th>
                      <th className="py-1.5 px-2 text-right">Bedrag</th>
                      <th className="py-1.5 pl-2 text-right">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bouw7.offerteRegels.map(r => (
                      <tr key={r.sleutel} className="border-b border-neutral-100 text-[12.5px]">
                        <td className="py-1.5 pr-2 tabular-nums text-neutral-500">{r.quotationNummer ?? r.quotationId}</td>
                        <td className="py-1.5 px-2 text-neutral-800">{r.omschrijving}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{r.aantal != null ? `${r.aantal}${r.eenheid ? ` ${r.eenheid}` : ''}` : '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{r.prijs != null ? fmt(r.prijs) : '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-neutral-900">{fmt(r.bedrag)}</td>
                        <td className="py-1.5 pl-2 text-right">
                          {r.alGeimporteerd
                            ? <span className="text-[11px] text-neutral-400">Geïmporteerd</span>
                            : <button className="text-[11px] font-medium text-brand-600 hover:underline" disabled={bezig} onClick={() => importOfferte(r)}>Importeer</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 text-[11px] text-neutral-500">
              Live uit Bouw7 (geboekt meerwerk per bewakingscode + meerwerk-offerteregels). Importeren maakt een bewerkbare EVA-regel (status Aangevraagd); dubbel importeren wordt voorkomen.
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
