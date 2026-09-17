/**
 * Commerciële sturingscijfers: kans-gewogen pijplijn, tijd per fase, conversie per eigenaar en
 * offertes waar niets meer gebeurt.
 *
 * Pure berekeningen — geen database, geen `'use server'`. Het ophalen zit in
 * `lib/dashboard/queries.ts` (`getCommercieCijfers`), zodat dit bestand testbaar blijft.
 *
 * ── WAAROM DIT NAAST DE BESTAANDE FUNNEL STAAT ────────────────────────────────
 * `berekenFunnel` beantwoordt "hoeveel offertes zijn er en hoeveel winnen we?". Dat zijn
 * standen. Hier gaat het om beweging: wat verwachten we wannéér, waar blijft het hangen, en
 * bij wie. Die twee door elkaar heen rekenen zou de funnel onleesbaar maken.
 *
 * ── DE BEDRAGBRON ─────────────────────────────────────────────────────────────
 * Alles hier rekent met `dossiers.bedrag_excl_btw`, net als de rest van het management­scherm.
 * De werklijst op /offertes rekent met `berekenKaartBedrag`, dat ook EVA-offertes, meerwerk en
 * stelposten meeneemt. Die twee kunnen dus verschillen. Dat is een bewuste keuze: binnen één
 * scherm moeten de getallen bij elkaar optellen, en deze blokken staan naast de funnel.
 */

// ── Invoer ───────────────────────────────────────────────────────────────────

export type RapportageDossier = {
  id: string
  titel: string | null
  hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht'
  offerte_substatus: string | null
  bedrag_excl_btw: number | null
  verzonden_op: string | null
}

export type RapportageBewaking = {
  dossier_id: string
  eigenaar_id: string | null
  kans_pct: number | null
  /** Maandprecisie (dag = 1). */
  verwachte_opdracht: string | null
}

export type Fasewissel = {
  dossier_id: string
  van: string | null
  naar: string | null
  op: string
}

export type RapportageInvoer = {
  dossiers: RapportageDossier[]
  bewaking: RapportageBewaking[]
  /** medewerker-id → naam. */
  eigenaarNamen: Record<string, string>
  fasewissels: Fasewissel[]
  /** dossier_id → ISO-tijdstip van de laatste commerciële beweging. */
  laatsteBeweging: Record<string, string>
  /** Peildatum, ISO. */
  nu: string
}

// ── Uitvoer ──────────────────────────────────────────────────────────────────

export type GewogenMaand = { maand: string; gewogen: number; aantal: number }

export type FaseDuur = {
  fase: string
  label: string
  aantal: number
  gemDagen: number
  medDagen: number
}

export type EigenaarRij = {
  naam: string
  offertes: number
  gewonnen: number
  verloren: number
  winrate: number | null
  openAantal: number
  openWaarde: number
  gewogen: number
}

export type StilRij = {
  dossier_id: string
  titel: string
  dagen: number
  bedrag: number | null
}

export type CommercieCijfers = {
  /** Som van alle open offertes (ongewogen), als ijkpunt naast het gewogen bedrag. */
  openWaarde: number
  /** Som van bedrag × kans over open offertes mét kanspercentage. */
  gewogenWaarde: number
  /** Open offertes zonder kanspercentage — die tellen in `gewogenWaarde` voor niets mee. */
  zonderKans: number
  metKans: number
  perMaand: GewogenMaand[]
  perFase: FaseDuur[]
  perEigenaar: EigenaarRij[]
  /** De langst stilstaande offertes, aflopend. Niet de volledige lijst — zie `stilTotaal`. */
  stilstaand: StilRij[]
  /** Hoeveel open offertes er in totaal stilstaan, en voor hoeveel geld. */
  stilTotaal: number
  stilWaarde: number
  /** Totaal aantal open offertes, als noemer bij `stilTotaal`. */
  openAantal: number
  /** Vanaf hoeveel dagen zonder beweging een offerte in `stilstaand` valt. */
  stilstandDrempelDagen: number
}

/** Offertes die hier langer dan dit stilstaan vragen aandacht. */
export const STILSTAND_DAGEN = 14

const FASE_LABELS: Record<string, string> = {
  verzonden: 'Verzonden',
  nabellen: 'Actie',
  in_behandeling: 'Wachten',
  mondelinge_toezegging: 'Mondelinge toezegging',
}

/** Alleen de fases waar een offerte daadwerkelijk in kan blijven hangen. */
const GEMETEN_FASES = Object.keys(FASE_LABELS)

const OFFERTE_DOOD = new Set(['verloren', 'vervallen'])

function isOpenOfferte(d: RapportageDossier): boolean {
  return d.hoofdstatus === 'offerte' && !OFFERTE_DOOD.has(d.offerte_substatus ?? '')
}

function mediaan(getallen: number[]): number {
  if (getallen.length === 0) return 0
  const s = [...getallen].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function dagenTussen(vanISO: string, totISO: string): number {
  return (new Date(totISO).getTime() - new Date(vanISO).getTime()) / 86_400_000
}

const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function maandLabel(iso: string): string {
  const [jaar, maand] = iso.slice(0, 7).split('-').map(Number)
  return `${MAAND_KORT[maand - 1] ?? '?'} ${String(jaar).slice(2)}`
}

// ── De berekening ────────────────────────────────────────────────────────────

export function berekenCommercieCijfers(invoer: RapportageInvoer): CommercieCijfers {
  const bewakingPerDossier = new Map(invoer.bewaking.map(b => [b.dossier_id, b]))
  const open = invoer.dossiers.filter(isOpenOfferte)

  // ── 1. Kans-gewogen pijplijn ──────────────────────────────────────────────
  let openWaarde = 0
  let gewogenWaarde = 0
  let metKans = 0
  const maanden = new Map<string, { gewogen: number; aantal: number }>()

  for (const d of open) {
    const bedrag = d.bedrag_excl_btw ?? 0
    openWaarde += bedrag
    const b = bewakingPerDossier.get(d.id)
    if (b?.kans_pct == null) continue

    metKans++
    const gewogen = bedrag * (b.kans_pct / 100)
    gewogenWaarde += gewogen

    // Zonder verwachte maand telt de kans wél mee in het totaal, maar is hij niet in de tijd
    // te plaatsen. Hem op "deze maand" gokken zou de prognose optisch vullen met werk dat
    // misschien pas volgend jaar komt.
    if (b.verwachte_opdracht) {
      const sleutel = b.verwachte_opdracht.slice(0, 7)
      const m = maanden.get(sleutel) ?? { gewogen: 0, aantal: 0 }
      m.gewogen += gewogen
      m.aantal += 1
      maanden.set(sleutel, m)
    }
  }

  const perMaand: GewogenMaand[] = [...maanden.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([sleutel, m]) => ({ maand: maandLabel(`${sleutel}-01`), gewogen: m.gewogen, aantal: m.aantal }))

  // ── 2. Tijd per fase ──────────────────────────────────────────────────────
  // Per dossier de offertefase-overgangen op volgorde lopen. De tijd in een fase is het gat
  // tussen binnenkomen en de volgende overgang. Een fase waar een offerte nú nog in zit telt
  // niet mee: die duur staat nog niet vast, en meetellen zou het gemiddelde structureel
  // omlaag trekken naarmate je vaker kijkt.
  const perDossier = new Map<string, Fasewissel[]>()
  for (const w of invoer.fasewissels) {
    const lijst = perDossier.get(w.dossier_id) ?? []
    lijst.push(w)
    perDossier.set(w.dossier_id, lijst)
  }

  const duurPerFase = new Map<string, number[]>()
  for (const wissels of perDossier.values()) {
    const gesorteerd = [...wissels].sort((a, b) => (a.op < b.op ? -1 : 1))
    for (let i = 0; i < gesorteerd.length - 1; i++) {
      const fase = gesorteerd[i].naar
      if (!fase || !GEMETEN_FASES.includes(fase)) continue
      const dagen = dagenTussen(gesorteerd[i].op, gesorteerd[i + 1].op)
      if (dagen < 0) continue
      const lijst = duurPerFase.get(fase) ?? []
      lijst.push(dagen)
      duurPerFase.set(fase, lijst)
    }
  }

  const perFase: FaseDuur[] = GEMETEN_FASES
    .map(fase => {
      const d = duurPerFase.get(fase) ?? []
      return {
        fase,
        label: FASE_LABELS[fase] ?? fase,
        aantal: d.length,
        gemDagen: d.length ? d.reduce((t, x) => t + x, 0) / d.length : 0,
        medDagen: mediaan(d),
      }
    })
    .filter(r => r.aantal > 0)

  // ── 3. Conversie per commercieel eigenaar ─────────────────────────────────
  type Emmer = { offertes: number; gewonnen: number; verloren: number; openAantal: number; openWaarde: number; gewogen: number }
  const perEigenaarMap = new Map<string, Emmer>()

  for (const d of invoer.dossiers) {
    const b = bewakingPerDossier.get(d.id)
    if (!b?.eigenaar_id) continue
    const naam = invoer.eigenaarNamen[b.eigenaar_id] ?? 'Onbekend'
    const e = perEigenaarMap.get(naam)
      ?? { offertes: 0, gewonnen: 0, verloren: 0, openAantal: 0, openWaarde: 0, gewogen: 0 }

    e.offertes++
    if (d.hoofdstatus === 'opdracht') e.gewonnen++
    else if (OFFERTE_DOOD.has(d.offerte_substatus ?? '')) e.verloren++
    else if (d.hoofdstatus === 'offerte') {
      e.openAantal++
      e.openWaarde += d.bedrag_excl_btw ?? 0
      if (b.kans_pct != null) e.gewogen += (d.bedrag_excl_btw ?? 0) * (b.kans_pct / 100)
    }
    perEigenaarMap.set(naam, e)
  }

  const perEigenaar: EigenaarRij[] = [...perEigenaarMap.entries()]
    .map(([naam, e]) => ({
      naam,
      ...e,
      // Alleen over besliste trajecten: open offertes zijn nog geen uitkomst.
      winrate: e.gewonnen + e.verloren > 0
        ? (e.gewonnen / (e.gewonnen + e.verloren)) * 100
        : null,
    }))
    .sort((a, b) => b.openWaarde - a.openWaarde)

  // ── 4. Offertes zonder beweging ───────────────────────────────────────────
  const stilstaand: StilRij[] = open
    .map(d => {
      const laatste = invoer.laatsteBeweging[d.id] ?? d.verzonden_op
      if (!laatste) return null
      const dagen = Math.floor(dagenTussen(laatste, invoer.nu))
      if (dagen < STILSTAND_DAGEN) return null
      return {
        dossier_id: d.id,
        titel: d.titel ?? 'Zonder titel',
        dagen,
        bedrag: d.bedrag_excl_btw,
      }
    })
    .filter((r): r is StilRij => r !== null)
    .sort((a, b) => b.dagen - a.dagen)

  return {
    openWaarde,
    gewogenWaarde,
    zonderKans: open.length - metKans,
    metKans,
    perMaand,
    perFase,
    perEigenaar,
    // Alleen de kop van de lijst: bij een achterstand van honderden offertes is een volledige
    // opsomming geen werklijst meer. Het kengetal eronder draagt de omvang.
    stilstaand: stilstaand.slice(0, 20),
    stilTotaal: stilstaand.length,
    stilWaarde: stilstaand.reduce((t, r) => t + (r.bedrag ?? 0), 0),
    openAantal: open.length,
    stilstandDrempelDagen: STILSTAND_DAGEN,
  }
}
