'use server'

/**
 * Server-acties rond de Bouw7-snapshots: de "Vernieuwen uit Bouw7"-knop.
 *
 * Bewust een apart bestand van `snapshot.ts`. Een `'use server'`-module mag uitsluitend async
 * functies exporteren; `snapshot.ts` exporteert ook `cache()`-waarden en constanten en zou de
 * Next-build laten omvallen (TypeScript merkt dat niet op).
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisSessie } from '@/lib/auth/rechten'
import { ververseDossierBronnen } from './snapshot'
import { WARM_SET, WARM_SET_AFGESLOTEN, type DossierSoort } from './snapshot-bronnen'

export type VernieuwResultaat = {
  ok: boolean
  /** Tijdstip waarop dit klaar was — de standregel toont dit meteen. */
  opgehaaldOp: string | null
  fouten: string[]
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any

/**
 * Haalt de opgegeven Bouw7-bronnen van één dossier opnieuw op.
 *
 * Zonder `soorten` pakt hij de volledige set die bij de fase van het dossier hoort — dat is de
 * dossier-brede knop. Met `soorten` (bv. `SOORTEN_PER_TAB.inkoop`) alleen wat dit tab nodig heeft,
 * zodat de knop boven een tab niet het hele dossier staat te verversen.
 */
export async function vernieuwDossierSnapshots(
  dossierId: string,
  soorten?: DossierSoort[],
): Promise<VernieuwResultaat> {
  await vereisSessie()

  const { data } = await db()
    .from('dossiers')
    .select('hoofdstatus, opdracht_substatus')
    .eq('id', dossierId)
    .maybeSingle()

  const rij = data as { hoofdstatus: string | null; opdracht_substatus: string | null } | null
  if (!rij) return { ok: false, opgehaaldOp: null, fouten: ['Dossier niet gevonden'] }

  const teDoen =
    soorten && soorten.length > 0
      ? soorten
      : rij.hoofdstatus === 'opdracht' && rij.opdracht_substatus === 'financieel_afgesloten'
        ? WARM_SET_AFGESLOTEN
        : (WARM_SET[(rij.hoofdstatus ?? 'aanvraag') as keyof typeof WARM_SET] ?? WARM_SET.aanvraag)

  const r = await ververseDossierBronnen(dossierId, teDoen)

  // Alle dossierroutes waarop deze gegevens getoond worden.
  for (const pad of ['/opdrachten', '/servicedesk', '/offertes', '/aanvragen', '/dossiers']) {
    revalidatePath(`${pad}/${dossierId}`, 'layout')
  }

  return {
    ok: r.gelukt.length > 0 || r.mislukt.length === 0,
    opgehaaldOp: r.gelukt.length > 0 ? new Date().toISOString() : null,
    fouten: r.mislukt.map((m) => `${m.soort}: ${m.fout}`),
  }
}
