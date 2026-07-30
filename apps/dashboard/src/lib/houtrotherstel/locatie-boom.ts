/**
 * locatie-boom.ts
 *
 * Pure boomoperaties op de houtrot-locatieboom (`LocatieNode`). Bewust zonder
 * React — dezelfde opzet als `everts-calc/groep-boom.ts`: de boom staat als
 * platte lijst met `parent_id`; kinderen, diepte en volgorde worden hier berekend.
 * Gebruikt door de editor (client) én de saneer-stap in de service (server).
 */
import type { LocatieBoom, LocatieNode, LocatieWaarde } from '@/lib/houtrotherstel/types'

/** Diepste toegestane niveau (aantal lagen). Diepte-index loopt dan 0..MAX_DIEPTE-1. */
export const MAX_DIEPTE = 3

/** Maximaal aantal knopen dat een reeks-/lijstgeneratie in één keer mag maken. */
export const MAX_GENEREER = 500

const nieuweId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `n_${Math.abs(Math.round(Math.sin(Date.now()) * 1e9)).toString(36)}_${Math.round(performance?.now?.() ?? 0)}`

/** Directe kinderen van een knoop (of de wortels bij parentId = null), op volgorde. */
export function kinderen(nodes: LocatieNode[], parentId: string | null): LocatieNode[] {
  return nodes
    .filter(n => (n.parent_id ?? null) === parentId)
    .sort((a, b) => a.volgorde - b.volgorde)
}

/** 0-gebaseerde diepte van een knoop (wortel = 0). */
export function diepteVan(nodes: LocatieNode[], id: string): number {
  let d = 0
  let huidig = nodes.find(n => n.id === id)
  while (huidig?.parent_id) {
    d++
    huidig = nodes.find(n => n.id === huidig!.parent_id)
    if (d > MAX_DIEPTE + 1) break // vangnet tegen kapotte data
  }
  return d
}

/** De knoop zelf plus al zijn nakomelingen. */
export function subtreeIds(nodes: LocatieNode[], id: string): Set<string> {
  const uit = new Set<string>([id])
  let gegroeid = true
  while (gegroeid) {
    gegroeid = false
    for (const n of nodes) {
      if (n.parent_id && uit.has(n.parent_id) && !uit.has(n.id)) {
        uit.add(n.id)
        gegroeid = true
      }
    }
  }
  return uit
}

export interface PlatteKnoop {
  node: LocatieNode
  /** 0-gebaseerde diepte. */
  diepte: number
}

/** Alle knopen in outline-volgorde, met hun diepte. */
export function platteBoom(nodes: LocatieNode[]): PlatteKnoop[] {
  const uit: PlatteKnoop[] = []
  const loop = (parentId: string | null, diepte: number) => {
    kinderen(nodes, parentId).forEach(n => {
      uit.push({ node: n, diepte })
      loop(n.id, diepte + 1)
    })
  }
  loop(null, 0)
  return uit
}

/** Mag er onder deze ouder (null = wortel) nog een niveau bij? */
export function magKindToevoegen(nodes: LocatieNode[], parentId: string | null): boolean {
  if (parentId === null) return true
  return diepteVan(nodes, parentId) + 1 < MAX_DIEPTE
}

/** Voegt één knoop toe onder `parentId` en geeft de nieuwe lijst terug. */
export function voegKnoopToe(nodes: LocatieNode[], parentId: string | null, naam: string): LocatieNode[] {
  if (!magKindToevoegen(nodes, parentId)) return nodes
  const volgorde = kinderen(nodes, parentId).length + 1
  return [...nodes, { id: nieuweId(), parent_id: parentId, naam: naam.trim() || 'Naamloos', volgorde }]
}

/** Voegt meerdere knopen (namen) in één keer toe onder `parentId`. */
export function voegMeerdereToe(nodes: LocatieNode[], parentId: string | null, namen: string[]): LocatieNode[] {
  if (!magKindToevoegen(nodes, parentId)) return nodes
  let volgorde = kinderen(nodes, parentId).length
  const nieuw = namen
    .map(n => n.trim())
    .filter(Boolean)
    .slice(0, MAX_GENEREER)
    .map(naam => ({ id: nieuweId(), parent_id: parentId, naam, volgorde: ++volgorde }))
  return [...nodes, ...nieuw]
}

/** Verwijdert een knoop met al zijn nakomelingen en hernummert de broers/zussen. */
export function verwijderKnoop(nodes: LocatieNode[], id: string): LocatieNode[] {
  const weg = subtreeIds(nodes, id)
  const parentId = nodes.find(n => n.id === id)?.parent_id ?? null
  const rest = nodes.filter(n => !weg.has(n.id))
  return hernummerBroers(rest, parentId)
}

/** Wijzigt de naam van één knoop. */
export function hernoem(nodes: LocatieNode[], id: string, naam: string): LocatieNode[] {
  return nodes.map(n => (n.id === id ? { ...n, naam } : n))
}

/** Verschuift een knoop één plek omhoog/omlaag tussen zijn broers/zussen. */
export function verplaatsBinnenBroers(
  nodes: LocatieNode[],
  id: string,
  richting: 'omhoog' | 'omlaag',
): LocatieNode[] {
  const node = nodes.find(n => n.id === id)
  if (!node) return nodes
  const broers = kinderen(nodes, node.parent_id ?? null)
  const idx = broers.findIndex(n => n.id === id)
  const doelIdx = richting === 'omhoog' ? idx - 1 : idx + 1
  if (doelIdx < 0 || doelIdx >= broers.length) return nodes
  const a = broers[idx]
  const b = broers[doelIdx]
  return nodes.map(n =>
    n.id === a.id ? { ...n, volgorde: b.volgorde } : n.id === b.id ? { ...n, volgorde: a.volgorde } : n,
  )
}

/** Hernummert de volgorde (1..n) van de directe kinderen van één ouder. */
function hernummerBroers(nodes: LocatieNode[], parentId: string | null): LocatieNode[] {
  const broers = kinderen(nodes, parentId)
  const volgorde = new Map(broers.map((n, i) => [n.id, i + 1]))
  return nodes.map(n => (volgorde.has(n.id) ? { ...n, volgorde: volgorde.get(n.id)! } : n))
}

/** Genereert namen uit een getallenreeks (van..tot inclusief, met stap + prefix/suffix). */
export function genereerReeks(opties: {
  van: number
  tot: number
  stap?: number
  prefix?: string
  suffix?: string
}): string[] {
  const { van, tot, prefix = '', suffix = '' } = opties
  const stap = Math.abs(opties.stap || 1) || 1
  if (!Number.isFinite(van) || !Number.isFinite(tot)) return []
  const op = van <= tot
  const uit: string[] = []
  for (let n = van; op ? n <= tot : n >= tot; n += op ? stap : -stap) {
    uit.push(`${prefix}${n}${suffix}`)
    if (uit.length >= MAX_GENEREER) break
  }
  return uit
}

// ── Consumptie in de app (afhankelijke keuzelijsten) ─────────────────────────

/**
 * De zichtbare keuzelijst-rijen voor de cascade: rij 0 = wortels; elke volgende
 * rij = de kinderen van de daarboven gekozen knoop. Stopt zodra een niveau nog
 * niet gekozen is of de gekozen knoop geen kinderen heeft.
 */
export function cascadeRijen(nodes: LocatieNode[], gekozenIds: string[]): { diepte: number; opties: LocatieNode[] }[] {
  const rijen: { diepte: number; opties: LocatieNode[] }[] = []
  let parentId: string | null = null
  for (let d = 0; d < MAX_DIEPTE; d++) {
    const opties = kinderen(nodes, parentId)
    if (opties.length === 0) break
    rijen.push({ diepte: d, opties })
    const gekozenId = gekozenIds[d]
    if (!gekozenId) break
    parentId = gekozenId
  }
  return rijen
}

/**
 * Is de cascade-keuze volledig? Volledig = er is geen keuzelijst meer open.
 *
 * `cascadeRijen` toont per diepte een rij zolang de daarboven gekozen knoop kinderen
 * heeft. Zijn er evenveel rijen als keuzes, dan is de diepste gekozen knoop een blad
 * en is het pad af. Zijn er méér rijen dan keuzes, dan staat er nog een lijst op "—".
 *
 * Nodig omdat een half pad (alleen Blok, geen Zijde/Etage) anders stil wordt opgeslagen
 * en de registratie in rapportages onder "niet ingevuld" belandt.
 */
export function locatieKeuzeCompleet(nodes: LocatieNode[], gekozenIds: string[]): boolean {
  return cascadeRijen(nodes, gekozenIds).length === gekozenIds.filter(Boolean).length
}

/** Bouwt het locatiepad (voor opslag) uit de gekozen knoop-ids per diepte. */
export function bouwLocatiePad(boom: LocatieBoom, gekozenIds: string[]): LocatieWaarde[] {
  const uit: LocatieWaarde[] = []
  gekozenIds.forEach((id, d) => {
    const node = boom.nodes.find(n => n.id === id)
    if (node) uit.push({ naam: (boom.labels[d] ?? '').trim(), waarde: node.naam, node_id: node.id })
  })
  return uit
}

/** Her-hydrateert de gekozen knoop-ids uit een opgeslagen locatiepad. */
export function selectieVanLocatie(nodes: LocatieNode[], locatie: LocatieWaarde[]): string[] {
  const ids: string[] = []
  let parentId: string | null = null
  for (const l of locatie) {
    // Voorkeur: exacte node_id onder de huidige ouder; anders op naam matchen.
    let node = l.node_id ? nodes.find(n => n.id === l.node_id && (n.parent_id ?? null) === parentId) : undefined
    if (!node) node = kinderen(nodes, parentId).find(n => n.naam === l.waarde)
    if (!node) break
    ids.push(node.id)
    parentId = node.id
  }
  return ids
}

/** Splitst geplakte tekst in namen (één per regel of komma-gescheiden). */
export function genereerLijst(tekst: string): string[] {
  return tekst
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Saneert een ruwe boom: trimt namen, gooit knopen weg met een ontbrekende ouder
 * of dieper dan MAX_DIEPTE, hernummert volgorde per ouder en capt de labels op 3.
 * Gedeeld door de service (bij opslaan) zodat kapotte data nooit doorlekt.
 */
export function saneerBoom(ruw: unknown): LocatieBoom {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = (ruw ?? {}) as any
  const labels: string[] = Array.isArray(obj.labels)
    ? obj.labels.slice(0, MAX_DIEPTE).map((l: unknown) => String(l ?? '').trim())
    : []

  const ruweNodes: LocatieNode[] = Array.isArray(obj.nodes)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj.nodes.map((n: any): LocatieNode => ({
        id: String(n?.id ?? ''),
        parent_id: n?.parent_id ? String(n.parent_id) : null,
        naam: String(n?.naam ?? '').trim(),
        volgorde: Number(n?.volgorde) || 0,
      }))
    : []

  // Alleen knopen met een geldig id en (indien gezet) een bestaande ouder houden,
  // en niet dieper dan MAX_DIEPTE.
  const geldigeIds = new Set(ruweNodes.filter(n => n.id && n.naam).map(n => n.id))
  const gehouden = ruweNodes.filter(n => {
    if (!n.id || !n.naam) return false
    if (n.parent_id && !geldigeIds.has(n.parent_id)) return false
    if (diepteVan(ruweNodes, n.id) >= MAX_DIEPTE) return false
    return true
  })

  // Volgorde per ouder hernummeren.
  let genummerd = gehouden
  const ouders = new Set<string | null>(gehouden.map(n => n.parent_id ?? null))
  for (const p of ouders) genummerd = hernummerBroers(genummerd, p)

  return { labels, nodes: genummerd }
}
