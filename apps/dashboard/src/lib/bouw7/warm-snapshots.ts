/**
 * De snapshot-warmer: vult `bouw7_snapshots` zodat de schermen niets meer live hoeven op te halen.
 *
 * Draait vanuit /api/cron/bouw7-snapshots, kort ná de reguliere Bouw7-sync. Werkt met een
 * tijdsbudget in plaats van een vaste lijst: hij begint bij de oudste snapshots, werkt door tot
 * het budget op is, en pakt de volgende run vanzelf de rest — de sortering op `opgehaald_op` is
 * de wachtrij, dus een aparte cursor is niet nodig.
 *
 * Verdeling van het werk: alleen opdrachten hebben de zware tabs (bewaking, inkoop, uren). Voor
 * aanvragen en offertes — samen 552 van de 676 dossiers — halen we alleen de financiële kerncijfers
 * en de bestandenlijst op. Zonder dat onderscheid zou één ronde niet binnen het budget passen.
 */
import 'server-only'

import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { getBouw7ClientOfNull } from './config'
import { logSync } from './sync'
import { ververseDossierBronnen, ververseGlobaleBron } from './snapshot'
import {
  GLOBALE_BRONNEN,
  warmSetVoor,
  type DossierSoort,
  type GlobaleSoort,
} from './snapshot-bronnen'

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any

/**
 * Hoeveel tijd de warmer zichzelf gunt. De route mag 300 s; we stoppen ruim daarvoor met nieuwe
 * dossiers zodat lopend werk nog netjes afrondt en het antwoord geschreven kan worden.
 */
const DEADLINE_MS = 240_000

/** Dossiers die tegelijk verwerkt worden; elk dossier haalt zijn eigen bronnen met 4 tegelijk. */
const DOSSIERS_PARALLEL = 2

export type WarmModus = 'alles' | 'dossiers' | 'overig'

export type WarmResultaat = {
  modus: WarmModus
  globaal: { gelukt: GlobaleSoort[]; mislukt: Array<{ soort: GlobaleSoort; fout: string }> }
  dossiersVolledig: number
  dossiersGedeeltelijk: number
  bronnenGelukt: number
  bronnenMislukt: number
  resterend: number
  duurMs: number
}

type DossierRij = {
  id: string
  bouw7_id: string | null
  hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht' | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  /** Bronnen die ooit zijn opgehaald; ingevuld door `dossiersOpVolgorde`. */
  aanwezig: Set<DossierSoort>
}

/**
 * Dossiers op volgorde van behoefte: eerst wie een bron uit zijn warmset nog nooit heeft gehad,
 * daarna wie het langst geleden is bijgewerkt. Het eerste criterium maakt dat een uitbreiding van
 * de warmset (zoals de servicedeskbonnen in sept 2026) zichzelf bijvult, ook als dat niet in één
 * ronde past.
 *
 * Beide queries gaan door `haalAlleRijen`: 676 dossiers passen nog net onder de PostgREST-grens
 * van 1000, maar hun snapshots (tot ~12 per opdracht) lopen daar ver overheen. Een stille
 * afkapping zou betekenen dat een deel van de dossiers nooit meer aan de beurt komt.
 */
async function dossiersOpVolgorde(): Promise<DossierRij[]> {
  const dossiers = await haalAlleRijen<Omit<DossierRij, 'aanwezig'>>((van, tot) =>
    db()
      .from('dossiers')
      .select('id, bouw7_id, hoofdstatus, opdracht_substatus, servicedesk_substatus')
      .not('bouw7_id', 'is', null)
      .order('id')
      .range(van, tot),
  )

  const snapshots = await haalAlleRijen<{
    dossier_id: string | null
    soort: DossierSoort
    opgehaald_op: string | null
  }>(
    (van, tot) =>
      db()
        .from('bouw7_snapshots')
        .select('dossier_id, soort, opgehaald_op')
        .not('dossier_id', 'is', null)
        .order('sleutel')
        .range(van, tot),
  )

  // Per dossier: welke bronnen ooit geslaagd zijn opgehaald, en de oudste daarvan. Een bron die
  // alleen een fout heeft opgeleverd telt als ontbrekend, zodat hij de volgende ronde weer vooraan
  // staat.
  const oudste = new Map<string, string>()
  const aanwezig = new Map<string, Set<DossierSoort>>()
  for (const s of snapshots) {
    if (!s.dossier_id || !s.opgehaald_op) continue
    let set = aanwezig.get(s.dossier_id)
    if (!set) aanwezig.set(s.dossier_id, (set = new Set()))
    set.add(s.soort)
    const huidig = oudste.get(s.dossier_id)
    if (!huidig || s.opgehaald_op < huidig) oudste.set(s.dossier_id, s.opgehaald_op)
  }

  const rijen: DossierRij[] = dossiers.map((d) => ({ ...d, aanwezig: aanwezig.get(d.id) ?? new Set() }))
  const mist = new Set(
    rijen.filter((d) => warmSetVoor(d, d.aanwezig).some((s) => !d.aanwezig.has(s))).map((d) => d.id),
  )

  return rijen.sort((a, b) => {
    const aMist = mist.has(a.id)
    const bMist = mist.has(b.id)
    if (aMist !== bMist) return aMist ? -1 : 1
    const aOud = oudste.get(a.id) ?? ''
    const bOud = oudste.get(b.id) ?? ''
    return aOud.localeCompare(bOud)
  })
}

/**
 * Warmt de snapshots. `modus` bestaat zodat het werk gesplitst kan worden zodra het niet meer in
 * één venster past: 'dossiers' doet alleen de per-dossier bronnen, 'overig' alleen de
 * bedrijfsbrede (uren, stamdata).
 */
export async function warmSnapshots(modus: WarmModus = 'alles'): Promise<WarmResultaat> {
  const start = Date.now()
  const uit: WarmResultaat = {
    modus,
    globaal: { gelukt: [], mislukt: [] },
    dossiersVolledig: 0,
    dossiersGedeeltelijk: 0,
    bronnenGelukt: 0,
    bronnenMislukt: 0,
    resterend: 0,
    duurMs: 0,
  }

  // Eén client voor de hele ronde: de token-cache scheelt anders een login per call.
  const client = await getBouw7ClientOfNull()
  if (!client) {
    uit.duurMs = Date.now() - start
    await logSync('bouw7_snapshots', 'in', {
      nieuw: 0, bijgewerkt: 0, fouten: 1, foutMelding: 'Bouw7 niet geconfigureerd',
    }, uit.duurMs)
    return uit
  }

  // 1. Bedrijfsbrede bronnen. Klein (vijf calls) en overal nodig, dus altijd eerst.
  if (modus !== 'dossiers') {
    for (const soort of Object.keys(GLOBALE_BRONNEN) as GlobaleSoort[]) {
      const r = await ververseGlobaleBron(soort, { client })
      if (r.ok) uit.globaal.gelukt.push(soort)
      else uit.globaal.mislukt.push({ soort, fout: r.fout ?? 'onbekend' })
    }
  }

  // 2. Dossiers, oudste eerst, tot het budget op is.
  if (modus !== 'overig') {
    const dossiers = await dossiersOpVolgorde()
    let volgende = 0
    let gestopt = false

    const werker = async (): Promise<void> => {
      for (;;) {
        if (Date.now() - start > DEADLINE_MS) { gestopt = true; return }
        const i = volgende++
        if (i >= dossiers.length) return

        const d = dossiers[i]
        const soorten = warmSetVoor(d, d.aanwezig)
        const r = await ververseDossierBronnen(d.id, soorten, {
          client,
          bouw7Id: d.bouw7_id ?? undefined,
        })
        uit.bronnenGelukt += r.gelukt.length
        uit.bronnenMislukt += r.mislukt.length
        if (r.mislukt.length === 0) uit.dossiersVolledig++
        else uit.dossiersGedeeltelijk++
      }
    }

    await Promise.all(Array.from({ length: DOSSIERS_PARALLEL }, werker))
    uit.resterend = gestopt ? Math.max(0, dossiers.length - volgende + DOSSIERS_PARALLEL) : 0
  }

  uit.duurMs = Date.now() - start
  await logSync(
    'bouw7_snapshots',
    'in',
    {
      nieuw: 0,
      bijgewerkt: uit.bronnenGelukt,
      fouten: uit.bronnenMislukt + uit.globaal.mislukt.length,
      foutMelding:
        `${uit.dossiersVolledig} dossiers volledig, ${uit.dossiersGedeeltelijk} gedeeltelijk, ` +
        `${uit.resterend} resterend (${modus})`,
    },
    uit.duurMs,
  )
  return uit
}
