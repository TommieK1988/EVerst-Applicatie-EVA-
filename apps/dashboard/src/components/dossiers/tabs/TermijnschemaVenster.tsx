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
 * **Btw splitst het schema.** Een Bouw7-termijn draagt precies één tarief. Kent de opdracht er
 * meer — 9% over arbeid, 21% over materiaal — dan wordt elke termijn opgesplitst in een termijn
 * per tarief, in de verhouding die in de offerte staat. Eén tarief over de hele staat zetten zou
 * btw opleveren die niemand zo heeft geoffreerd, en dat rolt door naar de factuur.
 *
 * De bedragen worden hier op dezelfde manier gerekend als op de server: percentage van de
 * grondslag, en de laatste termijn krijgt het afrondingsverschil zodat de som exact klopt. De
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
  type TermijnschemaBron, type TermijnschemaRegel, type TermijnGrondslag, type BtwAandeel,
} from '@/lib/dossiers/termijnen'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

/** Percentage uit een tekstveld; komma en punt allebei goed. Leeg = 0. */
const pct = (s: string): number => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Compacte weergave van een percentage: 30, 12,5 — geen sleep van nullen. */
const pctTekst = (n: number): string =>
  new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 4 }).format(Math.round(n * 10000) / 10000)

/** Eén termijn zoals hij in Bouw7 komt te staan: eigen bedrag, eigen btw-tarief. */
type Rij = TermijnschemaRegel & { btwTariefBouw7Id: number | null }

/**
 * Zet een termijnschema om in de termijnen die Bouw7 krijgt.
 *
 * Kent de offerte meerdere btw-tarieven, dan valt elke schema-regel uiteen in een regel per
 * tarief: "Aanbetaling" met 30% wordt bij een verdeling 40/60 een regel van 12% tegen het ene
 * tarief en 18% tegen het andere. De laatste regel neemt het afrondingsverschil op, zodat het
 * totaal exact 100% blijft.
 */
function bouwRijen(schema: TermijnschemaRegel[], verdeling: BtwAandeel[], standaard: number | null): Rij[] {
  if (schema.length === 0) return []

  const groepen = verdeling.length > 0
    ? verdeling
    : [{ bouw7TariefId: standaard, label: '', pct: 0, aandeel: 1 } as BtwAandeel]

  const rijen: Rij[] = []
  for (const regel of schema) {
    for (const groep of groepen) {
      rijen.push({
        omschrijving: groepen.length > 1 && groep.label
          ? `${regel.omschrijving || 'Termijn'} (${groep.label})`
          : regel.omschrijving,
        percentage: Math.round(regel.percentage * groep.aandeel * 10000) / 10000,
        btwTariefBouw7Id: groep.bouw7TariefId,
      })
    }
  }

  const somOpEen = rijen.slice(0, -1).reduce((s, r) => s + r.percentage, 0)
  const laatste = rijen[rijen.length - 1]
  laatste.percentage = Math.round((100 - somOpEen) * 10000) / 10000
  return rijen
}

/**
 * Verdeelt de grondslag over de termijnen. De laatste termijn absorbeert het afrondingsverschil —
 * anders blijft er een cent over die op geen enkele factuur terechtkomt.
 */
function bedragen(rijen: Rij[], grondslag: number): number[] {
  const centen = Math.round(grondslag * 100)
  let verdeeld = 0
  return rijen.map((r, i) => {
    const eigen = i === rijen.length - 1 ? centen - verdeeld : Math.round(centen * r.percentage / 100)
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
  const [laadfout, setLaadfout] = useState<string | null>(null)
  const [bezig, start] = useTransition()

  const [keuze, setKeuze] = useState('')
  const [afwijken, setAfwijken] = useState(false)
  const [rijen, setRijen] = useState<Rij[]>([])
  const [grondslag, setGrondslag] = useState<TermijnGrondslag>('aanneemsom')

  /** Terugval als de offerte geen btw-verdeling oplevert: het gewone hoge tarief. */
  const standaardTarief = (b: TermijnschemaBron): number | null => {
    const t = b.tarieven.find(x => !x.verlegd && Math.abs(x.percentage - 21) < 0.01) ?? b.tarieven[0]
    return t?.bouw7_id ?? null
  }

  // Alles wordt pas bij openen geladen; de Verkoop-tab hoeft er niet op te wachten.
  useEffect(() => {
    if (!open) return
    let levend = true
    setBron(null); setLaadfout(null)
    getTermijnschemaBron(dossierId)
      .then(b => {
        if (!levend) return
        setBron(b)
        setAfwijken(false)
        setGrondslag('aanneemsom')
        if (b.uitCalculatie) {
          setKeuze(b.uitCalculatie.conditieId)
          setRijen(bouwRijen(b.uitCalculatie.termijnen, b.btwVerdeling, standaardTarief(b)))
        } else {
          setKeuze('')
          setRijen([])
        }
      })
      .catch((e: unknown) => {
        if (levend) setLaadfout(e instanceof Error ? e.message : 'De gegevens zijn niet op te halen.')
      })
    return () => { levend = false }
  }, [open, dossierId])

  const kiesSchema = useCallback((waarde: string) => {
    setKeuze(waarde)
    if (!bron) return
    const schema = waarde === KEUZE_EIGEN
      ? [{ omschrijving: '', percentage: 100 }]
      : (bron.condities.find(c => c.id === waarde)?.termijnen.map(t => ({ ...t })) ?? [])
    setRijen(bouwRijen(schema, bron.btwVerdeling, standaardTarief(bron)))
  }, [bron])

  if (!open) return null

  const uitCalculatie = bron?.uitCalculatie ?? null
  // Zolang het schema uit de calculatie geldt staan de regels vast: dat is wat is afgesproken.
  const opSlot = !!uitCalculatie && !afwijken
  const gesplitst = (bron?.btwVerdeling.length ?? 0) > 1
  const basis = grondslag === 'contracttotaal'
    ? (bron?.aanneemsom ?? 0) + (bron?.meerwerk ?? 0)
    : (bron?.aanneemsom ?? 0)
  const somPct = rijen.reduce((s, r) => s + r.percentage, 0)
  const kloptSom = Math.abs(somPct - 100) <= 0.01
  const tariefOveral = rijen.every(r => r.btwTariefBouw7Id != null)
  const rijBedragen = bedragen(rijen, basis)
  const kanAanmaken = !bezig && rijen.length > 0 && kloptSom && tariefOveral && basis > 0
    && (bron?.bestaandeTermijnen ?? 0) === 0

  function wijzig(i: number, patch: Partial<Rij>) {
    setRijen(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function aanmaken() {
    start(async () => {
      const r = await maakTermijnschema(dossierId, {
        termijnen: rijen.map(x => ({
          omschrijving: x.omschrijving,
          percentage: x.percentage,
          btwTariefBouw7Id: x.btwTariefBouw7Id!,
        })),
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
      <DialogContent className="max-w-3xl">
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

              {/* — Btw-splitsing. Alleen melden als er iets te melden valt. — */}
              {gesplitst && (
                <p className="rounded-md border border-neutral-200 bg-neutral-50/60 px-3 py-2 text-[12px] leading-relaxed text-neutral-600">
                  De offerte kent {bron.btwVerdeling.length} btw-tarieven
                  {' '}({bron.btwVerdeling.map(v => `${v.label} over ${Math.round(v.aandeel * 100)}%`).join(', ')}).
                  Een Bouw7-termijn draagt er maar één, dus elke termijn is naar die verhouding gesplitst.
                </p>
              )}

              {/* — De termijnen zoals ze in Bouw7 komen te staan — */}
              {rijen.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-neutral-200">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                        <th className="w-8 px-2 py-1.5 text-left font-semibold">#</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Omschrijving</th>
                        <th className="w-20 px-2 py-1.5 text-right font-semibold">%</th>
                        <th className="w-32 px-2 py-1.5 text-right font-semibold">Excl. btw</th>
                        <th className="w-40 px-2 py-1.5 text-left font-semibold">Btw</th>
                        {!opSlot && <th className="w-8 px-2 py-1.5" />}
                      </tr>
                    </thead>
                    <tbody>
                      {rijen.map((r, i) => (
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
                            {opSlot ? `${pctTekst(r.percentage)} %` : (
                              <Input
                                value={pctTekst(r.percentage)} inputMode="decimal" disabled={bezig}
                                aria-label={`Percentage termijn ${i + 1}`}
                                className="text-right"
                                onChange={e => wijzig(i, { percentage: pct(e.target.value) })}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-neutral-800">
                            {fmt(rijBedragen[i] ?? 0)}
                          </td>
                          <td className="px-2 py-1">
                            {/* Het btw-tarief blijft altijd te kiezen, ook bij een schema uit de
                                calculatie: de betalingsconditie zegt niets over btw. */}
                            <select
                              className={selectKlasse} disabled={bezig}
                              value={r.btwTariefBouw7Id ?? ''}
                              aria-label={`Btw-tarief termijn ${i + 1}`}
                              onChange={e => wijzig(i, {
                                btwTariefBouw7Id: e.target.value ? Number(e.target.value) : null,
                              })}
                            >
                              <option value="">Kies een tarief…</option>
                              {bron.tarieven.map(t => (
                                <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
                              ))}
                            </select>
                          </td>
                          {!opSlot && (
                            <td className="px-2 py-1 text-right">
                              <Button
                                variant="ghost" size="icon-sm" disabled={bezig} title="Termijn verwijderen"
                                onClick={() => setRijen(prev => prev.filter((_, idx) => idx !== i))}
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
                          {pctTekst(somPct)} %
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-neutral-800">
                          {fmt(rijBedragen.reduce((s, b) => s + b, 0))}
                        </td>
                        <td className="px-2 py-1.5" />
                        {!opSlot && <td className="px-2 py-1.5" />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {!opSlot && keuze !== '' && (
                <Button
                  variant="ghost" size="sm" disabled={bezig}
                  onClick={() => setRijen(prev => [...prev, {
                    omschrijving: '', percentage: 0, btwTariefBouw7Id: standaardTarief(bron),
                  }])}
                >+ Termijn toevoegen</Button>
              )}

              {rijen.length > 0 && !kloptSom && (
                <p className="text-[12px] text-red-700">
                  De percentages tellen op tot {pctTekst(somPct)}% — dat moet 100% zijn voordat het
                  schema naar Bouw7 kan.
                </p>
              )}
              {rijen.length > 0 && !tariefOveral && (
                <p className="text-[12px] text-red-700">
                  Niet elke termijn heeft een btw-tarief. Bouw7 accepteert een termijn zonder tarief niet.
                </p>
              )}
              {basis <= 0 && (
                <p className="text-[12px] text-red-700">
                  Dit dossier heeft nog geen aanneemsom; zonder bedrag zijn er geen termijnen te berekenen.
                </p>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
          <Button variant="primary" onClick={aanmaken} disabled={!kanAanmaken}>
            {bezig ? 'Bezig…' : `Aanmaken in Bouw7${rijen.length > 0 ? ` (${rijen.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
