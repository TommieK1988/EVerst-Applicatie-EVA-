/**
 * Types en pure helpers voor de offertebewaking.
 *
 * Bewust géén `'use server'`: hier staan constanten, types en berekeningen die de client mag
 * importeren. Een `'use server'`-module mag alleen async functies exporteren, en `tsc` vangt
 * die fout niet — pas de Next-build valt om. Data en rekenwerk hier, server-actions in
 * `actions.ts`.
 *
 * ── HET ONTWERPPRINCIPE ────────────────────────────────────────────────────────
 * De gebruiker onderhoudt per kans precies één ding: de VOLGENDE STAP. Alles wat een
 * commercieel dashboard normaal als los veld of losse kanban-kolom heeft — "actie nodig",
 * "wachten op klant", "niet opvolgen vóór", "uitgesteld" — is hier een AFLEIDING van die ene
 * stap, berekend door `bewakingsStatus()`. Dat is het verschil tussen een hulpmiddel en een
 * dagtaak: wie een telefoontje afrondt vult één stap in, niet zeven velden.
 *
 * De fase (Verzonden → Nabellen → … → Gewonnen/Verloren) hoort hier nadrukkelijk NIET thuis.
 * Die leeft op `dossiers.offerte_substatus` en is al two-way gekoppeld met het Bouw7-veld
 * "Offerte Sub-status". Een tweede ladder ernaast zou dubbele waarheid creëren.
 */

import { dagenTussenKalender, formatDatumNL } from '@/lib/dossiers/datum-regels'

// ── Model ────────────────────────────────────────────────────────────────────

export type StapSoort = 'actie' | 'wachten'
export type WachtOp = 'klant' | 'intern' | 'extern'
export type BewakingSoort = 'offerte' | 'signaal'

export type BewakingKaart = {
  id: string
  dossier_id: string | null
  soort: BewakingSoort
  titel: string | null

  /** Blijft commercieel verantwoordelijk. Wisselt zelden. */
  eigenaar_id: string | null
  /** Voert de eerstvolgende stap uit. Wisselt voortdurend. */
  actiehouder_id: string | null

  stap_soort: StapSoort | null
  stap_tekst: string | null
  /** Actiedatum, of bij `wachten` de hercontroledatum. YYYY-MM-DD. */
  stap_datum: string | null
  wacht_op: WachtOp | null

  kans_pct: number | null
  /** Maandprecisie: dag is altijd 1. */
  verwachte_opdracht: string | null

  getrieerd_op: string | null
}

/**
 * De negen toestanden waarin een kans kan verkeren. Geen enkele hiervan wordt opgeslagen —
 * ze volgen alle uit de stap, de datum en of het dossier nog loopt.
 */
export type BewakingStatus =
  | 'afgerond'
  | 'ongetrieerd'
  | 'verlopen'
  | 'nu'
  | 'op_schema'
  | 'wacht_klant'
  | 'wacht_intern'
  | 'wacht_extern'
  | 'slapend'

/**
 * Vanaf hoeveel dagen vooruit een wachtende kans "slapend" heet en uit het dagelijkse zicht
 * verdwijnt. Dit is de hele implementatie van "Uitgesteld / later benaderen": een VvE die
 * volgend jaar opnieuw aanbesteedt krijgt een hercontroledatum ver vooruit en komt vanzelf
 * terug zodra die datum nadert. Geen aparte kolom, geen aparte entiteit, geen opschoonactie.
 */
export const SLAPEND_VANAF_DAGEN = 90

// ── De afleiding ─────────────────────────────────────────────────────────────

export type StatusContext = {
  /** Vandaag als YYYY-MM-DD in Nederlandse tijd. */
  vandaag: string
  /**
   * Of het dossier commercieel klaar is. Let op: de DB-trigger `tg_dossier_status_change`
   * promoveert `offerte_substatus = 'gewonnen'` meteen naar `hoofdstatus = 'opdracht'` en zet
   * de substatus op null. Afgerond is dus "hoofdstatus is opdracht" óf "substatus is
   * verloren/vervallen" — nooit "substatus is gewonnen", want die waarde bestaat maar kort.
   */
  afgerond: boolean
}

/**
 * De enige plek waar een bewakingsstatus ontstaat. Gebruikt door de werklijst, de
 * kanban-kaart, de tegels en het dagsignaal, zodat die het nooit oneens kunnen zijn.
 *
 * Volgorde is betekenisvol:
 *  1. afgerond wint altijd — een gewonnen offerte hoeft geen actie meer;
 *  2. geen stap = niets afgesproken, dus "nog niet beoordeeld", ongeacht de rest;
 *  3. datum verstreken is rood, óók voor een wachtende kans: een hercontrole die je laat
 *     lopen is precies hoe een offerte stilletjes verdwijnt;
 *  4. pas daarna telt of wij of de ander aan zet is.
 */
export function bewakingsStatus(
  kaart: Pick<BewakingKaart, 'stap_soort' | 'stap_datum' | 'wacht_op'>,
  ctx: StatusContext,
): BewakingStatus {
  if (ctx.afgerond) return 'afgerond'
  if (!kaart.stap_soort || !kaart.stap_datum) return 'ongetrieerd'

  const dagen = dagenTussenKalender(ctx.vandaag, kaart.stap_datum)
  // Onleesbare datum: behandel als "niets afgesproken" in plaats van stil groen tonen.
  if (dagen == null) return 'ongetrieerd'

  if (dagen < 0) return 'verlopen'
  if (dagen === 0) return 'nu'

  if (kaart.stap_soort === 'actie') return 'op_schema'

  if (dagen > SLAPEND_VANAF_DAGEN) return 'slapend'
  if (kaart.wacht_op === 'intern') return 'wacht_intern'
  if (kaart.wacht_op === 'extern') return 'wacht_extern'
  return 'wacht_klant'
}

// ── Presentatie ──────────────────────────────────────────────────────────────

export type StatusPresentatie = {
  label: string
  /** Korte uitleg voor een tooltip; beantwoordt "waarom staat deze kaart zo?". */
  uitleg: string
  /** Tailwind-klassen voor het bolletje op de kaart. */
  stip: string
  /** Tailwind-klassen voor een badge met tekst. */
  badge: string
  /**
   * Dezelfde kleur als `stip`, maar als CSS-waarde — voor DossierKaart, die met inline styles
   * werkt in plaats van Tailwind-klassen. De `--*-500`-variabelen kantelen mee in donkere
   * modus; de crew-kleuren zijn vaste hex, wat voor een egale stip in beide thema's werkt.
   */
  cssKleur: string
}

export const STATUS_PRESENTATIE: Record<BewakingStatus, StatusPresentatie> = {
  ongetrieerd: {
    label: 'Nog niet beoordeeld',
    uitleg: 'Er is nog geen eigenaar of volgende stap bepaald.',
    stip: 'bg-neutral-300',
    badge: 'bg-neutral-100 text-neutral-700',
    cssKleur: 'var(--neutral-300)',
  },
  verlopen: {
    label: 'Actie verlopen',
    uitleg: 'De afgesproken datum is voorbij.',
    stip: 'bg-error-500',
    badge: 'bg-error-50 text-error-700',
    cssKleur: 'var(--error-500)',
  },
  nu: {
    label: 'Actie nodig',
    uitleg: 'Vandaag aan de beurt.',
    stip: 'bg-info-500',
    badge: 'bg-info-50 text-info-700',
    cssKleur: 'var(--info-500)',
  },
  op_schema: {
    label: 'Op schema',
    uitleg: 'Er staat een actie klaar voor later.',
    stip: 'bg-success-500',
    badge: 'bg-success-50 text-success-700',
    cssKleur: 'var(--success-500)',
  },
  // De drie wacht-statussen delen bewust één badge-kleur. De DS-statusschalen
  // (success/warning/error/info) zijn de enige die via CSS-variabelen meekantelen in donkere
  // modus; een `bg-purple-50`-badge zou daar een lichte vlek blijven. Het onderscheid tussen
  // klant, collega en derde draagt daarom de stip (een egale kleur werkt in beide thema's)
  // plus het label — niet het badge-vlak.
  wacht_klant: {
    label: 'Wachten op klant',
    uitleg: 'De bal ligt bij de klant; hercontrole staat gepland.',
    stip: 'bg-warning-500',
    badge: 'bg-warning-50 text-warning-700',
    cssKleur: 'var(--warning-500)',
  },
  wacht_intern: {
    label: 'Wachten op collega',
    uitleg: 'Een collega moet eerst iets aanleveren.',
    stip: 'bg-crew-1',
    badge: 'bg-warning-50 text-warning-700',
    cssKleur: '#7c3aed',
  },
  wacht_extern: {
    label: 'Wachten op derde',
    uitleg: 'Een leverancier, adviseur of andere partij is aan zet.',
    stip: 'bg-crew-5',
    badge: 'bg-warning-50 text-warning-700',
    cssKleur: '#f59e0b',
  },
  slapend: {
    label: 'Slapend',
    uitleg: 'Uitgesteld werk. Komt vanzelf terug zodra de hercontroledatum nadert.',
    stip: 'bg-neutral-400',
    badge: 'bg-neutral-100 text-neutral-600',
    cssKleur: 'var(--neutral-400)',
  },
  afgerond: {
    label: 'Afgerond',
    uitleg: 'Gewonnen, verloren of vervallen.',
    stip: 'bg-neutral-800',
    badge: 'bg-neutral-100 text-neutral-700',
    cssKleur: 'var(--neutral-800)',
  },
}

/** Statussen die in de dagelijkse werklijst horen; de rest vraagt vandaag geen aandacht. */
export const ACTIEVE_STATUSSEN: BewakingStatus[] = ['verlopen', 'nu', 'ongetrieerd']

/**
 * Één regel die op de kaart vertelt wat er nu speelt — de zin die voorkomt dat een collega
 * moet reconstrueren of hij zelf nog iets moet doen.
 *
 * "Bellen over prijsvraag — 18 september" · "Wachten op klant tot 28 augustus"
 */
export function stapOmschrijving(
  kaart: Pick<BewakingKaart, 'stap_soort' | 'stap_tekst' | 'stap_datum' | 'wacht_op'>,
): string | null {
  if (!kaart.stap_soort || !kaart.stap_datum) return null
  const datum = formatDatumNL(kaart.stap_datum)
  if (kaart.stap_soort === 'wachten') {
    const bij =
      kaart.wacht_op === 'intern' ? 'collega' : kaart.wacht_op === 'extern' ? 'derde partij' : 'klant'
    return `Wachten op ${bij} tot ${datum}${kaart.stap_tekst ? ` — ${kaart.stap_tekst}` : ''}`
  }
  return `${kaart.stap_tekst ?? 'Actie'} — ${datum}`
}

// ── Uitkomsten van een klantcontact ──────────────────────────────────────────

/**
 * De vaste uitkomstknoppen. Dit is het hart van de module: na een telefoontje kiest de
 * gebruiker één uitkomst, en die bepaalt meteen de fase, de volgende stap, de actiehouder en
 * de datum. Zo blijft de keten gesloten zonder dat iemand vrije tekst hoeft te typen.
 *
 * `fase` is een `offerte_substatus`-waarde, of null om de huidige fase te laten staan.
 */
export type UitkomstSleutel =
  | 'geen_gehoor'
  | 'klant_komt_terug'
  | 'ligt_bij_alv'
  | 'vraag_intern'
  | 'offerte_aanpassen'
  | 'waarschijnlijk_opdracht'
  | 'uitgesteld'
  | 'verloren'

export type UitkomstDefinitie = {
  sleutel: UitkomstSleutel
  label: string
  /** Wat er met de kaart gebeurt, in gewone taal — getoond onder de knop. */
  gevolg: string
  fase: string | null
  stapSoort: StapSoort | null
  wachtOp: WachtOp | null
  /** Voorstel voor de staptekst; de gebruiker mag hem aanpassen. */
  stapTekst: string
  /** Voorgestelde werkdagen vooruit. null = de gebruiker moet zelf een datum kiezen. */
  werkdagen: number | null
  /** Vraagt de dialoog om een andere actiehouder? (overdracht) */
  vraagtActiehouder?: boolean
  /** Vraagt de dialoog om een datum die wij niet kunnen raden? */
  vraagtDatum?: boolean
  /** Vraagt de dialoog om een verliesreden? */
  vraagtReden?: boolean
  /** Voorstel voor het kanspercentage. */
  kans?: number
}

export const UITKOMSTEN: UitkomstDefinitie[] = [
  {
    sleutel: 'geen_gehoor',
    label: 'Geen gehoor',
    gevolg: 'Over drie werkdagen opnieuw bellen.',
    fase: null,
    stapSoort: 'actie',
    wachtOp: null,
    stapTekst: 'Opnieuw bellen',
    werkdagen: 3,
  },
  {
    sleutel: 'klant_komt_terug',
    label: 'Klant komt erop terug',
    gevolg: 'De bal ligt bij de klant; over twee weken controleren we het.',
    fase: 'in_behandeling',
    stapSoort: 'wachten',
    wachtOp: 'klant',
    stapTekst: 'Klant zou terugkomen op de offerte',
    werkdagen: 10,
  },
  {
    sleutel: 'ligt_bij_alv',
    label: 'Ligt bij ALV of bestuur',
    gevolg: 'Wachten tot na de vergadering. Vul de vergaderdatum in.',
    fase: 'in_behandeling',
    stapSoort: 'wachten',
    wachtOp: 'klant',
    stapTekst: 'Besluit tijdens ALV/bestuursvergadering',
    werkdagen: null,
    vraagtDatum: true,
  },
  {
    sleutel: 'vraag_intern',
    label: 'Vraag voor collega',
    gevolg: 'De kaart gaat naar een collega; jij blijft eigenaar.',
    fase: 'in_behandeling',
    stapSoort: 'wachten',
    wachtOp: 'intern',
    stapTekst: 'Inhoudelijke vraag uitgezet bij collega',
    werkdagen: 3,
    vraagtActiehouder: true,
  },
  {
    sleutel: 'offerte_aanpassen',
    label: 'Aangepaste offerte nodig',
    gevolg: 'Er moet een nieuwe prijs of scope komen.',
    fase: 'in_behandeling',
    stapSoort: 'actie',
    wachtOp: null,
    stapTekst: 'Aangepaste offerte opstellen',
    werkdagen: 5,
    vraagtActiehouder: true,
  },
  {
    sleutel: 'waarschijnlijk_opdracht',
    label: 'Waarschijnlijk opdracht',
    gevolg: 'Fase naar mondelinge toezegging, kans op 80%.',
    fase: 'mondelinge_toezegging',
    stapSoort: 'actie',
    wachtOp: null,
    stapTekst: 'Opdracht formeel rondmaken',
    werkdagen: 5,
    kans: 80,
  },
  {
    sleutel: 'uitgesteld',
    label: 'Uitgesteld',
    gevolg: 'Verdwijnt uit je dagelijkse lijst en komt terug op de herbenaderdatum.',
    fase: null,
    stapSoort: 'wachten',
    wachtOp: 'klant',
    stapTekst: 'Werk uitgesteld — opnieuw benaderen',
    werkdagen: null,
    vraagtDatum: true,
    kans: 10,
  },
  {
    sleutel: 'verloren',
    label: 'Verloren',
    gevolg: 'De kaart sluit. De reden komt in de verkooprapportage.',
    fase: 'verloren',
    stapSoort: null,
    wachtOp: null,
    stapTekst: '',
    werkdagen: null,
    vraagtReden: true,
  },
]

export const UITKOMST_LABELS: Record<UitkomstSleutel, string> = Object.fromEntries(
  UITKOMSTEN.map(u => [u.sleutel, u.label]),
) as Record<UitkomstSleutel, string>

/**
 * Verliesredenen. Een vaste lijst, want vrije tekst levert twintig varianten van "te duur" op
 * en dan is de rapportage waardeloos. "Anders" dwingt een toelichting af.
 */
export const VERLIES_REDENEN = [
  'Prijs te hoog',
  'Concurrent gekozen',
  'Geen budget',
  'Werk gaat niet door',
  'Planning niet haalbaar',
  'Bestaande relatie met andere partij',
  'Geen reactie meer van klant',
  'Anders',
] as const

export type VerliesReden = (typeof VERLIES_REDENEN)[number]

// ── Werkdagen ────────────────────────────────────────────────────────────────

/**
 * N werkdagen na een datum, als YYYY-MM-DD. Weekenden overslaan want een voorstel om
 * "zaterdag terugbellen" is meteen een reden om het systeem niet te vertrouwen.
 * Feestdagen laten we bewust liggen: de gebruiker mag de datum altijd aanpassen, en een
 * feestdagenkalender onderhouden kost meer dan het hier oplevert.
 */
export function werkdagenVooruit(vanafISO: string, dagen: number): string {
  const [j, m, d] = vanafISO.slice(0, 10).split('-').map(Number)
  const datum = new Date(Date.UTC(j, m - 1, d))
  let over = dagen
  while (over > 0) {
    datum.setUTCDate(datum.getUTCDate() + 1)
    const dag = datum.getUTCDay()
    if (dag !== 0 && dag !== 6) over--
  }
  return datum.toISOString().slice(0, 10)
}
