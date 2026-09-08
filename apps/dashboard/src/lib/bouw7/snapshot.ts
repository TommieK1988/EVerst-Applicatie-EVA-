/**
 * Lezen en bijwerken van de Bouw7-snapshots.
 *
 * De afspraak in één zin: **een schermbezoek doet nooit een Bouw7-call.** Schermen lezen hier,
 * en hier staat wat de cron (of de gebruiker met de Vernieuwen-knop, of een schrijfactie) er het
 * laatst in heeft gezet. Ontbreekt een snapshot, dan tonen we dat eerlijk in plaats van stilletjes
 * alsnog Bouw7 te bevragen — precies dat "één keertje live" is hoe de traagheid ontstond.
 *
 * Bewust géén functie die kan kiezen tussen lezen en live ophalen: `leesDossierBron` leest alleen,
 * `ververseDossierBronnen` haalt alleen op. Wie ophaalt, weet dus dat hij dat doet.
 *
 * LET OP: dit bestand is géén `'use server'`-module. Het exporteert `cache()`-waarden en
 * constanten, en dat mag daar niet — de Next-build valt er over (tsc niet).
 */
import 'server-only'

import { cache } from 'react'
import { after } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { getBouw7ClientOfNull } from './config'
import type { Bouw7Client } from './client'
import {
  DOSSIER_BRONNEN,
  GLOBALE_BRONNEN,
  type DossierSoort,
  type GlobaleSoort,
} from './snapshot-bronnen'

/* ── Vorm van een stand ───────────────────────────────────────────── */

export type SnapshotBron =
  /** Bruikbare stand uit de snapshot. */
  | 'snapshot'
  /** Nooit opgehaald (of leeggelopen) — het scherm hoort "nog niet opgehaald" te tonen. */
  | 'ontbreekt'
  /** Er staat een stand, maar de laatste poging om te verversen mislukte. */
  | 'fout'

export type SnapshotStand<T> = {
  data: T | null
  /** ISO-tijdstip van de laatste geslaagde ophaal. */
  opgehaaldOp: string | null
  bron: SnapshotBron
  fout: string | null
}

/** Samenvatting over meerdere bronnen — wat de standregel boven een tab laat zien. */
export type Bouw7Stand = {
  /** De oudste van de betrokken bronnen; dat is de eerlijke leeftijd van het scherm. */
  opgehaaldOp: string | null
  /** Bronnen die nog nooit zijn opgehaald. Niet leeg = het scherm is onvolledig. */
  ontbreekt: DossierSoort[]
  fout: string | null
}

export const LEGE_STAND: Bouw7Stand = { opgehaaldOp: null, ontbreekt: [], fout: null }

/* ── Sleutels ─────────────────────────────────────────────────────── */

export function dossierSleutel(dossierId: string, soort: DossierSoort): string {
  return `dossier:${dossierId}:${soort}`
}

/* ── Lezen ────────────────────────────────────────────────────────── */

type SnapshotRij = {
  payload: unknown
  opgehaald_op: string | null
  fout: string | null
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any

export async function leesSnapshot<T>(sleutel: string): Promise<SnapshotStand<T>> {
  const { data } = await db()
    .from('bouw7_snapshots')
    .select('payload, opgehaald_op, fout')
    .eq('sleutel', sleutel)
    .maybeSingle()

  const rij = data as SnapshotRij | null
  if (!rij || rij.opgehaald_op == null || rij.payload == null) {
    return { data: null, opgehaaldOp: null, bron: 'ontbreekt', fout: rij?.fout ?? null }
  }
  return {
    data: rij.payload as T,
    opgehaaldOp: rij.opgehaald_op,
    bron: rij.fout ? 'fout' : 'snapshot',
    fout: rij.fout,
  }
}

/**
 * Eén bron van één dossier. `cache()` dedupliceert binnen dezelfde render: het Financieel-tab
 * vraagt de bewaking twee keer op (twee blokken) en de servicedesk vraagt inkoop twee keer —
 * dat wordt zo één databasebevraging in plaats van twee.
 */
export const leesDossierBron = cache(
  async <T>(dossierId: string, soort: DossierSoort): Promise<SnapshotStand<T>> =>
    leesSnapshot<T>(dossierSleutel(dossierId, soort)),
)

export const leesGlobaleBron = cache(
  async <T>(soort: GlobaleSoort): Promise<SnapshotStand<T>> =>
    leesSnapshot<T>(GLOBALE_BRONNEN[soort].sleutel),
)

/** Het Bouw7-projectnummer van een dossier; ook per render gecachet. */
export const dossierBouw7Id = cache(async (dossierId: string): Promise<string | null> => {
  const { data } = await db().from('dossiers').select('bouw7_id').eq('id', dossierId).maybeSingle()
  const id = (data as { bouw7_id: string | null } | null)?.bouw7_id
  return id ? String(id) : null
})

/**
 * De gezamenlijke stand van een aantal bronnen. Oudste tijdstip wint: een tab is zo vers als zijn
 * meest verouderde bron, en dat is wat de gebruiker moet zien.
 */
export function combineerStand(
  standen: Array<{ soort: DossierSoort; stand: SnapshotStand<unknown> }>,
): Bouw7Stand {
  let oudste: string | null = null
  const ontbreekt: DossierSoort[] = []
  let fout: string | null = null

  for (const { soort, stand } of standen) {
    if (stand.bron === 'ontbreekt') { ontbreekt.push(soort); continue }
    if (stand.opgehaaldOp && (oudste == null || stand.opgehaaldOp < oudste)) oudste = stand.opgehaaldOp
    if (stand.fout && !fout) fout = stand.fout
  }
  return { opgehaaldOp: oudste, ontbreekt, fout }
}

/** Leest meerdere bronnen tegelijk en geeft naast de data ook de gecombineerde stand terug. */
export async function leesDossierBronnen(
  dossierId: string,
  soorten: readonly DossierSoort[],
): Promise<{ standen: Map<DossierSoort, SnapshotStand<unknown>>; stand: Bouw7Stand }> {
  const resultaten = await Promise.all(
    soorten.map(async (soort) => ({ soort, stand: await leesDossierBron<unknown>(dossierId, soort) })),
  )
  return {
    standen: new Map(resultaten.map((r) => [r.soort, r.stand])),
    stand: combineerStand(resultaten),
  }
}

/* ── Schrijven ────────────────────────────────────────────────────── */

export async function bewaarSnapshot(
  sleutel: string,
  opts: { dossierId?: string | null; soort: string; payload: unknown; duurMs?: number },
): Promise<void> {
  await db().from('bouw7_snapshots').upsert(
    {
      sleutel,
      dossier_id: opts.dossierId ?? null,
      soort: opts.soort,
      payload: opts.payload as never,
      opgehaald_op: new Date().toISOString(),
      duur_ms: opts.duurMs ?? null,
      // Gelukt = de vorige fout is niet meer waar.
      fout: null,
      fout_op: null,
    },
    { onConflict: 'sleutel' },
  )
}

/**
 * Een mislukte ophaal vastleggen zónder de bestaande payload weg te gooien. Een stand van
 * gisteren mét de melding "laatste poging mislukt" is bruikbaarder dan een leeg scherm.
 */
export async function bewaarSnapshotFout(
  sleutel: string,
  opts: { dossierId?: string | null; soort: string; fout: string },
): Promise<void> {
  const bestaat = await db().from('bouw7_snapshots').select('sleutel').eq('sleutel', sleutel).maybeSingle()
  const foutVeld = { fout: opts.fout.slice(0, 500), fout_op: new Date().toISOString() }

  if (bestaat.data) {
    await db().from('bouw7_snapshots').update(foutVeld).eq('sleutel', sleutel)
    return
  }
  await db().from('bouw7_snapshots').insert({
    sleutel,
    dossier_id: opts.dossierId ?? null,
    soort: opts.soort,
    payload: null,
    opgehaald_op: null,
    ...foutVeld,
  })
}

/* ── Verversen (de enige plek die Bouw7 leest) ────────────────────── */

/**
 * Voert `taken` uit met hooguit `max` tegelijk. Bouw7 is de traagste schakel en zijn limieten
 * kennen we niet; vier gelijktijdige calls is snel genoeg zonder de API te overvragen.
 */
async function metBeperking<T>(taken: Array<() => Promise<T>>, max: number): Promise<T[]> {
  const uit: T[] = new Array(taken.length)
  let volgende = 0

  async function werker(): Promise<void> {
    for (;;) {
      const i = volgende++
      if (i >= taken.length) return
      uit[i] = await taken[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(max, taken.length) }, werker))
  return uit
}

export type VerversResultaat = {
  gelukt: DossierSoort[]
  mislukt: Array<{ soort: DossierSoort; fout: string }>
}

/**
 * Haalt de opgegeven bronnen van één dossier live op en legt ze vast. Dit is het enige pad
 * waarlangs EVA nog Bouw7 leest voor scherm-data: de cron, de Vernieuwen-knop en de
 * schrijfacties komen hier alle drie uit.
 */
export async function ververseDossierBronnen(
  dossierId: string,
  soorten: readonly DossierSoort[],
  opts: { client?: Bouw7Client; bouw7Id?: string; concurrency?: number } = {},
): Promise<VerversResultaat> {
  const uit: VerversResultaat = { gelukt: [], mislukt: [] }
  if (soorten.length === 0) return uit

  const bouw7Id = opts.bouw7Id ?? (await dossierBouw7Id(dossierId))
  if (!bouw7Id) {
    return { gelukt: [], mislukt: soorten.map((s) => ({ soort: s, fout: 'geen Bouw7-koppeling' })) }
  }
  const client = opts.client ?? (await getBouw7ClientOfNull())
  if (!client) {
    return { gelukt: [], mislukt: soorten.map((s) => ({ soort: s, fout: 'Bouw7 niet geconfigureerd' })) }
  }

  await metBeperking(
    soorten.map((soort) => async () => {
      const sleutel = dossierSleutel(dossierId, soort)
      const start = Date.now()
      try {
        const payload = await DOSSIER_BRONNEN[soort](client, bouw7Id)
        await bewaarSnapshot(sleutel, { dossierId, soort, payload, duurMs: Date.now() - start })
        uit.gelukt.push(soort)
      } catch (e) {
        const fout = e instanceof Error ? e.message : String(e)
        await bewaarSnapshotFout(sleutel, { dossierId, soort, fout }).catch(() => {})
        uit.mislukt.push({ soort, fout })
      }
    }),
    opts.concurrency ?? 4,
  )
  return uit
}

export async function ververseGlobaleBron(
  soort: GlobaleSoort,
  opts: { client?: Bouw7Client } = {},
): Promise<{ ok: boolean; fout?: string }> {
  const bron = GLOBALE_BRONNEN[soort]
  const client = opts.client ?? (await getBouw7ClientOfNull())
  if (!client) return { ok: false, fout: 'Bouw7 niet geconfigureerd' }

  const start = Date.now()
  try {
    const payload = await bron.laad(client)
    await bewaarSnapshot(bron.sleutel, { soort, payload, duurMs: Date.now() - start })
    return { ok: true }
  } catch (e) {
    const fout = e instanceof Error ? e.message : String(e)
    await bewaarSnapshotFout(bron.sleutel, { soort, fout }).catch(() => {})
    return { ok: false, fout }
  }
}

/**
 * Stamdata voor schrijfacties: uit de snapshot als die vers genoeg is, anders live ophalen en
 * meteen vastleggen.
 *
 * Hier mág live wél. Het gaat om één kleine call, en een schrijfactie die op een verouderde
 * status-id draait schrijft de verkeerde waarde naar Bouw7 — dat is erger dan 300 ms wachten.
 */
export async function leesStam<T>(soort: GlobaleSoort, client?: Bouw7Client): Promise<T | null> {
  const bron = GLOBALE_BRONNEN[soort]
  const stand = await leesSnapshot<T>(bron.sleutel)
  if (stand.data != null && stand.opgehaaldOp != null) {
    const leeftijd = Date.now() - new Date(stand.opgehaaldOp).getTime()
    if (leeftijd < bron.maxLeeftijdMs) return stand.data
  }

  const c = client ?? (await getBouw7ClientOfNull())
  if (!c) return stand.data
  try {
    const payload = await bron.laad(c)
    await bewaarSnapshot(bron.sleutel, { soort, payload })
    return payload as T
  } catch {
    // Verse ophaal mislukt: liever de oude stand dan niets.
    return stand.data
  }
}

/* ── Na een schrijfactie ──────────────────────────────────────────── */

/**
 * Werkt de snapshots bij nadat EVA iets in Bouw7 heeft gewijzigd.
 *
 * `direct` wordt afgewacht: dat zijn de bronnen die het scherm toont waar de gebruiker nu naar
 * kijkt, en die moeten kloppen zodra de pagina zich ververst. `achteraf` loopt via `after()` door
 * nadat het antwoord al verstuurd is — de gebruiker wacht daar niet op.
 *
 * Faalt nooit: een mislukte verversing mag een geslaagde schrijfactie niet alsnog laten stranden.
 */
export async function ververSnapshotsNaSchrijven(
  dossierId: string,
  direct: readonly DossierSoort[],
  achteraf: readonly DossierSoort[] = [],
): Promise<void> {
  if (direct.length > 0) {
    await ververseDossierBronnen(dossierId, direct).catch(() => {})
  }
  if (achteraf.length > 0) {
    try {
      after(async () => {
        await ververseDossierBronnen(dossierId, achteraf).catch(() => {})
      })
    } catch {
      // Buiten een request-context (bv. vanuit de cron) bestaat `after` niet; daar is de
      // scheiding tussen direct en achteraf toch zinloos.
    }
  }
}
