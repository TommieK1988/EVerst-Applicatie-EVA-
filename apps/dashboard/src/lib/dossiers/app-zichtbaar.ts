import 'server-only'

/**
 * Het "In app"-vinkje van een dossierbestand wegschrijven.
 *
 * `server-only` en niet in `bestanden.ts`: dat is een 'use server'-bestand, en elke export daar is
 * een publiek aanroepbaar endpoint. Deze functie controleert zelf geen sessie — de aanroeper doet
 * dat (het vinkje in de Bestanden-tab, of het opnamedocument dat zichzelf vrijgeeft).
 *
 * Sleutel zoals `BestandRij.sleutel`: `bouw7:<id>` of `sharepoint:<itemId>`.
 */
export async function zetAppZichtbaar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: {
    dossierId: string
    sleutel: string
    bouw7Id?: number | null
    zichtbaar: boolean
    medewerkerId: string | null
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('dossier_bestand_app_zichtbaar')
    .upsert({
      dossier_id: args.dossierId,
      sleutel: args.sleutel,
      // Verouderd, maar blijft gevuld zolang de kolom bestaat: de vorige build leest
      // hem nog. Zie migratie 20260921a.
      bouw7_bestand_id: args.bouw7Id ?? null,
      zichtbaar: args.zichtbaar,
      gewijzigd_op: new Date().toISOString(),
      gewijzigd_door: args.medewerkerId,
    }, { onConflict: 'dossier_id,sleutel' })

  return error ? { ok: false, error: error.message } : { ok: true }
}
