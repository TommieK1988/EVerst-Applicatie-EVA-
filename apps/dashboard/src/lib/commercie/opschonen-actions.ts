'use server'

/**
 * De opschoonronde: meerdere offertes in één keer afsluiten (Offertes → Opschonen).
 *
 * Elke offerte loopt door dezelfde weg als een losse afsluiting: `updateDossierSubstatus` met de
 * Bouw7-spiegel (substatus, de offertes zelf op Vervallen/Verloren en het project op Afgewezen
 * als er niets meer loopt), daarna de reden op de historierij en een notitie in de tijdlijn.
 *
 * Het scherm stuurt kleine porties (`MAX_PER_KEER`): elke offerte kost een paar Bouw7-aanroepen,
 * en een server-action die honderd offertes in één keer doet loopt tegen de tijdslimiet aan.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { updateDossierSubstatus } from '@/lib/dossiers/actions'
import { legAfsluitRedenVastActie } from './actions'
import { redenenVoorAfsluiten } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PER_KEER = 10

export type AfsluitResultaat = { gelukt: string[]; mislukt: { id: string; fout: string }[] }

export async function sluitOffertesAf(
  ids: string[],
  uitkomst: 'vervallen' | 'verloren',
  reden: string,
): Promise<{ ok: true; resultaat: AfsluitResultaat } | { ok: false; error: string }> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  if (uitkomst !== 'vervallen' && uitkomst !== 'verloren') return { ok: false, error: 'Onbekende uitkomst.' }
  if (!redenenVoorAfsluiten(uitkomst).includes(reden)) return { ok: false, error: 'Kies een reden uit de lijst.' }
  const geldig = ids.filter(id => UUID.test(id))
  if (geldig.length === 0) return { ok: false, error: 'Geen offertes gekozen.' }
  if (geldig.length > MAX_PER_KEER) return { ok: false, error: `Hooguit ${MAX_PER_KEER} offertes per keer.` }

  const supabase = createAdminClient()
  const resultaat: AfsluitResultaat = { gelukt: [], mislukt: [] }

  for (const id of geldig) {
    try {
      const res = await updateDossierSubstatus(id, uitkomst, { schrijfBouw7: true })
      if (!res.ok) { resultaat.mislukt.push({ id, fout: res.error }); continue }
      // Lukte de write naar Bouw7 niet, dan staat het dossier in EVA wél dicht; de cron
      // probeert Bouw7 opnieuw. Wel melden, zodat het niet stil misgaat.
      if (res.bouw7 && !res.bouw7.ok) resultaat.mislukt.push({ id, fout: `In EVA afgesloten, Bouw7 nog niet: ${res.bouw7.error}` })
      await legAfsluitRedenVastActie(id, uitkomst, reden, 'opschoonronde')

      const { data: kaart } = await supabase.from('commercie_bewaking').select('id').eq('dossier_id', id).maybeSingle()
      if (kaart) {
        await supabase.from('commercie_bewaking').update({
          stap_soort: null, stap_tekst: null, stap_datum: null, wacht_op: null, stap_bron: 'handmatig',
        }).eq('id', kaart.id)
        await supabase.from('commercie_gebeurtenissen').insert({
          bewaking_id: kaart.id, soort: 'notitie', door: medewerker.id,
          tekst: `Afgesloten in de opschoonronde: ${uitkomst} · ${reden}`,
        })
      }
      if (!res.bouw7 || res.bouw7.ok) resultaat.gelukt.push(id)
    } catch (e) {
      resultaat.mislukt.push({ id, fout: e instanceof Error ? e.message : 'Onbekende fout' })
    }
  }

  revalidatePath('/offertes')
  return { ok: true, resultaat }
}
