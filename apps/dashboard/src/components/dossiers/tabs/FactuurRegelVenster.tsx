'use client'

/**
 * De factuurregels van één bewakingscode samenstellen uit de boekingen die eronder hangen.
 *
 * Twee tabellen van gelijke breedte naast elkaar, met de verplaatsknoppen ertussen — het klassieke
 * dual-list-patroon. Links staat wát er geboekt is, rechts wát de klant op zijn factuur leest. Dat
 * verband is waar nacalculatie om draait, en het is alleen af te lezen als beide in dezelfde vorm
 * naast elkaar staan; onder elkaar, of links een tabel en rechts kaartjes, moet je twee lijsten uit
 * je hoofd vergelijken.
 *
 * Werkwijze: rijen links aanklikken om ze te selecteren, rechts een factuurregel aanwijzen als doel,
 * en dan → om ze daarheen te verplaatsen, ← om ze weer de automatische indeling te laten volgen, of
 * + om er een nieuwe factuurregel van te maken.
 *
 * Het vinkje vooraan links is iets anders dan de selectie: dat zegt of de boeking óp de factuur komt.
 *
 * Prijzen zijn op twee plekken te sturen, en dat onderscheid is bewust: een tarief of opslag per
 * boeking rekent door met wat er nog geboekt wordt, een bedrag op de factuurregel zet dat juist stil
 * omdat er iets anders is afgesproken. In één veld is achteraf niet meer te zien of een bedrag
 * berekend was of afgesproken.
 *
 * Elke handeling slaat meteen op. Een tabel met een losse Opslaan-knop nodigt uit tot half werk: je
 * vinkt drie regels uit, sluit het venster en weet niet of het is meegegaan.
 *
 * Wat al op een verstuurde factuur staat ligt vast en is hier alleen nog te lezen.
 */

import React, { useEffect, useId, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Lock, ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import {
  Button, Input, Checkbox, useDialogen,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
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
/** Aantallen: geen vaste decimalen, wél een Nederlandse komma (6,5 u in plaats van 6.5 u). */
const fmtAantal = (v: number) =>
  new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(v)

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

/** Kolomkop. Sticky op de th en niet op de thead — anders werkt het niet met border-collapse. */
const kop = 'sticky top-0 z-[1] whitespace-nowrap border-b border-neutral-200 bg-neutral-50 '
  + 'px-1.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500'
const voet = 'sticky bottom-0 z-[1] border-t border-neutral-200 bg-neutral-50 px-1.5 py-2.5'

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
function BtwKeuze({ waarde, tarieven, disabled, opslaan }: {
  waarde: number | null
  tarieven: BtwTariefKeuze[]
  disabled?: boolean
  opslaan: (v: number | null) => void
}) {
  return (
    <select
      value={waarde ?? ''}
      disabled={disabled}
      onChange={e => opslaan(e.target.value ? Number(e.target.value) : null)}
      className={veldKlasse}
      title="Btw-tarief voor deze regel; leeg = het tarief van de hele factuur"
      aria-label="Btw-tarief"
    >
      <option value="">volgt factuur</option>
      {tarieven.map(t => (
        <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
      ))}
    </select>
  )
}

/** Het nummer dat een factuurregel verbindt met de boekingen links. */
function Nummer({ n, actief }: { n: number; actief?: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 place-items-center rounded text-[11px] font-bold tabular-nums ${
        actief ? 'bg-brand-500 text-white' : 'bg-neutral-200 text-neutral-700'
      }`}
    >
      {n}
    </span>
  )
}

/**
 * De twee regels tekst van een boeking, zonder dubbeling.
 *
 * Bij uren is `omschrijving` opgebouwd als "uursoort — medewerker"; die als titel tonen kapt in een
 * smalle kolom precies de naam af, terwijl de uursoort rechts al de naam van de factuurregel is.
 * Daarom staat bij uren de medewerker boven en de uursoort eronder. Bij kosten is de omschrijving
 * wél het onderscheidende, en toont de onderregel alleen wat daar nog niet in staat — anders komt
 * de leverancier er twee keer te staan zodra de omschrijving op hem terugvalt.
 */
function tekstVan(b: BoekingView): { titel: string; onder: string } {
  if (b.bronType === 'uur' && b.herkomst) return { titel: b.herkomst, onder: b.soort }
  const titel = b.omschrijving ?? b.soort
  const laag = titel.toLowerCase()
  const onder = [b.soort, b.herkomst]
    .filter((d): d is string => !!d && d.trim() !== '')
    .filter(d => !laag.includes(d.toLowerCase()))
    .join(' · ')
  return { titel, onder }
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
  /** De factuurregel die als doel is aangewezen voor de →-knop. */
  const [doel, setDoel] = useState<string | null>(null)
  const [bezig, start] = useTransition()
  const [geopendVoor, setGeopendVoor] = useState<string | null>(null)

  // Van code wisselen betekent een schone selectie; anders zouden regels van de vorige post meegaan
  // in een verplaatsing.
  if (code && geopendVoor !== code.bewakingscode) {
    setGeopendVoor(code.bewakingscode)
    setSelectie(new Set())
    setDoel(null)
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

  // Het doel wordt afgeleid en niet blind vertrouwd: groepen ontstaan en verdwijnen bij elke
  // herlading, dus een onthouden sleutel kan zomaar niet meer bestaan.
  const actiefDoel = doel != null && code.groepen.some(g => g.groepSleutel === doel) ? doel : null
  const doelNummer = actiefDoel ? nummerVan.get(actiefDoel) : null

  const bronnenVanSelectie = () => gekozen.map(b => ({ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }))

  function wissel(sleutel: string) {
    setSelectie(vorig => {
      const nieuw = new Set(vorig)
      if (nieuw.has(sleutel)) nieuw.delete(sleutel); else nieuw.add(sleutel)
      return nieuw
    })
  }

  function verplaatsNaarDoel() {
    if (!actiefDoel) return
    const bronnen = bronnenVanSelectie()
    start(async () => {
      const r = await zetBoekingGroep(dossierId, post.bewakingscode, bronnen, { groepSleutel: actiefDoel })
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      setSelectie(new Set())
      onBewaard()
    })
  }

  function losmaken() {
    const bronnen = bronnenVanSelectie()
    start(async () => {
      const r = await zetBoekingGroep(dossierId, post.bewakingscode, bronnen, { groepSleutel: null })
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      setSelectie(new Set())
      onBewaard()
    })
  }

  async function nieuweRegel() {
    const naam = await vraagTekst({
      titel: gekozen.length === 1 ? 'Nieuwe factuurregel' : `${gekozen.length} boekingen als één regel`,
      omschrijving: 'Ze komen als één regel op de factuur. De tekst hieronder is wat de klant leest.',
      label: 'Omschrijving op de factuur',
      standaard: post.omschrijving,
      verplicht: true,
      bevestigLabel: 'Aanmaken',
    })
    if (naam == null) return
    const bronnen = bronnenVanSelectie()
    start(async () => {
      const r = await zetBoekingGroep(dossierId, post.bewakingscode, bronnen, 'nieuw')
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      if (r.groepSleutel) {
        const n = await bewaarFactuurGroep(dossierId, post.bewakingscode, r.groepSleutel, { omschrijving: naam })
        if (!n.ok) { toast.error(n.error, { duration: 8000 }); return }
        setDoel(r.groepSleutel)
      }
      setSelectie(new Set())
      onBewaard()
    })
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

  // ── Knopstatus ────────────────────────────────────────────────────────────
  const kanNaarDoel = !opslot && !bezig && gekozen.length > 0 && actiefDoel != null
  const kanLosmaken = !opslot && !bezig && gekozen.some(b => b.handmatigToegewezen)
  const kanNieuw = !opslot && !bezig && gekozen.length > 0
  const doelUitleg = gekozen.length === 0
    ? 'Selecteer eerst boekingen links'
    : actiefDoel == null ? 'Kies eerst een factuurregel rechts'
    : `Toevoegen aan regel ${doelNummer}`

  // ── Totalen ───────────────────────────────────────────────────────────────
  const opFactuur = code.boekingen.filter(b => !b.uitgesloten && !b.gefactureerd)
  const somKosten = opFactuur.reduce((s, b) => s + b.inkoopBedrag, 0)
  const somVerkoop = opFactuur.reduce((s, b) => s + b.verkoopBedrag, 0)
  const uitRegels = code.groepen.filter(g => !g.meefactureren)
  const uitRegelBedrag = uitRegels.reduce((s, g) => s + g.bedrag, 0)
  const uitBoekingen = code.boekingen.filter(b => b.uitgesloten && !b.gefactureerd)
  const uitBoekingBedrag = uitBoekingen.reduce((s, b) => s + b.verkoopBedrag, 0)
  const uitleg = [
    uitRegels.length > 0
      && `${uitRegels.length} regel${uitRegels.length === 1 ? '' : 's'} staat uit — ${fmt(uitRegelBedrag)} blijft van de factuur af`,
    uitBoekingen.length > 0
      && `${uitBoekingen.length} boeking${uitBoekingen.length === 1 ? '' : 'en'} uitgevinkt — ${fmt(uitBoekingBedrag)}`,
    !code.meefactureren && 'De hele post staat uit; er komt niets van op de eerstvolgende factuur.',
  ].filter(Boolean) as string[]

  const herkomst = [
    code.bron === 'stelpost' ? 'Stelpost' : 'Meerwerk (regie)',
    code.aantalBoekingen > 0
      ? `${code.aantalBoekingen} boeking${code.aantalBoekingen === 1 ? '' : 'en'} te factureren`
      : 'geen openstaande boekingen',
    ...(code.aantalGefactureerd > 0 ? [`${code.aantalGefactureerd} al gefactureerd`] : []),
    ...(code.inBouw7 ? [] : ['nog niet in Bouw7']),
  ].join(' · ')

  const labelStijl = 'mb-1.5 block text-[13px] font-semibold text-neutral-700'
  const paneelKop = 'mb-2 flex min-h-8 shrink-0 items-center gap-2 text-[13px] font-semibold text-neutral-800'
  const scrollBak = 'min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-200'

  return (
    <Dialog open={code != null} onOpenChange={o => { if (!o) onSluit() }}>
      {/* Breder en met een vaste hoogte, net als ActiviteitToevoegenModal: twee tabellen naast
          elkaar passen niet in de 920px van size="xl", en een vaste hoogte houdt beide panelen even
          groot met hun eigen scroll. 1440 = 2 × 660 tabel + 44 knoppen + 32 gaps + 40 padding. */}
      <DialogContent size="xl" className="flex flex-col p-0 max-w-[1440px] h-[85vh]">
        <DialogHeader className="shrink-0 border-b border-neutral-200 px-6 py-4">
          <div className="pr-8">
            <DialogTitle>Factuurregels — {code.bewakingscode}</DialogTitle>
            <DialogDescription>{herkomst}</DialogDescription>
          </div>
        </DialogHeader>

        {/* De post zelf */}
        <div className="shrink-0 space-y-4 border-b border-neutral-100 px-5 py-4">
          {opslot && (
            <div className="flex gap-3 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-[13px] leading-relaxed text-warning-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {code.vergrendeld
                  ? 'Deze post is al volledig gefactureerd en ligt daarmee vast. Corrigeren gaat via een creditnota in Bouw7.'
                  : 'Dit dossier is afgesloten. De factuurregels zijn alleen nog in te zien.'}
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-[2fr,1fr,1.4fr]">
            <div>
              <label htmlFor={`${veld}-oms`} className={labelStijl}>Naam van de post</label>
              <Input
                id={`${veld}-oms`}
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
                className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-[13px] text-neutral-900 outline-none transition-[border-color,box-shadow] [transition-duration:120ms] hover:border-neutral-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400"
              >
                {GROEPERINGEN.map(g => <option key={g.waarde} value={g.waarde}>{g.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Links de boekingen, knoppen ertussen, rechts de factuur ─────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] gap-4 px-5 py-4">

          {/* LINKS */}
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className={paneelKop}>
              <span>Geboekte uren en kosten</span>
              <span className="flex-1" />
              {gekozen.length > 0 && (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {gekozen.length} geselecteerd
                </span>
              )}
            </div>
            <div className={scrollBak}>
              <table className="w-full min-w-[600px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: 30 }} />
                  <col style={{ width: 62 }} />
                  <col style={{ width: '99%' }} />
                  <col style={{ width: 58 }} />
                  {/* Ruim genoeg voor het totaal in de voetregel (€ 2.724,65), niet alleen voor
                      een enkele boeking. */}
                  <col style={{ width: 84 }} />
                  <col style={{ width: 72 }} />
                  {/* Een opslag kan 76,47 zijn; met het %-teken ín het veld is 80px het minimum
                      waarbij dat niet wordt afgekapt. */}
                  <col style={{ width: 80 }} />
                  <col style={{ width: 100 }} />
                </colgroup>
                <thead>
                  <tr className="text-left">
                    <th className={kop} title="Staat op de factuur">Op</th>
                    <th className={kop}>Datum</th>
                    <th className={kop}>Geboekt als</th>
                    <th className={`${kop} text-right`}>Aantal</th>
                    <th className={`${kop} text-right`}>Kostprijs</th>
                    <th className={`${kop} text-right`} title="Verkoopprijs per uur">Uurtarief</th>
                    <th className={`${kop} text-right`}>Opslag</th>
                    <th className={`${kop} text-right`}>Verkoop</th>
                  </tr>
                </thead>
                <tbody>
                  {code.boekingen.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-[13px] text-neutral-500">
                        Er is nog niets op deze bewakingscode geboekt.
                      </td>
                    </tr>
                  )}
                  {code.boekingen.map(b => {
                    const vast = opslot || b.gefactureerd || bezig
                    const isGekozen = selectie.has(b.sleutel)
                    const bijDoel = actiefDoel != null && b.groepSleutel === actiefDoel && !b.uitgesloten
                    const tekst = tekstVan(b)
                    return (
                      <tr
                        key={b.sleutel}
                        onClick={() => { if (!opslot && !b.gefactureerd) wissel(b.sleutel) }}
                        className={`border-b border-neutral-100 align-middle last:border-0 ${
                          opslot || b.gefactureerd ? '' : 'cursor-pointer'
                        } ${isGekozen ? 'bg-brand-50' : bijDoel ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
                        style={{ opacity: b.gefactureerd || b.uitgesloten ? 0.5 : 1 }}
                      >
                        <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                          {b.gefactureerd ? (
                            <Lock className="h-3.5 w-3.5 text-neutral-400" aria-label="Staat op een verstuurde factuur" />
                          ) : (
                            <Checkbox
                              checked={!b.uitgesloten}
                              disabled={vast}
                              aria-label="Deze boeking op de factuur zetten"
                              title="Op de factuur"
                              onCheckedChange={v => boekingPatch(b, { uitgesloten: v !== true })}
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-2 text-[12.5px] tabular-nums text-neutral-500">
                          {datumKort(b.datum)}
                        </td>
                        <td className="px-1.5 py-2">
                          <div className="truncate text-[13px] text-neutral-800" title={b.omschrijving}>
                            {tekst.titel}
                          </div>
                          {tekst.onder && (
                            <div className="truncate text-[11.5px] text-neutral-500" title={tekst.onder}>
                              {tekst.onder}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-2 text-right text-[13px] tabular-nums text-neutral-600">
                          {b.bronType === 'uur' ? `${fmtAantal(b.aantal ?? 0)} u` : '1'}
                        </td>
                        <td className="px-1.5 py-2 text-right text-[13px] tabular-nums text-neutral-500">
                          {fmt(b.inkoopBedrag)}
                        </td>
                        <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                          {/* Prijs per eenheid. Een kostenpost telt als één post en heeft er dus
                              geen; daar ís het verkoopbedrag de prijs. */}
                          {b.bronType === 'uur' && b.aantal ? (
                            <BewaarVeld
                              waarde={alsTekst(b.verkoopTarief)}
                              uitlijnen="rechts"
                              titel="Verkoopprijs per uur — past het verkoopbedrag en de opslag aan"
                              disabled={vast}
                              opslaan={t => boekingPatch(b, { verkoopTarief: getal(t) })}
                            />
                          ) : (
                            <div className="px-1 text-right text-[13px] text-neutral-400"
                                 title="Een kostenpost telt als één post; het verkoopbedrag ís de prijs">—</div>
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
                      </tr>
                    )
                  })}
                </tbody>
                {code.boekingen.length > 0 && (
                  <tfoot>
                    <tr className="text-[13px] font-semibold text-neutral-900">
                      <th colSpan={4} className={`${voet} text-left`}>Meegerekend</th>
                      <td className={`${voet} text-right tabular-nums`}>{fmt(somKosten)}</td>
                      <td className={voet} colSpan={2} />
                      <td className={`${voet} text-right tabular-nums`}>{fmt(somVerkoop)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* KNOPPEN ERTUSSEN */}
          <div className="flex min-h-0 flex-col items-center justify-center gap-2">
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0"
              disabled={!kanNaarDoel} onClick={verplaatsNaarDoel}
              title={doelUitleg} aria-label={doelUitleg}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0"
              disabled={!kanNieuw} onClick={nieuweRegel}
              title={kanNieuw ? 'Selectie als nieuwe factuurregel' : 'Selecteer eerst boekingen links'}
              aria-label="Selectie als nieuwe factuurregel"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0"
              disabled={!kanLosmaken} onClick={losmaken}
              title={kanLosmaken ? 'Losmaken — volgt weer de indeling' : 'Niets in de selectie is handmatig toegewezen'}
              aria-label="Losmaken"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* RECHTS */}
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className={paneelKop}>
              <span>Op de factuur</span>
              <span className="flex-1" />
              {doelNummer != null && (
                <span className="text-[11.5px] font-normal text-neutral-500">regel {doelNummer} gekozen</span>
              )}
            </div>
            <div className={scrollBak}>
              <table className="w-full min-w-[500px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: 34 }} />
                  <col style={{ width: 30 }} />
                  <col style={{ width: '99%' }} />
                  <col style={{ width: 68 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 116 }} />
                </colgroup>
                <thead>
                  <tr className="text-left">
                    <th className={kop}>Nr</th>
                    <th className={kop} title="Deze regel meenemen">Op</th>
                    <th className={kop}>Omschrijving op de factuur</th>
                    <th className={`${kop} text-right`}>Aantal</th>
                    <th className={`${kop} text-right`}>Bedrag</th>
                    <th className={kop}>Btw</th>
                  </tr>
                </thead>
                <tbody>
                  {code.groepen.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[13px] text-neutral-500">
                        Er staan geen boekingen op de factuur, dus er valt niets te factureren.
                      </td>
                    </tr>
                  )}
                  {code.groepen.map((g: GroepView, i) => {
                    const isDoel = actiefDoel === g.groepSleutel
                    return (
                      <tr
                        key={g.groepSleutel}
                        onClick={() => setDoel(d => d === g.groepSleutel ? null : g.groepSleutel)}
                        className={`cursor-pointer border-b border-neutral-100 align-middle last:border-0 ${
                          isDoel ? 'bg-brand-50 ring-1 ring-inset ring-brand-300' : 'hover:bg-neutral-50'
                        }`}
                        style={{ opacity: g.meefactureren ? 1 : 0.55 }}
                      >
                        <td className="px-1.5 py-2"><Nummer n={i + 1} actief={isDoel} /></td>
                        <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={g.meefactureren}
                            disabled={opslot || bezig}
                            aria-label="Deze regel meenemen op de factuur"
                            title="Deze regel meenemen op de factuur"
                            onCheckedChange={v => groepPatch(g.groepSleutel, { meefactureren: v === true })}
                          />
                        </td>
                        <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                          <BewaarVeld
                            waarde={g.eigenOmschrijving ?? ''}
                            placeholder={g.omschrijving}
                            titel={`${g.aantalBoekingen} boeking${g.aantalBoekingen === 1 ? '' : 'en'}`
                              + `${g.handmatig ? ' · handmatig samengevoegd' : ''}`}
                            disabled={opslot || bezig}
                            opslaan={t => groepPatch(g.groepSleutel, { omschrijving: t })}
                          />
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-2 text-right text-[13px] tabular-nums text-neutral-600">
                          {g.eenheid === 'uur' ? `${fmtAantal(g.aantal)} uur` : '1 post'}
                        </td>
                        <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                          <BewaarVeld
                            waarde={alsTekst(g.bedragOverride)}
                            placeholder={fmtGetal(g.berekend)}
                            uitlijnen="rechts"
                            eenheid="€"
                            eenheidVoor
                            titel={`Vast bedrag; leeg = de optelling van de boekingen (${fmt(g.berekend)})`}
                            disabled={opslot || bezig}
                            opslaan={t => groepPatch(g.groepSleutel, { bedrag_excl_btw: getal(t) })}
                          />
                        </td>
                        <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                          <BtwKeuze
                            waarde={g.btwTariefBouw7Id}
                            tarieven={tarieven}
                            disabled={opslot || bezig}
                            opslaan={v => groepPatch(g.groepSleutel, { btw_tarief_bouw7_id: v })}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {code.groepen.length > 0 && (
                  <tfoot>
                    <tr className="text-[14px] font-semibold text-neutral-900">
                      <th colSpan={3} className={`${voet} text-left`}>Samen excl. btw</th>
                      <td className={voet} />
                      <td className={`${voet} text-right tabular-nums`}>{fmt(code.bedrag)}</td>
                      <td className={voet} />
                    </tr>
                    {uitleg.length > 0 && (
                      <tr>
                        {/* Zonder deze regel staat er een kale € 0,00 naast regels van honderden
                            euro's, en is nergens te zien waarom ze niet meetellen. */}
                        <td colSpan={6}
                            className="sticky bottom-0 z-[1] border-t border-warning-300 bg-warning-50 px-3 py-2 text-[12px] leading-relaxed text-warning-900">
                          {uitleg.join(' · ')}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>

        <DialogFooter split className="shrink-0 border-t border-neutral-200 px-6 py-4">
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2.5 text-[13px] text-neutral-700">
              <Checkbox
                checked={code.meefactureren}
                disabled={opslot || bezig}
                onCheckedChange={v => codePatch({ meefactureren: v === true })}
              />
              <span>Deze post meenemen op de eerstvolgende factuur</span>
            </label>
            {!opslot && (
              <span className="text-[12px] text-neutral-500">
                Klik rijen links aan, kies rechts een factuurregel en gebruik <b>→</b> om ze daarheen te
                zetten. <b>+</b> maakt er een nieuwe regel van, <b>←</b> laat ze de indeling weer volgen.
              </span>
            )}
          </div>
          <Button variant="primary" size="lg" onClick={onSluit} disabled={bezig}>
            {bezig ? 'Bezig…' : 'Klaar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
