'use server'

import { createAdminClient } from '@everts/database/server'
import { getDossierVerkoop, getDossierInkoop } from './actions'
import { getGoedgekeurdMeerwerk } from './meerwerk'
import {
  CONTROLE_TITELS, CONTROLE_TOLERANTIE_EURO, CONTROLE_VOLGORDE, berekenContractTotaal,
  type ControleItem, type ControleSleutel, type ControleUitkomst,
  type FinancieelGereedControle, type RedenOnbekend,
} from './gereed-controle-types'

/**
 * Compleetheidscontrole vóór het financieel gereed melden van een opdracht.
 *
 * Vier controles: is alles gefactureerd, zijn alle inkoopfacturen binnen, zijn de aandachtspunten
 * afgehandeld, en zijn de formulieren ingevuld. De uitkomst blokkeert niets — de dialoog laat de
 * gebruiker doorgaan mits die een opmerking achterlaat. Zie `gereed-controle-types.ts` voor de
 * types en de tolerantie.
 *
 * Splitsing in een snelle en een trage helft is bewust: aandachtspunten en formulieren komen uit
 * twee EVA-queries en staan direct in beeld, terwijl facturatie en inkoop een handvol Bouw7-calls
 * doen en seconden kunnen duren.
 */

/** Maximaal aantal items per controle; daarboven één slotregel. Anders gaat een groot project met
 *  honderden opleverpunten integraal over de draad naar de client. */
const MAX_ITEMS = 12

const euro = (n: number): string =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

/** Kapt de itemlijst af en zet er een telregel onder. */
function kap(items: ControleItem[]): ControleItem[] {
  if (items.length <= MAX_ITEMS) return items
  const rest = items.length - MAX_ITEMS
  return [
    ...items.slice(0, MAX_ITEMS),
    { label: `… en nog ${rest} ${rest === 1 ? 'punt' : 'punten'}`, detail: null, bedrag: null, ernst: 'blokkade', href: null },
  ]
}

function onbekend(sleutel: ControleSleutel, reden: RedenOnbekend, samenvatting: string): ControleUitkomst {
  return { sleutel, titel: CONTROLE_TITELS[sleutel], status: 'onbekend', samenvatting, redenOnbekend: reden, items: [] }
}

function uitkomst(sleutel: ControleSleutel, items: ControleItem[], samenvattingCompleet: string, samenvattingOpen: string): ControleUitkomst {
  const blokkades = items.filter(i => i.ernst === 'blokkade')
  return {
    sleutel,
    titel: CONTROLE_TITELS[sleutel],
    status: blokkades.length > 0 ? 'onvolledig' : 'compleet',
    samenvatting: blokkades.length > 0 ? samenvattingOpen : samenvattingCompleet,
    redenOnbekend: null,
    items: kap(items),
  }
}

/* ── A · Facturatie ───────────────────────────────────────────────── */

/**
 * Is het volledige contracttotaal (aanneemsom + goedgekeurd meerwerk) gefactureerd?
 *
 * Rekent bewust zelf het gefactureerde bedrag uit in plaats van `totalen.gefactureerd` te gebruiken:
 * dat veld is de som van de factuurtotalen (incl. btw) terwijl het contracttotaal excl. btw is, en
 * het valt bij een lege facturenlijst terug op `revenue.realised` (wél excl. btw). Die grootheid
 * wisselt dus van betekenis en is niet vergelijkbaar met het contracttotaal.
 *
 * Naast het bedrag telt de termijnstatus mee: conceptfacturen zitten wél in de facturenlijst maar
 * zijn nooit naar de klant gegaan. Zonder die check zou een dossier met een openstaand concept
 * "volledig gefactureerd" heten.
 */
async function controleerFacturatie(dossierId: string, dossierHref: string): Promise<ControleUitkomst> {
  const [verkoop, meerwerkEva] = await Promise.all([
    getDossierVerkoop(dossierId),
    getGoedgekeurdMeerwerk(dossierId).catch(() => ({ excl: 0, aantal: 0 })),
  ])

  if (verkoop.bron === 'geen_koppeling') {
    return onbekend('facturatie', 'geen_bouw7_koppeling', 'Dit dossier is niet aan Bouw7 gekoppeld')
  }
  if (verkoop.bron === 'fout') {
    return onbekend('facturatie', 'bouw7_onbereikbaar', 'Bouw7 gaf geen antwoord')
  }

  const { contractTotaal } = berekenContractTotaal(
    verkoop.totalen.aanneemsom, verkoop.totalen.meerwerk, meerwerkEva,
  )
  // Let op: `berekenContractTotaal` kiest op het aantal EVA-regels, niet op het bedrag. Bij netto
  // minderwerk is de som negatief, en dat hoort het contracttotaal te verlagen — niet terug te
  // vallen op het Bouw7-aggregaat.
  if (contractTotaal <= 0) {
    return onbekend('facturatie', 'geen_contractwaarde', 'Geen aanneemsom bekend om tegen af te zetten')
  }

  // Creditnota's trekken af. `Math.abs` maakt dit teken-onafhankelijk: of Bouw7 het subtotaal van
  // een creditnota positief of negatief levert, het resultaat is hetzelfde.
  const gefactureerdExcl = verkoop.facturen.reduce(
    (som, f) => som + (f.isCredit ? -Math.abs(f.bedragExcl) : f.bedragExcl), 0,
  )
  const rest = contractTotaal - gefactureerdExcl
  const href = `${dossierHref}/verkoop`
  const items: ControleItem[] = []

  if (rest > CONTROLE_TOLERANTIE_EURO) {
    items.push({
      label: 'Nog niet gefactureerd',
      detail: `Contract ${euro(contractTotaal)} · gefactureerd ${euro(gefactureerdExcl)}`,
      bedrag: rest, ernst: 'blokkade', href,
    })
  } else if (-rest > CONTROLE_TOLERANTIE_EURO) {
    items.push({
      label: 'Meer gefactureerd dan het contracttotaal',
      detail: `Contract ${euro(contractTotaal)} · gefactureerd ${euro(gefactureerdExcl)}`,
      bedrag: -rest, ernst: 'signaal', href,
    })
  }

  for (const t of verkoop.termijnen) {
    if (t.status !== 'nog_te_factureren' && t.status !== 'concept') continue
    items.push({
      label: `Termijn ${t.nummer}${t.omschrijving ? ` — ${t.omschrijving}` : ''}`,
      detail: t.status === 'concept' ? 'Concept, nog niet verzonden' : 'Nog te factureren',
      bedrag: t.bedrag, ernst: 'blokkade', href,
    })
  }

  return uitkomst(
    'facturatie', items,
    `Volledig gefactureerd: ${euro(gefactureerdExcl)} excl. btw`,
    rest > CONTROLE_TOLERANTIE_EURO
      ? `${euro(rest)} nog te factureren`
      : 'Er staan nog termijnen open',
  )
}

/* ── B · Inkoop ───────────────────────────────────────────────────── */

/**
 * Zijn voor alle inkooporders en onderaannemerscontracten de facturen binnen?
 *
 * Vergelijkt op `openstaand` (Bouw7 `outstandingCosts`) en niet op `geboekt`: dat laatste is de som
 * van de facturen die EVA aan de order kon koppelen, en die matching mist facturen zonder leverbon.
 *
 * De twee lopen in de praktijk uiteen: er zijn contracten waar Bouw7 het volledige bedrag als
 * openstaand meldt terwijl er al facturen voor méér dan het contractbedrag aan hangen. Dat blijft
 * hier bewust een blokkade — een controle die ten onrechte "compleet" zegt is waardeloos, terwijl
 * een blokkade die de gebruiker weerlegt hooguit om een toelichting vraagt. De tegenstrijdigheid
 * wordt wél in de regel benoemd, zodat het geen raadsel is.
 *
 * Het signaal `factuur_zonder_bon` komt hier niet terug: dat is een boekingsanomalie, geen
 * ontbrekende factuur.
 */
async function controleerInkoop(dossierId: string, dossierHref: string): Promise<ControleUitkomst> {
  const inkoop = await getDossierInkoop(dossierId)

  if (inkoop.bron === 'geen_koppeling') {
    return onbekend('inkoop', 'geen_bouw7_koppeling', 'Dit dossier is niet aan Bouw7 gekoppeld')
  }
  if (inkoop.bron === 'fout') {
    return onbekend('inkoop', 'bouw7_onbereikbaar', 'Bouw7 gaf geen antwoord')
  }

  const href = `${dossierHref}/inkoop`
  const items: ControleItem[] = []
  // Referenties die al als blokkade in de lijst staan; hun overfacturatie-signaal zou anders een
  // tweede regel over dezelfde order opleveren.
  const alGemeld = new Set<string>()

  const regels = [
    ...inkoop.inkooporders.map(o => ({ ...o, partij: o.leverancier, soort: 'Inkooporder' })),
    ...inkoop.onderaannemers.map(c => ({ ...c, partij: c.onderaannemer, soort: 'Onderaannemerscontract' })),
  ]

  for (const r of regels) {
    if (r.openstaand <= CONTROLE_TOLERANTIE_EURO) continue
    if (r.nummer) alGemeld.add(r.nummer)
    const gedekt = r.geboekt >= r.contractbedrag - CONTROLE_TOLERANTIE_EURO
    items.push({
      label: [r.nummer, r.partij].filter(Boolean).join(' — ') || r.soort,
      // Bouw7-statusnamen zijn vrije tekst; wel tonen zodat de gebruiker een vervallen order
      // herkent, niet op filteren.
      detail: [
        r.omschrijving,
        r.status,
        gedekt ? `let op: er is al ${euro(r.geboekt)} aan facturen gekoppeld` : null,
      ].filter(Boolean).join(' · ') || null,
      bedrag: r.openstaand, ernst: 'blokkade', href,
    })
  }

  for (const s of inkoop.signalen) {
    if (s.soort !== 'overfacturatie') continue
    if (s.referentie && alGemeld.has(s.referentie)) continue
    items.push({
      label: [s.referentie, s.partij].filter(Boolean).join(' — ') || 'Overfacturatie',
      detail: s.toelichting, bedrag: s.bedrag, ernst: 'signaal', href,
    })
  }
  // Blokkades eerst, daarbinnen het grootste bedrag bovenaan; signalen sluiten de rij.
  items.sort((a, b) =>
    a.ernst === b.ernst ? (b.bedrag ?? 0) - (a.bedrag ?? 0) : a.ernst === 'blokkade' ? -1 : 1)

  const aantalOpen = items.filter(i => i.ernst === 'blokkade').length
  const somOpen = items.filter(i => i.ernst === 'blokkade').reduce((s, i) => s + (i.bedrag ?? 0), 0)
  const totaalRegels = inkoop.inkooporders.length + inkoop.onderaannemers.length

  return uitkomst(
    'inkoop', items,
    totaalRegels === 0
      ? 'Geen inkooporders of onderaannemerscontracten op dit project'
      : `Alle ${totaalRegels} orders en contracten zijn volledig gefactureerd`,
    `${aantalOpen} ${aantalOpen === 1 ? 'order/contract' : 'orders/contracten'} zonder factuur (${euro(somOpen)})`,
  )
}

/* ── C · Aandachtspunten ──────────────────────────────────────────── */

/** Statussen die nog werk betekenen. `geaccepteerd` is klaar, `afgewezen` viel af bij de triage. */
const OPEN_PUNT_STATUSSEN = ['open', 'in_behandeling', 'opgelost', 'geweigerd']

/**
 * Zijn alle aandachtspunten uit de oplevering én uit de bewonersfeedback afgehandeld?
 *
 * Bewust een eigen, lichte query in plaats van `getDossierOplevering`: die doet zeven extra queries
 * voor foto's, reacties en namen die hier niets toevoegen.
 *
 * Punten op `nieuw` wachten nog op triage door de projectleider. Ze tellen niet als werk, maar ze
 * zijn ook niet afgehandeld — daarom een eigen regel in de lijst.
 */
async function controleerAandachtspunten(dossierId: string, dossierHref: string): Promise<ControleUitkomst> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: punten, error } = await supabase
    .from('oplever_punten')
    .select('id, volgnummer, omschrijving, status, moment_id, form_inzending_id')
    .eq('dossier_id', dossierId)
    .eq('soort', 'oplever')
    .in('status', [...OPEN_PUNT_STATUSSEN, 'nieuw'])
    .order('volgnummer', { ascending: true })

  if (error) return onbekend('aandachtspunten', 'query_fout', 'De opleverpunten konden niet worden opgehaald')

  const rijen = (punten ?? []) as {
    id: string; volgnummer: number | null; omschrijving: string | null
    status: string; moment_id: string | null; form_inzending_id: string | null
  }[]

  // Herkomst bepalen: een punt uit de bewonersfeedback hangt aan een inzending die via de publieke
  // link is ingediend. `project_ref` is de enige betrouwbare discriminant — `melder_naam is null`
  // komt ook voor bij interne inzendingen zonder indiener.
  const inzendingIds = [...new Set(rijen.map(r => r.form_inzending_id).filter(Boolean))] as string[]
  const feedbackIds = new Set<string>()
  if (inzendingIds.length > 0) {
    const { data: inzendingen } = await supabase
      .from('form_inzendingen')
      .select('id')
      .in('id', inzendingIds)
      .eq('project_ref', 'oplever-feedback')
    for (const i of (inzendingen ?? []) as { id: string }[]) feedbackIds.add(i.id)
  }

  const href = `${dossierHref}/oplevering`
  const items: ControleItem[] = rijen.map(r => {
    const prefix = r.moment_id ? 'OP' : 'AP'
    const nummer = r.volgnummer != null ? `${prefix}-${r.volgnummer}` : prefix
    const herkomst = r.form_inzending_id && feedbackIds.has(r.form_inzending_id)
      ? 'bewonersfeedback'
      : r.moment_id ? 'oplevering' : 'aandachtspunt'
    const statusTekst = r.status === 'nieuw' ? 'wacht op beoordeling' : r.status.replace('_', ' ')
    return {
      label: `${nummer} — ${r.omschrijving?.trim() || 'zonder omschrijving'}`,
      detail: `${herkomst} · ${statusTekst}`,
      bedrag: null,
      ernst: 'blokkade' as const,
      href,
    }
  })

  const aantalTriage = rijen.filter(r => r.status === 'nieuw').length
  const aantalOpen = rijen.length - aantalTriage
  const delen = [
    aantalOpen > 0 ? `${aantalOpen} open` : null,
    aantalTriage > 0 ? `${aantalTriage} wacht op beoordeling` : null,
  ].filter(Boolean)

  return uitkomst(
    'aandachtspunten', items,
    'Alle aandachtspunten zijn afgehandeld',
    delen.join(', '),
  )
}

/* ── D · Formulieren ──────────────────────────────────────────────── */

/**
 * Zijn alle benodigde formulieren ingevuld?
 *
 * EVA kent geen declaratieve lijst van verplichte formulieren per dossier. Wat er wél is: een taak
 * kan een formulier eisen (`tasks.formulier_template_id`) en gaat automatisch op `gereed` zodra dat
 * formulier is ingediend. Een openstaande taak mét formulier is dus een niet-ingevuld formulier.
 *
 * Taken hangen aan een dossier via `dossier_id` (losse taken) óf via een actielijst van het dossier.
 * Alleen op `dossier_id` filteren mist het merendeel van de sjabloontaken — zelfde OR-patroon als
 * `getUrgenteTakenVoorDossier`.
 */
async function controleerFormulieren(dossierId: string, dossierHref: string): Promise<ControleUitkomst> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: lijsten } = await supabase
    .from('task_lists')
    .select('id')
    .eq('dossier_id', dossierId)
    .eq('is_template', false)
  const lijstIds = ((lijsten ?? []) as { id: string }[]).map(l => l.id)

  const orFilters = [`dossier_id.eq.${dossierId}`]
  if (lijstIds.length > 0) orFilters.push(`lijst_id.in.(${lijstIds.join(',')})`)

  const { data: taken, error } = await supabase
    .from('tasks')
    .select('id, titel, deadline, formulier_template_id')
    .or(orFilters.join(','))
    .not('status', 'in', '("gereed","vervallen")')
    .not('formulier_template_id', 'is', null)
    .order('deadline', { ascending: true, nullsFirst: false })

  if (error) return onbekend('formulieren', 'query_fout', 'De taken konden niet worden opgehaald')

  const rijen = (taken ?? []) as {
    id: string; titel: string | null; deadline: string | null; formulier_template_id: string
  }[]

  // Naam van het gevraagde formulier erbij, zodat de regel zonder de taak te openen te plaatsen is.
  const templateIds = [...new Set(rijen.map(r => r.formulier_template_id))]
  const naamPerTemplate = new Map<string, string>()
  if (templateIds.length > 0) {
    const { data: templates } = await supabase
      .from('form_templates')
      .select('id, naam')
      .in('id', templateIds)
    for (const t of (templates ?? []) as { id: string; naam: string }[]) naamPerTemplate.set(t.id, t.naam)
  }

  const href = `${dossierHref}/taken`
  const items: ControleItem[] = rijen.map(r => ({
    label: naamPerTemplate.get(r.formulier_template_id) ?? 'Formulier',
    detail: [r.titel, r.deadline ? `deadline ${r.deadline}` : null].filter(Boolean).join(' · ') || null,
    bedrag: null,
    ernst: 'blokkade' as const,
    href,
  }))

  return uitkomst(
    'formulieren', items,
    'Alle gevraagde formulieren zijn ingediend',
    `${rijen.length} ${rijen.length === 1 ? 'formulier' : 'formulieren'} nog niet ingevuld`,
  )
}

/* ── Samenstellen ─────────────────────────────────────────────────── */

function bundel(dossierId: string, controles: ControleUitkomst[]): FinancieelGereedControle {
  const gesorteerd = CONTROLE_VOLGORDE
    .map(sleutel => controles.find(c => c.sleutel === sleutel))
    .filter((c): c is ControleUitkomst => c != null)
  return {
    dossierId,
    gemetenOp: new Date().toISOString(),
    controles: gesorteerd,
    allesCompleet: gesorteerd.length > 0 && gesorteerd.every(c => c.status === 'compleet'),
    heeftBlokkades: gesorteerd.some(c => c.status === 'onvolledig'),
    heeftOnbekend: gesorteerd.some(c => c.status === 'onbekend'),
  }
}

/**
 * Eén controle die onderuit gaat mag de andere drie niet meeslepen: die zou dan als "compleet"
 * ontbreken in plaats van als "niet te controleren" verschijnen.
 */
async function veilig(
  sleutel: ControleSleutel,
  fn: () => Promise<ControleUitkomst>,
): Promise<ControleUitkomst> {
  try {
    return await fn()
  } catch {
    return onbekend(sleutel, 'query_fout', 'De controle kon niet worden uitgevoerd')
  }
}

/** De twee EVA-controles: aandachtspunten en formulieren. Twee lichte queries, direct beschikbaar. */
export async function getGereedControleSnel(
  dossierId: string,
  dossierHref: string,
): Promise<FinancieelGereedControle> {
  const controles = await Promise.all([
    veilig('aandachtspunten', () => controleerAandachtspunten(dossierId, dossierHref)),
    veilig('formulieren',     () => controleerFormulieren(dossierId, dossierHref)),
  ])
  return bundel(dossierId, controles)
}

/** De twee Bouw7-controles: facturatie en inkoop. Een handvol live calls, duurt seconden. */
export async function getGereedControleBouw7(
  dossierId: string,
  dossierHref: string,
): Promise<FinancieelGereedControle> {
  const controles = await Promise.all([
    veilig('facturatie', () => controleerFacturatie(dossierId, dossierHref)),
    veilig('inkoop',     () => controleerInkoop(dossierId, dossierHref)),
  ])
  return bundel(dossierId, controles)
}

/** Alle vier de controles in één keer. Voor gebruik buiten de dialoog. */
export async function getFinancieelGereedControle(
  dossierId: string,
  dossierHref: string,
): Promise<FinancieelGereedControle> {
  const [snel, traag] = await Promise.all([
    getGereedControleSnel(dossierId, dossierHref),
    getGereedControleBouw7(dossierId, dossierHref),
  ])
  return bundel(dossierId, [...snel.controles, ...traag.controles])
}
