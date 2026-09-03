'use server'

/**
 * Welke bewakingscodes van een dossier mogen op een verkoopfactuur komen.
 *
 * Dit is de belangrijkste vraag van de hele facturatie, en het antwoord is streng: op een
 * aangenomen opdracht zit verreweg het meeste werk al ín de aanneemsom. Die kosten zijn via de
 * termijnen al gefactureerd; ze nóg eens als regie doorbelasten is dubbel factureren.
 *
 * Nagecalculeerd wordt alleen wat als zodanig is afgesproken:
 *
 *   • een **meerwerkregel met afrekenwijze `regie`** — daar is expliciet vastgelegd dat er op
 *     werkelijke kosten wordt afgerekend;
 *   • een **stelpost** — die rekent per definitie op werkelijke kosten af.
 *
 * En één uitzondering die er echt toe doet: zit een stelpost **in de aanneemsom** (carve-out), dan
 * is hij al betaald via de termijnen en is alleen het *verschil* nog te verrekenen. Dat verschil
 * loopt via `verrekenStelpost` naar een aparte meerwerkregel. Zo'n stelpost hoort dus níét als
 * volledige factuurregel op te duiken — dat zou hem twee keer in rekening brengen.
 *
 * Alle overige codes (WERKZAAMHEDEN, ALGEMEEN, bouwplaatskosten…) blijven buiten beeld.
 */

import { createAdminClient } from '@everts/database/server'

export type FactureerbareCode = {
  bewakingscode: string
  bron: 'stelpost' | 'meerwerk'
  /** Id van de stelpost of meerwerkregel waar deze code bij hoort. */
  bronId: string
  /** Naam zoals hij standaard op de factuur komt. */
  omschrijving: string
  /**
   * Alleen het verschil is nog te factureren, want de post zit al in de aanneemsom. Zulke codes
   * horen niet in het factuurvoorstel; ze staan hier zodat het scherm kan uitleggen wáárom.
   */
  alleenVerschil: boolean
  /** Eigen opslagpercentage van de stelpost; leeg = de bedrijfsstandaard. */
  opslagPct: number | null
  /**
   * Staat deze bewakingscode ook echt in Bouw7? Zo niet, dan kunnen er geen kosten op geboekt
   * worden en blijft de post op nul staan — dat moet zichtbaar zijn, anders lijkt het of er niets
   * is uitgegeven.
   */
  inBouw7: boolean
}

/**
 * De bewakingscodes van dit dossier die op nacalculatie afrekenen, met hun herkomst.
 * Codes die nergens aan hangen komen hier niet in voor — die zitten in de aanneemsom.
 */
export async function getFactureerbareCodes(dossierId: string): Promise<FactureerbareCode[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [stelposten, meerwerk] = await Promise.all([
    supabase
      .from('opdracht_onderdelen')
      .select('id, omschrijving, bewakingscode, in_aanneemsom, in_opdracht, opslag_pct, grondslag, bouw7_chapter_id')
      .eq('dossier_id', dossierId)
      .eq('soort', 'stelpost')
      .not('bewakingscode', 'is', null),
    supabase
      .from('meerwerk_regels')
      .select('id, omschrijving, bewakingscode, afrekenwijze, is_stelpost, status, opdracht_onderdeel_id, bouw7_chapter_id')
      .eq('dossier_id', dossierId)
      .not('bewakingscode', 'is', null),
  ])

  const uit: FactureerbareCode[] = []
  const gezien = new Set<string>()

  for (const s of (stelposten.data ?? []) as any[]) {
    if (!s.in_opdracht) continue // uitgesloten uit de opdracht: niets te factureren
    const code = String(s.bewakingscode)
    if (gezien.has(code)) continue
    gezien.add(code)
    uit.push({
      bewakingscode: code,
      bron: 'stelpost',
      bronId: String(s.id),
      omschrijving: s.omschrijving ?? code,
      // Een carve-out is via de aanneemsom al gefactureerd; alleen het verschil telt nog, en dat
      // loopt via de verrekening naar een meerwerkregel.
      alleenVerschil: s.in_aanneemsom !== false,
      opslagPct: s.opslag_pct != null ? Number(s.opslag_pct) : null,
      inBouw7: s.bouw7_chapter_id != null,
    })
  }

  for (const m of (meerwerk.data ?? []) as any[]) {
    // Alleen wat op nacalculatie afrekent. Een 'aangenomen' meerwerkregel heeft een vast bedrag en
    // wordt als zodanig gefactureerd, niet uit de geboekte kosten.
    const opNacalculatie = m.afrekenwijze === 'regie' || m.is_stelpost === true
    if (!opNacalculatie) continue
    if (m.status === 'afgewezen') continue
    // Een verrekenregel van een stelpost draagt zelf geen code en hoort hier niet; de guard is er
    // voor het geval dat ooit verandert.
    if (m.opdracht_onderdeel_id != null) continue
    const code = String(m.bewakingscode)
    if (gezien.has(code)) continue
    gezien.add(code)
    uit.push({
      bewakingscode: code,
      bron: 'meerwerk',
      bronId: String(m.id),
      omschrijving: m.omschrijving ?? code,
      alleenVerschil: false,
      opslagPct: null,
      inBouw7: m.bouw7_chapter_id != null,
    })
  }

  return uit.sort((a, b) => a.bewakingscode.localeCompare(b.bewakingscode, 'nl'))
}

/** Opgeslagen aanpassingen per bewakingscode (uit het popup-scherm). */
export type CodeInstelling = {
  bewakingscode: string
  omschrijving: string | null
  opslag_pct: number | null
  bedrag_excl_btw: number | null
  uitsplitsen: boolean
  btw_tarief_bouw7_id: number | null
  meefactureren: boolean
}

export async function getCodeInstellingen(dossierId: string): Promise<CodeInstelling[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('factuur_regelinstellingen')
    .select('bewakingscode, omschrijving, opslag_pct, bedrag_excl_btw, uitsplitsen, btw_tarief_bouw7_id, meefactureren')
    .eq('dossier_id', dossierId)
  return (data ?? []) as CodeInstelling[]
}
