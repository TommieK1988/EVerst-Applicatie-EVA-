import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * De admin-client voor de materieel-module, op één plek.
 *
 * WAAROM EEN CAST: de materieel-tabellen staan niet in de gegenereerde
 * `database.types.ts`. Die volgt het Bouw7-deel van het schema en wordt bewust
 * niet opnieuw gegenereerd zolang daar werk-in-uitvoering op ligt. Zonder cast
 * kent `.from('materieel_objecten')` dus geen enkele kolom en faalt elke query
 * op het type — niet omdat de query fout is, maar omdat de typen achterlopen.
 *
 * WAAROM HIER EN NIET PER BESTAND: vóór dit bestand stond exact dezelfde regel
 * bovenaan elk materieelbestand apart. Dat is dezelfde schuld, acht keer
 * betaald. Eén plek betekent dat de dag waarop de typen wél kloppen één regel
 * kost in plaats van een zoektocht.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = () => createAdminClient() as any
