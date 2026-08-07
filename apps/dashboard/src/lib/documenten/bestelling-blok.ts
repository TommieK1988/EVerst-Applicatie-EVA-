/**
 * bestelling-blok.ts
 *
 * De {bestelling.*}- en {leverancier.*}-blokken voor een inkooporder of
 * onderaannemerscontract. Dit is het inkoop-equivalent van `laadOpdrachtBlok()`
 * in `document-context.ts`: een blok dat alleen bij zijn eigen documentsoort
 * gevuld wordt.
 *
 * De regels worden hier RECHTSTREEKS uit Supabase berekend, niet uit de
 * werkbegroting-payload van de client. Reden: het document wordt gerenderd vanaf
 * de server (preview, PDF-route, mail-action) waar die payload er niet is — en
 * een document dat aan de leverancier gaat hoort op de opgeslagen bestelling te
 * slaan, niet op wat er toevallig in het scherm van de opsteller staat.
 *
 * De som spiegelt `bouwBestelregelPlan()` in de werkbegroting-action:
 *   aantal = regel.hoeveelheid × component.norm_hoeveelheid
 *   prijs  = component.tarief            (zonder opslag, net als de EVA-totalen)
 *   bedrag = aantal × prijs
 * Zou dit afwijken, dan staat er een ander bedrag op het papier dan in Bouw7.
 */

import 'server-only'
import { datumNL, datumISO } from './format'

const EUR = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
const GETAL = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const fmtEur = (n: number | null | undefined): string => EUR.format(Number(n) || 0)
const fmtGetal = (n: number | null | undefined): string => GETAL.format(Number(n) || 0)
const rond = (n: number): number => Math.round(n * 100) / 100

export interface BestellingRegel {
  nummer: string
  omschrijving: string
  aantal: string
  eenheid: string
  stukprijs: string
  bedrag: string
  code: string
  /** Ruwe waarde voor eventueel rekenwerk in een sjabloon; Word toont de string. */
  bedrag_getal: number
}

export interface BestellingTermijn {
  nummer: string
  omschrijving: string
  percentage: string
  bedrag: string
}

export interface BestellingBlok {
  heeft: boolean
  /** Contractnummer uit Bouw7 ("20261.00357OA002"); leeg zolang de order daar niet staat. */
  nummer: string
  bonnummer: string
  soort: string
  soort_label: string
  omschrijving: string
  levering: string
  levering_datum: string
  levering_datum_iso: string
  betaalafspraak: string
  interne_notitie: string
  /** Offertenummer van de leverancier ("uw offertekenmerk"), van de eerste regel die er een heeft. */
  offertenummer: string
  aantal_regels: string
  totaal: string
  totaal_getal: number
  regels: BestellingRegel[]
  /** Standaard termijnschema over het ordertotaal; zie TERMIJN_SCHEMA. */
  termijnen: BestellingTermijn[]
  /** True bij een onderaannemerscontract; voor {#bestelling.is_oa}…{/bestelling.is_oa}. */
  is_oa: boolean
  is_inkooporder: boolean
}

export interface LeverancierBlok {
  heeft: boolean
  naam: string
  /** Relatienummer uit Bouw7 — op de opdrachtbon het veld "Bestelling voor". */
  nummer: string
  adres: string
  postcode: string
  plaats: string
  volledig_adres: string
  email: string
  telefoon: string
  website: string
  kvk: string
  btw: string
  contactpersoon: string
  contactpersoon_email: string
  contactpersoon_telefoon: string
}

export const LEEG_BESTELLING_BLOK: BestellingBlok = {
  heeft: false, nummer: '', bonnummer: '', soort: '', soort_label: '', omschrijving: '',
  levering: '', levering_datum: '', levering_datum_iso: '', betaalafspraak: '', interne_notitie: '',
  offertenummer: '', aantal_regels: '0', totaal: fmtEur(0), totaal_getal: 0, regels: [],
  termijnen: [], is_oa: false, is_inkooporder: false,
}

export const LEEG_LEVERANCIER_BLOK: LeverancierBlok = {
  heeft: false, naam: '', nummer: '', adres: '', postcode: '', plaats: '', volledig_adres: '',
  email: '', telefoon: '', website: '', kvk: '', btw: '',
  contactpersoon: '', contactpersoon_email: '', contactpersoon_telefoon: '',
}

/**
 * Het standaard termijnschema uit de Everts-overeenkomst van onderaanneming:
 * 20% bij opdracht, 20% bij start, de rest naar rato, 10% na oplevering.
 *
 * Bewust hier als constante en niet per sjabloon instelbaar: het is één vaste
 * bedrijfsafspraak die op élk onderaannemerscontract hetzelfde is. Verandert die
 * afspraak, dan is dit de enige plek die mee moet.
 */
const TERMIJN_SCHEMA: { omschrijving: string; pct: number }[] = [
  { omschrijving: '1e termijn — bij opdracht', pct: 20 },
  { omschrijving: '2e termijn — bij start', pct: 20 },
  { omschrijving: 'Termijnen naar rato', pct: 50 },
  { omschrijving: 'Oplevertermijn — na oplevering', pct: 10 },
]

/**
 * Zet het ordertotaal om in het termijnschema. De laatste termijn krijgt het
 * restant, zodat de som exact op het totaal uitkomt en er geen afrondingscent
 * blijft hangen.
 */
function bouwTermijnen(totaal: number): BestellingTermijn[] {
  if (!(totaal > 0)) return []
  const uit: BestellingTermijn[] = []
  let verdeeld = 0
  TERMIJN_SCHEMA.forEach((t, i) => {
    const laatste = i === TERMIJN_SCHEMA.length - 1
    const bedrag = laatste ? rond(totaal - verdeeld) : rond((totaal * t.pct) / 100)
    verdeeld = rond(verdeeld + bedrag)
    uit.push({
      nummer: String(i + 1),
      omschrijving: t.omschrijving,
      percentage: `${t.pct}%`,
      bedrag: fmtEur(bedrag),
    })
  })
  return uit
}

const soortLabel = (s: string | null | undefined): string =>
  s === 'oa_contract' ? 'Onderaannemerscontract' : s === 'inkooporder' ? 'Inkooporder' : ''

/**
 * Het Bouw7-contractnummer van een bestelling, voor de bestandsnaam. Leeg zolang
 * de order nog niet in Bouw7 staat.
 */
export async function bestellingOrdernummer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bestellingId: string | null | undefined,
): Promise<string | null> {
  if (!bestellingId) return null
  try {
    const { data } = await supabase
      .from('werkbegroting_bestellingen')
      .select('bouw7_nummer')
      .eq('id', bestellingId)
      .maybeSingle()
    return data?.bouw7_nummer ?? null
  } catch {
    return null
  }
}

/**
 * Hoort deze bestelling bij dit dossier?
 *
 * De bestelling-id komt uit de client (preview-URL, PDF-body). Zonder deze check
 * kan iemand met leesrecht op één dossier de regels en leveranciersprijzen van een
 * ander dossier in een document laten renderen.
 *
 * Het anker is `werkbegrotingen.dossier_id` — dat is wat `syncWerkbegrotingNaarSupabase`
 * altijd vult. `project_id` blijft leeg zodra de calculatie een synthetisch project-id
 * heeft ("wb-direct-…"), en dat is bij verreweg de meeste werkbegrotingen zo; die keten
 * alleen volgen keurde elke inkoop af. Voor oude rijen zonder dossier_id blijft de
 * calc-project-keten (`dossiers.everts_calc_project_id`) als terugval staan.
 */
export async function bestellingHoortBijDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bestellingId: string,
  dossierId: string,
): Promise<boolean> {
  try {
    const { data: bestelling } = await supabase
      .from('werkbegroting_bestellingen')
      .select('werkbegroting_id')
      .eq('id', bestellingId)
      .maybeSingle()
    if (!bestelling?.werkbegroting_id) return false

    const { data: wb } = await supabase
      .from('werkbegrotingen')
      .select('dossier_id, project_id')
      .eq('id', bestelling.werkbegroting_id)
      .maybeSingle()
    if (!wb) return false

    if (wb.dossier_id) return wb.dossier_id === dossierId
    if (!wb.project_id) return false

    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('everts_calc_project_id', wb.project_id)
      .maybeSingle()
    return !!dossier
  } catch {
    return false
  }
}

/**
 * Bouwt beide blokken voor één bestelling. Best-effort: een onvindbare bestelling
 * of een leesfout levert lege blokken op, zodat {#bestelling.heeft} vals blijft en
 * het sjabloon zelf kan bepalen wat het dan toont.
 */
export async function laadBestellingBlokken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bestellingId: string,
): Promise<{ bestelling: BestellingBlok; leverancier: LeverancierBlok }> {
  const leeg = { bestelling: LEEG_BESTELLING_BLOK, leverancier: LEEG_LEVERANCIER_BLOK }
  try {
    const { data: rij } = await supabase
      .from('werkbegroting_bestellingen')
      .select('id, omschrijving, soort, relatie_id, bouw7_nummer, bouw7_bonnummer, levering_datum, levering_tekst, betaalafspraak, interne_notitie')
      .eq('id', bestellingId)
      .maybeSingle()
    if (!rij) return leeg

    const [{ regels, offertenummer }, leverancier] = await Promise.all([
      laadRegels(supabase, bestellingId, rij.omschrijving ?? ''),
      laadLeverancier(supabase, rij.relatie_id),
    ])

    const totaal = rond(regels.reduce((s, r) => s + r.bedrag_getal, 0))

    return {
      bestelling: {
        heeft: true,
        nummer: rij.bouw7_nummer ?? '',
        bonnummer: rij.bouw7_bonnummer ?? '',
        soort: rij.soort ?? '',
        soort_label: soortLabel(rij.soort),
        omschrijving: rij.omschrijving ?? '',
        // Eén veld voor het papier: de vrije tekst ("week 34") wint van de datum,
        // want die is specifieker afgesproken als hij is ingevuld.
        levering: (rij.levering_tekst ?? '').trim() || datumNL(rij.levering_datum),
        levering_datum: datumNL(rij.levering_datum),
        levering_datum_iso: datumISO(rij.levering_datum),
        betaalafspraak: rij.betaalafspraak ?? '',
        interne_notitie: rij.interne_notitie ?? '',
        offertenummer,
        aantal_regels: String(regels.length),
        totaal: fmtEur(totaal),
        totaal_getal: totaal,
        regels,
        termijnen: bouwTermijnen(totaal),
        is_oa: rij.soort === 'oa_contract',
        is_inkooporder: rij.soort === 'inkooporder',
      },
      leverancier,
    }
  } catch (e) {
    console.warn('Bestellingblok laden mislukt:', e)
    return leeg
  }
}

/**
 * De bestelde regels, in de volgorde van de werkbegroting. Componenten die
 * inmiddels zijn verwijderd of geen bedrag hebben, vallen af — die staan ook niet
 * op het Bouw7-contract.
 *
 * Bij een **reservering** (alle componenten `is_reservering`) wordt het één regel met het
 * totaalbedrag, precies zoals `maakBestellingInBouw7` er één contracttermijn van maakt.
 * Een reservering gaat niet als document de deur uit, maar hij wordt wel gearchiveerd en
 * kan als voorbeeld worden bekeken — en dan hoort er hetzelfde te staan als in Bouw7.
 */
async function laadRegels(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bestellingId: string,
  bestellingOmschrijving: string,
): Promise<{ regels: BestellingRegel[]; offertenummer: string }> {
  const { data: junction } = await supabase
    .from('werkbegroting_bestelling_regels')
    .select('component_id')
    .eq('bestelling_id', bestellingId)

  const compIds = ((junction ?? []) as { component_id: string }[]).map(j => j.component_id)
  if (compIds.length === 0) return { regels: [], offertenummer: '' }

  const { data: comps } = await supabase
    .from('werkbegroting_componenten')
    .select('id, werkbegroting_regel_id, omschrijving, norm_hoeveelheid, tarief, eenheid, offertenummer, is_reservering, is_verwijderd')
    .in('id', compIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const levend = ((comps ?? []) as any[]).filter(c => !c.is_verwijderd)
  if (levend.length === 0) return { regels: [], offertenummer: '' }

  const regelIds = [...new Set(levend.map(c => c.werkbegroting_regel_id).filter(Boolean))]
  const { data: wbRegels } = await supabase
    .from('werkbegroting_regels')
    .select('id, omschrijving, hoeveelheid, eenheid, kostengroep, volgorde')
    .in('id', regelIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regelById = new Map(((wbRegels ?? []) as any[]).map(r => [r.id, r]))

  const gesorteerd = [...levend].sort((a, b) => {
    const va = regelById.get(a.werkbegroting_regel_id)?.volgorde ?? 0
    const vb = regelById.get(b.werkbegroting_regel_id)?.volgorde ?? 0
    return va - vb
  })

  const uit: BestellingRegel[] = []
  for (const comp of gesorteerd) {
    const regel = regelById.get(comp.werkbegroting_regel_id)
    const aantal = rond(Number(regel?.hoeveelheid ?? 0) * Number(comp.norm_hoeveelheid ?? 0))
    const prijs = rond(Number(comp.tarief ?? 0))
    const bedrag = rond(aantal * prijs)
    if (bedrag === 0) continue
    uit.push({
      nummer: String(uit.length + 1),
      omschrijving: (comp.omschrijving?.trim() || regel?.omschrijving || '').trim(),
      aantal: fmtGetal(aantal),
      eenheid: String(comp.eenheid || regel?.eenheid || 'st'),
      stukprijs: fmtEur(prijs),
      bedrag: fmtEur(bedrag),
      code: regel?.kostengroep ?? '',
      bedrag_getal: bedrag,
    })
  }

  // "Uw offertekenmerk" op de opdrachtbon: het offertenummer van de leverancier.
  // Staat per component; in de praktijk hoort één order bij één leveranciersofferte,
  // dus de eerste gevulde is de juiste.
  const offertenummer = gesorteerd.find(c => c.offertenummer?.trim())?.offertenummer?.trim() ?? ''

  // Reservering: samenvouwen tot dezelfde ene post die Bouw7 als contracttermijn kreeg.
  if (uit.length > 0 && gesorteerd.every(c => c.is_reservering)) {
    const totaal = rond(uit.reduce((s, r) => s + r.bedrag_getal, 0))
    return {
      regels: [{
        nummer: '1',
        omschrijving: bestellingOmschrijving.trim() || 'Reservering',
        aantal: fmtGetal(1),
        eenheid: 'post',
        stukprijs: fmtEur(totaal),
        bedrag: fmtEur(totaal),
        code: uit[0].code,
        bedrag_getal: totaal,
      }],
      offertenummer,
    }
  }

  return { regels: uit, offertenummer }
}

/** Leverancier/onderaannemer + primaire contactpersoon. */
async function laadLeverancier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  relatieId: string | null,
): Promise<LeverancierBlok> {
  if (!relatieId) return LEEG_LEVERANCIER_BLOK
  const { data: r } = await supabase
    .from('relaties')
    .select('naam, email, telefoon, website, kvk_nummer, btw_nummer, adres_straat, adres_postcode, adres_plaats, bouw7_id')
    .eq('id', relatieId)
    .maybeSingle()
  if (!r) return LEEG_LEVERANCIER_BLOK

  // Primaire contactpersoon, anders de eerste. Best-effort: geen contact → lege velden.
  const { data: contacten } = await supabase
    .from('relatie_contacten')
    .select('naam, email, telefoon, is_primair')
    .eq('relatie_id', relatieId)
    .order('is_primair', { ascending: false })
    .limit(1)
  const contact = (contacten ?? [])[0] ?? null

  return {
    heeft: true,
    naam: r.naam ?? '',
    nummer: r.bouw7_id ?? '',
    adres: r.adres_straat ?? '',
    postcode: r.adres_postcode ?? '',
    plaats: r.adres_plaats ?? '',
    volledig_adres: [r.adres_straat, [r.adres_postcode, r.adres_plaats].filter(Boolean).join(' ')]
      .filter(Boolean).join(', '),
    email: r.email ?? '',
    telefoon: r.telefoon ?? '',
    website: r.website ?? '',
    kvk: r.kvk_nummer ?? '',
    btw: r.btw_nummer ?? '',
    contactpersoon: contact?.naam ?? '',
    contactpersoon_email: contact?.email ?? '',
    contactpersoon_telefoon: contact?.telefoon ?? '',
  }
}
