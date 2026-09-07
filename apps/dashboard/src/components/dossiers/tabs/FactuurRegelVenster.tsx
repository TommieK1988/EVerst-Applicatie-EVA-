'use client'

/**
 * De factuurregels van één bewakingscode samenstellen uit de boekingen die eronder hangen.
 *
 * Twee lagen, en dat onderscheid is het hele punt van dit scherm:
 *  • boven staan de regels zoals de klant ze op zijn factuur ziet — tekst, bedrag, btw;
 *  • onder staan de geboekte uren en kosten waaruit die regels zijn opgeteld.
 * Wie een prijs aanpast doet dat op het niveau waar de afspraak zit: een opslag of tarief per
 * boeking als het werk gewoon doorgerekend wordt, een vast bedrag op de factuurregel als er iets
 * anders is afgesproken. Beide door één veld halen maakt achteraf onnavolgbaar of een bedrag
 * berekend was of afgesproken.
 *
 * Elke handeling slaat meteen op. Een tabel met een losse Opslaan-knop nodigt uit tot half werk:
 * je vinkt drie regels uit, sluit het venster en weet niet of het is meegegaan.
 *
 * Wat al op een verstuurde factuur staat ligt vast en is hier alleen nog te lezen.
 */

import React, { useEffect, useId, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Lock, Merge, Eye, EyeOff } from 'lucide-react'
import {
  Button, Input, Checkbox, useDialogen,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import {
  bewaarCodeInstelling, bewaarFactuurGroep, bewaarBoekingen, zetBoekingGroep,
  type CodeRegelView, type BoekingView, type GroepView,
} from '@/lib/dossiers/servicedesk'
import { GROEPERINGEN, type Groepering } from '@/lib/dossiers/factuurregel-groepen'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)
const fmtGetal = (v: number) =>
  new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2 }).format(v)

const getal = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const alsTekst = (v: number | null | undefined) => (v != null ? String(v).replace('.', ',') : '')

const datumKort = (d: string | null) => {
  if (!d) return '—'
  const [j, m, dag] = d.slice(0, 10).split('-')
  return dag && m ? `${dag}-${m}-${(j ?? '').slice(2)}` : d.slice(0, 10)
}

const veldKlasse =
  'h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px] text-neutral-900 outline-none '
  + 'transition-[border-color,box-shadow] [transition-duration:120ms] hover:border-neutral-400 '
  + 'focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 '
  + 'disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400'

/**
 * Invoerveld dat pas opslaat bij verlaten of Enter, en dat zijn eigen tekst prijsgeeft zodra de
 * server een andere waarde teruggeeft. Zonder die synchronisatie blijft een afgewezen of afgeronde
 * waarde in beeld staan alsof hij bewaard is.
 */
function BewaarVeld({ waarde, opslaan, disabled, placeholder, uitlijnen, titel, eenheid, eenheidVoor }: {
  waarde: string
  opslaan: (tekst: string) => void
  disabled?: boolean
  placeholder?: string
  uitlijnen?: 'rechts'
  titel?: string
  /** Teken in het veld dat zegt wát het getal is — €, % of /u. */
  eenheid?: string
  /** Eenheid vóór het getal in plaats van erachter (bedragen). */
  eenheidVoor?: boolean
}) {
  const [tekst, setTekst] = useState(waarde)
  useEffect(() => { setTekst(waarde) }, [waarde])
  const bewaar = () => { if (tekst !== waarde) opslaan(tekst) }
  const veld = (
    <input
      value={tekst}
      title={titel}
      disabled={disabled}
      placeholder={placeholder}
      onChange={e => setTekst(e.target.value)}
      onBlur={bewaar}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        if (e.key === 'Escape') setTekst(waarde)
      }}
      className={`${veldKlasse} ${uitlijnen === 'rechts' ? 'text-right tabular-nums' : ''} `
        + `${eenheid ? (eenheidVoor ? 'pl-5' : 'pr-6') : ''}`}
    />
  )
  if (!eenheid) return veld
  // De eenheid staat in het veld en niet in de kolomkop: bij twee getalvelden naast elkaar is de
  // kop te ver weg om nog te vertellen of je naar een bedrag of een percentage kijkt.
  return (
    <div className="relative">
      {veld}
      <span
        className={`pointer-events-none absolute top-0 grid h-8 place-items-center text-[12px] text-neutral-400 `
          + `${eenheidVoor ? 'left-2' : 'right-2'}`}
        aria-hidden
      >
        {eenheid}
      </span>
    </div>
  )
}

/** Btw-keuze voor één regel: leeg = volg wat er een niveau hoger is gekozen. */
function BtwKeuze({ waarde, tarieven, disabled, opslaan, leegLabel }: {
  waarde: number | null
  tarieven: BtwTariefKeuze[]
  disabled?: boolean
  opslaan: (v: number | null) => void
  leegLabel: string
}) {
  return (
    <select
      value={waarde ?? ''}
      disabled={disabled}
      onChange={e => opslaan(e.target.value ? Number(e.target.value) : null)}
      className={veldKlasse}
      aria-label="Btw-tarief"
    >
      <option value="">{leegLabel}</option>
      {tarieven.map(t => (
        <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
      ))}
    </select>
  )
}

export default function FactuurRegelVenster({ dossierId, code, tarieven, readOnly, onSluit, onBewaard }: {
  dossierId: string
  code: CodeRegelView | null
  tarieven: BtwTariefKeuze[]
  /** Afgesloten dossier: alles alleen-lezen, net als elders. */
  readOnly?: boolean
  onSluit: () => void
  onBewaard: () => void
}) {
  const veld = useId()
  const { vraagTekst, bevestig } = useDialogen()
  const [selectie, setSelectie] = useState<Set<string>>(new Set())
  const [bezig, start] = useTransition()
  const [geopendVoor, setGeopendVoor] = useState<string | null>(null)

  // Van code wisselen betekent een schone selectie; anders zouden regels van de vorige post
  // meegaan in een samenvoeging.
  if (code && geopendVoor !== code.bewakingscode) {
    setGeopendVoor(code.bewakingscode)
    setSelectie(new Set())
  }

  if (!code) return null
  // Vaste verwijzing voor de handelingen hieronder: binnen een async-callback ziet TypeScript de
  // controle hierboven niet meer, en `code!` op tien plekken verstopt juist wat hier geborgd is.
  const post = code
  const opslot = code.vergrendeld || !!readOnly

  /** Elke handeling loopt hierlangs: uitvoeren, fout tonen, en anders opnieuw ophalen. */
  function doe(actie: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    start(async () => {
      const r = await actie()
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      onBewaard()
    })
  }

  const codePatch = (patch: Parameters<typeof bewaarCodeInstelling>[2]) =>
    doe(() => bewaarCodeInstelling(dossierId, code.bewakingscode, patch))
  const groepPatch = (sleutel: string, patch: Parameters<typeof bewaarFactuurGroep>[3]) =>
    doe(() => bewaarFactuurGroep(dossierId, code.bewakingscode, sleutel, patch))
  const boekingPatch = (b: BoekingView, patch: Parameters<typeof bewaarBoekingen>[3]) =>
    doe(() => bewaarBoekingen(dossierId, code.bewakingscode,
      [{ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }], patch))

  const teKiezen = code.boekingen.filter(b => !b.gefactureerd)
  const gekozen = teKiezen.filter(b => selectie.has(b.sleutel))
  const alles = gekozen.length > 0 && gekozen.length === teKiezen.length

  function wissel(sleutel: string) {
    setSelectie(vorig => {
      const nieuw = new Set(vorig)
      if (nieuw.has(sleutel)) nieuw.delete(sleutel); else nieuw.add(sleutel)
      return nieuw
    })
  }

  async function samenvoegen() {
    const naam = await vraagTekst({
      titel: `${gekozen.length} boekingen samenvoegen`,
      omschrijving: 'Ze komen als één regel op de factuur. De tekst hieronder is wat de klant leest.',
      label: 'Omschrijving op de factuur',
      standaard: post.omschrijving,
      verplicht: true,
      bevestigLabel: 'Samenvoegen',
    })
    if (naam == null) return
    const bronnen = gekozen.map(b => ({ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }))
    start(async () => {
      const r = await zetBoekingGroep(dossierId, post.bewakingscode, bronnen, 'nieuw')
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      if (r.groepSleutel) {
        const n = await bewaarFactuurGroep(dossierId, post.bewakingscode, r.groepSleutel, { omschrijving: naam })
        if (!n.ok) { toast.error(n.error, { duration: 8000 }); return }
      }
      setSelectie(new Set())
      toast.success('Samengevoegd tot één factuurregel')
      onBewaard()
    })
  }

  function zetUit(uit: boolean) {
    const bronnen = gekozen.map(b => ({ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }))
    start(async () => {
      const r = await bewaarBoekingen(dossierId, post.bewakingscode, bronnen, { uitgesloten: uit })
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      setSelectie(new Set())
      onBewaard()
    })
  }

  async function verplaats(b: BoekingView, keuze: string) {
    if (keuze === '__nieuw') {
      const naam = await vraagTekst({
        titel: 'Nieuwe factuurregel',
        label: 'Omschrijving op de factuur',
        standaard: post.omschrijving,
        verplicht: true,
        bevestigLabel: 'Aanmaken',
      })
      if (naam == null) return
      start(async () => {
        const r = await zetBoekingGroep(dossierId, post.bewakingscode,
          [{ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }], 'nieuw')
        if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
        if (r.groepSleutel) await bewaarFactuurGroep(dossierId, post.bewakingscode, r.groepSleutel, { omschrijving: naam })
        onBewaard()
      })
      return
    }
    doe(() => zetBoekingGroep(dossierId, post.bewakingscode,
      [{ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }],
      { groepSleutel: keuze === '' ? null : keuze }))
  }

  async function anderGroeperen(nieuw: Groepering) {
    const handmatig = post.boekingen.filter(b => b.handmatigToegewezen).length
    if (handmatig > 0) {
      const ja = await bevestig({
        titel: 'Indeling opnieuw laten bepalen?',
        omschrijving: `${handmatig} boeking${handmatig === 1 ? '' : 'en'} ${handmatig === 1 ? 'is' : 'zijn'} `
          + 'handmatig aan een regel toegewezen. Die toewijzing blijft staan en volgt de nieuwe indeling niet.',
        bevestigLabel: 'Doorgaan',
      })
      if (!ja) return
    }
    codePatch({ groepering: nieuw })
  }

  const herkomst = [
    code.bron === 'stelpost' ? 'Stelpost' : 'Meerwerk (regie)',
    code.aantalBoekingen > 0
      ? `${code.aantalBoekingen} boeking${code.aantalBoekingen === 1 ? '' : 'en'} te factureren`
      : 'geen openstaande boekingen',
    ...(code.aantalGefactureerd > 0 ? [`${code.aantalGefactureerd} al gefactureerd`] : []),
    ...(code.inBouw7 ? [] : ['nog niet in Bouw7']),
  ].join(' · ')

  const kop = 'px-2 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-500'
  const labelStijl = 'mb-1.5 block text-[13px] font-semibold text-neutral-700'

  return (
    <Dialog open={code != null} onOpenChange={o => { if (!o) onSluit() }}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Factuurregels — {code.bewakingscode}</DialogTitle>
            <DialogDescription>{herkomst}</DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-7">
          {opslot && (
            <div className="flex gap-3 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3.5 text-[13px] leading-relaxed text-warning-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {code.vergrendeld
                  ? 'Deze post is al volledig gefactureerd en ligt daarmee vast. Corrigeren gaat via een creditnota in Bouw7.'
                  : 'Dit dossier is afgesloten. De factuurregels zijn alleen nog in te zien.'}
              </p>
            </div>
          )}

          {/* ── De post zelf ────────────────────────────────────────────────── */}
          <section className="grid gap-4 sm:grid-cols-[2fr,1fr,1.4fr]">
            <div>
              <label htmlFor={`${veld}-oms`} className={labelStijl}>Naam van de post</label>
              <Input
                id={`${veld}-oms`}
                inputSize="lg"
                defaultValue={code.omschrijving}
                disabled={opslot}
                onBlur={e => {
                  if (e.target.value.trim() !== code.omschrijving) codePatch({ omschrijving: e.target.value })
                }}
              />
              <p className="mt-1.5 text-[12.5px] text-neutral-500">Basis voor de tekst van elke regel hieronder.</p>
            </div>
            <div>
              <label htmlFor={`${veld}-opslag`} className={labelStijl}>Opslag %</label>
              <Input
                id={`${veld}-opslag`}
                inputSize="lg"
                suffix={<span className="text-[13px]">%</span>}
                defaultValue={alsTekst(code.opslagPct)}
                inputMode="decimal"
                placeholder="standaard"
                disabled={opslot}
                onBlur={e => {
                  const v = getal(e.target.value)
                  if (v !== code.opslagPct) codePatch({ opslag_pct: v })
                }}
              />
              <p className="mt-1.5 text-[12.5px] text-neutral-500">Op nieuwe kosten.</p>
            </div>
            <div>
              <label htmlFor={`${veld}-groep`} className={labelStijl}>Indeling van de factuurregels</label>
              <select
                id={`${veld}-groep`}
                value={code.groepering}
                disabled={opslot}
                onChange={e => anderGroeperen(e.target.value as Groepering)}
                className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition-[border-color,box-shadow] [transition-duration:120ms] hover:border-neutral-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400"
              >
                {GROEPERINGEN.map(g => <option key={g.waarde} value={g.waarde}>{g.label}</option>)}
              </select>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-500">
                {GROEPERINGEN.find(g => g.waarde === code.groepering)?.uitleg}
              </p>
            </div>
          </section>

          {/* ── Wat er op de factuur komt ───────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-neutral-800">Op de factuur</h3>
            {code.groepen.length === 0 ? (
              <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3.5 text-[13px] text-neutral-500">
                Er staan geen openstaande boekingen op deze code, dus er valt niets te factureren.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <table className="w-full border-collapse">
                  <thead className="bg-neutral-50">
                    <tr className="border-b border-neutral-200 text-left">
                      <th className={`${kop} w-9`} />
                      <th className={kop}>Omschrijving op de factuur</th>
                      <th className={`${kop} w-24 text-right`}>Aantal</th>
                      <th className={`${kop} w-32 text-right`}>Bedrag excl.</th>
                      <th className={`${kop} w-44`}>Btw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {code.groepen.map((g: GroepView) => (
                      <tr key={g.groepSleutel}
                          className="border-b border-neutral-100 last:border-0"
                          style={{ opacity: g.meefactureren ? 1 : 0.5 }}>
                        <td className="px-2 py-2 align-middle">
                          <Checkbox
                            checked={g.meefactureren}
                            disabled={opslot || bezig}
                            aria-label="Deze regel meenemen op de factuur"
                            onCheckedChange={v => groepPatch(g.groepSleutel, { meefactureren: v === true })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <BewaarVeld
                            waarde={g.eigenOmschrijving ?? ''}
                            placeholder={g.omschrijving}
                            disabled={opslot || bezig}
                            opslaan={t => groepPatch(g.groepSleutel, { omschrijving: t })}
                          />
                          <div className="mt-1 px-0.5 text-[11.5px] text-neutral-500">
                            {g.aantalBoekingen} boeking{g.aantalBoekingen === 1 ? '' : 'en'}
                            {' · berekend '}{fmt(g.berekend)}
                            {g.handmatig ? ' · handmatig samengevoegd' : ''}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right text-[13px] tabular-nums text-neutral-600">
                          {g.eenheid === 'uur' ? `${g.aantal} uur` : '1 post'}
                        </td>
                        <td className="px-2 py-2">
                          <BewaarVeld
                            waarde={alsTekst(g.bedragOverride)}
                            placeholder={fmtGetal(g.berekend)}
                            uitlijnen="rechts"
                            eenheid="€"
                            eenheidVoor
                            titel="Vast bedrag; laat leeg om de optelling van de boekingen te volgen"
                            disabled={opslot || bezig}
                            opslaan={t => groepPatch(g.groepSleutel, { bedrag_excl_btw: getal(t) })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <BtwKeuze
                            waarde={g.btwTariefBouw7Id}
                            tarieven={tarieven}
                            disabled={opslot || bezig}
                            leegLabel="Volg de factuur"
                            opslaan={v => groepPatch(g.groepSleutel, { btw_tarief_bouw7_id: v })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-neutral-200 bg-neutral-50 text-[14px] font-semibold text-neutral-900">
                      <td />
                      <td className="px-2 py-2.5">Samen op de factuur</td>
                      <td />
                      <td className="px-2 py-2.5 text-right tabular-nums">{fmt(code.bedrag)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* ── De boekingen eronder ────────────────────────────────────────── */}
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-semibold text-neutral-800">Geboekte uren en kosten</h3>
              <span className="flex-1" />
              {gekozen.length > 0 && !opslot && (
                <>
                  <span className="text-[12.5px] text-neutral-500">{gekozen.length} geselecteerd</span>
                  <Button variant="outline" size="sm" disabled={bezig || gekozen.length < 2} onClick={samenvoegen}>
                    <Merge className="h-3.5 w-3.5" /> Samenvoegen
                  </Button>
                  <Button variant="outline" size="sm" disabled={bezig} onClick={() => zetUit(true)}>
                    <EyeOff className="h-3.5 w-3.5" /> Uitzetten
                  </Button>
                  <Button variant="outline" size="sm" disabled={bezig} onClick={() => zetUit(false)}>
                    <Eye className="h-3.5 w-3.5" /> Aanzetten
                  </Button>
                </>
              )}
            </div>

            {code.boekingen.length === 0 ? (
              <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3.5 text-[13px] text-neutral-500">
                Er is nog niets op deze bewakingscode geboekt.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead className="bg-neutral-50">
                    <tr className="border-b border-neutral-200 text-left">
                      <th className={`${kop} w-9`}>
                        <Checkbox
                          checked={alles}
                          disabled={opslot || teKiezen.length === 0}
                          aria-label="Alles selecteren"
                          onCheckedChange={v =>
                            setSelectie(v === true ? new Set(teKiezen.map(b => b.sleutel)) : new Set())}
                        />
                      </th>
                      <th className={`${kop} w-20`}>Datum</th>
                      <th className={kop}>Omschrijving</th>
                      <th className={`${kop} w-20 text-right`}>Aantal</th>
                      <th className={`${kop} w-24 text-right`}>Kostprijs</th>
                      <th className={`${kop} w-28 text-right`}>Tarief</th>
                      <th className={`${kop} w-24 text-right`}>Opslag</th>
                      <th className={`${kop} w-28 text-right`}>Verkoop</th>
                      <th className={`${kop} w-40`}>Factuurregel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {code.boekingen.map(b => {
                      const dood = b.gefactureerd || b.uitgesloten
                      const vast = opslot || b.gefactureerd || bezig
                      return (
                        <tr key={b.sleutel}
                            className="border-b border-neutral-100 align-middle last:border-0"
                            style={{ opacity: dood ? 0.45 : 1 }}>
                          <td className="px-2 py-2">
                            <Checkbox
                              checked={selectie.has(b.sleutel)}
                              disabled={opslot || b.gefactureerd}
                              aria-label="Deze boeking selecteren"
                              onCheckedChange={() => wissel(b.sleutel)}
                            />
                          </td>
                          <td className="px-2 py-2 text-[12.5px] tabular-nums text-neutral-500">
                            {datumKort(b.datum)}
                          </td>
                          <td className="px-2 py-2">
                            <div className="text-[13px] text-neutral-800">{b.omschrijving}</div>
                            <div className="text-[11.5px] text-neutral-500">
                              {b.soort}
                              {b.herkomst ? ` · ${b.herkomst}` : ''}
                              {b.gefactureerd ? ' · staat op een factuur' : b.uitgesloten ? ' · uitgezet' : ''}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-[13px] tabular-nums text-neutral-600">
                            {b.bronType === 'uur' ? `${b.aantal ?? 0} uur` : '1 post'}
                          </td>
                          <td className="px-2 py-2 text-right text-[13px] tabular-nums text-neutral-500">
                            {fmt(b.inkoopBedrag)}
                          </td>
                          <td className="px-2 py-2">
                            {/* Prijs per eenheid. Een kostenpost telt als één post en heeft er dus
                                geen; daar ís het verkoopbedrag de prijs. */}
                            {b.aantal && b.aantal !== 0 ? (
                              <BewaarVeld
                                waarde={alsTekst(b.verkoopTarief)}
                                uitlijnen="rechts"
                                eenheid={b.eenheid === 'uur' ? '/u' : ''}
                                titel={`Verkoopprijs per ${b.eenheid ?? 'eenheid'} — past het verkoopbedrag en de opslag aan`}
                                disabled={vast}
                                opslaan={t => boekingPatch(b, { verkoopTarief: getal(t) })}
                              />
                            ) : (
                              <div className="px-1 text-right text-[13px] text-neutral-400">—</div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {b.inkoopBedrag > 0 ? (
                              <BewaarVeld
                                waarde={alsTekst(b.opslagPct)}
                                uitlijnen="rechts"
                                eenheid="%"
                                titel="Opslag op de kostprijs — past het verkoopbedrag en het tarief aan"
                                disabled={vast}
                                opslaan={t => boekingPatch(b, { opslagPct: getal(t) })}
                              />
                            ) : (
                              <div className="px-1 text-right text-[13px] text-neutral-400"
                                   title="Zonder kostprijs valt er geen opslag op te rekenen">—</div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <BewaarVeld
                              waarde={fmtGetal(b.verkoopBedrag)}
                              uitlijnen="rechts"
                              eenheid="€"
                              eenheidVoor
                              titel="Verkoopbedrag excl. btw — past het tarief en de opslag aan"
                              disabled={vast}
                              opslaan={t => boekingPatch(b, { verkoopBedrag: getal(t) })}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={b.handmatigToegewezen ? b.groepSleutel : ''}
                              disabled={vast}
                              onChange={e => verplaats(b, e.target.value)}
                              className={veldKlasse}
                              aria-label="Bij welke factuurregel hoort deze boeking"
                            >
                              <option value="">Volg de indeling</option>
                              {code.groepen.map(g => (
                                <option key={g.groepSleutel} value={g.groepSleutel}>{g.omschrijving}</option>
                              ))}
                              {/* Een uitgezette boeking telt in geen enkele groep mee, maar houdt wel
                                  zijn toewijzing. Zonder deze optie zou de keuzelijst leeg lijken en
                                  bij de eerste aanraking stilletjes iets anders kiezen. */}
                              {b.handmatigToegewezen
                                && !code.groepen.some(g => g.groepSleutel === b.groepSleutel) && (
                                <option value={b.groepSleutel}>Eigen regel (nu uitgezet)</option>
                              )}
                              <option value="__nieuw">Nieuwe regel…</option>
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!opslot && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-500">
                Een tarief of opslag rekent mee met wat er nog geboekt wordt; een verkoopbedrag zet die
                regel vast. Uitgezette boekingen blijven staan voor een volgende factuur.
              </p>
            )}
          </section>
        </DialogBody>

        <DialogFooter split>
          <label className="flex items-center gap-2.5 text-[13px] text-neutral-700">
            <Checkbox
              checked={code.meefactureren}
              disabled={opslot || bezig}
              onCheckedChange={v => codePatch({ meefactureren: v === true })}
            />
            <span>Deze post meenemen op de eerstvolgende factuur</span>
          </label>
          <Button variant="primary" size="lg" onClick={onSluit} disabled={bezig}>
            {bezig ? 'Bezig…' : 'Klaar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
