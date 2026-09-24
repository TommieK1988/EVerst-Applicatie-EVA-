/**
 * Aangenomen meerwerk klaarzetten als conceptfactuur, vanuit het blok "Meerwerk in termijnstaat"
 * op de Verkoop-tab.
 *
 * Dat blok toont EVA-meerwerkregels, geen Bouw7-termijnen. Een regel kan er in Bouw7 op drie
 * manieren voor staan, en klaarzetten moet ze alle drie goed afhandelen:
 *
 *   1. **Gekoppelde termijnen** (`bouw7_term_ids`): EVA heeft ze zelf gezet. De termijn draagt
 *      zijn eigen factuurstatus (`invoiceLine`); die is leidend.
 *   2. **Een termijn die de administratie met de hand maakte.** Bij livegang stonden er ruim honderd
 *      aangenomen regels zonder termijn-id die destijds in Bouw7 zijn afgehandeld. Noemt een termijn
 *      het meerwerknummer (MW03, de Bouw7-code), dan is dát de termijn van deze regel: koppelen, niet
 *      een tweede aanmaken. Anders staat hetzelfde meerwerk twee keer in de staat en wordt het twee
 *      keer gefactureerd.
 *   3. **Nog niets.** Dan eerst de termijn(en) zetten via `zetMeerwerkAlsTermijn` — die volgt de
 *      termijnkeuze van de regel — en daarna klaarzetten.
 *
 * Bovenop de termijnen kijkt de controle ook in de verkoopfacturen van het project: meerwerk dat
 * zonder termijn, als losse regel, is gefactureerd, heeft geen termijn om naar te kijken maar is
 * wel af.
 *
 * Herkenning van een termijn of factuurregel die niet aan de regel gekoppeld is, in volgorde:
 *   a. het meerwerknummer als los woord in de omschrijving ("Meerwerk MW12: …", zoals EVA ze zelf
 *      schrijft);
 *   b. het woord "meerwerk" én precies hetzelfde bedrag. De administratie schreef termijnen als
 *      "Houtrot Peuleyen meerwerk", zonder nummer (gezien sep 2026). Een bedrag alleen is te zwak —
 *      twee meerwerkjes van € 450 zijn geen uitzondering — maar samen met het woord is het
 *      specifiek genoeg, en de fout die het voorkomt (dubbel factureren) is erger dan de fout die
 *      het kan maken (een regel die je in Bouw7 even moet nakijken).
 *   c. dezelfde omschrijving als de meerwerkregel én precies hetzelfde bedrag. Factureert de
 *      administratie meerwerk rechtstreeks vanuit Bouw7, dan kopieert Bouw7 de omschrijving van de
 *      meerwerkregel letterlijk naar de factuurregel ("KAJUIT: Wand sauzen"), zonder nummer, zonder
 *      het woord "meerwerk" en zonder enige koppeling (`reference`, `linkedBookingItems` en
 *      `projectInvoiceTermIds` zijn leeg). Vlietkinderen, sep 2026: dertien zulke facturen werden
 *      als "buiten de termijnen om gefactureerd" gemeld, terwijl het precies MW003–MW020 was.
 * Termijnen die al aan een andere meerwerkregel hangen tellen daarbij niet mee.
 *
 * En dan het geval zonder enig herkenbaar spoor: de administratie factureerde al het meerwerk in
 * één keer, onder een eigen inkoopordernummer van de corporatie ("ION100714516_001 Termijn 001",
 * Complex 1162, sep 2026). Geen nummer, geen woord "meerwerk" — alleen een bedrag dat precies het
 * nettototaal van meerwerk en minderwerk is. Daarom (`bepaalStanden`):
 *   d. factuurregels die bij geen enkele termijn horen tellen op tot het "los gefactureerde" bedrag;
 *      is dat gelijk aan het totaal van het nog ongekoppelde meerwerk, dan is dat meerwerk af;
 *   e. is er wel los gefactureerd maar klopt het niet, dan wordt het meerwerk `twijfel`: je kunt
 *      het kiezen, maar pas na een expliciete bevestiging.
 *
 * De stand wordt live uit Bouw7 gelezen, niet uit de snapshot: het hele punt is dat een regel die
 * al gefactureerd is niet nog eens aangeboden wordt, en een snapshot van vanochtend weet niet wat
 * de administratie vanmiddag heeft verstuurd. Het klaarzetten leest hem vlak vóór de write opnieuw.
 */

import 'server-only'
import type { Bouw7ListResponse, Bouw7ProjectInvoiceTerm, Bouw7SalesInvoice } from '@/lib/bouw7/client'
import { bouw7VoorDossier } from './actions'
import { getDossierMeerwerk, type MeerwerkRegelView } from './meerwerk'
import { termijnBedragen } from './termijnen-schema'

// WAAROM GEEN 'use server': dit leest zonder rechtencheck. De poort zit in meerwerk-facturatie.ts.

/** Eén (bestaande of nog aan te maken) termijn van een meerwerkregel. */
export type MeerwerkTermijnStand = {
  /** Positie in het schema van de regel; de sleutel waarmee de UI een termijn kiest. */
  index: number
  omschrijving: string
  bedragExcl: number
  /** Bouw7-termijn-id; null als de termijn nog aangemaakt moet worden. */
  bouw7TermId: number | null
  /** Staat er in Bouw7 al een factuur(regel) op? Dan is hij niet meer te kiezen. */
  gefactureerd: boolean
}

export type MeerwerkFacturatieStand = {
  regelId: string
  code: string
  /**
   * - `open`: minstens één termijn is nog te factureren
   * - `gefactureerd`: alles staat al op een factuur (via termijn of als losse factuurregel)
   * - `geblokkeerd`: klaarzetten kan niet; `reden` zegt waarom
   * - `twijfel`: te kiezen, maar er is buiten de termijnen om iets gefactureerd dat hier niet
   *   eenduidig aan te koppelen is. De gebruiker moet het in Bouw7 nakijken en expliciet bevestigen.
   */
  stand: 'open' | 'gefactureerd' | 'geblokkeerd' | 'twijfel'
  reden: string | null
  termijnen: MeerwerkTermijnStand[]
}

const rond = (n: number) => Math.round(n * 100) / 100

/**
 * De nummers waaronder dit meerwerk in Bouw7 heet. Het afgeleide MW+volgnummer alleen als er
 * niets anders is: bij geïmporteerde regels wijkt het volgnummer af van het Bouw7-nummer (volgnummer
 * 8 is daar MW009), en "MW04" kan dan precies de bewakingscode van een ánder meerwerk zijn.
 */
function codesVan(r: MeerwerkRegelView): string[] {
  const uit = [r.bouw7_nummer, r.bewakingscode].map(c => c?.trim() ?? '').filter(c => c.length >= 3)
  if (uit.length === 0 && r.volgnummer != null) uit.push(`MW${String(r.volgnummer).padStart(2, '0')}`)
  return [...new Set(uit)]
}

const zelfdeBedrag = (a: unknown, b: number) => Math.round(Number(a ?? 0) * 100) === Math.round(b * 100)
const noemtMeerwerk = (tekst: string | null | undefined) => /meerwerk/i.test(tekst ?? '')
/** Omschrijving zonder opmaak, hoofdletters of dubbele spaties: Bouw7 kan er HTML van maken. */
const kaal = (tekst: string | null | undefined) =>
  (tekst ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
const zelfdeOmschrijving = (tekst: string | null | undefined, r: MeerwerkRegelView) =>
  kaal(tekst) !== '' && kaal(tekst) === kaal(r.omschrijving)

/** Hoort deze omschrijving + dit bedrag bij de regel? Zie de kop van dit bestand (a/b/c). */
function lijktOp(tekst: string | null | undefined, bedrag: unknown, r: MeerwerkRegelView, codes: string[]): boolean {
  return noemtCode(tekst, codes)
    || ((noemtMeerwerk(tekst) || zelfdeOmschrijving(tekst, r)) && zelfdeBedrag(bedrag, r.effectiefExcl))
}

/** Noemt deze tekst een van de codes als los woord? "MW1" mag niet matchen in "MW12". */
function noemtCode(tekst: string | null | undefined, codes: string[]): boolean {
  if (!tekst) return false
  return codes.some(c => new RegExp(`(^|[^A-Za-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(tekst))
}

export type Bouw7Lezing = {
  termijnen: Bouw7ProjectInvoiceTerm[]
  heeftTermijnstaat: boolean
  /** Omschrijving + factuurnummer van elke regel op een (niet-credit) verkoopfactuur. */
  factuurregels: {
    omschrijving: string
    bedrag: number
    factuur: string
    /** Hoort bij geen termijn uit de staat (niet op id en niet op omschrijving). */
    los: boolean
  }[]
}

export async function leesBouw7(dossierId: string): Promise<Bouw7Lezing | { fout: string }> {
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { fout: 'Dit dossier is niet aan een Bouw7-project gekoppeld.' }
  const { client, bouw7Id } = ctx
  try {
    const stmts = await client.get<Bouw7ListResponse<{ id: number }>>(
      '/list/project-invoice-term-statements', { q: `project.id = ${bouw7Id} LIMIT 200` })
    const termijnen: Bouw7ProjectInvoiceTerm[] = []
    for (const s of stmts.items ?? []) {
      const res = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>(
        '/list/project-invoice-terms', { q: `statement.id = ${s.id} LIMIT 500` })
      termijnen.push(...(res.items ?? []))
    }

    // De regels zitten niet op de lijst, alleen op het document. Eén project heeft er hooguit een
    // paar tientallen; begrensd op dit project.
    const facturen = await client.get<Bouw7ListResponse<Bouw7SalesInvoice>>(
      '/list/invoices', { q: `project.id = ${bouw7Id} LIMIT 500` })
    // Een termijnregel herkennen we op het id van de factuurregel én op de omschrijving: een
    // gecrediteerde en opnieuw verstuurde termijn staat twee keer op een factuur, maar de termijn
    // wijst er maar één aan. Die tweede is geen los gefactureerd meerwerk.
    const termijnRegelIds = new Set(termijnen.map(t => t.invoiceLine?.id).filter((v): v is number => v != null))
    const termijnTeksten = new Set(termijnen.map(t => (t.description ?? '').trim()).filter(Boolean))
    const factuurregels: Bouw7Lezing['factuurregels'] = []
    for (const f of (facturen.items ?? []).filter(f => !f.isCredit)) {
      const doc = await client.get<{ chapters?: { lines?: { id?: number | null; description?: string | null; subTotal?: string | number }[] }[] }>(`/invoice/${f.id}`)
      for (const ch of doc.chapters ?? []) {
        for (const l of ch.lines ?? []) {
          const omschrijving = l.description ?? ''
          factuurregels.push({
            omschrijving,
            bedrag: Number(l.subTotal ?? 0),
            factuur: f.invoiceNumber ?? `concept ${f.id}`,
            los: !(l.id != null && termijnRegelIds.has(l.id)) && !termijnTeksten.has(omschrijving.trim()),
          })
        }
      }
    }
    return { termijnen, heeftTermijnstaat: (stmts.items ?? []).length > 0, factuurregels }
  } catch (e) {
    return { fout: `Bouw7 is nu niet te lezen: ${e instanceof Error ? e.message : 'onbekende fout'}.` }
  }
}

/** De stand van één regel, afgeleid uit wat Bouw7 nu zegt. */
export function standVan(
  r: MeerwerkRegelView,
  b: Bouw7Lezing,
  /** Termijn-ids die aan een ándere meerwerkregel van dit dossier hangen. */
  bezet: Set<number>,
): MeerwerkFacturatieStand & { handmatigeTermIds: number[] } {
  const codes = codesVan(r)
  const code = codes[0] ?? '—'
  const perId = new Map(b.termijnen.map(t => [t.id, t]))
  const basis = { regelId: r.id, code, handmatigeTermIds: [] as number[] }

  const gekoppeld = termIdsVan(r)
  const alsStand = (t: Bouw7ProjectInvoiceTerm, index: number): MeerwerkTermijnStand => ({
    index,
    omschrijving: t.description ?? `Termijn ${index + 1}`,
    bedragExcl: rond(Number(t.subtotal ?? 0)),
    bouw7TermId: t.id,
    gefactureerd: t.invoiceLine != null,
  })
  const samenvatten = (termijnen: MeerwerkTermijnStand[], extra: Partial<typeof basis> = {}) => {
    const open = termijnen.some(t => !t.gefactureerd)
    return { ...basis, ...extra, termijnen, stand: open ? 'open' as const : 'gefactureerd' as const, reden: open ? null : 'Staat al op een factuur in Bouw7' }
  }

  // 1. Termijnen die EVA zelf zette.
  if (gekoppeld.length > 0) {
    const live = gekoppeld.map(id => perId.get(id)).filter((t): t is Bouw7ProjectInvoiceTerm => t != null)
    if (live.length > 0) return samenvatten(live.map(alsStand))
    // Gekoppeld maar weg uit Bouw7: niet stil opnieuw aanmaken, dat kan een bewuste keuze zijn.
    return { ...basis, stand: 'geblokkeerd', termijnen: [],
      reden: 'De gekoppelde termijn bestaat niet meer in Bouw7. Controleer de termijnstaat.' }
  }

  // 2. Met de hand gemaakte termijn: eerst op nummer, anders op "meerwerk" + bedrag.
  const vrij = b.termijnen.filter(t => !bezet.has(t.id))
  const opNummer = vrij.filter(t => noemtCode(t.description, codes))
  const handmatig = opNummer.length > 0 ? opNummer : vrij.filter(t => lijktOp(t.description, t.subtotal, r, codes)).slice(0, 1)
  if (handmatig.length > 0) {
    return samenvatten(handmatig.map(alsStand), { handmatigeTermIds: handmatig.map(t => t.id) })
  }

  // Zonder termijn, maar wel als losse regel op een factuur.
  const opFactuur = b.factuurregels.find(l => lijktOp(l.omschrijving, l.bedrag, r, codes))
  if (opFactuur) {
    return { ...basis, stand: 'gefactureerd', termijnen: [],
      reden: `Al gefactureerd zonder termijn (factuur ${opFactuur.factuur})` }
  }

  // 3. Nog niets: de termijnen die `zetMeerwerkAlsTermijn` zou maken, op basis van de termijnkeuze.
  if (!(r.effectiefExcl > 0)) {
    return { ...basis, stand: 'geblokkeerd', termijnen: [],
      reden: r.effectiefExcl < 0 ? 'Minderwerk gaat niet via een termijn' : 'Geen bedrag' }
  }
  if (!b.heeftTermijnstaat) {
    return { ...basis, stand: 'geblokkeerd', termijnen: [],
      reden: 'Dit project heeft nog geen termijnstaat in Bouw7. Zet eerst het termijnschema op.' }
  }
  if (r.in_termijnstaat) {
    return { ...basis, stand: 'geblokkeerd', termijnen: [], reden: 'Zit al in de termijnen van de opdracht verwerkt' }
  }
  const schema = r.termijnVerwerking.soort === 'volgt_offerte' && r.termijnVerwerking.schema.length > 0
    ? r.termijnVerwerking.schema
    : [{ omschrijving: '', percentage: 100 }]
  const bedragen = termijnBedragen(schema.map(s => ({ ...s, btwTariefBouw7Id: null })), r.effectiefExcl)
  return {
    ...basis, stand: 'open', reden: null,
    termijnen: schema.map((s, i) => ({
      index: i,
      omschrijving: s.omschrijving || (schema.length > 1 ? `Termijn ${i + 1} (${s.percentage}%)` : 'Hele bedrag'),
      bedragExcl: bedragen[i],
      bouw7TermId: null,
      gefactureerd: false,
    })),
  }
}

const termIdsVan = (r: MeerwerkRegelView): number[] =>
  (r.bouw7_term_ids?.length ? r.bouw7_term_ids : (r.bouw7_term_id != null ? [r.bouw7_term_id] : [])).map(Number)

/** Termijn-id → de regel die hem draagt. */
export function bezetteTermijnen(regels: MeerwerkRegelView[]): Map<number, string> {
  return new Map(regels.flatMap(r => termIdsVan(r).map(id => [id, r.id] as const)))
}

/** De ids die aan een andere regel dan `r` hangen. */
export function weg(bezet: Map<number, string>, r: MeerwerkRegelView): Set<number> {
  return new Set([...bezet].filter(([, regelId]) => regelId !== r.id).map(([id]) => id))
}

/** Aangenomen, goedgekeurd meerwerk: dezelfde regels als het blok op de Verkoop-tab toont. */
export async function termijnRegels(dossierId: string): Promise<MeerwerkRegelView[]> {
  const meerwerk = await getDossierMeerwerk(dossierId)
  return meerwerk.regels.filter(r => (r.status === 'akkoord' || r.status === 'voltooid') && r.opTermijn)
}

export type RegelStand = MeerwerkFacturatieStand & { handmatigeTermIds: number[] }

/**
 * De stand van alle regels samen. Per regel `standVan`, daarna de controle die alleen over het
 * geheel kan: is er buiten de termijnen om gefactureerd, en dekt dat het ongekoppelde meerwerk?
 * Zie (d) en (e) in de kop van dit bestand.
 */
export function bepaalStanden(regels: MeerwerkRegelView[], b: Bouw7Lezing): RegelStand[] {
  const bezet = bezetteTermijnen(regels)
  const standen = regels.map(r => {
    const st = standVan(r, b, weg(bezet, r))
    // Een met de hand gemaakte termijn kan maar bij één regel horen.
    for (const id of st.handmatigeTermIds) bezet.set(id, r.id)
    return st
  })

  // Losse factuurregels die al aan een specifieke regel zijn toegeschreven (a/b) tellen niet mee.
  const toegeschreven = new Set(regels.flatMap(r => {
    const codes = codesVan(r)
    return b.factuurregels.filter(l => lijktOp(l.omschrijving, l.bedrag, r, codes))
  }))
  const los = b.factuurregels.filter(l => l.los && !toegeschreven.has(l))
  const losTotaal = rond(los.reduce((s, l) => s + l.bedrag, 0))
  if (los.length === 0 || losTotaal === 0) return standen

  // Het meerwerk zonder enig spoor in Bouw7: geen termijn, geen factuurregel. Minderwerk telt mee
  // in het saldo (de administratie factureert het saldo), ook al krijgt het zelf geen termijn.
  const perId = new Map(regels.map(r => [r.id, r]))
  const zonderSpoor = standen.filter(st =>
    st.termijnen.every(t => t.bouw7TermId == null)
    && (st.stand === 'open' || st.reden === 'Minderwerk gaat niet via een termijn'))
  const saldo = rond(zonderSpoor.reduce((s, st) => s + (perId.get(st.regelId)?.effectiefExcl ?? 0), 0))
  const facturen = [...new Set(los.map(l => l.factuur))].join(', ')

  if (zonderSpoor.length > 0 && Math.abs(saldo - losTotaal) < 0.01) {
    for (const st of zonderSpoor) {
      st.stand = 'gefactureerd'
      st.reden = zonderSpoor.length > 1
        ? `Samen met het overige meerwerk gefactureerd zonder termijn (factuur ${facturen})`
        : `Gefactureerd zonder termijn (factuur ${facturen})`
      st.termijnen = []
    }
    return standen
  }
  const bedrag = losTotaal.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
  for (const st of zonderSpoor) {
    if (st.stand !== 'open') continue
    st.stand = 'twijfel'
    st.reden = `Er is ${bedrag} buiten de termijnen om gefactureerd (factuur ${facturen}). `
      + 'Controleer in Bouw7 of dit meerwerk daar al in zit.'
  }
  return standen
}

/** De stand van al het termijn-meerwerk van een dossier, zonder rechtencheck (zie de aanroeper). */
export async function leesMeerwerkFacturatieStand(dossierId: string): Promise<
  { ok: true; regels: MeerwerkFacturatieStand[]; heeftTermijnstaat: boolean } | { ok: false; error: string }
> {
  const regels = await termijnRegels(dossierId)
  if (regels.length === 0) return { ok: true, regels: [], heeftTermijnstaat: false }
  const b = await leesBouw7(dossierId)
  if ('fout' in b) return { ok: false, error: b.fout }
  return {
    ok: true,
    heeftTermijnstaat: b.heeftTermijnstaat,
    regels: bepaalStanden(regels, b).map(({ regelId, code, stand, reden, termijnen }) => ({ regelId, code, stand, reden, termijnen })),
  }
}
