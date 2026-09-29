'use client'

/**
 * De factuurregels van één bewakingscode samenstellen uit de boekingen die eronder hangen.
 *
 * Twee tabellen naast elkaar: links wát er geboekt is, rechts wát de klant op zijn factuur leest.
 *
 * Links is alleen-lezen, op het vinkje na dat zegt of een boeking óp de factuur komt. De prijs
 * wordt uitsluitend rechts gemaakt, per factuurregel: prijsvelden op twee plekken lieten niet meer
 * zien welk bedrag waar vandaan kwam. Het regelnummer achter elke boeking verbindt de twee.
 *
 * Rechts is per regel alles aan te passen: omschrijving, aantal, eenheid, opslag, prijs per eenheid,
 * totaal en btw. Het totaal is aantal × prijs per eenheid, tenzij je het totaal zelf invult — dan
 * wint dat, en volgt de prijs eruit. Zonder ingevulde prijs komt die uit de boekingen (som ÷
 * geboekt aantal); een opslag invullen zet de prijs op kostprijs + opslag. Een veld leegmaken zet
 * dat stuk terug op de berekening.
 *
 * Een losse regel heeft geen boekingen onder zich en stelt zijn eigen regel samen: zelfde regel,
 * met aantal 1 en prijs 0 als vertrekpunt.
 *
 * Regels selecteren en "Samenvoegen" zet hun boekingen samen op één nieuwe regel; "Splitsen" laat
 * die boekingen de indeling van de post weer volgen.
 *
 * Elke handeling slaat meteen op. Een tabel met een losse Opslaan-knop nodigt uit tot half werk: je
 * vinkt drie regels uit, sluit het venster en weet niet of het is meegegaan.
 *
 * Wat al op een verstuurde factuur staat ligt vast en is hier alleen nog te lezen.
 */

import React, { useEffect, useId, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Lock, Plus, Trash2, Merge, Split } from 'lucide-react'
import {
  Button, Input, Textarea, Checkbox, useDialogen,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui'
import {
  bewaarCodeInstelling, bewaarFactuurGroep, bewaarBoekingen, zetBoekingGroep,
  voegLosseRegelToe, verwijderLosseRegel, maakRegieFactuurInBouw7, voegFactuurRegelsSamen,
  type CodeRegelView, type BoekingView, type GroepView,
} from '@/lib/dossiers/servicedesk'
import {
  GROEPERINGEN, bedragUitOpslag, isHandmatigeGroep, standaardFactuurtekst,
  telbareRegels, type Groepering,
} from '@/lib/dossiers/factuurregel-groepen'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'
import { getLosseRegelKeuzes, type LosseRegelKeuze } from '@/lib/dossiers/factuur-standaardregels'

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

/** Waar deze post vandaan komt, in de regel boven het venster. */
const HERKOMST_LABEL: Record<CodeRegelView['bron'], string> = {
  regie:    'Regiewerk',
  stelpost: 'Stelpost',
  meerwerk: 'Meerwerk (regie)',
}

/**
 * Kieslijst onder "+ Losse regel": eerst de prijsafspraken met de opdrachtgever, dan de
 * bedrijfsbrede standaardregels (Instellingen → Facturatie), onderaan een vrije regel.
 *
 * Bewust inline en niet als popover: een popover portalt naar body, buiten `.eva`, en daar
 * bestaan de kleur-tokens niet.
 */
function LosseRegelKiezer({ dossierId, onKies, onVrij, onSluit }: {
  dossierId: string
  onKies: (k: LosseRegelKeuze) => void
  onVrij: () => void
  onSluit: () => void
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getLosseRegelKeuzes>> | null>(null)
  const [fout, setFout] = useState(false)

  useEffect(() => {
    let weg = false
    getLosseRegelKeuzes(dossierId)
      .then(d => { if (!weg) setData(d) })
      .catch(() => { if (!weg) setFout(true) })
    return () => { weg = true }
  }, [dossierId])

  const groep = (titel: string, items: LosseRegelKeuze[]) => items.length > 0 && (
    <div>
      <div className="px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-500">{titel}</div>
      {items.map(k => (
        <button key={k.sleutel} type="button" onClick={() => onKies(k)}
                className="flex w-full items-baseline gap-3 rounded-md px-3 py-2 text-left text-[13px] text-neutral-800 hover:bg-neutral-100">
          <span className="min-w-0 flex-1 truncate">{k.omschrijving}</span>
          {k.btwLabel && <span className="shrink-0 text-[12px] text-neutral-500">{k.btwLabel}</span>}
          <span className="shrink-0 tabular-nums text-neutral-600">
            {k.prijs != null ? fmt(k.prijs) : '—'}{k.eenheid ? ` / ${k.eenheid}` : ''}
          </span>
        </button>
      ))}
    </div>
  )

  const leeg = data != null && data.afspraken.length === 0 && data.standaard.length === 0

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 p-2" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onSluit() } }}>
      <div className="max-h-[280px] overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1">
        {data == null && !fout && <div className="px-3 py-2 text-[13px] text-neutral-500">Laden…</div>}
        {fout && <div className="px-3 py-2 text-[13px] text-error-700">De kieslijst kon niet worden geladen.</div>}
        {data && groep(data.klantNaam ? `Afspraken met ${data.klantNaam}` : 'Afspraken met de opdrachtgever', data.afspraken)}
        {data && groep('Standaard', data.standaard)}
        {leeg && (
          <div className="px-3 py-2 text-[12px] text-neutral-500">
            Nog geen standaardregels. Leg ze vast onder Instellingen → Facturatie, of als prijsafspraak op de relatie.
          </div>
        )}
        <div className="mt-1 border-t border-neutral-100 pt-1">
          <button type="button" onClick={onVrij}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium text-neutral-800 hover:bg-neutral-100">
            <Plus className="h-3.5 w-3.5" /> Vrije regel…
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FactuurRegelVenster({
  dossierId, code, tarieven, readOnly, onSluit, onBewaard, onGefactureerd,
}: {
  dossierId: string
  code: CodeRegelView | null
  tarieven: BtwTariefKeuze[]
  /** Afgesloten dossier: alles alleen-lezen, net als elders. */
  readOnly?: boolean
  onSluit: () => void
  onBewaard: () => void
  /** Er staat een conceptfactuur in Bouw7: het paneel én de pagina eromheen moeten verversen. */
  onGefactureerd: () => void
}) {
  const veld = useId()
  const { vraagTekst, bevestig } = useDialogen()
  /** Btw voor de hele factuur; een regel mag er via zijn eigen kolom van afwijken. */
  const [factuurTariefId, setFactuurTariefId] = useState<number | null>(null)
  /** Geselecteerde factuurregels rechts, om samen te voegen of te splitsen. */
  const [selectie, setSelectie] = useState<Set<string>>(new Set())
  const [bezig, start] = useTransition()
  const [geopendVoor, setGeopendVoor] = useState<string | null>(null)
  /** De kiezer voor een losse regel (afspraken met de klant, standaardregels, vrije regel). */
  const [kiezerOpen, setKiezerOpen] = useState(false)

  // Standaard 21%, net als voorheen in het nacalculatie-blok. Pas zetten zodra de tarieven er zijn,
  // en daarna een eigen keuze niet meer overschrijven.
  useEffect(() => {
    if (tarieven.length === 0) return
    setFactuurTariefId(vorig => {
      if (vorig != null) return vorig
      const standaard = tarieven.find(t => !t.verlegd && Math.abs(t.percentage - 21) < 0.01) ?? tarieven[0]
      return standaard?.bouw7_id ?? null
    })
  }, [tarieven])

  // Van code wisselen betekent een schone selectie; anders zouden regels van de vorige post
  // meegaan in een samenvoeging.
  if (code && geopendVoor !== code.bewakingscode) {
    setGeopendVoor(code.bewakingscode)
    setSelectie(new Set())
    setKiezerOpen(false)
  }

  if (!code) return null
  // Vaste verwijzing voor de handelingen hieronder: binnen een async-callback ziet TypeScript de
  // controle hierboven niet meer, en `code!` op tien plekken verstopt juist wat hier geborgd is.
  const post = code
  const opslot = code.vergrendeld || !!readOnly

  /** Elke handeling loopt hierlangs: uitvoeren, fout tonen, en anders opnieuw ophalen. */
  function doe(actie: () => Promise<{ ok: true } | { ok: false; error: string }>, daarna?: () => void) {
    start(async () => {
      const r = await actie()
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      daarna?.()
      onBewaard()
    })
  }

  const codePatch = (patch: Parameters<typeof bewaarCodeInstelling>[2]) =>
    doe(() => bewaarCodeInstelling(dossierId, code.bewakingscode, patch))
  const groepPatch = (sleutel: string, patch: Parameters<typeof bewaarFactuurGroep>[3]) =>
    doe(() => bewaarFactuurGroep(dossierId, code.bewakingscode, sleutel, patch))

  // ── Prijsvelden rechts ───────────────────────────────────────────────────
  // Totaal = aantal × prijs, tenzij het totaal hard is ingevuld. Een prijs of opslag invullen
  // betekent "reken het totaal uit", dus die wissen een eerder hard totaal.
  const zetTotaal = (g: GroepView, totaal: number | null) =>
    groepPatch(g.groepSleutel, { bedrag_excl_btw: totaal })
  const zetPrijs = (g: GroepView, prijs: number | null) =>
    groepPatch(g.groepSleutel, { stukprijs: prijs, bedrag_excl_btw: null })
  const zetOpslag = (g: GroepView, pct: number | null) =>
    groepPatch(g.groepSleutel, {
      stukprijs: pct == null ? null
        : Math.round((bedragUitOpslag(g.inkoop, pct) / (g.aantal || 1)) * 100) / 100,
      bedrag_excl_btw: null,
    })

  const nummerVan = new Map(code.groepen.map((g, i) => [g.groepSleutel, i + 1]))

  // Afgeleid en niet blind vertrouwd: groepen ontstaan en verdwijnen bij elke herlading, dus een
  // onthouden sleutel kan zomaar niet meer bestaan.
  const gekozen = code.groepen.filter(g => selectie.has(g.groepSleutel))

  function wissel(sleutel: string) {
    setSelectie(vorig => {
      const nieuw = new Set(vorig)
      if (nieuw.has(sleutel)) nieuw.delete(sleutel); else nieuw.add(sleutel)
      return nieuw
    })
  }

  async function samenvoegen() {
    const ja = await bevestig({
      titel: `${gekozen.length} regels samenvoegen?`,
      omschrijving: `Ze komen als één regel op de factuur, met de tekst van regel ${nummerVan.get(gekozen[0].groepSleutel)}. `
        + 'Die kun je daarna aanpassen; met Splitsen maak je het ongedaan.',
      bevestigLabel: 'Samenvoegen',
    })
    if (!ja) return
    const sleutels = gekozen.map(g => g.groepSleutel)
    start(async () => {
      const r = await voegFactuurRegelsSamen(dossierId, post.bewakingscode, sleutels)
      if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
      setSelectie(new Set([r.groepSleutel]))
      onBewaard()
    })
  }

  function splitsen() {
    const g = gekozen[0]
    const bronnen = post.boekingen
      .filter(b => b.groepSleutel === g.groepSleutel && !b.gefactureerd)
      .map(b => ({ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }))
    doe(() => zetBoekingGroep(dossierId, post.bewakingscode, bronnen, { groepSleutel: null }),
      () => setSelectie(new Set()))
  }

  /** Een regel uit de kieslijst: omschrijving, eenheid, prijs en btw worden gekopieerd. */
  function kiesLosseRegel(k: LosseRegelKeuze) {
    setKiezerOpen(false)
    doe(() => voegLosseRegelToe(dossierId, post.bewakingscode, {
      omschrijving: k.omschrijving,
      bedragExclBtw: k.prijs,
      aantal: 1,
      eenheid: k.eenheid,
      btwTariefBouw7Id: k.btwTariefBouw7Id,
    }))
  }

  /** Een post die nergens geboekt staat: opstartkosten, voorrijkosten, een afgesproken toeslag. */
  async function losseRegel() {
    setKiezerOpen(false)
    const naam = await vraagTekst({
      titel: 'Losse regel toevoegen',
      omschrijving: 'Een regel die niet uit een boeking volgt. Aantal, eenheid en prijs vul je zo in de tabel in.',
      label: 'Omschrijving op de factuur',
      placeholder: 'bijv. Voorrijkosten',
      verplicht: true,
      bevestigLabel: 'Toevoegen',
    })
    if (naam == null) return
    doe(() => voegLosseRegelToe(dossierId, post.bewakingscode, { omschrijving: naam, bedragExclBtw: null }))
  }

  async function verwijderRegel(g: GroepView) {
    const ja = await bevestig({
      titel: `"${g.omschrijving}" verwijderen?`,
      omschrijving: 'De regel verdwijnt van de factuur. Er gaat geen geboekt werk verloren.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (!ja) return
    doe(() => verwijderLosseRegel(dossierId, post.bewakingscode, g.groepSleutel))
  }

  async function anderGroeperen(nieuw: Groepering) {
    const handmatig = post.boekingen.filter(b => b.handmatigToegewezen).length
    if (handmatig > 0) {
      const ja = await bevestig({
        titel: 'Indeling opnieuw laten bepalen?',
        omschrijving: `${handmatig} boeking${handmatig === 1 ? '' : 'en'} ${handmatig === 1 ? 'is' : 'zijn'} `
          + 'handmatig samengevoegd. Die samenvoeging blijft staan en volgt de nieuwe indeling niet.',
        bevestigLabel: 'Doorgaan',
      })
      if (!ja) return
    }
    codePatch({ groepering: nieuw })
  }

  /** Wat er van deze post op de eerstvolgende factuur belandt — dezelfde regel als de server. */
  const teFactureren = telbareRegels(code)
  const teFacturerenTotaal = teFactureren.reduce((som, g) => som + g.bedrag, 0)

  /**
   * Deze post als conceptfactuur klaarzetten in Bouw7.
   *
   * Alleen deze post: je stelt hier de regels samen, dus hier hoort ook de knop die ze afdrukt.
   * De server bouwt het voorstel opnieuw op en factureert wat er dan staat — `teFactureren` is
   * puur wat de knop laat zien, en komt uit dezelfde `telbareRegels` die de server gebruikt.
   */
  async function klaarzetten() {
    if (factuurTariefId == null) return
    const tarief = tarieven.find(t => t.bouw7_id === factuurTariefId)
    const ja = await bevestig({
      titel: 'Conceptfactuur klaarzetten in Bouw7?',
      omschrijving: `${teFactureren.length} factuurregel${teFactureren.length === 1 ? '' : 's'} `
        + `van "${post.omschrijving}", samen ${fmt(teFacturerenTotaal)} excl. btw`
        + `${tarief ? ` (${tarief.label}, tenzij per regel anders)` : ''}. `
        + (post.factuurtekst ? 'Je eigen factuurtekst gaat mee. ' : '')
        + 'De factuur krijgt nog geen factuurnummer; de administratie verstuurt hem in Bouw7.',
      bevestigLabel: 'Klaarzetten',
    })
    if (!ja) return
    start(async () => {
      const r = await maakRegieFactuurInBouw7(dossierId, {
        btwTariefBouw7Id: factuurTariefId,
        bewakingscode: post.bewakingscode,
      })
      if (!r.ok) { toast.error(r.error, { duration: 9000 }); onBewaard(); return }
      toast.success(`Conceptfactuur klaargezet in Bouw7 — ${r.aantal} regels, ${fmt(r.totaal)} excl. btw.`)
      onGefactureerd()
      onSluit()
    })
  }

  // ── Knopstatus ────────────────────────────────────────────────────────────
  const samenvoegbaar = gekozen.filter(g => !g.los && !g.gefactureerd)
  const kanSamenvoegen = !opslot && !bezig && gekozen.length >= 2 && samenvoegbaar.length === gekozen.length
  const kanSplitsen = !opslot && !bezig && gekozen.length === 1 && isHandmatigeGroep(gekozen[0].groepSleutel)
  const samenvoegUitleg = gekozen.length < 2
    ? 'Selecteer eerst twee of meer regels'
    : samenvoegbaar.length !== gekozen.length
      ? 'Een losse regel kan niet worden samengevoegd'
      : `${gekozen.length} regels samenvoegen tot één`
  // Een vergrendelde post, een afgesloten dossier of een post waar niets van meegaat: dan is er
  // niets af te drukken en hoort de knop er ook niet te staan.
  const kanKlaarzetten = !opslot && teFactureren.length > 0

  // ── Totalen ───────────────────────────────────────────────────────────────
  const opFactuur = code.boekingen.filter(b => !b.uitgesloten && !b.gefactureerd)
  const somKosten = opFactuur.reduce((s, b) => s + b.inkoopBedrag, 0)
  const uitRegels = code.groepen.filter(g => !g.meefactureren)
  const uitRegelBedrag = uitRegels.reduce((s, g) => s + g.bedrag, 0)
  const uitBoekingen = code.boekingen.filter(b => b.uitgesloten && !b.gefactureerd)
  const uitBoekingBedrag = uitBoekingen.reduce((s, b) => s + b.verkoopBedrag, 0)
  const zonderBedrag = code.groepen.filter(g => g.los && !g.gefactureerd && g.meefactureren && g.bedrag === 0)
  const uitleg = [
    uitRegels.length > 0
      && `${uitRegels.length} regel${uitRegels.length === 1 ? '' : 's'} staat uit — ${fmt(uitRegelBedrag)} blijft van de factuur af`,
    uitBoekingen.length > 0
      && `${uitBoekingen.length} boeking${uitBoekingen.length === 1 ? '' : 'en'} uitgevinkt — ${fmt(uitBoekingBedrag)}`,
    zonderBedrag.length > 0
      && `${zonderBedrag.length} losse regel${zonderBedrag.length === 1 ? '' : 's'} heeft nog geen bedrag en gaat zo niet mee`,
    !code.meefactureren && 'De hele post staat uit; er komt niets van op de eerstvolgende factuur.',
  ].filter(Boolean) as string[]

  const herkomst = [
    HERKOMST_LABEL[code.bron],
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
          groot met hun eigen scroll. */}
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
          <div className="grid gap-4 sm:grid-cols-[2fr,1.4fr]">
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
          <div>
            <label htmlFor={`${veld}-tekst`} className={labelStijl}>Factuurtekst</label>
            {/* Ongecontroleerd en met een key per post, net als de naam hierboven: opslaan bij
                verlaten, en bij wisselen van post een vers veld in plaats van de vorige tekst. */}
            <Textarea
              key={code.bewakingscode}
              id={`${veld}-tekst`}
              rows={3}
              defaultValue={code.factuurtekst ?? ''}
              placeholder={standaardFactuurtekst(code.omschrijving)}
              disabled={opslot}
              maxLength={4000}
              onBlur={e => {
                if (e.target.value.trim() !== (code.factuurtekst ?? '')) codePatch({ factuurtekst: e.target.value })
              }}
            />
            <p className="mt-1 text-[12px] text-neutral-500">
              Komt als tekst op de factuur in Bouw7. Elke regel wordt een eigen alinea; leeg = de tekst
              hierboven in grijs. Vet of opsommingen kun je daarna in Bouw7 zelf aanbrengen.
            </p>
          </div>
        </div>

        {/* ── Links de boekingen, rechts de factuur ─────────────────────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(340px,1fr)_minmax(0,2.2fr)] gap-4 px-5 py-4">

          {/* LINKS — alleen-lezen, op het vinkje na */}
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className={paneelKop}>
              <span>Geboekte uren en kosten</span>
            </div>
            <div className={scrollBak}>
              <table className="w-full min-w-[340px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: 28 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: '99%' }} />
                  <col style={{ width: 56 }} />
                  {/* Ruim genoeg voor het totaal in de voetregel (€ 2.724,65). */}
                  <col style={{ width: 88 }} />
                  <col style={{ width: 48 }} />
                </colgroup>
                <thead>
                  <tr className="text-left">
                    <th className={kop} title="Staat op de factuur">Op</th>
                    <th className={kop}>Datum</th>
                    <th className={kop}>Geboekt als</th>
                    <th className={`${kop} text-right`}>Aantal</th>
                    <th className={`${kop} text-right`}>Kostprijs</th>
                    <th className={`${kop} text-center`} title="Factuurregel waar deze boeking in valt">Regel</th>
                  </tr>
                </thead>
                <tbody>
                  {code.boekingen.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[13px] text-neutral-500">
                        Er is nog niets op deze bewakingscode geboekt.
                      </td>
                    </tr>
                  )}
                  {code.boekingen.map(b => {
                    const vast = opslot || b.gefactureerd || bezig
                    const regel = !b.uitgesloten && !b.gefactureerd ? nummerVan.get(b.groepSleutel) : undefined
                    const bijSelectie = regel != null && selectie.has(b.groepSleutel)
                    const tekst = tekstVan(b)
                    return (
                      <tr
                        key={b.sleutel}
                        className={`border-b border-neutral-100 align-middle last:border-0 ${bijSelectie ? 'bg-brand-50' : ''}`}
                        style={{ opacity: b.gefactureerd || b.uitgesloten ? 0.5 : 1 }}
                      >
                        <td className="px-1.5 py-2">
                          {b.gefactureerd ? (
                            <Lock className="h-3.5 w-3.5 text-neutral-400" aria-label="Staat op een verstuurde factuur" />
                          ) : (
                            <Checkbox
                              checked={!b.uitgesloten}
                              disabled={vast}
                              aria-label="Deze boeking op de factuur zetten"
                              title="Op de factuur"
                              onCheckedChange={v => doe(() => bewaarBoekingen(dossierId, post.bewakingscode,
                                [{ bronType: b.bronType, bronBouw7Id: b.bronBouw7Id }], { uitgesloten: v !== true }))}
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
                        <td className="px-1.5 py-2 text-right text-[13px] tabular-nums text-neutral-600">
                          {fmt(b.inkoopBedrag)}
                        </td>
                        <td className="px-1.5 py-2">
                          {regel != null && (
                            <div className="flex justify-center"><Nummer n={regel} actief={bijSelectie} /></div>
                          )}
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
                      <td className={voet} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* RECHTS — de factuur */}
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className={paneelKop}>
              <span>Op de factuur</span>
              {gekozen.length > 0 && (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {gekozen.length} geselecteerd
                </span>
              )}
              <span className="flex-1" />
              {!opslot && (
                <>
                  {kanSplitsen ? (
                    <Button variant="outline" size="sm" disabled={bezig} onClick={splitsen}
                            title="De boekingen van deze regel volgen weer de indeling van de post">
                      <Split className="h-3.5 w-3.5" /> Splitsen
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={!kanSamenvoegen} onClick={samenvoegen}
                            title={samenvoegUitleg}>
                      <Merge className="h-3.5 w-3.5" /> Samenvoegen
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={bezig} onClick={() => setKiezerOpen(o => !o)}
                          aria-expanded={kiezerOpen}
                          title="Een regel die niet uit een boeking volgt, zoals voorrijkosten">
                    <Plus className="h-3.5 w-3.5" /> Losse regel
                  </Button>
                </>
              )}
            </div>
            {kiezerOpen && !opslot && (
              <LosseRegelKiezer
                dossierId={dossierId}
                onKies={kiesLosseRegel}
                onVrij={losseRegel}
                onSluit={() => setKiezerOpen(false)}
              />
            )}
            <div className={scrollBak}>
              <table className="w-full min-w-[780px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: 28 }} />
                  <col style={{ width: 30 }} />
                  <col style={{ width: 28 }} />
                  <col style={{ width: '99%' }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 60 }} />
                  {/* Een opslag kan 76,47 zijn; met het %-teken ín het veld is 84px het minimum. */}
                  <col style={{ width: 84 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 104 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 36 }} />
                </colgroup>
                <thead>
                  <tr className="text-left">
                    <th className={kop} title="Selecteren om samen te voegen of te splitsen" />
                    <th className={kop}>Nr</th>
                    <th className={kop} title="Deze regel meenemen">Op</th>
                    <th className={kop}>Omschrijving op de factuur</th>
                    <th className={`${kop} text-right`}>Aantal</th>
                    <th className={kop}>Eenheid</th>
                    <th className={`${kop} text-right`}>Opslag</th>
                    <th className={`${kop} text-right`}>Eh-prijs</th>
                    <th className={`${kop} text-right`}>Totaal</th>
                    <th className={kop}>Btw</th>
                    <th className={kop} />
                  </tr>
                </thead>
                <tbody>
                  {code.groepen.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-[13px] text-neutral-500">
                        Er staat nog niets op de factuur. Vink links boekingen aan, of voeg een losse
                        regel toe.
                      </td>
                    </tr>
                  )}
                  {code.groepen.map((g: GroepView, i) => {
                    const isGekozen = selectie.has(g.groepSleutel)
                    // Een losse regel die al op een factuur staat ligt vast, net als een afgeboekte
                    // boeking links.
                    const regelVast = opslot || bezig || g.gefactureerd
                    // Wat niet zelf is ingevuld staat in grijs: dat is berekend en beweegt mee.
                    const prijsIngevuld = g.stukprijsOverride != null && g.bedragOverride == null
                    return (
                      <tr
                        key={g.groepSleutel}
                        className={`border-b border-neutral-100 align-middle last:border-0 ${
                          isGekozen ? 'bg-brand-50' : ''
                        }`}
                        style={{ opacity: g.meefactureren && !g.gefactureerd ? 1 : 0.55 }}
                      >
                        <td className="px-1.5 py-2">
                          <Checkbox
                            checked={isGekozen}
                            disabled={opslot || g.gefactureerd}
                            aria-label="Regel selecteren"
                            title="Selecteren om samen te voegen of te splitsen"
                            onCheckedChange={() => wissel(g.groepSleutel)}
                          />
                        </td>
                        <td className="px-1.5 py-2"><Nummer n={i + 1} actief={isGekozen} /></td>
                        <td className="px-1.5 py-2">
                          <Checkbox
                            checked={g.meefactureren}
                            disabled={regelVast}
                            aria-label="Deze regel meenemen op de factuur"
                            title="Deze regel meenemen op de factuur"
                            onCheckedChange={v => groepPatch(g.groepSleutel, { meefactureren: v === true })}
                          />
                        </td>
                        <td className="px-1.5 py-2">
                          <BewaarVeld
                            waarde={g.eigenOmschrijving ?? ''}
                            placeholder={g.omschrijving}
                            titel={g.los
                              ? (g.gefactureerd ? 'Losse regel — staat al op een factuur' : 'Losse regel, niet uit een boeking')
                              : `${g.aantalBoekingen} boeking${g.aantalBoekingen === 1 ? '' : 'en'}`
                                + `${g.handmatig ? ' · samengevoegd' : ''}`}
                            disabled={regelVast}
                            opslaan={t => groepPatch(g.groepSleutel, { omschrijving: t })}
                          />
                        </td>
                        <td className="px-1.5 py-2">
                          <BewaarVeld
                            waarde={g.eigenAantal ? alsTekst(g.aantal) : ''}
                            placeholder={fmtAantal(g.aantal)}
                            uitlijnen="rechts"
                            titel={g.los
                              ? 'Aantal op de factuur; totaal = aantal × prijs'
                              : 'Aantal op de factuur; leeg = uit de boekingen. Totaal = aantal × prijs.'}
                            disabled={regelVast}
                            opslaan={t => groepPatch(g.groepSleutel, { aantal: getal(t) })}
                          />
                        </td>
                        <td className="px-1.5 py-2">
                          <BewaarVeld
                            waarde={g.eigenEenheid ? (g.eenheid ?? '') : ''}
                            placeholder={g.eenheid ?? 'post'}
                            titel="Eenheid achter het aantal — post, uur, dag, stuks, m²"
                            disabled={regelVast}
                            opslaan={t => groepPatch(g.groepSleutel, { eenheid: t })}
                          />
                        </td>
                        <td className="px-1.5 py-2">
                          {g.inkoop > 0 ? (
                            <BewaarVeld
                              waarde={prijsIngevuld ? alsTekst(g.opslagPct) : ''}
                              placeholder={g.opslagPct != null ? fmtGetal(g.opslagPct) : ''}
                              uitlijnen="rechts"
                              eenheid="%"
                              titel={`Opslag op de kostprijs (${fmt(g.inkoop)}) — zet de prijs per eenheid`}
                              disabled={regelVast}
                              opslaan={t => zetOpslag(g, getal(t))}
                            />
                          ) : (
                            <div className="px-1 text-right text-[13px] text-neutral-400"
                                 title={g.los ? 'Een losse regel heeft geen kostprijs' : 'Zonder kostprijs valt er geen opslag op te rekenen'}>
                              —
                            </div>
                          )}
                        </td>
                        <td className="px-1.5 py-2">
                          <BewaarVeld
                            waarde={prijsIngevuld ? alsTekst(g.stukprijsOverride) : ''}
                            placeholder={fmtGetal(g.stukprijs)}
                            uitlijnen="rechts"
                            eenheid="€"
                            eenheidVoor
                            titel={g.bedragOverride != null
                              ? `Prijs per ${g.eenheid ?? 'post'} volgt uit het ingevulde totaal; invullen rekent het totaal weer uit`
                              : `Prijs per ${g.eenheid ?? 'post'} — totaal = aantal × deze prijs`}
                            disabled={regelVast}
                            opslaan={t => zetPrijs(g, getal(t))}
                          />
                        </td>
                        <td className="px-1.5 py-2">
                          <BewaarVeld
                            waarde={g.bedragOverride != null ? alsTekst(g.bedragOverride) : ''}
                            placeholder={fmtGetal(g.bedrag)}
                            uitlijnen="rechts"
                            eenheid="€"
                            eenheidVoor
                            titel="Regeltotaal excl. btw; leeg = aantal × prijs. Zelf invullen zet het vast."
                            disabled={regelVast}
                            opslaan={t => zetTotaal(g, getal(t))}
                          />
                        </td>
                        <td className="px-1.5 py-2">
                          <BtwKeuze
                            waarde={g.btwTariefBouw7Id}
                            tarieven={tarieven}
                            disabled={regelVast}
                            opslaan={v => groepPatch(g.groepSleutel, { btw_tarief_bouw7_id: v })}
                          />
                        </td>
                        <td className="px-1.5 py-2">
                          {/* Alleen een losse regel is te verwijderen. Een afgeleide groep wissen
                              heeft geen betekenis: die wordt bij het volgende laden gewoon opnieuw
                              uit de boekingen afgeleid. */}
                          {g.los && !g.gefactureerd && !opslot && (
                            <button
                              type="button" onClick={() => verwijderRegel(g)} disabled={bezig}
                              title="Deze losse regel verwijderen" aria-label="Regel verwijderen"
                              className="grid h-6 w-6 place-items-center rounded text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-700 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {g.gefactureerd && (
                            <Lock className="h-3.5 w-3.5 text-neutral-400" aria-label="Staat op een verstuurde factuur" />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {code.groepen.length > 0 && (
                  <tfoot>
                    <tr className="text-[14px] font-semibold text-neutral-900">
                      <th colSpan={8} className={`${voet} text-left`}>Samen excl. btw</th>
                      <td className={`${voet} text-right tabular-nums`}>{fmt(code.bedrag)}</td>
                      <td className={voet} colSpan={2} />
                    </tr>
                    {uitleg.length > 0 && (
                      <tr>
                        {/* Zonder deze regel staat er een kale € 0,00 naast regels van honderden
                            euro's, en is nergens te zien waarom ze niet meetellen. */}
                        <td colSpan={11}
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
                Vink links aan wat op de factuur komt. Rechts is het totaal aantal × prijs, tenzij je het
                zelf invult; grijs is berekend, leegmaken zet de berekening terug. Selecteer regels om ze samen te voegen.
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {kanKlaarzetten && (
              <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                <span>Btw</span>
                <select
                  value={factuurTariefId ?? ''}
                  onChange={e => setFactuurTariefId(e.target.value ? Number(e.target.value) : null)}
                  disabled={bezig}
                  aria-label="Btw-tarief voor deze factuur"
                  title="Btw voor de hele factuur; een regel met een eigen tarief houdt dat van zichzelf"
                  className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-[12.5px] text-neutral-700 outline-none focus:border-brand-500"
                >
                  {tarieven.map(t => (
                    <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
                  ))}
                </select>
              </label>
            )}
            <Button variant="outline" size="lg" onClick={onSluit} disabled={bezig}>Sluiten</Button>
            {kanKlaarzetten && (
              <Button
                variant="primary" size="lg"
                onClick={klaarzetten}
                disabled={bezig || factuurTariefId == null}
              >
                {bezig ? 'Bezig…' : `Klaarzetten in Bouw7 (${teFactureren.length})`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
