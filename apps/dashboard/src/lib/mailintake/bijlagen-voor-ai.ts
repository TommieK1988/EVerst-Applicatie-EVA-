import 'server-only'

/**
 * mailintake/bijlagen-voor-ai.ts
 *
 * Welke bijlagen gaan mee naar het model, en wat gaat er verloren.
 *
 * Staat los van `verwerken.ts` omdat dat bestand tegen de 800 regels aanloopt (zie
 * de schuldteller en DEVELOPMENT_STANDARDS 2.1), en omdat dit een afgerond stukje
 * werk is: van bijlagerijen naar bytes, met de zeef ertussen.
 *
 * Niet te verwarren met `bijlagen-filter.ts`. Dat bestand beslist per bestand of het
 * een projectstuk is of mailopmaak; dit bestand haalt de stukken op die daar
 * doorkomen en meldt wat er niet gelezen kon worden.
 */

import { createAdminClient } from '@everts/database/server'

import { beoordeelBijlage } from './bijlagen-filter'
import type { BijlageVoorAI } from './extractie'

/**
 * De bijlagen van één of meer berichten, klaar om mee te sturen.
 *
 * Meer dan één, want mails over dezelfde klus horen als geheel gelezen te worden:
 * de bon zit vaak in een ander bericht dan de afspraak erover. Een dubbele bijlage
 * (dezelfde bon twee keer doorgestuurd) gaat er één keer in -- ontdubbeld op
 * `sha256`, want twee keer hetzelfde bestand meesturen kost geld en helpt niets.
 */
export async function bijlagenVoorAI(berichtIds: string[]): Promise<{ voorAI: BijlageVoorAI[]; namen: string[]; ongelezen: boolean }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_bijlagen')
    .select('id, bestandsnaam, content_type, grootte_bytes, is_inline, opslag_pad, te_groot, sha256')
    .in('bericht_id', berichtIds)
    .limit(100)

  const voorAI: BijlageVoorAI[] = []
  const namen: string[] = []
  const gezien = new Set<string>()
  let ongelezen = false

  for (const b of data ?? []) {
    // Ingesloten beeld filteren we hier, niet in de query: een geplakte gevelfoto
    // moet mee, het logo uit de handtekening niet. Dat onderscheid zit in de
    // grootte en de naam, en die kent alleen `beoordeelBijlage`.
    if (!beoordeelBijlage({
      bestandsnaam: b.bestandsnaam, contentType: b.content_type,
      grootteBytes: b.grootte_bytes, isInline: Boolean(b.is_inline),
    }).meelezen) continue

    if (b.sha256) {
      if (gezien.has(b.sha256)) continue
      gezien.add(b.sha256)
    }
    namen.push(b.bestandsnaam)
    // Zelfde maatstaf als bij overgeslagen bijlagen: een foto kost geen gegevens.
    const isFoto = (b.content_type ?? '').toLowerCase().startsWith('image/')
    if (b.te_groot || !b.opslag_pad) { ongelezen = ongelezen || !isFoto; continue }
    try {
      const { data: blob, error } = await supabase.storage.from('mail-intake').download(b.opslag_pad)
      if (error || !blob) { ongelezen = ongelezen || !isFoto; continue }
      voorAI.push({
        bestandsnaam: b.bestandsnaam,
        contentType: b.content_type,
        bytes: Buffer.from(await blob.arrayBuffer()),
      })
    } catch {
      ongelezen = ongelezen || !isFoto
    }
  }

  return { voorAI, namen, ongelezen }
}
