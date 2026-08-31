import { createAdminClient } from '@everts/database/server'

/**
 * Bedrag-verrijking voor de kanban-kaarten en de lijstweergave.
 *
 * `dossiers.bedrag_excl_btw` / `kostprijs_excl_btw` worden uitsluitend door de Bouw7-sync geschreven
 * (2×/dag). Alles wat in EVA zelf ontstaat — de calculatie/offerte, goedgekeurd meer-/minderwerk,
 * stelposten buiten de aanneemsom en gekozen opties — komt daar dus nooit in terecht. Op het
 * Informatie-tab wordt dat live bijgerekend; de kaarten lazen alleen de kale kolom en liepen daardoor
 * achter of bleven leeg.
 *
 * Deze module haalt diezelfde onderdelen in één bulk-slag op voor een hele lijst dossiers, zodat de
 * kaart en de lijst hetzelfde getal tonen als het Informatie-tab. Volumes zijn klein (een handvol
 * calculatie-offertes, enkele honderden meerwerkregels), dus de aggregatie gebeurt in JS.
 */

const rond = (n: number): number => Math.round(n * 100) / 100
const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
  return 0
}

/** Statussen die als goedgekeurd meetellen — gelijk aan `GOEDGEKEURD` in lib/dossiers/meerwerk.ts. */
const GOEDGEKEURD = ['akkoord', 'voltooid']

export type KaartBedragVelden = {
  eva_offerte_excl_btw: number | null
  eva_kostprijs_excl_btw: number | null
  meerwerk_goedgekeurd_excl_btw: number
  stelposten_apart_excl_btw: number
  gekozen_opties_excl_btw: number
}

type Invoer = { id: string; everts_calc_project_id?: string | null }

/**
 * Een `.in()` over honderden uuid's wordt een URL van tienduizenden tekens; PostgREST kapt die af
 * of weigert hem. De borden tonen makkelijk 500+ dossiers, dus altijd in blokken opvragen.
 * Wordt ook gebruikt door `getLijstVerrijking` in actions.ts.
 */
export const ID_BLOK = 150

/**
 * Voert `query` uit per blok van `ID_BLOK` ids en plakt de resultaten aan elkaar. De blokken gaan
 * parallel: ze hebben niets van elkaar nodig, en achter elkaar wachten kostte bij 400+ dossiers
 * drie volle roundtrips per tabel.
 */
async function inChunks<T>(
  ids: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (blok: string[]) => any,
): Promise<T[]> {
  const blokken: string[][] = []
  for (let i = 0; i < ids.length; i += ID_BLOK) blokken.push(ids.slice(i, i + ID_BLOK))

  const resultaten = await Promise.all(blokken.map(blok => query(blok)))

  const uit: T[] = []
  for (const { data } of resultaten) {
    if (data) uit.push(...(data as T[]))
  }
  return uit
}

/**
 * Effectief bedrag van één meerwerkregel — de DB-only variant van `effectiefExcl` uit
 * lib/dossiers/meerwerk.ts. Regie en stelposten-op-geboekte-kosten hangen op live Bouw7-data
 * (geboekte uren/kosten per bewakingscode) en tellen hier bewust als 0: dat per dossier ophalen
 * zou het bord tientallen Bouw7-calls kosten. Het Informatie-tab blijft daarvoor de bron.
 */
function meerwerkEffectief(r: {
  is_stelpost: boolean | null
  stelpost_grondslag: string | null
  afrekenwijze: string | null
  bedrag_excl_btw: unknown
  eenheidsprijs: unknown
  hoeveelheid_werkelijk: unknown
}): number {
  if (r.is_stelpost && r.stelpost_grondslag === 'eenheidsprijzen') {
    return rond(num(r.eenheidsprijs) * num(r.hoeveelheid_werkelijk))
  }
  const opGeboekteKosten = r.afrekenwijze === 'regie'
    || (r.is_stelpost && r.stelpost_grondslag === 'geboekte_kosten')
  if (opGeboekteKosten) return 0
  return rond(num(r.bedrag_excl_btw))
}

/**
 * Haalt per dossier de EVA-eigen bedragen op. Geeft een lege map terug als er niets te halen valt,
 * zodat de aanroeper de rijen ongemoeid kan laten. Faalt stil: een kaart zonder verrijking is beter
 * dan een bord dat niet laadt.
 */
export async function laadKaartBedragen(rijen: Invoer[]): Promise<Map<string, KaartBedragVelden>> {
  const uit = new Map<string, KaartBedragVelden>()
  const ids = rijen.map(r => r.id)
  if (ids.length === 0) return uit

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // Calculatieproject-id → dossier-id. `quotes.project_id` is text, `everts_calc_project_id` uuid.
  const projectNaarDossier = new Map<string, string>()
  for (const r of rijen) {
    if (r.everts_calc_project_id) projectNaarDossier.set(String(r.everts_calc_project_id), r.id)
  }
  const projectIds = [...projectNaarDossier.keys()]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [meerwerkRijen, onderdeelRijen, quotes] = await Promise.all([
    inChunks<any>(ids, blok => supabase.from('meerwerk_regels')
      .select('dossier_id, status, afrekenwijze, is_stelpost, stelpost_grondslag, bedrag_excl_btw, eenheidsprijs, hoeveelheid_werkelijk')
      .in('dossier_id', blok)
      .in('status', GOEDGEKEURD)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inChunks<any>(ids, blok => supabase.from('opdracht_onderdelen')
      .select('dossier_id, soort, in_opdracht, in_aanneemsom, bedrag_excl_btw')
      .in('dossier_id', blok)
      .eq('in_opdracht', true)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inChunks<any>(projectIds, blok => supabase.from('quotes')
      .select('id, project_id, subtotaal_ex_btw, updated_at')
      .in('project_id', blok)
      .is('meerwerk_regel_id', null)
      .order('updated_at', { ascending: false })),
  ])

  const veldenVoor = (dossierId: string): KaartBedragVelden => {
    let v = uit.get(dossierId)
    if (!v) {
      v = {
        eva_offerte_excl_btw: null,
        eva_kostprijs_excl_btw: null,
        meerwerk_goedgekeurd_excl_btw: 0,
        stelposten_apart_excl_btw: 0,
        gekozen_opties_excl_btw: 0,
      }
      uit.set(dossierId, v)
    }
    return v
  }

  for (const r of meerwerkRijen) {
    const v = veldenVoor(r.dossier_id)
    v.meerwerk_goedgekeurd_excl_btw = rond(v.meerwerk_goedgekeurd_excl_btw + meerwerkEffectief(r))
  }

  // Stelposten ín de aanneemsom zijn carve-outs: die zitten al in de aanneemsom en mogen er niet
  // nog eens bij op. Alleen stelposten erbuiten en gekozen opties zijn extra omzet.
  for (const r of onderdeelRijen) {
    const v = veldenVoor(r.dossier_id)
    if (r.soort === 'stelpost') {
      if (r.in_aanneemsom === false) {
        v.stelposten_apart_excl_btw = rond(v.stelposten_apart_excl_btw + num(r.bedrag_excl_btw))
      }
    } else if (r.soort === 'optie') {
      v.gekozen_opties_excl_btw = rond(v.gekozen_opties_excl_btw + num(r.bedrag_excl_btw))
    }
  }

  // Hoofd-offerte per calculatieproject: nieuwste eerst, dus de eerste hit per project wint —
  // dezelfde keuze als `vindHoofdOfferte` in lib/dossiers/opdracht-onderdelen.ts.
  const hoofdOfferte = new Map<string, { id: string; subtotaal: number | null }>()
  for (const q of quotes) {
    const dossierId = projectNaarDossier.get(String(q.project_id))
    if (!dossierId || hoofdOfferte.has(dossierId)) continue
    hoofdOfferte.set(dossierId, {
      id: q.id,
      subtotaal: q.subtotaal_ex_btw != null ? num(q.subtotaal_ex_btw) : null,
    })
  }

  if (hoofdOfferte.size) {
    const quoteIds = [...hoofdOfferte.values()].map(q => q.id)
    // Kostprijs = som van (kostprijs_pe × hoeveelheid) over niet-optionele regels — gelijk aan
    // `getQuoteTotalenVoorProject`. Verkoop en kostprijs komen zo uit dezelfde offerte; ze mengen
    // met het Bouw7-bedrag zou een betekenisloze marge opleveren.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [lines, secties] = await Promise.all([
      inChunks<any>(quoteIds, blok => supabase.from('quote_lines')
        .select('quote_id, kostprijs_pe, hoeveelheid, section_id').in('quote_id', blok)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inChunks<any>(quoteIds, blok => supabase.from('quote_sections')
        .select('id, quote_id, is_optioneel').in('quote_id', blok)),
    ])
    const optioneleSecties = new Set<string>(
      secties.filter(s => s.is_optioneel).map(s => s.id as string),
    )
    const kostprijsPerQuote = new Map<string, number>()
    for (const l of lines) {
      if (l.section_id && optioneleSecties.has(l.section_id)) continue
      kostprijsPerQuote.set(l.quote_id, (kostprijsPerQuote.get(l.quote_id) ?? 0) + num(l.kostprijs_pe) * num(l.hoeveelheid ?? 1))
    }

    for (const [dossierId, q] of hoofdOfferte) {
      const v = veldenVoor(dossierId)
      v.eva_offerte_excl_btw = q.subtotaal
      const kp = kostprijsPerQuote.get(q.id)
      v.eva_kostprijs_excl_btw = kp != null && kp > 0 ? rond(kp) : null
    }
  }

  return uit
}
