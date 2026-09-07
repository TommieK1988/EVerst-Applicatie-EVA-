'use client'

/**
 * De factuurregels van één bewakingscode samenstellen uit de boekingen die eronder hangen.
 *
 * Twee panelen naast elkaar, en die indeling is het hele punt: links staat wat er geboekt is,
 * rechts wat de klant straks op zijn factuur leest. Het verband tussen die twee is waar het bij
 * nacalculatie om draait, en dat verband is alleen te zien als je ze naast elkaar zet — onder
 * elkaar moet je twee tabellen uit je hoofd vergelijken.
 *
 * Het nummer voor een factuurregel komt terug in de kolom Regel links, zodat van elke boeking af te
 * lezen is waar hij terechtkomt. Wijs je met de muis een factuurregel aan, dan lichten zijn
 * boekingen op.
 *
 * Prijzen zijn op twee plekken te sturen, en dat onderscheid is bewust: een tarief of opslag per
 * boeking rekent door met wat er nog geboekt wordt, een bedrag op de factuurregel zet dat juist
 * stil omdat er iets anders is afgesproken. In één veld is achteraf niet meer te zien of een bedrag
 * berekend was of afgesproken.
 *
 * Elke handeling slaat meteen op. Een tabel met een losse Opslaan-knop nodigt uit tot half werk:
 * je vinkt drie regels uit, sluit het venster en weet niet of het is meegegaan.
 *
 * Wat al op een verstuurde factuur staat ligt vast en is hier alleen nog te lezen.
 */

import React, { useEffect, useId, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Lock, Merge, Unlink } from 'lucide-react'
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
  // De eenheid staat in het veld en niet in de kolomkop: bij getalvelden naast elkaar is de kop te
  // ver weg om nog te vertellen of je naar een bedrag of een percentage kijkt.
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

/** Het nummer dat een factuurregel rechts verbindt met zijn boekingen links. */
function Nummer({ n, gemarkeerd }: { n: number; gemarkeerd?: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] font-bold tabular-nums ${
        gemarkeerd ? 'bg-brand-500 text-white' : 'bg-neutral-200 text-neutral-700'
      }`}
    >
      {n}
    </span>
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
  /** Factuurregel die de muis aanwijst; zijn boekingen lichten links op. */
  const [gemarkeerd, setGemarkeerd] = useState<string | null>(null)
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
  const nummerVan = new Map(code.groepen.map((g, i) => [g.groepSleutel, i + 1]))

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

  function losmaken() {
    const bronnen = gekozen.map(b => ({ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }))
    start(async () => {
      const r = await zetBoekingGroep(dossierId, post.bewakingscode, bronnen, { groepSleutel: null })
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

  const kop = 'px-1.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500'
  const labelStijl = 'mb-1.5 block text-[13px] font-semibold text-neutral-700'

  return (
    <Dialog open={code != null} onOpenChange={o => { if (!o) onSluit() }}>
      {/* Breder dan de DS-maten: twee panelen naast elkaar met een bewerkbare tabel links passen
          niet in 920px, en onder elkaar zetten is precies wat dit scherm níét moest worden. */}
      <DialogContent size="xl" className="max-w-[1320px]">
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Factuurregels — {code.bewakingscode}</DialogTitle>
            <DialogDescription>{herkomst}</DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-6">
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
            </div>
          </section>

          {/* ── Links de boekingen, rechts de factuur ───────────────────────── */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">

            {/* Links: hoe het geboekt is */}
            <section className="min-w-0">
              <div className="mb-2 flex min-h-8 flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-semibold text-neutral-800">Geboekte uren en kosten</h3>
                <span className="flex-1" />
                {gekozen.length > 0 && !opslot && (
                  <>
                    <span className="text-[12.5px] text-neutral-500">{gekozen.length} geselecteerd</span>
                    <Button variant="outline" size="sm" disabled={bezig || gekozen.length < 2} onClick={samenvoegen}>
                      <Merge className="h-3.5 w-3.5" /> Samenvoegen
                    </Button>
                    <Button variant="outline" size="sm" disabled={bezig} onClick={losmaken}>
                      <Unlink className="h-3.5 w-3.5" /> Losmaken
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
                  <table className="w-full min-w-[720px] border-collapse">
                    <thead className="bg-neutral-50">
                      <tr className="border-b border-neutral-200 text-left">
                        <th className={`${kop} w-8`} title="Staat op de factuur">Op</th>
                        <th className={`${kop} w-16`}>Datum</th>
                        <th className={kop}>Geboekt als</th>
                        <th className={`${kop} w-16 text-right`}>Aantal</th>
                        <th className={`${kop} w-20 text-right`}>Kostprijs</th>
                        <th className={`${kop} w-[86px] text-right`}>Tarief</th>
                        <th className={`${kop} w-[74px] text-right`}>Opslag</th>
                        <th className={`${kop} w-[92px] text-right`}>Verkoop</th>
                        <th className={`${kop} w-[74px]`}>Regel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {code.boekingen.map(b => {
                        const vast = opslot || b.gefactureerd || bezig
                        const isGekozen = selectie.has(b.sleutel)
                        const licht = gemarkeerd != null && b.groepSleutel === gemarkeerd && !b.uitgesloten
                        return (
                          <tr
                            key={b.sleutel}
                            // De rij aanklikken selecteert hem. Het vinkje vooraan is bezet: dat zegt
                            // of de boeking op de factuur komt, en dat is een andere vraag.
                            onClick={() => { if (!opslot && !b.gefactureerd) wissel(b.sleutel) }}
                            className={`border-b border-neutral-100 align-middle last:border-0 ${
                              opslot || b.gefactureerd ? '' : 'cursor-pointer'
                            } ${isGekozen ? 'bg-brand-50' : licht ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
                            style={{ opacity: b.gefactureerd || b.uitgesloten ? 0.5 : 1 }}
                          >
                            <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={!b.uitgesloten}
                                disabled={vast}
                                aria-label="Deze boeking op de factuur zetten"
                                title={b.gefactureerd ? 'Staat al op een verstuurde factuur' : 'Op de factuur'}
                                onCheckedChange={v => boekingPatch(b, { uitgesloten: v !== true })}
                              />
                            </td>
                            <td className="px-1.5 py-2 text-[12.5px] tabular-nums text-neutral-500">
                              {datumKort(b.datum)}
                            </td>
                            <td className="px-1.5 py-2">
                              <div className="truncate text-[13px] text-neutral-800" title={b.omschrijving}>
                                {b.omschrijving}
                              </div>
                              <div className="truncate text-[11.5px] text-neutral-500">
                                {b.soort}
                                {b.herkomst ? ` · ${b.herkomst}` : ''}
                                {b.gefactureerd ? ' · gefactureerd' : b.uitgesloten ? ' · niet op de factuur' : ''}
                              </div>
                            </td>
                            <td className="px-1.5 py-2 text-right text-[13px] tabular-nums text-neutral-600">
                              {b.bronType === 'uur' ? `${b.aantal ?? 0} u` : '1'}
                            </td>
                            <td className="px-1.5 py-2 text-right text-[13px] tabular-nums text-neutral-500">
                              {fmt(b.inkoopBedrag)}
                            </td>
                            <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
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
                            <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
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
                            <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
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
                            <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                              <select
                                value={b.handmatigToegewezen ? b.groepSleutel : ''}
                                disabled={vast || b.uitgesloten}
                                onChange={e => verplaats(b, e.target.value)}
                                className={veldKlasse}
                                title="Bij welke factuurregel hoort deze boeking"
                                aria-label="Factuurregel"
                              >
                                <option value="">
                                  {b.uitgesloten ? '—' : `${nummerVan.get(b.groepSleutel) ?? '?'} (auto)`}
                                </option>
                                {code.groepen.map(g => (
                                  <option key={g.groepSleutel} value={g.groepSleutel}>
                                    {nummerVan.get(g.groepSleutel)}
                                  </option>
                                ))}
                                {/* Een uitgezette boeking telt in geen enkele groep mee, maar houdt
                                    wel zijn toewijzing. Zonder deze optie zou de lijst leeg lijken en
                                    bij de eerste aanraking stilletjes iets anders kiezen. */}
                                {b.handmatigToegewezen
                                  && !code.groepen.some(g => g.groepSleutel === b.groepSleutel) && (
                                  <option value={b.groepSleutel}>eigen</option>
                                )}
                                <option value="__nieuw">nieuw…</option>
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!opslot && code.boekingen.length > 0 && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-500">
                  Het vinkje zet een boeking op de factuur. Klik op een rij om hem te selecteren en
                  meerdere boekingen tot één factuurregel samen te voegen.
                </p>
              )}
            </section>

            {/* Rechts: wat de klant leest */}
            <section className="min-w-0">
              <h3 className="mb-2 flex min-h-8 items-center text-[13px] font-semibold text-neutral-800">
                Op de factuur
              </h3>

              {code.groepen.length === 0 ? (
                <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3.5 text-[13px] text-neutral-500">
                  Er staan geen boekingen op de factuur, dus er valt niets te factureren.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {code.groepen.map((g: GroepView, i) => (
                    <div
                      key={g.groepSleutel}
                      onMouseEnter={() => setGemarkeerd(g.groepSleutel)}
                      onMouseLeave={() => setGemarkeerd(null)}
                      className={`rounded-lg border px-3.5 py-3 transition-colors ${
                        gemarkeerd === g.groepSleutel ? 'border-brand-300 bg-brand-50/40' : 'border-neutral-200'
                      }`}
                      style={{ opacity: g.meefactureren ? 1 : 0.55 }}
                    >
                      <div className="flex items-center gap-2.5">
                        <Nummer n={i + 1} gemarkeerd={gemarkeerd === g.groepSleutel} />
                        <BewaarVeld
                          waarde={g.eigenOmschrijving ?? ''}
                          placeholder={g.omschrijving}
                          disabled={opslot || bezig}
                          titel="Omschrijving op de factuur"
                          opslaan={t => groepPatch(g.groepSleutel, { omschrijving: t })}
                        />
                        <Checkbox
                          checked={g.meefactureren}
                          disabled={opslot || bezig}
                          aria-label="Deze regel meenemen op de factuur"
                          title="Deze regel meenemen op de factuur"
                          onCheckedChange={v => groepPatch(g.groepSleutel, { meefactureren: v === true })}
                        />
                      </div>

                      <div className="mt-2.5 flex items-center gap-2.5">
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-neutral-500">
                          {g.eenheid === 'uur' ? `${g.aantal} uur` : '1 post'}
                          {' · '}{g.aantalBoekingen} boeking{g.aantalBoekingen === 1 ? '' : 'en'}
                          {g.bedragOverride != null ? ` · berekend ${fmt(g.berekend)}` : ''}
                          {g.handmatig ? ' · samengevoegd' : ''}
                        </span>
                        <div className="w-[110px] shrink-0">
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
                        </div>
                      </div>

                      <div className="mt-2">
                        <BtwKeuze
                          waarde={g.btwTariefBouw7Id}
                          tarieven={tarieven}
                          disabled={opslot || bezig}
                          leegLabel="Btw: volg de factuur"
                          opslaan={v => groepPatch(g.groepSleutel, { btw_tarief_bouw7_id: v })}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex items-baseline justify-between gap-3 rounded-lg bg-neutral-100 px-3.5 py-3 text-[14px] font-semibold text-neutral-900">
                    <span>Samen excl. btw</span>
                    <span className="tabular-nums">{fmt(code.bedrag)}</span>
                  </div>
                </div>
              )}
            </section>
          </div>
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
