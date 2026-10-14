import 'server-only'

import { losseTabel } from '@/lib/supabase/losse-tabel'
import { leesFactuurStand } from '@/lib/bouw7/verzamelfactuur'
import { updateServicedeskSubstatus } from '@/lib/dossiers/actions'

/**
 * Volgt klaargezette verzamelfacturen tot ze verstuurd zijn.
 *
 * EVA zet alleen klaar; de administratie verstuurt in Bouw7, en pas dan krijgt de factuur een
 * nummer. Dát moment is "gefactureerd": de bonnen erop gaan dan van Kosten compleet naar
 * Financieel gereed, met een notitie op de bon waarom. Eerder niet — een concept kan nog worden
 * weggegooid, en dan hoort de bon gewoon op Kosten compleet te blijven staan.
 *
 * Een in Bouw7 verwijderd concept wordt hier op `verwijderd` gezet. De boekingen komen vanzelf
 * weer vrij: `getRegieFactuurvoorstel` geeft bij elke opbouw vrij wat op een verdwenen factuur stond.
 *
 * Draait in de cron en bij het openen van het verzamelfactuurscherm. Alleen concepten, dus begrensd.
 */
export async function controleerVerzamelfacturen(): Promise<{ verzonden: number; verwijderd: number; fouten: number }> {
  const supabase = losseTabel()
  const { data } = await supabase.from('verzamelfacturen')
    .select('id, bouw7_invoice_id, aangemaakt_door, verzamelfactuur_dossiers(dossier_id)')
    .eq('status', 'concept')
    .not('bouw7_invoice_id', 'is', null)
    .limit(200)

  const uit = { verzonden: 0, verwijderd: 0, fouten: 0 }
  const nu = new Date().toISOString()
  for (const vz of (data ?? []) as unknown as {
    id: string; bouw7_invoice_id: string; aangemaakt_door: string | null; verzamelfactuur_dossiers: { dossier_id: string }[]
  }[]) {
    const stand = await leesFactuurStand(Number(vz.bouw7_invoice_id))
    if (stand.stand === 'onbekend') { uit.fouten++; continue }
    if (stand.stand === 'weg') {
      await supabase.from('verzamelfacturen').update({ status: 'verwijderd', gecontroleerd_op: nu }).eq('id', vz.id)
      uit.verwijderd++
      continue
    }
    if (!stand.factuurnummer) {
      await supabase.from('verzamelfacturen').update({ gecontroleerd_op: nu }).eq('id', vz.id)
      continue
    }

    await supabase.from('verzamelfacturen').update({
      status: 'verzonden', factuurnummer: stand.factuurnummer, verzonden_op: nu, gecontroleerd_op: nu,
    }).eq('id', vz.id)
    uit.verzonden++

    const ids = vz.verzamelfactuur_dossiers.map(d => d.dossier_id)
    if (ids.length === 0) continue
    const { data: bonnen } = await supabase.from('dossiers').select('id, servicedesk_substatus').in('id', ids)
    for (const b of (bonnen ?? []) as unknown as { id: string; servicedesk_substatus: string | null }[]) {
      // Alleen wat er nog op Kosten compleet staat; is een bon intussen verder gezet, dan niet terug.
      if (b.servicedesk_substatus !== 'kosten_compleet') continue
      try {
        await updateServicedeskSubstatus(b.id, 'financieel_gereed')
        await supabase.from('dossier_notities').insert({
          dossier_id: b.id,
          medewerker_id: vz.aangemaakt_door,
          inhoud: `Financieel gereed: gefactureerd op verzamelfactuur ${stand.factuurnummer}.`,
        })
      } catch {
        uit.fouten++
      }
    }
  }
  return uit
}
