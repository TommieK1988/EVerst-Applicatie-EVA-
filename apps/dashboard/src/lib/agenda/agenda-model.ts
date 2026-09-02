import {
  addMonths, endOfMonth, endOfWeek, format, parseISO,
  startOfMonth, startOfWeek, subMonths,
} from 'date-fns'

/**
 * Gedeeld agendamodel voor het mobiele scherm `/m/planning`.
 *
 * Bewust client-veilig: geen `server-only`, geen Supabase-import. Zowel de
 * server-fetch (`lib/agenda/mijn-agenda.ts`) als het client-component
 * (`components/mobiel/planning/*`) leunen hierop, zodat er maar één definitie
 * van "wat is een agenda-item" bestaat.
 */

export type AgendaBron = 'planitem' | 'afwezigheid' | 'bedrijf' | 'taak'

export type AgendaItem = {
  /**
   * Bron-prefix + database-id, bv. `plan:<uuid>`. De prefix is functioneel:
   * bijgeladen maanden overlappen elkaar aan de randen (een maandrooster loopt
   * door in de buurmaand), en dedupe op deze sleutel maakt dat probleem weg.
   */
  id: string
  bron: AgendaBron
  titel: string
  /** Tweede regel op de kaart: klant · dossiernummer, of de opmerking bij verlof. */
  subtitel: string | null
  /** Lokale kalenderdag (yyyy-MM-dd). NOOIT een UTC-slice — zie `dagVanTijdstip`. */
  startDag: string
  /** Lokale kalenderdag, inclusief: een meerdaags item loopt t/m deze dag. */
  eindDag: string
  heleDag: boolean
  /** 'HH:mm', of null bij een hele-dag-item. */
  startTijd: string | null
  eindTijd: string | null
  kleur: string
  /** 'Werk' | 'Verlof' | 'Feestdag' | 'Deadline' | de uursoortnaam. */
  typeLabel: string
  locatie: string | null
  dossierId: string | null
  href: string | null
  detail: string | null
}

/** Volgorde waarin bronnen om een stipje strijden als er meer items dan stippen zijn. */
const BRON_PRIORITEIT: Record<AgendaBron, number> = {
  afwezigheid: 0, planitem: 1, bedrijf: 2, taak: 3,
}

export const MAX_STIPPEN = 3

// ─── Datum-helpers ────────────────────────────────────────────────────────────

/** Datum-only ISO uit een `date`-kolom; die is al lokaal en mag niet door een tz-conversie. */
export const dagVanDatum = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null)

/**
 * Lokale kalenderdag van een timestamptz (`planning_items.start_dt`/`eind_dt`).
 *
 * NIET `slice(0,10)` gebruiken: PostgREST levert UTC, dus 1 juni 00:00 in
 * Nederland komt binnen als `2026-05-31T22:00:00+00:00` en zou dan op 31 mei
 * belanden. `parseISO` rekent wél naar lokale tijd. Dezelfde helper staat in
 * `components/mobiel/dossier-tabs/DetailplanningClient.tsx`.
 *
 * `eindExclusief`: een planitem eindigt op middernacht ván de volgende dag, dus
 * de laatste gewerkte dag is die van (eind − 1 ms). Bij een eindtijd midden op
 * de dag verandert dat niets.
 */
export function dagVanTijdstip(iso: string | null, eindExclusief = false): string | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    return format(new Date(eindExclusief ? d.getTime() - 1 : d.getTime()), 'yyyy-MM-dd')
  } catch { return null }
}

/** Lokale tijd 'HH:mm' van een timestamptz. */
export function tijdVanTijdstip(iso: string | null): string | null {
  if (!iso) return null
  try { return format(parseISO(iso), 'HH:mm') } catch { return null }
}

export const maandSleutel = (d: Date): string => format(d, 'yyyy-MM')
export const dagSleutel = (d: Date): string => format(d, 'yyyy-MM-dd')

/** Maand-Date uit een 'yyyy-MM'-sleutel (dag 1, lokale middernacht). */
export function maandUitSleutel(sleutel: string): Date {
  const [jaar, maand] = sleutel.split('-').map(Number)
  return new Date(jaar, (maand ?? 1) - 1, 1)
}

/**
 * De 42 dagen van een maandrooster: altijd zes volle weken vanaf maandag.
 *
 * Vast op 42 en niet op "zoveel weken als de maand nodig heeft": anders is het
 * grid in de ene maand 5 rijen en in de volgende 6, en verspringt de hele
 * pagina bij elke swipe.
 */
export function maandGridDagen(peil: Date): Date[] {
  const start = startOfWeek(startOfMonth(peil), { weekStartsOn: 1 })
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/** Het datumvenster (inclusief) dat het rooster van één maand bestrijkt. */
export function maandVenster(peil: Date): { van: string; tot: string } {
  const dagen = maandGridDagen(peil)
  return { van: dagSleutel(dagen[0]), tot: dagSleutel(dagen[41]) }
}

/**
 * Startvenster van de pagina: de peilmaand plus de maand ervoor en erna, uitgelijnd
 * op de roosterranden. Zo is één maand terug of vooruit swipen meteen gevuld.
 */
export function startVenster(peil: Date): { van: string; tot: string } {
  return {
    van: dagSleutel(startOfWeek(startOfMonth(subMonths(peil, 1)), { weekStartsOn: 1 })),
    tot: dagSleutel(endOfWeek(endOfMonth(addMonths(peil, 1)), { weekStartsOn: 1 })),
  }
}

// ─── Item-helpers ─────────────────────────────────────────────────────────────

/**
 * Items die op `dag` (yyyy-MM-dd) lopen. Stringvergelijking is hier correct én
 * goedkoop: yyyy-MM-dd sorteert lexicografisch gelijk aan chronologisch. Een
 * meerdaags item (verlof ma t/m vr) is één item dat op elk van die dagen valt.
 */
export function itemsOpDag(items: AgendaItem[], dag: string): AgendaItem[] {
  return items.filter(i => i.startDag <= dag && dag <= i.eindDag)
}

/**
 * Items per kalenderdag. Het maandrooster vraagt 126 dagcellen (drie maanden à 42)
 * op elke render; die één keer indexeren scheelt evenzoveel keer de hele lijst
 * doorlopen. Een meerdaags item komt in elke dag van zijn bereik te staan.
 */
export function indexeerPerDag(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const kaart = new Map<string, AgendaItem[]>()
  for (const item of items) {
    const eind = item.eindDag < item.startDag ? item.startDag : item.eindDag
    const cursor = new Date(`${item.startDag}T12:00:00`)
    // Harde bovengrens: een corrupte einddatum mag geen oneindige lus opleveren.
    for (let i = 0; i < 400; i++) {
      const dag = dagSleutel(cursor)
      if (dag > eind) break
      const rij = kaart.get(dag)
      if (rij) rij.push(item)
      else kaart.set(dag, [item])
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return kaart
}

/** Hele-dag-items bovenaan, daarna op begintijd; gelijk = op titel. */
export function sorteerDagItems(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    if (a.heleDag !== b.heleDag) return a.heleDag ? -1 : 1
    const at = a.startTijd ?? ''
    const bt = b.startTijd ?? ''
    if (at !== bt) return at < bt ? -1 : 1
    return a.titel.localeCompare(b.titel, 'nl')
  })
}

/**
 * Stipkleuren voor één dagcel: gededupliceerd op hexwaarde, want drie werkitems
 * op dezelfde dag zouden anders drie identieke groene stippen geven — dat leest
 * als "druk" terwijl het niets zegt.
 *
 * `rest` telt de kleuren die niet meer passen, zodat de cel een overloop-indicator
 * kan tonen.
 */
export function stipKleuren(items: AgendaItem[]): { kleuren: string[]; rest: number } {
  const gesorteerd = [...items].sort((a, b) => BRON_PRIORITEIT[a.bron] - BRON_PRIORITEIT[b.bron])
  const uniek: string[] = []
  for (const item of gesorteerd) {
    if (!uniek.includes(item.kleur)) uniek.push(item.kleur)
  }
  return { kleuren: uniek.slice(0, MAX_STIPPEN), rest: Math.max(0, uniek.length - MAX_STIPPEN) }
}

/** Dedupe op `id`; items die eerder in de lijst staan winnen. */
export function dedupeItems(items: AgendaItem[]): AgendaItem[] {
  const kaart = new Map<string, AgendaItem>()
  for (const item of items) if (!kaart.has(item.id)) kaart.set(item.id, item)
  return [...kaart.values()]
}

/** Valt er een feestdag op deze dag? Kleurt het dagnummer rood, zoals in iOS. */
export function isFeestdag(items: AgendaItem[]): boolean {
  return items.some(i => i.typeLabel === 'Feestdag')
}
