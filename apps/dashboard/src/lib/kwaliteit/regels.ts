/**
 * De rekenkern van de kwaliteitscontrole.
 *
 * Bewust een GEWONE module (geen `'use server'`): het mobiele doorloopscherm moet tijdens het typen
 * meteen groen of rood kunnen tonen, en dat kan niet met logica die in een server-module opgesloten
 * zit. Zelfde reden als `lib/dossiers/oplever-status.ts`.
 *
 * Alle beslissingen staan hier en nergens anders. Wie een grenswaarde-vergelijking in een component
 * schrijft, maakt het rapport en het scherm vroeg of laat oneens met elkaar.
 *
 * De harde regels uit het domein:
 *   1. Een ingevoerde meetwaarde wordt automatisch getoetst.
 *   2. Een niet-uitgevoerde verplichte meting mag nooit als akkoord worden opgeslagen.
 *   3. NIET BEOORDEELD is géén VOLDOET — nergens, ook niet in de tellingen.
 *   4. Een grenswaarde is altijd herleidbaar naar een bron.
 *   5. Een projecteis overschrijft de generieke bibliotheekwaarde.
 */

import type {
  KwaliteitControlepunt,
  KwaliteitEis,
  KwaliteitProjectEis,
  KwaliteitResultaat,
  KwaliteitResultaatStatus,
} from '@everts/database/kwaliteit-types'

// ── Eis bepalen ──────────────────────────────────────────────────────────────

/**
 * De eis die voor dit controlepunt op dit project geldt.
 *
 * De projecteis heeft dezelfde vorm als de bibliotheekeis, dus het overschrijven is een merge en
 * geen if-else per discipline. Alleen ingevulde projectvelden overschrijven; een projecteis die
 * enkel een tekst vastlegt laat de getallen uit de bibliotheek staan.
 */
export function bepaalEis(
  punt: Pick<KwaliteitControlepunt,
    | 'min_waarde' | 'max_waarde' | 'doel_waarde' | 'tolerantie_min' | 'tolerantie_plus'
    | 'eenheid' | 'eis_tekst' | 'bron_type' | 'bron_document' | 'project_eis_sleutel'>,
  projectEisen: Pick<KwaliteitProjectEis,
    | 'sleutel' | 'min_waarde' | 'max_waarde' | 'doel_waarde' | 'tolerantie_min'
    | 'tolerantie_plus' | 'eenheid' | 'eis_tekst' | 'bron_type' | 'bron_document'>[] = [],
): KwaliteitEis {
  const pe = punt.project_eis_sleutel
    ? projectEisen.find(e => e.sleutel === punt.project_eis_sleutel)
    : undefined

  const heeftGetal = (v: number | null | undefined) => v !== null && v !== undefined
  const overschreven = !!pe && (
    heeftGetal(pe.min_waarde) || heeftGetal(pe.max_waarde) || heeftGetal(pe.doel_waarde)
  )

  const eis: KwaliteitEis = {
    min_waarde:      overschreven ? pe!.min_waarde      : punt.min_waarde,
    max_waarde:      overschreven ? pe!.max_waarde      : punt.max_waarde,
    doel_waarde:     overschreven ? pe!.doel_waarde     : punt.doel_waarde,
    tolerantie_min:  overschreven ? pe!.tolerantie_min  : punt.tolerantie_min,
    tolerantie_plus: overschreven ? pe!.tolerantie_plus : punt.tolerantie_plus,
    eenheid:         pe?.eenheid   ?? punt.eenheid,
    eis_tekst:       pe?.eis_tekst ?? punt.eis_tekst,
    bron_type:       overschreven ? pe!.bron_type     : punt.bron_type,
    bron_document:   overschreven ? pe!.bron_document : punt.bron_document,
    uit_projecteis:  overschreven,
    geen_waarde_bekend: false,
  }

  eis.geen_waarde_bekend =
    !heeftGetal(eis.min_waarde) && !heeftGetal(eis.max_waarde) && !heeftGetal(eis.doel_waarde)

  return eis
}

/** Het toegestane bereik als getallenpaar, met de tolerantie al verrekend. */
export function toegestaanBereik(eis: KwaliteitEis): { min: number | null; max: number | null } {
  if (eis.doel_waarde !== null && eis.doel_waarde !== undefined) {
    const min = eis.tolerantie_min !== null && eis.tolerantie_min !== undefined
      ? eis.doel_waarde - eis.tolerantie_min : eis.doel_waarde
    const max = eis.tolerantie_plus !== null && eis.tolerantie_plus !== undefined
      ? eis.doel_waarde + eis.tolerantie_plus : eis.doel_waarde
    return { min, max }
  }
  return { min: eis.min_waarde ?? null, max: eis.max_waarde ?? null }
}

/** "≤ 18,0 %", "2 ± 1 mm", "5 – 30 °C" — de eis zoals hij naast de meetwaarde komt te staan. */
export function eisOmschrijving(eis: KwaliteitEis): string {
  const e = eis.eenheid ? ` ${eenheidLabel(eis.eenheid)}` : ''
  if (eis.doel_waarde !== null && eis.doel_waarde !== undefined) {
    const tMin = eis.tolerantie_min ?? 0
    const tPlus = eis.tolerantie_plus ?? 0
    if (tMin === 0 && tPlus === 0) return `${getal(eis.doel_waarde)}${e}`
    if (tMin === tPlus) return `${getal(eis.doel_waarde)} ± ${getal(tMin)}${e}`
    return `${getal(eis.doel_waarde)} −${getal(tMin)} / +${getal(tPlus)}${e}`
  }
  const heeftMin = eis.min_waarde !== null && eis.min_waarde !== undefined
  const heeftMax = eis.max_waarde !== null && eis.max_waarde !== undefined
  if (heeftMin && heeftMax) return `${getal(eis.min_waarde!)} – ${getal(eis.max_waarde!)}${e}`
  if (heeftMax) return `≤ ${getal(eis.max_waarde!)}${e}`
  if (heeftMin) return `≥ ${getal(eis.min_waarde!)}${e}`
  return 'Geen generieke waarde beschikbaar'
}

/** Eenheden worden in de database ASCII opgeslagen; de weergave mag netjes zijn. */
export function eenheidLabel(eenheid: string): string {
  if (eenheid === 'um') return 'µm'
  if (eenheid === 'C') return '°C'
  if (eenheid === 'dE') return 'ΔE'
  return eenheid
}

function getal(n: number): string {
  // Hele getallen zonder decimalen, de rest met maximaal één — meetwaarden op locatie zijn
  // nooit preciezer dan dat.
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}

export function getalNL(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return getal(n)
}

// ── Beoordelen ───────────────────────────────────────────────────────────────

export type BeoordeelInvoer = {
  /** Door de opzichter gekozen status, of null als hij alleen een waarde heeft ingevuld. */
  status?: KwaliteitResultaatStatus | null
  antwoord?: 'ja' | 'nee' | null
  gemeten_waarde?: number | null
}

export type Beoordeling = {
  status: KwaliteitResultaatStatus
  /** Uitkomst van de rekenregel; null als er niets te rekenen viel. */
  berekend_voldoet: boolean | null
  /** Waarom deze uitkomst — voor de uitleg onder het meetveld. */
  reden: string
  /** true wanneer de status niet mag worden opgeslagen zoals hij is. */
  blokkade: string | null
}

/**
 * De centrale beslisregel. Geeft de status die bij deze invoer hoort.
 *
 * Volgorde is belangrijk: een expliciete keuze van de opzichter voor N.V.T., NIET BEOORDEELD of
 * NADER ONDERZOEK wint altijd van de rekenregel — hij staat er tenslotte bij en de app niet. Alleen
 * VOLDOET en VOLDOET NIET worden afgeleid.
 */
export function beoordeel(
  punt: Pick<KwaliteitControlepunt,
    'binair_voldoet_bij' | 'meting_verplicht' | 'meting_optioneel' | 'inspectie_type'>,
  eis: KwaliteitEis,
  invoer: BeoordeelInvoer,
): Beoordeling {
  const gekozen = invoer.status ?? null

  // 1. Expliciete niet-beoordeel-statussen: overnemen, nooit stilzwijgend naar VOLDOET.
  if (gekozen === 'nvt') {
    return { status: 'nvt', berekend_voldoet: null, reden: 'Niet van toepassing op dit werk.', blokkade: null }
  }
  if (gekozen === 'niet_beoordeeld') {
    return {
      status: 'niet_beoordeeld', berekend_voldoet: null,
      reden: 'Niet beoordeeld. Telt niet als akkoord en komt zo in het rapport.',
      blokkade: null,
    }
  }
  if (gekozen === 'nader_onderzoek') {
    return {
      status: 'nader_onderzoek', berekend_voldoet: null,
      reden: 'Specialistische beoordeling nodig.', blokkade: null,
    }
  }

  const heeftMeting = invoer.gemeten_waarde !== null && invoer.gemeten_waarde !== undefined

  // 2. Meting aanwezig én een grenswaarde bekend → de app rekent, de opzichter niet.
  if (heeftMeting && !eis.geen_waarde_bekend) {
    const { min, max } = toegestaanBereik(eis)
    const waarde = invoer.gemeten_waarde as number
    const teLaag = min !== null && waarde < min
    const teHoog = max !== null && waarde > max
    const voldoet = !teLaag && !teHoog
    return {
      status: voldoet ? 'voldoet' : 'voldoet_niet',
      berekend_voldoet: voldoet,
      reden: voldoet
        ? `Gemeten ${getal(waarde)}${eis.eenheid ? ' ' + eenheidLabel(eis.eenheid) : ''} — binnen ${eisOmschrijving(eis)}.`
        : `Gemeten ${getal(waarde)}${eis.eenheid ? ' ' + eenheidLabel(eis.eenheid) : ''} — buiten ${eisOmschrijving(eis)}.`,
      blokkade: null,
    }
  }

  // 3. Meting aanwezig zonder bekende grenswaarde: de opzichter beoordeelt zelf, maar de waarde
  //    wordt wel vastgelegd. Zonder eigen oordeel is dit geen akkoord.
  if (heeftMeting && eis.geen_waarde_bekend) {
    if (gekozen === 'voldoet' || gekozen === 'voldoet_niet') {
      return {
        status: gekozen,
        berekend_voldoet: null,
        reden: 'Geen grenswaarde bekend; beoordeeld door de inspecteur. Leg de projecteis vast om dit automatisch te laten toetsen.',
        blokkade: null,
      }
    }
    return {
      status: 'niet_beoordeeld', berekend_voldoet: null,
      reden: 'Meetwaarde vastgelegd, maar er is geen grenswaarde bekend. Kies zelf of dit voldoet, of leg de projecteis vast.',
      blokkade: null,
    }
  }

  // 4. Verplichte meting die niet is uitgevoerd mag nooit op VOLDOET.
  if (punt.meting_verplicht && !heeftMeting) {
    return {
      status: 'niet_beoordeeld', berekend_voldoet: null,
      reden: 'Voor dit punt is een meting verplicht.',
      blokkade: gekozen === 'voldoet'
        ? 'Zonder meetwaarde kan dit punt niet op Voldoet.'
        : null,
    }
  }

  // 5. Binaire controle: het controlepunt weet zelf of JA of NEE goed is.
  if (punt.binair_voldoet_bij && invoer.antwoord) {
    const voldoet = invoer.antwoord === punt.binair_voldoet_bij
    return {
      status: voldoet ? 'voldoet' : 'voldoet_niet',
      berekend_voldoet: voldoet,
      reden: voldoet ? 'Antwoord voldoet aan het criterium.' : 'Antwoord wijkt af van het criterium.',
      blokkade: null,
    }
  }

  // 6. Geen berekening mogelijk: de keuze van de opzichter is leidend.
  if (gekozen) {
    return { status: gekozen, berekend_voldoet: null, reden: 'Beoordeeld door de inspecteur.', blokkade: null }
  }

  return {
    status: 'niet_beoordeeld', berekend_voldoet: null,
    reden: 'Nog niet beoordeeld.', blokkade: null,
  }
}

/**
 * Welke statusknoppen dit controlepunt aanbiedt. VOLDOET en VOLDOET NIET staan er altijd; de rest
 * kan per punt worden uitgezet in de bibliotheek.
 */
export function toegestaneStatussen(
  punt: Pick<KwaliteitControlepunt, 'sta_niet_beoordeeld' | 'sta_nvt' | 'sta_nader_onderzoek'>,
): KwaliteitResultaatStatus[] {
  const lijst: KwaliteitResultaatStatus[] = ['voldoet', 'voldoet_niet']
  if (punt.sta_niet_beoordeeld) lijst.push('niet_beoordeeld')
  if (punt.sta_nvt) lijst.push('nvt')
  if (punt.sta_nader_onderzoek) lijst.push('nader_onderzoek')
  return lijst
}

/** Een status die een afwijking in het register oplevert. */
export function levertAfwijkingOp(status: KwaliteitResultaatStatus): boolean {
  return status === 'voldoet_niet' || status === 'nader_onderzoek'
}

/** Verplicht dit controlepunt een foto bij deze status? */
export function fotoVerplicht(
  punt: Pick<KwaliteitControlepunt, 'foto_verplicht_bij_afkeur' | 'foto_altijd_verplicht'>,
  status: KwaliteitResultaatStatus,
): boolean {
  if (punt.foto_altijd_verplicht) return true
  return punt.foto_verplicht_bij_afkeur && levertAfwijkingOp(status)
}

// ── Rapportteksten ───────────────────────────────────────────────────────────

/**
 * De standaardtekst voor het rapport, met de gemeten waarden er al in verwerkt. De inspecteur mag
 * hem overschrijven; dat is precies waarom hij als voorstel wordt aangeboden en niet pas bij het
 * genereren van het rapport wordt bedacht.
 */
export function rapportTekst(
  punt: Pick<KwaliteitControlepunt, 'titel' | 'rapport_tekst_voldoet' | 'rapport_tekst_voldoet_niet'>,
  status: KwaliteitResultaatStatus,
  eis: KwaliteitEis,
  gemetenWaarde?: number | null,
): string {
  const eenheid = eis.eenheid ? eenheidLabel(eis.eenheid) : ''
  const meting = gemetenWaarde !== null && gemetenWaarde !== undefined
    ? `Het gemeten resultaat bedraagt ${getal(gemetenWaarde)}${eenheid ? ' ' + eenheid : ''}. `
      + (eis.geen_waarde_bekend ? '' : `De toegestane waarde is ${eisOmschrijving(eis)}. `)
    : ''

  switch (status) {
    case 'voldoet':
      return meting + (punt.rapport_tekst_voldoet
        ?? `${punt.titel} voldoet aan het gestelde kwaliteitscriterium.`)
    case 'voldoet_niet':
      return meting + (punt.rapport_tekst_voldoet_niet
        ?? `${punt.titel} voldoet niet aan het gestelde kwaliteitscriterium.`)
    case 'nader_onderzoek':
      return meting + `${punt.titel}: specialistische beoordeling noodzakelijk voordat een oordeel kan worden gegeven.`
    case 'niet_beoordeeld':
      return `${punt.titel} is tijdens deze inspectie niet betrouwbaar te beoordelen. Dit onderdeel is niet goedgekeurd.`
    case 'nvt':
      return `${punt.titel} is niet van toepassing op het aangetroffen werk.`
  }
}

// ── Samenvatting ─────────────────────────────────────────────────────────────

export type KwaliteitSamenvatting = {
  beoordeeld: number
  voldoet: number
  voldoet_niet: number
  niet_beoordeeld: number
  nvt: number
  nader_onderzoek: number
  kritiek: number
  technisch: number
  esthetisch: number
  observatie: number
}

/**
 * De tellingen voor het live-overzicht en de afrondpagina.
 *
 * `beoordeeld` telt N.V.T. bewust NIET mee: dat is geen beoordeling maar een constatering dat het
 * punt hier niet speelt. NIET BEOORDEELD telt wél mee als "aangeraakt", maar staat apart — het mag
 * nooit als goedkeuring worden gelezen.
 *
 * Er komt bewust GEEN kwaliteitspercentage uit: een steekproef rechtvaardigt geen "96% kwaliteit".
 */
export function samenvatting(
  resultaten: Pick<KwaliteitResultaat, 'status'>[],
  afwijkingen: { ernst: string }[] = [],
): KwaliteitSamenvatting {
  const tel = (s: KwaliteitResultaatStatus) => resultaten.filter(r => r.status === s).length
  const nvt = tel('nvt')
  return {
    beoordeeld:      resultaten.length - nvt,
    voldoet:         tel('voldoet'),
    voldoet_niet:    tel('voldoet_niet'),
    niet_beoordeeld: tel('niet_beoordeeld'),
    nvt,
    nader_onderzoek: tel('nader_onderzoek'),
    kritiek:    afwijkingen.filter(a => a.ernst === 'kritiek').length,
    technisch:  afwijkingen.filter(a => a.ernst === 'technisch').length,
    esthetisch: afwijkingen.filter(a => a.ernst === 'esthetisch').length,
    observatie: afwijkingen.filter(a => a.ernst === 'observatie').length,
  }
}

/**
 * Signaal bij een opvallend aantal gelijksoortige afwijkingen (§35). Bewust geen harde
 * steekproefpercentages: de inspecteur bepaalt de omvang van zijn ronde.
 */
export function steekproefSignaal(bekeken: number | null, afwijkend: number | null): string | null {
  if (!bekeken || bekeken <= 0 || afwijkend === null || afwijkend === undefined) return null
  const pct = Math.round((afwijkend / bekeken) * 100)
  if (afwijkend >= 3 && pct >= 20) {
    return `${afwijkend} van ${bekeken} bekeken elementen wijkt af (${pct}%). Overweeg de steekproef uit te breiden.`
  }
  return null
}

// ── Hercontrole ──────────────────────────────────────────────────────────────

/**
 * Wat de opzichter tijdens een volgende ronde over een openstaande afwijking kan melden (§38).
 *
 * Staat hier en niet in `afwijkingen.ts`, omdat een `'use server'`-module alleen async functies mag
 * exporteren terwijl de mobiele knoppen deze labels client-side nodig hebben — zelfde reden als
 * `lib/dossiers/oplever-status.ts`.
 */
export type HercontroleUitkomst =
  | 'niet_gecontroleerd'
  | 'nog_open'
  | 'hersteld'
  | 'onvoldoende_hersteld'
  | 'nader_onderzoek'

export const HERCONTROLE_LABELS: Record<HercontroleUitkomst, string> = {
  niet_gecontroleerd:   'Niet gecontroleerd',
  nog_open:             'Nog open',
  hersteld:             'Hersteld',
  onvoldoende_hersteld: 'Onvoldoende hersteld',
  nader_onderzoek:      'Nader onderzoek nodig',
}

/** Bij deze uitkomsten is bewijs van het herstel gewenst; bij een kritieke afwijking verplicht. */
export const HERCONTROLE_VRAAGT_FOTO: HercontroleUitkomst[] = ['hersteld', 'onvoldoende_hersteld']

// ── Weergavekleuren ──────────────────────────────────────────────────────────

/**
 * Statuskleuren als CSS-variabelen uit het bestaande design system, zodat donkere modus en print
 * meekantelen. Groen = voldoet, rood = voldoet niet, oranje = aandacht, grijs = geen oordeel.
 */
export const STATUS_TOON: Record<KwaliteitResultaatStatus, { bg: string; fg: string; rand: string }> = {
  voldoet:         { bg: 'var(--success-50)', fg: 'var(--success-700)', rand: 'var(--success-300)' },
  voldoet_niet:    { bg: 'var(--error-50)',   fg: 'var(--error-700)',   rand: 'var(--error-300)'   },
  nader_onderzoek: { bg: 'var(--warning-50)', fg: 'var(--warning-700)', rand: 'var(--warning-300)' },
  niet_beoordeeld: { bg: 'var(--neutral-100)', fg: 'var(--neutral-700)', rand: 'var(--neutral-300)' },
  nvt:             { bg: 'var(--neutral-100)', fg: 'var(--neutral-600)', rand: 'var(--neutral-300)' },
}

export const ERNST_TOON: Record<string, { bg: string; fg: string }> = {
  kritiek:    { bg: 'var(--error-100)',   fg: 'var(--error-700)'   },
  technisch:  { bg: 'var(--warning-100)', fg: 'var(--warning-700)' },
  esthetisch: { bg: 'var(--info-100)',    fg: 'var(--info-700)'    },
  observatie: { bg: 'var(--neutral-100)', fg: 'var(--neutral-700)' },
}
