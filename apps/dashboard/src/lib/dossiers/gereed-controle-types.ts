/**
 * Types en pure helpers voor de compleetheidscontrole bij "Financieel gereed melden".
 *
 * Staat bewust náást `gereed-controle.ts` en niet erin: die module is `'use server'` en mag alleen
 * async functies exporteren. De dialoog heeft de types, de tolerantie en de samenvatting client-side
 * nodig. Zelfde splitsing als `oplever-status.ts` naast `oplevering.ts`.
 */

export type ControleSleutel = 'facturatie' | 'inkoop' | 'aandachtspunten' | 'formulieren'

export type ControleStatus = 'compleet' | 'onvolledig' | 'onbekend'

/**
 * Waarom een controle géén uitspraak kan doen. Bewust een eigen status en niet "compleet":
 * een uitgevallen Bouw7 mag nooit als "alles is gefactureerd" doorgaan.
 */
export type RedenOnbekend =
  | 'geen_bouw7_koppeling'
  | 'bouw7_onbereikbaar'
  | 'geen_contractwaarde'
  | 'query_fout'

/** Eén concreet openstaand punt binnen een controle. */
export type ControleItem = {
  /** Eerste regel, bv. "IO001 — Van Dijk Bouwmaterialen". */
  label: string
  /** Tweede regel, bv. "Nog te ontvangen" of "Concept, niet verzonden". */
  detail: string | null
  /** Gevuld als het item een geldbedrag is (excl. btw). */
  bedrag: number | null
  /** Alleen 'blokkade' maakt de controle onvolledig; 'signaal' is informatief. */
  ernst: 'blokkade' | 'signaal'
  /** Deeplink naar de tab waar dit op te lossen is; null = geen link. */
  href: string | null
}

export type ControleUitkomst = {
  sleutel: ControleSleutel
  titel: string
  status: ControleStatus
  /** Eén zin, ook bij 'compleet' ("Volledig gefactureerd: € 128.400,00 excl. btw"). */
  samenvatting: string
  /** Alleen gevuld bij status 'onbekend'. */
  redenOnbekend: RedenOnbekend | null
  items: ControleItem[]
}

export type FinancieelGereedControle = {
  dossierId: string
  /** ISO-tijdstip van meten; de dialoog toont wanneer er gecontroleerd is. */
  gemetenOp: string
  /** Vaste volgorde: facturatie, inkoop, aandachtspunten, formulieren. */
  controles: ControleUitkomst[]
  allesCompleet: boolean
  /** ≥1 controle onvolledig → de opmerking wordt verplicht. */
  heeftBlokkades: boolean
  /** ≥1 controle niet te controleren → geen groen vinkje, wel doorgaan zonder opmerking. */
  heeftOnbekend: boolean
}

/**
 * Verschillen kleiner dan dit gelden als afronding, niet als openstaand bedrag.
 *
 * € 1,00 absoluut, op excl.-btw-bedragen. Dit is dezelfde drempel die `termijnenDekking.volledig`
 * in `getDossierVerkoop` al hanteert; een tweede, afwijkende drempel voor dezelfde soort
 * vergelijking in dezelfde dialoog is een bug-in-wording. Bewust geen percentage: 0,1% van een
 * project van € 500k is € 500 en dat is een vergeten meerwerkregel, geen afronding.
 */
export const CONTROLE_TOLERANTIE_EURO = 1

/** Titels in vaste volgorde, gedeeld door server en dialoog. */
export const CONTROLE_TITELS: Record<ControleSleutel, string> = {
  facturatie:      'Facturatie',
  inkoop:          'Inkoop',
  aandachtspunten: 'Aandachtspunten',
  formulieren:     'Formulieren',
}

export const CONTROLE_VOLGORDE: ControleSleutel[] = [
  'facturatie', 'inkoop', 'aandachtspunten', 'formulieren',
]

/**
 * Contracttotaal van een dossier: aanneemsom + goedgekeurd meerwerk.
 *
 * EVA-native meerwerkregels (status akkoord/voltooid) zijn leidend; alleen als die er niet zijn
 * valt de berekening terug op het Bouw7-aggregaat.
 *
 * De keuze hangt aan het **aantal** regels, niet aan het bedrag: bij netto minderwerk is de som
 * negatief, en dat betekent niet "geen EVA-regels" maar "per saldo minder werk" — dat hoort het
 * contracttotaal te verlagen. Zie `getGoedgekeurdMeerwerk` in `meerwerk.ts`.
 */
export function berekenContractTotaal(
  aanneemsom: number,
  meerwerkBouw7: number,
  meerwerkEva: { excl: number; aantal: number },
): { contractTotaal: number; meerwerk: number } {
  const meerwerk = meerwerkEva.aantal > 0 ? meerwerkEva.excl : meerwerkBouw7
  return { contractTotaal: aanneemsom + meerwerk, meerwerk }
}

/** Telt een uitkomst als openstaand werk? */
export function isBlokkade(u: ControleUitkomst): boolean {
  return u.status === 'onvolledig'
}

/**
 * Compacte samenvatting voor de dossiernotitie bij het gereedmelden. Alleen gebruikt wanneer er
 * daadwerkelijk is doorgezet met openstaande of oncontroleerbare punten — bij een schone controle
 * levert een automatische notitie alleen ruis op.
 */
export function vatControleSamen(c: FinancieelGereedControle): string {
  const regels = c.controles.map(u => {
    if (u.status === 'onbekend') return `${u.titel}: niet te controleren (${u.samenvatting})`
    if (u.status === 'compleet') return `${u.titel}: compleet`
    return `${u.titel}: ${u.samenvatting}`
  })
  return regels.join('\n')
}
