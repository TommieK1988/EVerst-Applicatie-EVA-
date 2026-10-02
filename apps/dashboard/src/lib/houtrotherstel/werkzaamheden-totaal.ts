/**
 * werkzaamheden-totaal.ts
 *
 * Telt de werkzaamheden van alle houtrotregistraties op tot één regel per soort
 * werk: het totaalblad van de rapportage. Bewust pure code naast `bedragen.ts` —
 * geen server-imports — zodat de optelling los na te rekenen is en de rapportage-
 * bouwer alleen nog hoeft te formatteren.
 */
import { gesorteerdeRegels } from './bedragen'
import { pctLabel, type BtwUitkomst } from './btw'
import { REGEL_CATEGORIEEN, type RegelCategorie, type RepairRegistration } from './types'
import { euroNL, getalNL } from '@/lib/documenten/format'

/**
 * Bepaalt per regel het geldende btw-tarief: een bibliotheekregel via zijn recept,
 * een handmatige regel via de code die op de regel zelf staat.
 */
export type BtwWijzer = (regel: { recept_id?: string | null; btw_tarief?: string | null }) => BtwUitkomst

/** Eén regel van het totaalblad, klaar voor het Word-sjabloon. */
export interface WerkzaamheidTotaal {
  code: string
  naam: string
  eenheid: string
  aantal: string
  aantal_num: number
  uren: string
  prijs_per_stuk: string
  btw_pct: string
  btw_pct_num: number
  totaal: string
  totaal_num: number
  /** 'Handmatig' voor zelf ingevoerde regels, anders leeg. */
  bron: string
  /** 'Reparatie' of 'Aanvullende werkzaamheden'. */
  categorie: string
}

export interface WerkzaamhedenTelling {
  regels: WerkzaamheidTotaal[]
  /** Voer voor de btw-opstelling: bedrag exclusief btw per regel, met zijn tarief. */
  btwRegels: { excl: number; uitkomst: BtwUitkomst }[]
}

const rond = (n: number) => Math.round(n * 100) / 100

/**
 * Gegroepeerd op werkzaamheid **én** eenheidsprijs. Staat dezelfde werkzaamheid
 * twee keer met een andere prijs (prijslijst gewijzigd tussen twee registraties),
 * dan komt hij als twee regels. Anders zou `aantal × eenheidsprijs` niet meer op
 * het regeltotaal uitkomen, en dat is precies wat een lezer narekent.
 */
export function telWerkzaamheden(
  registraties: RepairRegistration[],
  btwVan: BtwWijzer,
  toonPrijzen: boolean,
): WerkzaamhedenTelling {
  type Bak = {
    code: string; naam: string; eenheid: string
    aantal: number; perStuk: number; totaal: number
    uren: number; uitkomst: BtwUitkomst
    handmatig: boolean; categorie: RegelCategorie
  }
  const bakken = new Map<string, Bak>()

  for (const r of registraties) {
    for (const l of gesorteerdeRegels(r)) {
      const aantal = Number(l.aantal) || 0
      if (aantal === 0) continue
      const perStuk = Number(l.sale_price_snapshot ?? 0)
      const handmatig = l.bron === 'handmatig'
      const categorie: RegelCategorie = l.categorie === 'meerwerk' ? 'meerwerk' : 'reparatie'
      // Handmatige regels hebben geen recept: ze bundelen op omschrijving + eenheid,
      // en nooit met een bibliotheekregel van dezelfde naam.
      const wie = handmatig
        ? `h:${(l.repair_name_snapshot ?? '').trim().toLowerCase()}|${l.unit_snapshot ?? ''}|${l.btw_tarief ?? ''}`
        : (l.recept_id ?? l.repair_code_snapshot ?? l.repair_name_snapshot ?? '?')
      const sleutel = `${wie}|${perStuk}|${categorie}`
      let bak = bakken.get(sleutel)
      if (!bak) {
        const naam = l.repair_name_snapshot ?? 'Werkzaamheid'
        bak = {
          code: l.repair_code_snapshot ?? '',
          // In de naam, zodat het ook in bestaande Word-sjablonen zichtbaar is.
          naam: handmatig ? `${naam} (handmatig)` : naam,
          eenheid: l.unit_snapshot ?? '',
          aantal: 0, perStuk, totaal: 0, uren: 0,
          uitkomst: btwVan(l),
          handmatig, categorie,
        }
        bakken.set(sleutel, bak)
      }
      bak.aantal += aantal
      bak.totaal += Number(l.line_sale_total ?? perStuk * aantal)
      bak.uren += aantal * Number(l.labor_hours_snapshot ?? 0)
    }
  }

  const lijst = [...bakken.values()].sort(
    (a, b) => a.code.localeCompare(b.code, 'nl') || a.naam.localeCompare(b.naam, 'nl'),
  )

  const regels: WerkzaamheidTotaal[] = lijst.map(b => {
    const totaal = rond(b.totaal)
    return {
      code: b.code,
      naam: b.naam,
      eenheid: b.eenheid,
      aantal: getalNL(b.aantal, b.aantal % 1 === 0 ? 0 : 2),
      aantal_num: b.aantal,
      uren: getalNL(rond(b.uren)),
      prijs_per_stuk: toonPrijzen ? euroNL(b.perStuk) : '',
      btw_pct: toonPrijzen ? pctLabel(b.uitkomst) : '',
      btw_pct_num: b.uitkomst.pct,
      totaal: toonPrijzen ? euroNL(totaal) : '',
      totaal_num: toonPrijzen ? totaal : 0,
      bron: b.handmatig ? 'Handmatig' : '',
      categorie: REGEL_CATEGORIEEN[b.categorie],
    }
  })

  return {
    regels,
    btwRegels: lijst.map(b => ({ excl: rond(b.totaal), uitkomst: b.uitkomst })),
  }
}
