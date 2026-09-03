/**
 * Opname → calculatie: de vertaling van opnameregels naar groepen, calculatieregels en
 * componentregels.
 *
 * BEWUST GEEN `'use server'`. Twee redenen, allebei hard:
 *
 * 1. Dit bestand exporteert synchrone functies. In een `'use server'`-module is dat verboden; `tsc`
 *    keurt het goed en de Next-build valt om.
 * 2. Deze mapping MOET client-side draaien. De calculatie-editor werkt op browser-werkgeheugen
 *    (`lib/everts-calc/local-store.ts`) met `calculatie_snapshots` als bron van waarheid. Wie
 *    server-side in die JSONB-blob schrijft, wordt bij de eerstvolgende autosave van een geopende
 *    calculatie-tab (debounce 1,5 s) weer overschreven — de import lijkt dan te lukken en verdwijnt
 *    daarna.
 *
 * Idempotentie zit in drie sloten:
 *   1. `Calculatieregel.id === opname_regels.id` — `slaCalculatieregelOp` upsert op id.
 *   2. `opnames.calculatie_groep_id` — altijd dezelfde bovengroep, nooit een tweede blok.
 *   3. Componentregel-ids zijn deterministisch afgeleid van regel-id + index.
 */

import type {
  Calculatieregel,
  Componentregel,
  ComponentType,
  Groep,
} from '@/lib/everts-calc/types'
import type { OpnameNorm, OpnameRegel } from '@everts/database/opname-types'
import { componentId, opnameGroepId, ruimteGroepId } from './ids'
import { opslagVoor } from './prijs'

/** Eén opnameregel met de foto's die als data-URL meegaan naar de calculatie. */
export type ImportRegel = OpnameRegel & {
  /** Al verkleinde base64 data-URL's; komen uit `laadOpnameVoorImport` op de server. */
  afbeeldingen?: string[]
}

export type ImportInvoer = {
  opnameId: string
  opnamenummer: string
  scenarioId: string
  /** Bovengroep uit een eerdere import; leeg = nu bepalen en daarna opslaan. */
  bestaandeGroepId: string | null
  /** Kop van de bovengroep, bijvoorbeeld het werkadres. */
  adres: string | null
  regels: ImportRegel[]
  /** Volgnummer van de bovengroep binnen het scenario. */
  volgordeBasis: number
  /** BTW-percentage van het scenario, als de regel er zelf geen heeft. */
  btwPctDefault?: number
}

export type ImportResultaat = {
  groepen: Groep[]
  regels: Calculatieregel[]
  componenten: Componentregel[]
  /** De bovengroep, zodat de aanroeper hem in `opnames.calculatie_groep_id` kan vastleggen. */
  hoofdgroepId: string
}

const GELDIGE_TYPES: ComponentType[] = ['arbeid', 'materieel', 'onderaanneming']

function componentVanNorm(regelId: string, norm: OpnameNorm, index: number): Componentregel {
  const type: ComponentType = GELDIGE_TYPES.includes(norm.type as ComponentType)
    ? (norm.type as ComponentType)
    : 'materieel'
  return {
    id: componentId(regelId, index),
    calculatieregel_id: regelId,
    type,
    norm_hoeveelheid: Number(norm.norm_hoeveelheid) || 0,
    eenheid: norm.eenheid || (type === 'arbeid' ? 'uur' : 'st'),
    tarief: Number(norm.tarief) || 0,
    // BEWUST geen opslag_pct per component: die moeten allemaal de opslag van de regel erven,
    // anders klopt de terugrekening `opslag = verkoop/kostprijs − 1` niet meer en landt de
    // afgesproken prijs er net naast.
    omschrijving: norm.omschrijving ?? undefined,
  }
}

/**
 * Een leesbare interne notitie bij een vaste-prijs-regel.
 *
 * De calculator ziet bij zo'n regel een rare opslag (bijvoorbeeld 37,4%), want die is teruggerekend
 * uit de afgesproken prijs. Zonder uitleg lijkt dat een fout. `opmerking` is een intern veld en komt
 * niet op de offerte.
 */
function herkomstNotitie(
  opnamenummer: string,
  regel: ImportRegel,
): string {
  const stukken = [`Opname ${opnamenummer}`]
  if (regel.ruimte) stukken.push(regel.ruimte)
  if (regel.prijs_soort === 'vast' && regel.verkoop_pe != null) {
    const prijs = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })
      .format(regel.verkoop_pe)
    stukken.push(`vaste prijs opdrachtgever ${prijs}/${regel.eenheid}`)
  }
  return stukken.join(' · ')
}

/**
 * Bouwt de complete boom voor één opname.
 *
 * Structuur: niveau 1 = de opname, niveau 2 = de ruimte. Ruimtes komen in de volgorde waarin ze in
 * de opname voorkomen — dat is de looproute van de opnemer en daarmee de volgorde die de
 * opdrachtgever herkent.
 */
export function bouwImport(invoer: ImportInvoer): ImportResultaat {
  const hoofdgroepId = invoer.bestaandeGroepId ?? opnameGroepId(invoer.opnameId)

  const groepen: Groep[] = [
    {
      id: hoofdgroepId,
      scenario_id: invoer.scenarioId,
      parent_id: null,
      naam: [invoer.opnamenummer, invoer.adres].filter(Boolean).join(' · '),
      niveau: 1,
      volgorde: invoer.volgordeBasis,
    },
  ]

  const regels: Calculatieregel[] = []
  const componenten: Componentregel[] = []

  // Ruimtes in volgorde van eerste voorkomen; regels binnen een ruimte op hun eigen volgorde.
  const perRuimte = new Map<string, ImportRegel[]>()
  for (const regel of [...invoer.regels].sort((a, b) => a.volgorde - b.volgorde)) {
    const ruimte = regel.ruimte?.trim() || 'Overig'
    const bestaand = perRuimte.get(ruimte)
    if (bestaand) bestaand.push(regel)
    else perRuimte.set(ruimte, [regel])
  }

  let ruimteVolgorde = 0
  for (const [ruimte, ruimteRegels] of perRuimte) {
    ruimteVolgorde += 1
    const groepId = ruimteGroepId(invoer.opnameId, ruimte)
    groepen.push({
      id: groepId,
      scenario_id: invoer.scenarioId,
      parent_id: hoofdgroepId,
      naam: ruimte,
      niveau: 2,
      volgorde: ruimteVolgorde,
    })

    ruimteRegels.forEach((regel, index) => {
      const normen = Array.isArray(regel.normen) ? regel.normen : []
      const kostprijsPe = normen.reduce(
        (som, n) => som + (Number(n.norm_hoeveelheid) || 0) * (Number(n.tarief) || 0),
        0,
      )

      // De opslag die de afgesproken verkoopprijs exact laat uitkomen. `opslagVoor` vangt de
      // deling door nul af: zonder die check wordt de opslag Infinity en worden ALLE bedragen in
      // de calculatie NaN — ook regels die niets met deze opname te maken hebben.
      const opslag =
        regel.prijs_soort === 'vast'
          ? opslagVoor(Number(regel.verkoop_pe) || 0, kostprijsPe)
          : Number(regel.opslag_pct) || 0

      const calcRegel: Calculatieregel = {
        id: regel.id,
        groep_id: groepId,
        omschrijving: regel.omschrijving,
        werkomschrijving: regel.toelichting_opnemer ?? undefined,
        hoeveelheid: Number(regel.aantal) || 0,
        eenheid: regel.eenheid || 'st',
        volgorde: index + 1,
        opslag_pct: opslag,
        btw_tarief_id: regel.btw_tarief_id ?? undefined,
        btw_pct: regel.btw_pct ?? invoer.btwPctDefault,
        kostengroep: regel.kostengroep ?? undefined,
        opmerking: herkomstNotitie(invoer.opnamenummer, regel),
        ...(regel.afbeeldingen?.length ? { werkomschrijving_afbeeldingen: regel.afbeeldingen } : {}),
      }
      regels.push(calcRegel)

      normen.forEach((norm, i) => componenten.push(componentVanNorm(regel.id, norm, i)))

      // Geen enkele norm: één component met de kostprijs, anders is de regel € 0 in de calculatie
      // terwijl de opname wél een bedrag toonde.
      if (normen.length === 0 && (Number(regel.verkoop_pe) || 0) !== 0) {
        componenten.push(
          componentVanNorm(
            regel.id,
            {
              type: 'materieel',
              norm_hoeveelheid: 1,
              eenheid: 'st',
              tarief: Number(regel.kostprijs_pe) || Number(regel.verkoop_pe) || 0,
              omschrijving: 'Vaste eenheidsprijs (afgesproken)',
            },
            0,
          ),
        )
      }
    })
  }

  return { groepen, regels, componenten, hoofdgroepId }
}

/** De markering waaraan een geïmporteerde regel te herkennen is. Zie `herkomstNotitie`. */
export function herkomstMarkering(opnamenummer: string): string {
  return `Opname ${opnamenummer}`
}

/**
 * Welke calculatieregels van een eerdere import horen niet meer bij deze opname?
 *
 * Herkenning gaat via de herkomstnotitie in `opmerking`, niet via "alles onder deze groep". Een
 * regel die de calculator er zélf bij zette — en dat gebeurt: hij vult aan wat de opnemer miste —
 * heeft die notitie niet en blijft dus staan. Zonder dat onderscheid zou een herimport stilletjes
 * zijn werk wissen.
 */
export function overbodigeRegelIds(
  bestaandeRegels: Pick<Calculatieregel, 'id' | 'opmerking'>[],
  huidigeOpnameRegelIds: string[],
  opnamenummer: string,
): string[] {
  const huidig = new Set(huidigeOpnameRegelIds)
  const markering = herkomstMarkering(opnamenummer)
  return bestaandeRegels
    .filter(r => !huidig.has(r.id) && (r.opmerking ?? '').startsWith(markering))
    .map(r => r.id)
}
