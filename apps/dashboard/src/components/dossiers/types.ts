import type {
  Dossier,
  Hoofdstatus,
  AanvraagSubstatus,
  OfferteSubstatus,
  OpdrachtSubstatus,
  ServicedeskSubstatus,
} from '@everts/database'

export type { Dossier, Hoofdstatus, AanvraagSubstatus, OfferteSubstatus, OpdrachtSubstatus, ServicedeskSubstatus }

export type DossierSectie = 'aanvraag' | 'offerte' | 'opdracht' | 'servicedesk'

export type DossierSubstatus = AanvraagSubstatus | OfferteSubstatus | OpdrachtSubstatus | ServicedeskSubstatus

export type StatusDef<K extends string> = { key: K; label: string }

/** Dossier verrijkt met opgeloste namen (via join met relaties + medewerkers + contactpersoon). */
export type DossierRij = Dossier & {
  klant_naam: string | null
  projectleider_naam: string | null
  projectleider_kleur: string | null
  teamleider_naam: string | null
  werkvoorbereider_naam: string | null
  werkvoorbereider_kleur: string | null
  calculator_naam: string | null
  calculator_kleur: string | null
  uitvoerder_naam: string | null
  uitvoerder_kleur: string | null
  controller_naam: string | null
  controller_kleur: string | null
  contactpersoon_naam:     string | null
  contactpersoon_email:    string | null
  contactpersoon_telefoon: string | null
  /** Naam bij het werkadres (DB-kolom bestaat wel, ontbreekt nog in de gegenereerde Dossier-types). */
  werkadres_naam?: string | null
  /** Samengesteld afwijkend factuuradres (label + adres), voor zoeken en de lijstkolom. */
  factuuradres_tekst?: string | null
  /** Bewaking-vlaggen (tijdens Bouw7-sync berekend; nog niet in de gegenereerde Dossier-types). */
  bouw7_bestelregels_afwijking?: boolean | null
  bouw7_uren_overschrijding?:    boolean | null
  /** Werkbegroting is geaccordeerd geweest maar bevat nu niet-geaccordeerde wijzigingen (WB!-badge). */
  wb_ongeaccordeerde_wijzigingen?: boolean | null
  /** Aantal Bouw7-offertes met status "Verstuurd" (sync). >1 → indicator + som op de offerte-kaart. */
  offerte_verstuurd_aantal?: number | null
  /** Som van de subtotalen (excl. btw) van alle offertes met status "Verstuurd". */
  offerte_verstuurd_som_excl_btw?: number | null
  /** Taken-tellers (server-side geteld over losse taken + actielijst-taken; zie verrijkDossiers). */
  taken_open?: number
  taken_totaal?: number
  /* ── Notities (zie verrijkDossiers) ─────────────────────────────────────────
     Voedt de notitie-indicator op de kaart; de nieuwste notitie vult het uitklappaneel. */
  notitie_aantal?: number
  notitie_laatste_inhoud?: string | null
  notitie_laatste_auteur?: string | null
  notitie_laatste_op?: string | null
  /* ── EVA-eigen bedragen (zie lib/dossiers/kaart-bedragen.ts) ────────────────
     `bedrag_excl_btw` / `kostprijs_excl_btw` komen alleen uit de Bouw7-sync. Deze velden vullen aan
     wat in EVA zelf ontstaat, zodat de kaart en de lijst hetzelfde tonen als het Informatie-tab.
     Reken er niet los mee — gebruik `berekenKaartBedrag` uit ./kaart-bedrag. */
  /** Verkoopsom excl. btw uit de EVA-hoofdofferte van de gekoppelde calculatie. */
  eva_offerte_excl_btw?: number | null
  /** Kostprijs excl. btw bij diezelfde EVA-hoofdofferte. */
  eva_kostprijs_excl_btw?: number | null
  /** Som van goedgekeurd meer-/minderwerk excl. btw; negatief bij per saldo minderwerk. */
  meerwerk_goedgekeurd_excl_btw?: number
  /** Stelposten buiten de aanneemsom (apart factureren) — extra omzet. */
  stelposten_apart_excl_btw?: number
  /** Gekozen opties — extra omzet. */
  gekozen_opties_excl_btw?: number
  /* ── Offertebewaking (zie lib/commercie) ───────────────────────────────────
     Alleen gevuld voor dossiers in de offertefase die een bewakingskaart hebben. De kleur op
     de kaart wordt niet opgeslagen maar afgeleid met `bewakingsStatus()` uit lib/commercie. */
  bewaking_stap_soort?: 'actie' | 'wachten' | null
  bewaking_stap_tekst?: string | null
  bewaking_stap_datum?: string | null
  bewaking_wacht_op?: 'klant' | 'intern' | 'extern' | null
  /** Waar de stap vandaan komt: 'actie' = overgenomen uit de actielijst, nog geen commerciële
      afspraak; 'handmatig' = iemand heeft hem zelf vastgelegd. */
  bewaking_stap_bron?: 'handmatig' | 'actie' | null
  /** Naam van wie nu aan zet is — voorkomt dat twee collega's dezelfde klant nabellen. */
  bewaking_actiehouder?: string | null
  /** Id van de actiehouder; draagt het "alleen van mij"-filter op de werklijst. */
  bewaking_actiehouder_id?: string | null
  /** Id van de commercieel eigenaar. */
  bewaking_eigenaar_id?: string | null
  /** True zodra er een bewakingskaart bestaat; onderscheidt "niets afgesproken" van "geen kaart". */
  bewaking_actief?: boolean
  /** "Intern"-toggle (sleutel 'intern') aan → dossier wordt verborgen op de borden/lijsten. */
  intern: boolean
}

/** Geeft de actieve substatus terug voor een dossier, ongeacht de fase. */
export function getDossierSubstatus(dossier: Dossier): DossierSubstatus {
  if (dossier.hoofdstatus === 'aanvraag') return dossier.aanvraag_substatus!
  if (dossier.hoofdstatus === 'offerte')  return dossier.offerte_substatus!
  return dossier.opdracht_substatus!
}

/**
 * True als een dossier definitief is afgesloten en daarmee overal **alleen-lezen**:
 * Afgewezen/Vervallen (aanvraag), Verloren/Vervallen (offerte), Financieel afgesloten
 * (opdracht), of een Bouw7-projectstatus in de 07-reeks (afgesloten projecten).
 * Structureel getypeerd zodat zowel een volledige `DossierRij` als een kale status-select
 * (zie `lib/dossiers/guards.ts`) hierin passen.
 */
export function isDossierAfgesloten(dossier: {
  hoofdstatus?: Hoofdstatus | null
  aanvraag_substatus?: AanvraagSubstatus | null
  offerte_substatus?: OfferteSubstatus | null
  opdracht_substatus?: OpdrachtSubstatus | null
  bouw7_projectstatus_naam?: string | null
}): boolean {
  const b7 = dossier.bouw7_projectstatus_naam?.trim()
  if (b7 && b7.startsWith('07')) return true
  switch (dossier.hoofdstatus) {
    case 'aanvraag': return dossier.aanvraag_substatus === 'afgewezen' || dossier.aanvraag_substatus === 'vervallen'
    case 'offerte':  return dossier.offerte_substatus === 'verloren'  || dossier.offerte_substatus === 'vervallen'
    case 'opdracht': return dossier.opdracht_substatus === 'financieel_afgesloten'
    default:         return false
  }
}

/**
 * True als een dossier tot de servicedesk hoort. Zelfde afbakening als de servicedesk-query
 * in `lib/dossiers/actions.ts` en de sectie-bepaling in de Bouw7-sync: Bouw7-projectstatus
 * "LB.*" of Bouw7-categorie "Dagelijks onderhoud"/"Mutatie".
 */
export function isServicedeskDossier(dossier: {
  bouw7_projectstatus_naam?: string | null
  bouw7_categorie_naam?: string | null
}): boolean {
  if ((dossier.bouw7_projectstatus_naam ?? '').trim().toUpperCase().startsWith('LB.')) return true
  const categorie = dossier.bouw7_categorie_naam?.trim()
  return categorie === 'Dagelijks onderhoud' || categorie === 'Mutatie'
}

export const AANVRAAG_STATUSSEN: StatusDef<AanvraagSubstatus>[] = [
  { key: 'nieuw',               label: 'Nieuw'               },
  { key: 'inlezen_aanvraag',    label: 'Inlezen aanvraag'    },
  { key: 'werkopname',          label: 'Werkopname'          },
  { key: 'uitwerken_begroting', label: 'Uitwerken begroting' },
  { key: 'controle_begroting',  label: 'Controle begroting'  },
  { key: 'offerte_gereed',      label: 'Offerte gereed'      },
  { key: 'verzonden',           label: 'Verzonden'           },
  { key: 'afgewezen',           label: 'Afgewezen'           },
  { key: 'vervallen',           label: 'Vervallen'           },
]

/**
 * De offertefase. Let op het verschil tussen sleutel en label: `nabellen` heet op het scherm
 * **Actie** (wij zijn aan zet) en `in_behandeling` heet **Wachten** (de bal ligt bij de klant).
 * Het bedrijf denkt in die twee woorden; "nabellen" bleek te smal (er wordt ook gemaild en
 * langsgegaan) en "in behandeling" zei niet bij wie het lag.
 *
 * De sleutels blijven ongewijzigd — ze staan in de database, in `dossier_status_historie`, in
 * actielijst-triggers en in de Bouw7-ladder ("08. Nabellen", "09. In behandeling", zie
 * `lib/bouw7/substatus-map.ts`). Hernoemen daarvan zou de two-way koppeling breken voor één woord.
 */
export const OFFERTE_STATUSSEN: StatusDef<OfferteSubstatus>[] = [
  { key: 'verzonden',             label: 'Verzonden'             },
  { key: 'nabellen',              label: 'Actie'                 },
  { key: 'in_behandeling',        label: 'Wachten'               },
  { key: 'mondelinge_toezegging', label: 'Mondelinge toezegging' },
  { key: 'gewonnen',              label: 'Gewonnen'              },
  { key: 'verloren',              label: 'Verloren'              },
  { key: 'vervallen',             label: 'Vervallen'             },
]

export const OPDRACHT_STATUSSEN: StatusDef<OpdrachtSubstatus>[] = [
  { key: 'nieuwe_opdracht',       label: 'Nieuwe opdracht'       },
  { key: 'werkvoorbereiding',     label: 'Werkvoorbereiding'     },
  { key: 'onderhanden',           label: 'Onderhanden'           },
  { key: 'uitvoering_gereed',     label: 'Uitvoering gereed'     },
  { key: 'financieel_gereed',     label: 'Financieel gereed'     },
  { key: 'financieel_afgesloten', label: 'Financieel afgesloten' },
]

export const OPDRACHT_ACTIEF_STATUSSEN: StatusDef<OpdrachtSubstatus>[] =
  OPDRACHT_STATUSSEN.filter(s => s.key !== 'financieel_afgesloten')

/** Kanban-statussen voor opdrachten: excl. financieel_afgesloten (definitieve afsluiting via knop).
 *  financieel_gereed is óók een kolom zodat je een opdracht ernaartoe kunt slepen (schrijft naar Bouw7);
 *  de "Financieel gereed melden" knop in de detail-view doet hetzelfde. */
export const OPDRACHT_KANBAN_STATUSSEN: StatusDef<OpdrachtSubstatus>[] =
  OPDRACHT_STATUSSEN.filter(s => s.key !== 'financieel_afgesloten')

/**
 * Wat de gebruiker leest bij `dossiers.facturatiemethode`.
 *
 * De opgeslagen waarde blijft `termijnen`: die staat in de database, in de Bouw7-snapshots en in
 * de code die de methode automatisch omzet bij een offerte op akkoord. Alleen het woord op het
 * scherm verandert — het bedrijf noemt dit werk "aangenomen", tegenover werk op regie. Zelfde
 * aanpak als bij Taken/Acties: label los van sleutel.
 */
export const FACTURATIE_LABELS: Record<'regie' | 'termijnen', string> = {
  regie:     'Regie',
  termijnen: 'Aangenomen',
}

/**
 * De vaste kostengroep die een servicedeskbon krijgt om op in te kopen, uren op te boeken en van
 * af te rekenen. Eén per bon; het aanmaken en de reden staan in `lib/dossiers/bon-bewakingscode.ts`.
 *
 * Hier en niet daar, omdat dit bestand aan beide kanten van de client/server-grens leesbaar is en
 * de aanmaakmodule de hele Bouw7-write meesleept.
 *
 * **Twee codes, want het zijn twee verschillende dingen.** Op regie is de groep de hele
 * verkoopwaarde van de bon: wat erop staat gaat één op één naar de factuur. Op aangenomen werk is
 * de groep juist de kostenkant — de opbrengst ligt vast in de aanneemsom en loopt via de
 * termijnstaat. Zou één code beide dragen, dan is aan een bedrag niet meer te zien of het nog
 * gefactureerd moet worden of allang betaald is, en dat is precies de vergissing die tot dubbel
 * factureren leidt.
 *
 * `RW` en `AW` volgen de stijl van `SP` (stelpost) en `MW` (meerwerk).
 */
export const REGIE_BEWAKINGSCODE = 'RW01'
export const REGIE_BEWAKINGSCODE_NAAM = 'Regiewerkzaamheden'
export const AANGENOMEN_BEWAKINGSCODE = 'AW01'
export const AANGENOMEN_BEWAKINGSCODE_NAAM = 'Aangenomen werk'

/** De vaste kostengroep die bij deze afrekenwijze hoort. */
export function bonBewakingscode(
  facturatiemethode: string | null | undefined,
): { code: string; naam: string } {
  return facturatiemethode === 'termijnen'
    ? { code: AANGENOMEN_BEWAKINGSCODE, naam: AANGENOMEN_BEWAKINGSCODE_NAAM }
    : { code: REGIE_BEWAKINGSCODE, naam: REGIE_BEWAKINGSCODE_NAAM }
}

/**
 * Servicedesk kent twee trajecten die los van elkaar lopen, en dus twee kolomreeksen:
 *
 *  * **Dagelijks onderhoud** — bon binnen, mandaat toetsen, uitzetten bij eigen mensen of een
 *    onderaannemer, kosten verzamelen, factureren. Werk op regie.
 *  * **Mutatie** — opname ter plaatse, offerte, werkvoorbereiding, uitvoering. Lijkt op een gewone
 *    opdracht en gaat aangenomen.
 *
 * Beide ladders schrijven op dezelfde kolom `dossiers.servicedesk_substatus`; alleen de getoonde
 * reeks verschilt. Gedeelde sleutels houden daardoor hun historie en hun Bouw7-koppeling — een
 * dossier dat van categorie wisselt springt niet van plek.
 */
export type ServicedeskLadder = 'onderhoud' | 'mutatie'

/**
 * Cookie waarin staat welke kant van het servicedeskbord de gebruiker het laatst koos.
 *
 * Een cookie en geen localStorage: de serverpagina moet de keuze al bij de eerste render kennen,
 * anders flitst er bij elke paginaload eerst een frame Dagelijks onderhoud voorbij. Deze constante
 * staat bewust hier en niet in ServicedeskBord — dat bestand heeft 'use client', en dan levert een
 * import vanuit een Server Component een client-referentie op in plaats van de string zelf.
 */
export const SERVICEDESK_LADDER_COOKIE = 'servicedesk_ladder'

/** Leest de cookiewaarde uit; alles wat geen geldige keuze is, valt terug op Dagelijks onderhoud. */
export function ladderUitCookie(waarde: string | null | undefined): ServicedeskLadder {
  return waarde === 'mutatie' ? 'mutatie' : 'onderhoud'
}

/** De ladder voor Dagelijks onderhoud (en voor elk servicedeskdossier dat geen mutatie is). */
export const SERVICEDESK_STATUSSEN: StatusDef<ServicedeskSubstatus>[] = [
  { key: 'nieuw',               label: 'Nieuw'                         },
  { key: 'mandaat_verhoging',   label: 'Mandaat verhoging aangevraagd' },
  { key: 'offerte_uitgebracht', label: 'Offerte uitgebracht'           },
  { key: 'uitgezet',            label: 'Uitgezet'                      },
  { key: 'ingepland',           label: 'Ingepland'                     },
  { key: 'loopt',               label: 'Loopt'                         },
  { key: 'uitgevoerd',          label: 'Uitgevoerd'                    },
  { key: 'kosten_compleet',     label: 'Kosten compleet'               },
  { key: 'financieel_gereed',   label: 'Financieel gereed'             },
]

/**
 * De ladder voor mutatiewerk.
 *
 * Drie sleutels dragen hier bewust een ander label dan op het onderhoudsbord: `offerte_uitgebracht`
 * heet "Offerte verstuurd", `loopt` heet "Onderhanden" en `uitgevoerd` heet "Uitvoering gereed".
 * Dat is per dossier eenduidig — de categorie bepaalt welke ladder je ziet — en het houdt de
 * bestaande Bouw7-mapping intact: die statussen komen 1-op-1 uit `04. Onderhanden` en
 * `05. Uitvoering gereed`. Alleen `opgenomen` en `in_voorbereiding` zijn nieuw.
 */
export const SERVICEDESK_MUTATIE_STATUSSEN: StatusDef<ServicedeskSubstatus>[] = [
  { key: 'nieuw',               label: 'Nieuw'             },
  { key: 'opgenomen',           label: 'Opgenomen'         },
  { key: 'offerte_uitgebracht', label: 'Offerte verstuurd' },
  { key: 'in_voorbereiding',    label: 'In voorbereiding'  },
  { key: 'loopt',               label: 'Onderhanden'       },
  { key: 'uitgevoerd',          label: 'Uitvoering gereed' },
  { key: 'kosten_compleet',     label: 'Kosten compleet'   },
  { key: 'financieel_gereed',   label: 'Financieel gereed' },
]

/**
 * Alle servicedesk-substatussen samen, voor plekken die alleen een label bij een sleutel zoeken en
 * de categorie van het dossier niet kennen (widgets, mobiele lijst, actieve-dossiers-view). Bij een
 * sleutel die in beide ladders zit wint het onderhoudslabel: dat is verreweg de grootste groep.
 * Ken je het dossier wél, gebruik dan `servicedeskLadder(dossier)`.
 */
export const SERVICEDESK_ALLE_STATUSSEN: StatusDef<ServicedeskSubstatus>[] = [
  ...SERVICEDESK_STATUSSEN,
  ...SERVICEDESK_MUTATIE_STATUSSEN.filter(
    m => !SERVICEDESK_STATUSSEN.some(o => o.key === m.key),
  ),
]

/**
 * True als dit dossier mutatiewerk is. Case-ongevoelig en getrimd: de waarde komt uit Bouw7 en daar
 * is de schrijfwijze niet gegarandeerd. `categorie` (de EVA-spiegel) is de terugval voor dossiers
 * die nog nooit door de sync zijn gegaan.
 */
export function isMutatieDossier(dossier: {
  bouw7_categorie_naam?: string | null
  categorie?: string | null
}): boolean {
  const cat = (dossier.bouw7_categorie_naam ?? dossier.categorie ?? '').trim().toLowerCase()
  return cat === 'mutatie'
}

/**
 * De kolomreeks die bij dít dossier hoort. Alles wat servicedesk is en geen mutatie, valt onder
 * Dagelijks onderhoud — inclusief de LB.-bonnen met een afwijkende categorie.
 */
export function servicedeskLadder(dossier: {
  bouw7_categorie_naam?: string | null
  categorie?: string | null
}): StatusDef<ServicedeskSubstatus>[] {
  return isMutatieDossier(dossier) ? SERVICEDESK_MUTATIE_STATUSSEN : SERVICEDESK_STATUSSEN
}

/**
 * True als het zetten van deze substatus het dossier **definitief afsluit** — daarna is het overal
 * alleen-lezen (zie `isDossierAfgesloten` + `lib/dossiers/guards.ts`) en is het niet meer via de UI
 * terug te draaien. Deze substatussen worden bovendien naar Bouw7 teruggeschreven en kunnen daar de
 * projectstatus op `08. Afgewezen` zetten. Vandaar een bevestiging vóór de wijziging.
 */
export function isAfsluitendeSubstatus(sectie: DossierSectie, key: string): boolean {
  if (sectie === 'aanvraag') return key === 'afgewezen' || key === 'vervallen'
  if (sectie === 'offerte')  return key === 'verloren'  || key === 'vervallen'
  return false
}
