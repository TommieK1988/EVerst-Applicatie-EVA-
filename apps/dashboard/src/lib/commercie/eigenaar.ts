'use server'

/**
 * De commercieel eigenaar los wijzigen, zonder de volgende stap aan te raken.
 *
 * Los van `slaStapOp` omdat die een complete stap verwacht en een 'stap'-gebeurtenis
 * schrijft: wie alleen de eigenaar omzet, zou dan een dubbele stapregel in de tijdlijn
 * krijgen. Hier komt één notitieregel, zodat herleidbaar blijft wie het eigenaarschap
 * wanneer heeft verlegd.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { vertaalDbFout, type ActieResultaat } from './types'

export async function zetCommercieelEigenaar(
  dossierId: string,
  eigenaarId: string | null,
): Promise<ActieResultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  const supabase = createAdminClient()

  const { data: kaart } = await supabase.from('commercie_bewaking')
    .select('id,eigenaar_id,stap_soort,getrieerd_op').eq('dossier_id', dossierId).maybeSingle()

  if (kaart?.eigenaar_id === eigenaarId) return { ok: true }

  let bewakingId: string
  if (kaart) {
    const update: { eigenaar_id: string | null; getrieerd_op?: string; getrieerd_door?: string } =
      { eigenaar_id: eigenaarId }
    // Zelfde regel als in slaStapOp: eigenaar én stap = de triage is gedaan.
    if (!kaart.getrieerd_op && eigenaarId && kaart.stap_soort) {
      update.getrieerd_op = new Date().toISOString()
      update.getrieerd_door = medewerker.id
    }
    const { error } = await supabase.from('commercie_bewaking').update(update).eq('id', kaart.id)
    if (error) return { ok: false, error: vertaalDbFout(error.message) }
    bewakingId = kaart.id
  } else {
    const { data: nieuw, error } = await supabase.from('commercie_bewaking')
      .insert({ dossier_id: dossierId, soort: 'offerte', eigenaar_id: eigenaarId })
      .select('id').single()
    if (error || !nieuw) return { ok: false, error: vertaalDbFout(error?.message ?? 'Onbekende fout') }
    bewakingId = nieuw.id
  }

  let naam = 'niemand'
  if (eigenaarId) {
    const { data: m } = await supabase.from('medewerkers')
      .select('voornaam,tussenvoegsel,achternaam').eq('id', eigenaarId).maybeSingle()
    if (m) naam = [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
  }
  await supabase.from('commercie_gebeurtenissen').insert({
    bewaking_id: bewakingId,
    soort: 'notitie',
    tekst: `Commercieel eigenaar: ${naam}`,
    door: medewerker.id,
  })

  revalidatePath(`/offertes/${dossierId}/bewaking`)
  revalidatePath('/offertes')
  return { ok: true }
}
