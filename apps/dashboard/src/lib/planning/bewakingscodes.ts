import { leesDossierBron } from '@/lib/bouw7/snapshot'
import { createAdminClient } from '@everts/database/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

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
}

type SecCode = { id?: number; code?: string | null; name?: string | null }
type SecChapter = {
  securityCodeChapter?: { id?: number; name?: string | null } | null
  budgetDataPerSecurityCodes?: { securityCode?: SecCode | null }[]
}
type SecObject = { securityCodesPerChapters?: SecChapter[] }

/** Sleutel waarop codes samenvallen: gelijk genummerde codes met een andere omschrijving
 *  zijn in Bouw7 verschillende codes en blijven hier dus apart staan. */
function identiteit(code: string, naam: string | null): string {
  return `${code.toLowerCase()}|${(naam ?? '').trim().toLowerCase()}`
}

/**
 * De bewakingscodes waaruit een planner bij dit dossier kan kiezen.
 *
 * Bron is de `security_links`-snapshot: die draagt als enige de `securityCode.id` die de
 * planitem-write nodig heeft om het item in Bouw7 aan de code te hangen. Daar bovenop komen
 * de codes die al op activiteiten van dit dossier staan (uit de planning-sync), zodat een
 * bestaande keuze nooit uit de lijst valt als de snapshot achterloopt.
 *
 * Leest alleen uit de database — nooit live uit Bouw7. Een lege lijst betekent: dit dossier
 * kent (nog) geen codes, en dan mag de kiezer niets afdwingen.
 */
export async function getPlanningBewakingscodes(dossierId: string): Promise<PlanningBewakingscode[]> {
  const map = new Map<string, PlanningBewakingscode>()

  const zet = (code: string, naam: string | null, hoofdstuk: string | null, id: number | null): void => {
    const schoon = code.trim()
    if (!schoon) return
    const sleutel = identiteit(schoon, naam)
    const bestaand = map.get(sleutel)
    if (!bestaand) {
      map.set(sleutel, { code: schoon, naam: naam?.trim() || null, hoofdstuk, bouw7_security_code_id: id })
      return
    }
    // Aanvullen, nooit overschrijven: de snapshot is de rijkste bron en komt als eerste langs.
    if (bestaand.bouw7_security_code_id == null && id != null) bestaand.bouw7_security_code_id = id
    if (!bestaand.hoofdstuk && hoofdstuk) bestaand.hoofdstuk = hoofdstuk
  }

  const [snapshot, activiteiten] = await Promise.all([
    leesDossierBron<SecObject[]>(dossierId, 'security_links'),
    db()
      .from('planning_activiteiten')
      .select('bewakingscode, bouw7_security_code_id')
      .eq('dossier_id', dossierId)
      .not('bewakingscode', 'is', null),
  ])

  for (const obj of snapshot.data ?? []) {
    for (const chap of obj.securityCodesPerChapters ?? []) {
      const hoofdstuk = chap.securityCodeChapter?.name?.trim() || null
      for (const bd of chap.budgetDataPerSecurityCodes ?? []) {
        const sc = bd.securityCode
        if (!sc?.code) continue
        zet(sc.code, sc.name ?? null, hoofdstuk, sc.id ?? null)
      }
    }
  }

  // Codes uit de snapshot dragen een omschrijving, de activiteit alleen het nummer. Een
  // activiteitcode toevoegen die al in de snapshot staat zou dus een tweede, naamloze regel
  // met hetzelfde nummer opleveren — vandaar de check op het kale nummer.
  const nummers = new Set([...map.values()].map(c => c.code.toLowerCase()))
  for (const a of (activiteiten.data ?? []) as { bewakingscode: string | null; bouw7_security_code_id: number | null }[]) {
    const code = a.bewakingscode?.trim()
    if (!code || nummers.has(code.toLowerCase())) continue
    nummers.add(code.toLowerCase())
    zet(code, null, null, a.bouw7_security_code_id)
  }

  return [...map.values()].sort((a, b) =>
    (a.hoofdstuk ?? '').localeCompare(b.hoofdstuk ?? '', 'nl')
    || a.code.localeCompare(b.code, 'nl', { numeric: true }))
}
