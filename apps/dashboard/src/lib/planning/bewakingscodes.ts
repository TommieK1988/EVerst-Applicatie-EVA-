import { leesDossierBron } from '@/lib/bouw7/snapshot'
import type { AthenaControlPayload } from '@/lib/bouw7/snapshot-bronnen'
import type { Bouw7CostTypeId } from '@/lib/bouw7/client'
import { leesEigenBewakingscodes } from '@/lib/dossiers/eigen-bewakingscodes'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { createAdminClient } from '@everts/database/server'

const db = () => createAdminClient()

/**
 * Waar een bewakingscode op dít dossier voorkomt. Een code zonder enige herkomst bestaat in
 * Bouw7 wel, maar er hangt niets aan: geen begroting, geen kosten, niet in de werkbegroting en
 * niet in de planning. Dat zijn de restanten van een projectsjabloon, en die horen niet in een
 * keuzelijst.
 */
export type PlanningCodeHerkomst =
  /** Staat als kostengroep op een regel van de werkbegroting van dit dossier. */
  | 'werkbegroting'
  /** Door EVA uitgedeeld bij een stelpost in de opdracht. */
  | 'stelpost'
  /** Door EVA uitgedeeld bij goedgekeurd meerwerk. */
  | 'meerwerk'
  /** De opvangcode "Regiewerkzaamheden" van een servicedeskbon die op regie afrekent. */
  | 'regie'
  /** Heeft in Bouw7 een begroting (bedrag of uren) staan. */
  | 'begroot'
  /** Heeft in Bouw7 geboekte kosten of uren. */
  | 'geboekt'
  /** Is al gekozen op een fase of activiteit van dit dossier. */
  | 'gepland'

/** Eén keuzemogelijkheid in de bewakingscode-kiezer van de detailplanning. */
export type PlanningBewakingscode = {
  /** Kale code, zoals Bouw7 hem toont ("410.A"). */
  code: string
  /** Omschrijving bij de code ("Bouwplaatskosten"). */
  naam: string | null
  /** Hoofdstuk waar de code onder hangt — in Bouw7 hetzelfde begrip als een fase. */
  hoofdstuk: string | null
  /** Bouw7 securityCode.id; nodig om een planitem in Bouw7 aan de code te koppelen. */
  bouw7_security_code_id: number | null
  /** Alle plekken waar deze code op dit dossier voorkomt. Leeg = nergens. */
  herkomst: PlanningCodeHerkomst[]
  /** Kortweg: `herkomst.length > 0`. Alleen deze codes toont de kiezer standaard. */
  in_gebruik: boolean
}

type SecCode = { id?: number; code?: string | null; name?: string | null }
type SecBudget = {
  securityCode?: SecCode | null
  laborCosts?: string | number | null
  laborHours?: string | number | null
  materialCosts?: string | number | null
  subcontractorCosts?: string | number | null
  purchaseOrderCosts?: string | number | null
  equipmentCosts?: string | number | null
  equipmentHours?: string | number | null
  wasteCosts?: string | number | null
  miscellaneousCosts?: string | number | null
}
type SecChapter = {
  securityCodeChapter?: { id?: number; name?: string | null } | null
  budgetDataPerSecurityCodes?: SecBudget[]
}
type SecObject = { securityCodesPerChapters?: SecChapter[] }

/** Hoofdstuk-labels voor codes die (nog) niet in Bouw7 staan; anders vallen ze onder "Overig". */
const HOOFDSTUK_EVA: Record<'werkbegroting' | 'stelpost' | 'meerwerk' | 'regie', string> = {
  werkbegroting: 'Werkbegroting',
  stelpost:      'Stelposten',
  meerwerk:      'Meerwerk',
  regie:         'Regie',
}

/** Sleutel waarop codes samenvallen: gelijk genummerde codes met een andere omschrijving
 *  zijn in Bouw7 verschillende codes en blijven hier dus apart staan. */
function identiteit(code: string, naam: string | null): string {
  return `${code.toLowerCase()}|${(naam ?? '').trim().toLowerCase()}`
}

/**
 * De werkbegroting bewaart code én omschrijving in één kostengroep-veld: `"01.A — Peuterhof"`.
 *
 * Splitsen op het eerste scheidingsteken, en de rest **letterlijk** laten staan. Wie op álle
 * scheidingstekens splitst en weer aaneenrijgt, herschrijft een streepje in de omschrijving zelf:
 * `"01.A — Peuterhof - Dobbelaan 9"` werd dan `"Peuterhof — Dobbelaan 9"`, en die code viel niet
 * meer samen met dezelfde code uit Bouw7 — de kiezer toonde hem twee keer.
 */
function splitsKostengroep(kostengroep: string): { code: string; naam: string | null } {
  const heel = kostengroep.trim()
  const m = /^(.*?)\s[—-]\s(.*)$/.exec(heel)
  if (!m) return { code: heel, naam: null }
  return { code: m[1].trim(), naam: m[2].trim() || null }
}

/** Getal uit een Bouw7-veld dat zowel string als number kan zijn; onleesbaar telt als 0. */
function getal(v: unknown): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * De bewakingscodes waaruit een planner bij dit dossier kan kiezen.
 *
 * VIJF BRONNEN, ÉÉN LIJST
 * De Bouw7-snapshot `security_links` is de enige bron die de `securityCode.id` draagt die de
 * planitem-write nodig heeft, maar hij loopt achter: een code die de calculator zojuist in de
 * werkbegroting heeft aangemaakt staat pas in Bouw7 ná het accorderen én de push, en pas in de
 * snapshot na de volgende sync. Daarom komen de codes van de werkbegroting, de stelposten en het
 * goedgekeurde meerwerk hier rechtstreeks uit onze eigen tabellen mee — die zijn direct. Wat al
 * op een fase of activiteit gekozen is komt er hoe dan ook bij, zodat een bestaande keuze nooit
 * uit de lijst valt.
 *
 * WELKE CODES ZIJN "IN GEBRUIK"
 * Elke code krijgt zijn herkomst mee. Een code die uit de snapshot komt maar nergens anders
 * voorkomt — geen begroting, geen geboekte kosten, niet in de werkbegroting, niet gepland — is
 * een restant van het projectsjabloon. Die staat met `in_gebruik: false` in de lijst en wordt
 * door de kiezer verborgen; alleen wie er expliciet om vraagt krijgt hem te zien.
 *
 * Leest alleen uit de database — nooit live uit Bouw7. Een lege lijst betekent: dit dossier
 * kent (nog) geen codes, en dan mag de kiezer niets afdwingen.
 */
export async function getPlanningBewakingscodes(dossierId: string): Promise<PlanningBewakingscode[]> {
  const map = new Map<string, PlanningBewakingscode>()
  /** Kale code (lowercase) → de eerste regel met dat nummer, voor codes zónder omschrijving. */
  const perNummer = new Map<string, PlanningBewakingscode>()

  /**
   * Een code toevoegen of aanvullen. Nooit overschrijven: de snapshot is de rijkste bron en komt
   * als eerste langs. Een code zónder omschrijving valt samen met een al bekende code met
   * hetzelfde nummer — anders krijg je naast "01.A — Peuterhof" een tweede, naamloze "01.A".
   */
  const zet = (
    code: string,
    naam: string | null,
    hoofdstuk: string | null,
    id: number | null,
    herkomst: PlanningCodeHerkomst | null,
  ): void => {
    const schoon = code.trim()
    if (!schoon) return
    const schoneNaam = naam?.trim() || null
    const bestaand = map.get(identiteit(schoon, schoneNaam))
      ?? (schoneNaam ? null : perNummer.get(schoon.toLowerCase()))

    if (bestaand) {
      if (bestaand.bouw7_security_code_id == null && id != null) bestaand.bouw7_security_code_id = id
      if (!bestaand.hoofdstuk && hoofdstuk) bestaand.hoofdstuk = hoofdstuk
      if (herkomst && !bestaand.herkomst.includes(herkomst)) bestaand.herkomst.push(herkomst)
      return
    }

    const nieuw: PlanningBewakingscode = {
      code: schoon,
      naam: schoneNaam,
      hoofdstuk,
      bouw7_security_code_id: id,
      herkomst: herkomst ? [herkomst] : [],
      in_gebruik: false, // wordt onderaan bepaald uit `herkomst`
    }
    map.set(identiteit(schoon, schoneNaam), nieuw)
    if (!perNummer.has(schoon.toLowerCase())) perNummer.set(schoon.toLowerCase(), nieuw)
  }

  const supabase = db()
  const [snapshot, control, eigenCodes, werkbegrotingRegels, activiteiten, fasen] = await Promise.all([
    leesDossierBron<SecObject[]>(dossierId, 'security_links'),
    leesDossierBron<AthenaControlPayload>(dossierId, 'athena_control'),
    leesEigenBewakingscodes(dossierId),
    leesWerkbegrotingKostengroepen(dossierId),
    haalAlleRijen<{ bewakingscode: string | null; bouw7_security_code_id: number | null }>((van, tot) =>
      supabase
        .from('planning_activiteiten')
        .select('bewakingscode, bouw7_security_code_id')
        .eq('dossier_id', dossierId)
        .not('bewakingscode', 'is', null)
        .order('id')
        .range(van, tot)),
    supabase
      .from('planning_fasen')
      .select('bewakingscode, bouw7_security_code_id')
      .eq('dossier_id', dossierId)
      .not('bewakingscode', 'is', null),
  ])

  // 1. Bouw7-snapshot: de volledige codelijst mét securityCode.id. Een code telt als "begroot"
  //    zodra er in welke kostensoort dan ook een bedrag of urenaantal op staat.
  for (const obj of snapshot.data ?? []) {
    for (const chap of obj.securityCodesPerChapters ?? []) {
      const hoofdstuk = chap.securityCodeChapter?.name?.trim() || null
      for (const bd of chap.budgetDataPerSecurityCodes ?? []) {
        const sc = bd.securityCode
        if (!sc?.code) continue
        const begroot = getal(bd.laborCosts) + getal(bd.laborHours) + getal(bd.materialCosts)
          + getal(bd.subcontractorCosts) + getal(bd.purchaseOrderCosts) + getal(bd.equipmentCosts)
          + getal(bd.equipmentHours) + getal(bd.wasteCosts) + getal(bd.miscellaneousCosts)
        zet(sc.code, sc.name ?? null, hoofdstuk, sc.id ?? null, begroot !== 0 ? 'begroot' : null)
      }
    }
  }

  // 2. Projectbewaking: begroting én realisatie per kostensoort. Een code waarop uren of kosten
  //    geboekt staan is in gebruik, ook als er nooit een begroting op is gezet.
  for (const resp of Object.values(control.data ?? {}) as AthenaControlPayload[Bouw7CostTypeId][]) {
    for (const item of resp?.items ?? []) {
      const ci = item.chapterInfo
      if (ci?.name === 'uncoded_costs' || ci?.id === 0) continue
      for (const sc of item.securityCodes ?? []) {
        const code = (sc.code ?? '').trim()
        if (!code) continue
        const begroot = getal(sc.budgetAmount) + getal(sc.hourInfo?.budgetHours) + getal(sc.additionalWorkAmount)
        const geboekt = getal(sc.costAmount) + getal(sc.hourInfo?.costHours)
        const hoofdstuk = ci?.name?.trim() || null
        zet(code, sc.name ?? null, hoofdstuk, null, begroot !== 0 ? 'begroot' : null)
        if (geboekt !== 0) zet(code, sc.name ?? null, hoofdstuk, null, 'geboekt')
      }
    }
  }

  // 3. De werkbegroting — de reden dat deze functie bestaat. Codes die de calculator daar heeft
  //    aangemaakt zijn hier meteen kiesbaar, zonder te wachten op accorderen of een sync.
  for (const kostengroep of werkbegrotingRegels) {
    const { code, naam } = splitsKostengroep(kostengroep)
    zet(code, naam, HOOFDSTUK_EVA.werkbegroting, null, 'werkbegroting')
  }

  // 4. Codes die EVA zelf heeft uitgedeeld: een stelpost, goedgekeurd meerwerk, of de regiecode
  //    van een servicedeskbon. Die laatste is op zo'n bon meestal de énige keuze die er is.
  for (const e of eigenCodes) {
    zet(e.code, e.naam, HOOFDSTUK_EVA[e.soort], null, e.soort)
  }

  // 5. Al gekozen op een fase of activiteit — die mag nooit uit de lijst vallen.
  const gekozen = [
    ...(activiteiten ?? []),
    ...((fasen.data ?? []) as { bewakingscode: string | null; bouw7_security_code_id: number | null }[]),
  ]
  for (const r of gekozen) {
    const code = r.bewakingscode?.trim()
    if (!code) continue
    zet(code, null, null, r.bouw7_security_code_id, 'gepland')
  }

  return [...map.values()]
    .map(c => ({ ...c, in_gebruik: c.herkomst.length > 0 }))
    .sort((a, b) =>
      (a.hoofdstuk ?? '').localeCompare(b.hoofdstuk ?? '', 'nl')
      || a.code.localeCompare(b.code, 'nl', { numeric: true }))
}

/**
 * De kostengroepen van de werkbegroting(en) van dit dossier, als ruwe `"CODE — Naam"`-strings.
 *
 * De werkbegroting is Supabase-first met een debounced sync, dus wat hier staat loopt hooguit
 * een paar seconden achter op wat de calculator ziet — en niet een halve dag, zoals de
 * Bouw7-snapshot. Verwijderde regels tellen niet mee: hun code is bewust losgelaten.
 */
async function leesWerkbegrotingKostengroepen(dossierId: string): Promise<string[]> {
  const supabase = db()
  const { data: wbs } = await supabase
    .from('werkbegrotingen')
    .select('id')
    .eq('dossier_id', dossierId)
  const ids = (wbs ?? []).map((w: { id: string }) => w.id)
  if (ids.length === 0) return []

  const regels = await haalAlleRijen<{ kostengroep: string | null }>((van, tot) =>
    supabase
      .from('werkbegroting_regels')
      .select('kostengroep')
      .in('werkbegroting_id', ids)
      .eq('is_verwijderd', false)
      .not('kostengroep', 'is', null)
      .order('id')
      .range(van, tot))

  return [...new Set(regels.map(r => (r.kostengroep ?? '').trim()).filter(Boolean))]
}

/**
 * Het Bouw7 `securityCode.id` van één bewakingscode op dit dossier, of null.
 *
 * Nodig voor codes die in EVA ontstaan — in de werkbegroting, bij een stelpost, bij meerwerk.
 * Die zijn hier meteen kiesbaar, maar hebben pas een Bouw7-id zodra de code daar bestaat én de
 * snapshot is ververst. De planitem-write gebruikt dit om dat id alsnog op te halen, zodat een
 * activiteit die vóór die tijd is ingepland niet voor altijd ongecodeerd naar Bouw7 gaat.
 *
 * Matcht op het kale nummer: de aanroeper heeft alleen dat, en binnen één dossier levert een
 * gelijk genummerde code in een ander hoofdstuk hooguit een andere PSL op — nooit een code die
 * bij een ander project hoort.
 */
export async function zoekBouw7SecurityCodeId(dossierId: string, code: string): Promise<number | null> {
  const gezocht = code.trim().toLowerCase()
  if (!gezocht) return null
  const snapshot = await leesDossierBron<SecObject[]>(dossierId, 'security_links')
  for (const obj of snapshot.data ?? []) {
    for (const chap of obj.securityCodesPerChapters ?? []) {
      for (const bd of chap.budgetDataPerSecurityCodes ?? []) {
        const sc = bd.securityCode
        if (sc?.id != null && (sc.code ?? '').trim().toLowerCase() === gezocht) return sc.id
      }
    }
  }
  return null
}
