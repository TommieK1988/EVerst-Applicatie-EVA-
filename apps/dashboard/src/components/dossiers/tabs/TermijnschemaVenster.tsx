'use client'

/**
 * Venster om de termijnen van een project in één keer aan te maken in Bouw7.
 *
 * De volgorde is bewust: **eerst kijken wat de calculatie zegt.** Staat er een betalingsconditie op
 * de offerte, dan is dát het schema dat de klant heeft geaccepteerd; dat wordt getoond en
 * overgenomen. Pas als je expliciet zegt af te wijken — of als de calculatie geen schema kent —
 * kies je er zelf een uit de stamgegevens of stel je er ter plekke een samen. Zo kan een schema
 * niet per ongeluk afwijken van wat er is afgesproken, en zit je toch niet vast op dossiers zonder
 * EVA-offerte (storingswerk, kleine opdrachten).
 *
 * De bedragen worden hier op dezelfde manier gerekend als op de server: percentage van de
 * grondslag, en het laatste termijn krijgt het afrondingsverschil zodat de som exact klopt. De
 * server rekent ze opnieuw — dit is voorbeeld, geen invoer.
 */

import React, { useCallback, useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import {
  Button, Input, Spinner,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import {
  getTermijnschemaBron, maakTermijnschema,
  type TermijnschemaBron, type TermijnschemaRegel, type TermijnGrondslag,
} from '@/lib/dossiers/termijnen'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

/** Percentage uit een tekstveld; komma en punt allebei goed. Leeg = 0. */
const pct = (s: string): number => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Verdeelt de grondslag over de termijnen. Het laatste termijn absorbeert het afrondingsverschil —
 * anders blijft er een cent over die op geen enkele factuur terechtkomt.
 */
function bedragen(regels: TermijnschemaRegel[], grondslag: number): number[] {
  const centen = Math.round(grondslag * 100)
  let verdeeld = 0
  return regels.map((r, i) => {
    const eigen = i === regels.length - 1 ? centen - verdeeld : Math.round(centen * r.percentage / 100)
    verdeeld += eigen
    return eigen / 100
  })
}

const KEUZE_EIGEN = '__eigen__'

const labelKlasse = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500'
const selectKlasse = 'w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[13px] '
  + 'text-neutral-800 outline-none focus:border-brand-400 disabled:opacity-50'

export default function TermijnschemaVenster({ dossierId, open, onSluit, onKlaar }: {
  dossierId: string
  open: boolean
  onSluit: () => void
  onKlaar: () => void
}) {
  const [bron, setBron] = useState<TermijnschemaBron | null>(null)
  const [tarieven, setTarieven] = useState<BtwTariefKeuze[]>([])
  const [laadfout, setLaadfout] = useState<string | null>(null)
  const [bezig, start] = useTransition()

  const [keuze, setKeuze] = useState('')
  const [afwijken, setAfwijken] = useState(false)
  const [regels, setRegels] = useState<TermijnschemaRegel[]>([])
  const [grondslag, setGrondslag] = useState<TermijnGrondslag>('aanneemsom')
  const [tariefId, setTariefId] = useState<number | null>(null)

  // Alles wordt pas bij openen geladen; de Verkoop-tab hoeft er niet op te wachten.
  useEffect(() => {
    if (!open) return
    let levend = true
    setBron(null); setLaadfout(null)
    Promise.all([getTermijnschemaBron(dossierId), laadBtwTarieven()])
      .then(([b, t]) => {
        if (!levend) return
        setBron(b)
        setTarieven(t)
        const standaard = t.find(x => !x.verlegd && Math.abs(x.percentage - 21) < 0.01) ?? t[0]
        setTariefId(standaard?.bouw7_id ?? null)
        setAfwijken(false)
        setGrondslag('aanneemsom')
        if (b.uitCalculatie) {
          setKeuze(b.uitCalculatie.conditieId)
          setRegels(b.uitCalculatie.termijnen)
        } else {
          setKeuze('')
          setRegels([])
        }
      })
      .catch((e: unknown) => {
        if (levend) setLaadfout(e instanceof Error ? e.message : 'De gegevens zijn niet op te halen.')
      })
    return () => { levend = false }
  }, [open, dossierId])

  const kiesSchema = useCallback((waarde: string) => {
    setKeuze(waarde)
    if (waarde === KEUZE_EIGEN) { setRegels([{ omschrijving: '', percentage: 100 }]); return }
    const conditie = bron?.condities.find(c => c.id === waarde)
    setRegels(conditie ? conditie.termijnen.map(t => ({ ...t })) : [])
  }, [bron])

  if (!open) return null

  const uitCalculatie = bron?.uitCalculatie ?? null
  // Zolang het schema uit de calculatie geldt staan de regels vast: dat is wat is afgesproken.
  const opSlot = !!uitCalculatie && !afwijken
  const basis = grondslag === 'contracttotaal'
    ? (bron?.aanneemsom ?? 0) + (bron?.meerwerk ?? 0)
    : (bron?.aanneemsom ?? 0)
  const somPct = regels.reduce((s, r) => s + r.percentage, 0)
  const kloptSom = Math.abs(somPct - 100) <= 0.01
  const rijBedragen = bedragen(regels, basis)
  const kanAanmaken = !bezig && regels.length > 0 && kloptSom && tariefId != null && basis > 0
    && (bron?.bestaandeTermijnen ?? 0) === 0

  function wijzig(i: number, patch: Partial<TermijnschemaRegel>) {
    setRegels(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function aanmaken() {
    start(async () => {
      const r = await maakTermijnschema(dossierId, {
        termijnen: regels,
        btwTariefBouw7Id: tariefId!,
        grondslag,
      })
      if (!r.ok) { toast.error(r.error, { duration: 9000 }); return }
      toast.success(
        `${r.aangemaakt} termijn${r.aangemaakt === 1 ? '' : 'en'} aangemaakt in Bouw7 `
        + `over ${fmt(r.grondslag)} excl. btw.`,
      )
      onKlaar()
      onSluit()
    })
  }

  return (
    <Dialog open onOpenChange={v => { if (!v && !bezig) onSluit() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Termijnen aanmaken</DialogTitle>
          <DialogDescription>
            Het schema wordt als termijnstaat in Bouw7 gezet. Er wordt nog niets gefactureerd —
            dat doe je daarna met &ldquo;Klaarzetten in Bouw7&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {laadfout && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{laadfout}</p>
          )}

          {!bron && !laadfout && (
            <div className="flex items-center gap-2 py-8 text-[13px] text-neutral-500">
              <Spinner /> Schema&apos;s en bedragen ophalen…
            </div>
          )}

          {bron && (
            <div className="space-y-4">
              {bron.bestaandeTermijnen > 0 && (
                <p className="rounded-md px-3 py-2 text-[12.5px]"
                   style={{ background: 'var(--warning-50, #fff7ed)', color: 'var(--warning-800, #9a3412)' }}>
                  Dit project heeft in Bouw7 al {bron.bestaandeTermijnen} termijn(en). Aanmaken kan
                  alleen op een leeg project; pas een bestaande termijnstaat in Bouw7 zelf aan.
                </p>
              )}

              {/* — Herkomst van het schema — */}
              {uitCalculatie ? (
                <div className="rounded-md border border-neutral-200 bg-neutral-50/60 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-neutral-800">
                      Schema uit de calculatie: <strong>{uitCalculatie.naam}</strong>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setAfwijken(a => !a)} disabled={bezig}>
                      {afwijken ? 'Terug naar de calculatie' : 'Ander schema kiezen'}
                    </Button>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-snug text-neutral-500">
                    {afwijken
                      ? 'Je wijkt af van wat er op de offerte staat. Controleer dat dit met de klant is afgestemd.'
                      : 'Dit is de betalingsconditie op de offerte — wat de klant heeft geaccepteerd.'}
                  </p>
                  {afwijken && (
                    <select
                      className={`${selectKlasse} mt-2`} value={keuze} disabled={bezig}
                      aria-label="Termijnschema"
                      onChange={e => kiesSchema(e.target.value)}
                    >
                      <option value="">Kies een schema…</option>
                      {bron.condities.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.naam}{c.id === uitCalculatie.conditieId ? ' (uit de calculatie)' : ''}
                        </option>
                      ))}
                      <option value={KEUZE_EIGEN}>Eigen schema samenstellen…</option>
                    </select>
                  )}
                </div>
              ) : (
                <div>
                  <span className={labelKlasse}>Termijnschema</span>
                  <select
                    className={selectKlasse} value={keuze} disabled={bezig}
                    aria-label="Termijnschema"
                    onChange={e => kiesSchema(e.target.value)}
                  >
                    <option value="">Kies een schema…</option>
                    {bron.condities.map(c => <option key={c.id} value={c.id}>{c.naam}</option>)}
                    <option value={KEUZE_EIGEN}>Eigen schema samenstellen…</option>
                  </select>
                  <p className="mt-1 text-[11.5px] leading-snug text-neutral-500">
                    De calculatie van dit dossier kent geen betalingsconditie, dus kies zelf welk
                    schema geldt. Schema&apos;s beheer je bij Instellingen → Betalingscondities.
                  </p>
                </div>
              )}

              {/* — Grondslag. Alleen een keuze zodra er meerwerk is; anders is er niets te kiezen. — */}
              {bron.meerwerk !== 0 ? (
                <div>
                  <span className={labelKlasse}>Bedragen rekenen over</span>
                  <select
                    className={selectKlasse} value={grondslag} disabled={bezig}
                    aria-label="Grondslag voor de bedragen"
                    onChange={e => setGrondslag(e.target.value as TermijnGrondslag)}
                  >
                    <option value="aanneemsom">Aanneemsom — {fmt(bron.aanneemsom)}</option>
                    <option value="contracttotaal">
                      Aanneemsom + goedgekeurd meerwerk — {fmt(bron.aanneemsom + bron.meerwerk)}
                    </option>
                  </select>
                </div>
              ) : (
                <p className="text-[12.5px] text-neutral-600">
                  Bedragen worden gerekend over de aanneemsom van <strong>{fmt(bron.aanneemsom)}</strong> excl. btw.
                </p>
              )}

              {/* — De termijnen zelf — */}
              {regels.length > 0 && (
                <div className="overflow-hidden rounded-md border border-neutral-200">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                        <th className="w-8 px-2 py-1.5 text-left font-semibold">#</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Omschrijving</th>
                        <th className="w-24 px-2 py-1.5 text-right font-semibold">%</th>
                        <th className="w-32 px-2 py-1.5 text-right font-semibold">Excl. btw</th>
                        {!opSlot && <th className="w-8 px-2 py-1.5" />}
                      </tr>
                    </thead>
                    <tbody>
                      {regels.map((r, i) => (
                        <tr key={i} className="border-t border-neutral-100">
                          <td className="px-2 py-1 text-neutral-500">{i + 1}</td>
                          <td className="px-2 py-1">
                            {opSlot ? (
                              <span className="text-neutral-800">{r.omschrijving || `Termijn ${i + 1}`}</span>
                            ) : (
                              <Input
                                value={r.omschrijving} disabled={bezig}
                                placeholder={`Termijn ${i + 1}`}
                                aria-label={`Omschrijving termijn ${i + 1}`}
                                onChange={e => wijzig(i, { omschrijving: e.target.value })}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {opSlot ? `${r.percentage} %` : (
                              <Input
                                value={String(r.percentage)} inputMode="decimal" disabled={bezig}
                                aria-label={`Percentage termijn ${i + 1}`}
                                className="text-right"
                                onChange={e => wijzig(i, { percentage: pct(e.target.value) })}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-neutral-800">
                            {fmt(rijBedragen[i] ?? 0)}
                          </td>
                          {!opSlot && (
                            <td className="px-2 py-1 text-right">
                              <Button
                                variant="ghost" size="icon-sm" disabled={bezig} title="Termijn verwijderen"
                                onClick={() => setRegels(prev => prev.filter((_, idx) => idx !== i))}
                              >×</Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                        <td className="px-2 py-1.5" />
                        <td className="px-2 py-1.5 text-neutral-600">Totaal</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${kloptSom ? 'text-neutral-800' : 'text-red-700'}`}>
                          {Math.round(somPct * 100) / 100} %
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-neutral-800">
                          {fmt(rijBedragen.reduce((s, b) => s + b, 0))}
                        </td>
                        {!opSlot && <td className="px-2 py-1.5" />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {!opSlot && keuze !== '' && (
                <Button
                  variant="ghost" size="sm" disabled={bezig}
                  onClick={() => setRegels(prev => [...prev, { omschrijving: '', percentage: 0 }])}
                >+ Termijn toevoegen</Button>
              )}

              {regels.length > 0 && !kloptSom && (
                <p className="text-[12px] text-red-700">
                  De percentages tellen op tot {Math.round(somPct * 100) / 100}% — dat moet 100% zijn
                  voordat het schema naar Bouw7 kan.
                </p>
              )}
              {basis <= 0 && (
                <p className="text-[12px] text-red-700">
                  Dit dossier heeft nog geen aanneemsom; zonder bedrag zijn er geen termijnen te berekenen.
                </p>
              )}

              {/* — Btw — */}
              <div>
                <span className={labelKlasse}>Btw op de termijnen</span>
                <select
                  className={selectKlasse} value={tariefId ?? ''} disabled={bezig}
                  aria-label="Btw-tarief voor de termijnen"
                  onChange={e => setTariefId(e.target.value ? Number(e.target.value) : null)}
                >
                  {tarieven.map(t => (
                    <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11.5px] leading-snug text-neutral-500">
                  Eén tarief voor alle termijnen. Wijkt een termijn af, pas hem dan in Bouw7 aan.
                </p>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
          <Button variant="primary" onClick={aanmaken} disabled={!kanAanmaken}>
            {bezig ? 'Bezig…' : `Aanmaken in Bouw7${regels.length > 0 ? ` (${regels.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
