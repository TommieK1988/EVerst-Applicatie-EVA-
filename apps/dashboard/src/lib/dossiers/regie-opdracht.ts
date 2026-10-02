import 'server-only'

/**
 * dossiers/regie-opdracht.ts
 *
 * Een **regieopdracht** is een gewone opdracht (geen servicedeskbon) die op nacalculatie afrekent
 * in plaats van tegen een aanneemsom. Komt weinig voor, maar het gebeurt. Of een dossier dat is,
 * beslist `opRegie()` in `components/dossiers/types.ts`; aanzetten gaat via de schakelaar op de
 * Verkoop-tab (`afrekenwijze.ts`) of via de mailintake.
 *
 * Wat anders is dan op een regiebon: een opdracht heeft meestal een werkbegroting met meerdere
 * bewakingscodes, en de planning en de uren lopen op die codes. Daarom wordt er niet op één
 * opvangcode (RW01) afgerekend, maar op **elke bewakingscode waarop geboekt is**. Er is geen
 * aanneemsom waar dat werk al in zit, dus er valt ook niets dubbel te factureren.
 */

import { createAdminClient } from '@everts/database/server'
import { isCorrectieCode, isServicedeskDossier, opRegie } from '@/components/dossiers/types'
import type { FactureerbareCode } from './facturatie-codes'

export const AFREKENWIJZE_VELDEN =
  'facturatiemethode, facturatiemethode_handmatig, bouw7_categorie_naam, servicedesk_substatus'

/** Een regieopdracht: op regie, en géén servicedeskbon (die heeft zijn eigen opvangcode). */
export function isRegieOpdrachtRij(d: {
  facturatiemethode?: string | null
  facturatiemethode_handmatig?: boolean | null
  bouw7_categorie_naam?: string | null
  servicedesk_substatus?: string | null
} | null | undefined): boolean {
  if (!d) return false
  const servicedesk = isServicedeskDossier(d) || d.servicedesk_substatus != null
  return !servicedesk && opRegie(d)
}

export async function isRegieOpdracht(dossierId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('dossiers')
    .select(AFREKENWIJZE_VELDEN)
    .eq('id', dossierId)
    .maybeSingle()
  return isRegieOpdrachtRij(data as Parameters<typeof isRegieOpdrachtRij>[0])
}

/**
 * Vult de factureerbare codes van een regieopdracht aan met elke bewakingscode waarop geboekt is.
 *
 * De codes die er al stonden (meerwerk, stelposten) houden hun eigen herkomst; alles wat erbij
 * komt is `bron: 'regie'`, want dat ís het regiewerk. De correctiecode blijft erbuiten: daar wordt
 * nooit op geboekt, het is een bijstelling van de prognose.
 */
export function metGeboekteCodes(
  codes: FactureerbareCode[],
  geboekt: (string | null | undefined)[],
): FactureerbareCode[] {
  const gezien = new Set(codes.map(c => c.bewakingscode))
  const erbij: FactureerbareCode[] = []
  for (const ruw of geboekt) {
    const code = (ruw ?? '').trim()
    if (!code || gezien.has(code) || isCorrectieCode(code)) continue
    gezien.add(code)
    erbij.push({
      bewakingscode: code,
      bron: 'regie',
      bronId: code,
      omschrijving: code,
      alleenVerschil: false,
      opslagPct: null,
      // Er is op geboekt, dus hij staat in Bouw7.
      inBouw7: true,
      mandaat: null,
    })
  }
  erbij.sort((a, b) => a.bewakingscode.localeCompare(b.bewakingscode, 'nl'))
  return [...erbij, ...codes]
}
