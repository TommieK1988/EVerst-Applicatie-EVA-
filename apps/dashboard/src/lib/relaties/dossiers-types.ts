/**
 * Vorm van de gekoppelde dossiers van een relatie.
 *
 * Apart van `./dossiers.ts` omdat dát bestand `server-only` is: het blok op de relatiepagina
 * is een client-component en zou de hele leeslaag (en daarmee de service-role-client) de
 * browserbundel in trekken. Hier staan alleen types en labels — geen queries.
 */
import type { DossierFase } from '@/lib/dossiers/fase'

/** In welke hoedanigheid een inkooppartij aan een dossier hangt. */
export type BetrokkenRol = 'inkoopfactuur' | 'bestelling' | 'uitvraag' | 'opleverpunt'

export const BETROKKEN_ROL_LABEL: Record<BetrokkenRol, string> = {
  inkoopfactuur: 'Inkoopfactuur',
  bestelling:    'Besteld',
  uitvraag:      'Uitgevraagd',
  opleverpunt:   'Opleverpunt',
}

export type RelatieDossier = {
  id: string
  dossiernummer: string | null
  titel: string
  fase: DossierFase
  /** Detailroute, servicedesk meegerekend. `null` = geen route waar we zeker van zijn. */
  href: string | null
  adres: string | null
  jaar: number | null
  updated_at: string
  /**
   * Opdrachtgever: gefactureerd excl. btw uit `management_projecten`.
   * Inkooppartij: som van de inkoopfacturen excl. btw, of `null` zonder recht daarop.
   */
  bedrag: number | null
  /** Alleen gevuld bij de inkoopvariant. */
  rollen: BetrokkenRol[]
  /* ── Velden voor het mobiele klantbeeld (lib/commercie/klantbeeld.ts) ──────────────────
     De tabellen op de relatiepagina gebruiken ze niet; ze staan hier omdat ze uit dezelfde
     query komen en een tweede leesronde zouden kosten. */
  /**
   * Datum waarop de offerte is verzonden. Twee rollen in het klantbeeld: hij corrigeert het
   * jaar van de geïmporteerde Gilde-dossiers (zie `jaarVoorKlantbeeld`), en hij draagt het
   * signaal "deze offerte ligt er al lang".
   */
  verzonden_op: string | null
  /** Het vastgoedobject waar dit dossier bij hoort; draagt de groepering per complex. */
  object_id: string | null
  /** Ruwe datumbronnen, zodat het klantbeeld zijn eigen jaarbepaling kan doen. */
  bouw7_aanmaakdatum: string | null
  aanvraagdatum: string | null
  created_at: string
  /**
   * De ruwe statuskolommen, waar `fase` de samenvatting van is.
   *
   * De scoreberekening heeft ze los nodig: `fase` gooit "verloren offerte" en "financieel
   * afgesloten opdracht" allebei op `afgesloten`, en dat is precies het verschil tussen een
   * gewonnen en een verloren traject. Ze komen sowieso al uit de query (`FASE_KOLOMMEN`),
   * dus doorgeven kost niets — ze afleiden uit `fase` zou giswerk zijn.
   */
  hoofdstatus: string
  /**
   * Niet in `FASE_KOLOMMEN`: `bepaalFase` heeft hem niet nodig. Het klantbeeld wel — het is
   * de enige plek waar "afgewezen aanvraag" van "we werken eraan" te onderscheiden valt
   * (`isNietDoorgegaan`).
   */
  aanvraag_substatus: string | null
  offerte_substatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
}

export type RelatieDossierTotalen = {
  aantal: number
  lopend: number
  bedrag: number
  /**
   * Dossiers die gefactureerd hóren te zijn maar nog geen regel in `management_projecten`
   * hebben — die tabel wordt door een eigen sync gevuld en kan achterlopen. Zonder dit getal
   * zou een te laag totaal als volledig lezen. Alleen bij de opdrachtgeverkant.
   */
  zonderFacturatiegegevens: number
}

export type RelatieDossiersData = {
  klant: RelatieDossier[]
  klantTotalen: RelatieDossierTotalen
  betrokken: RelatieDossier[]
  betrokkenTotalen: RelatieDossierTotalen
  /** Zonder recht op inkoopfacturen blijven de bedragen bij de inkoopkant leeg. */
  toontInkoopbedragen: boolean
}

export const LEEG_DOSSIER_TOTAAL: RelatieDossierTotalen = {
  aantal: 0, lopend: 0, bedrag: 0, zonderFacturatiegegevens: 0,
}

export const LEGE_RELATIE_DOSSIERS: RelatieDossiersData = {
  klant: [], klantTotalen: LEEG_DOSSIER_TOTAAL,
  betrokken: [], betrokkenTotalen: LEEG_DOSSIER_TOTAAL,
  toontInkoopbedragen: false,
}
