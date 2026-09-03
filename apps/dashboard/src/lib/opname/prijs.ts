/**
 * Prijsopbouw van een opnameregel — puur, geen Supabase, geen `'use server'`.
 *
 * BEWUST GEEN `'use server'`: dit bestand exporteert synchrone functies. In een `'use server'`-module
 * is dat verboden; `tsc` keurt het goed en de Next-build valt om. Bovendien moet deze logica zowel
 * op de server (bij het toevoegen van een regel) als in de browser (offline, met de lokale kopie van
 * de bibliotheek) precies hetzelfde uitrekenen.
 *
 * ── Waarom een opslag terugrekenen? ──────────────────────────────────────────
 *
 * De calculatie kent geen "vaste verkoopprijs". `berekenCalculatieregel` rekent altijd:
 *
 *   kp_pe = Σ(norm_hoeveelheid × tarief)
 *   vp_pe = Σ(norm_hoeveelheid × tarief × (1 + opslag/100))
 *
 * Zolang alle componenten van een regel dezelfde opslag erven geldt dus `vp_pe = kp_pe × (1+p/100)`.
 * Een met de opdrachtgever afgesproken prijs landt daarom exact door de opslag terug te rekenen:
 *
 *   opslag_pct = (verkoop_pe / kostprijs_pe − 1) × 100
 *
 * Dat is eerlijker dan de kostprijs gelijkstellen aan de verkoopprijs (marge zou dan altijd 0 zijn)
 * en veel minder ingrijpend dan een `vaste_prijs`-veld in de rekenkern, wat calculations.ts,
 * sync-utils.ts, quote-renderer.ts én de werkbegroting zou raken.
 *
 * De calculator ziet daardoor wel een rare opslag (37,4%). Daarom zet de import een leesbare regel
 * in `Calculatieregel.opmerking` — een intern veld dat niet op de offerte komt.
 */

import type {
  OpnameNorm,
  OpnameOnderdeel,
  OpnamePrijsSoort,
} from '@everts/database/opname-types'

/** De velden die als snapshot op `opname_regels` worden bevroren. */
export type RegelPrijs = {
  prijs_soort: OpnamePrijsSoort
  verkoop_pe: number
  kostprijs_pe: number
  uren_pe: number
  opslag_pct: number
  normen: OpnameNorm[]
}

/** Alleen wat de prijsopbouw nodig heeft, zodat de mobiele client dit ook kan aanroepen. */
export type PrijslijstContext = {
  standaard_opslag_pct: number
  uurtarief_kostprijs: number | null
}

const getal = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Afronden op 4 decimalen: de kolommen zijn numeric(12,4) en drijvende komma glipt eruit. */
const rond4 = (n: number): number => Math.round(n * 10000) / 10000

export function kostprijsVanNormen(normen: OpnameNorm[]): number {
  return normen.reduce((som, n) => som + getal(n.norm_hoeveelheid) * getal(n.tarief), 0)
}

export function urenVanNormen(normen: OpnameNorm[]): number {
  return normen
    .filter(n => n.type === 'arbeid')
    .reduce((som, n) => som + getal(n.norm_hoeveelheid), 0)
}

/**
 * Bouwt de prijssnapshot voor één regel.
 *
 * @param onderdeel  het bibliotheek-onderdeel dat de opnemer koos
 * @param normen     de al bevroren normen van het gekoppelde recept (leeg als er geen recept is)
 * @param prijslijst opslag- en uurtarief-standaarden van de prijslijst
 */
export function bepaalRegelPrijs(
  onderdeel: Pick<
    OpnameOnderdeel,
    'prijs_soort' | 'verkoop_pe' | 'kostprijs_pe' | 'uren_pe' | 'opslag_pct'
  >,
  normen: OpnameNorm[],
  prijslijst: PrijslijstContext,
): RegelPrijs {
  const uitRecept = kostprijsVanNormen(normen)
  const urenUitRecept = urenVanNormen(normen)

  // ── Recept: de prijs volgt uit de normen plus opslag ──────────────────────
  if (onderdeel.prijs_soort === 'recept') {
    const opslag = onderdeel.opslag_pct ?? prijslijst.standaard_opslag_pct ?? 0
    return {
      prijs_soort: 'recept',
      kostprijs_pe: rond4(uitRecept),
      verkoop_pe: rond4(uitRecept * (1 + opslag / 100)),
      uren_pe: rond4(urenUitRecept || getal(onderdeel.uren_pe)),
      opslag_pct: rond4(opslag),
      normen,
    }
  }

  // ── Vaste prijs: de afgesproken verkoopprijs is leidend ───────────────────
  const verkoop = getal(onderdeel.verkoop_pe)

  // Geval A — het recept levert de kostprijs en de uren. Beste variant: marge én uren kloppen,
  // dus werkbegroting en planning krijgen echte getallen.
  if (uitRecept > 0) {
    return {
      prijs_soort: 'vast',
      kostprijs_pe: rond4(uitRecept),
      verkoop_pe: rond4(verkoop),
      uren_pe: rond4(urenUitRecept || getal(onderdeel.uren_pe)),
      opslag_pct: rond4(opslagVoor(verkoop, uitRecept)),
      normen,
    }
  }

  // Geval B — geen recept. Kostprijs afleiden in plaats van gelijkstellen aan de verkoopprijs.
  const uren = getal(onderdeel.uren_pe)
  const uurtarief = getal(prijslijst.uurtarief_kostprijs)
  const arbeidsdeel = uren * uurtarief

  let kostprijs = getal(onderdeel.kostprijs_pe)
  if (kostprijs <= 0) {
    const standaard = getal(prijslijst.standaard_opslag_pct)
    // standaard_opslag_pct = 0 laat dit netjes terugvallen op kostprijs = verkoopprijs, marge 0.
    kostprijs = standaard > -100 ? verkoop / (1 + standaard / 100) : verkoop
  }

  // Kost de arbeid alleen al meer dan de afgeleide kostprijs, dan is die afleiding onzin. De
  // arbeid is dan de kostprijs; dat mag een negatieve marge opleveren — die is echt, en de
  // calculator hoort hem te zien in plaats van een gladgestreken getal.
  if (arbeidsdeel > kostprijs) kostprijs = arbeidsdeel

  const materiaaldeel = kostprijs - arbeidsdeel
  const opgebouwd: OpnameNorm[] = []
  if (arbeidsdeel > 0) {
    opgebouwd.push({
      type: 'arbeid',
      norm_hoeveelheid: rond4(uren),
      eenheid: 'uur',
      tarief: rond4(uurtarief),
      omschrijving: 'Arbeid (norm uit prijsafspraak)',
    })
  }
  if (materiaaldeel > 0 || opgebouwd.length === 0) {
    opgebouwd.push({
      type: 'materieel',
      norm_hoeveelheid: 1,
      eenheid: 'st',
      tarief: rond4(Math.max(materiaaldeel, 0)),
      omschrijving: 'Vaste eenheidsprijs (afgesproken)',
    })
  }

  return {
    prijs_soort: 'vast',
    kostprijs_pe: rond4(kostprijs),
    verkoop_pe: rond4(verkoop),
    uren_pe: rond4(uren),
    opslag_pct: rond4(opslagVoor(verkoop, kostprijs)),
    normen: opgebouwd,
  }
}

/**
 * De opslag die `kostprijs` precies op `verkoop` laat uitkomen.
 *
 * De nulcheck is geen formaliteit. Zonder hem wordt de opslag `Infinity`, en omdat de calculatie
 * álle regels optelt worden daarmee de bedragen van de héle calculatie `NaN` — ook regels die niets
 * met deze opname te maken hebben.
 */
export function opslagVoor(verkoop: number, kostprijs: number): number {
  if (!Number.isFinite(kostprijs) || kostprijs <= 0) return 0
  const pct = (verkoop / kostprijs - 1) * 100
  return Number.isFinite(pct) ? pct : 0
}

/** Regeltotaal zoals de database het als generated kolom uitrekent. Voor optimistische UI. */
export function regelTotaal(aantal: number, prijsPerEenheid: number | null): number {
  return Math.round(getal(aantal) * getal(prijsPerEenheid) * 100) / 100
}
