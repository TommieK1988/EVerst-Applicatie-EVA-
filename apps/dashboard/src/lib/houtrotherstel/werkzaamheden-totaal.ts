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
import type { RepairRegistration } from './types'
import { euroNL, getalNL } from '@/lib/documenten/format'

/** Bepaalt per recept het geldende btw-tarief. */
export type BtwWijzer = (receptId: string | null | undefined) => BtwUitkomst

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
  }
  const bakken = new Map<string, Bak>()

  for (const r of registraties) {
    for (const l of gesorteerdeRegels(r)) {
      const aantal = Number(l.aantal) || 0
      if (aantal === 0) continue
      const perStuk = Number(l.sale_price_snapshot ?? 0)
      const sleutel = `${l.recept_id ?? l.repair_code_snapshot ?? l.repair_name_snapshot ?? '?'}|${perStuk}`
      let bak = bakken.get(sleutel)
      if (!bak) {
        bak = {
          code: l.repair_code_snapshot ?? '',
          naam: l.repair_name_snapshot ?? 'Werkzaamheid',
          eenheid: l.unit_snapshot ?? '',
          aantal: 0, perStuk, totaal: 0, uren: 0,
          uitkomst: btwVan(l.recept_id),
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
    }
  })

  return {
    regels,
    btwRegels: lijst.map(b => ({ excl: rond(b.totaal), uitkomst: b.uitkomst })),
  }
}
