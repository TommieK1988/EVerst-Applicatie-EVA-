'use server'

// Goedkeuren en afkeuren van ingediende kosten.
//
// WIE MAG WAT bepaalt de routering (`./onkosten-route`): de projectleider van het dossier waar
// de kosten voor zijn, en zonder project de eigen goedkeurder van de medewerker. Een lijst id's
// uit een scherm zegt daar niets over; elke actie haalt de posten opnieuw op en houdt alleen
// over wat nu werkelijk bij de ingelogde medewerker ligt.
//
// Een beoordeling is eindstation: goedgekeurde en afgekeurde kosten liggen vast, ook voor de
// medewerker zelf. Wie een afgekeurde post wil rechtzetten, dient een nieuwe in.
//
// Wie het eerst klikt beoordeelt: de update eist dat de post nog open is, zodat twee
// beoordelaars elkaars besluit niet stil overschrijven.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { getAppVertaler } from '@/i18n/server'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { ONKOSTEN_LABEL } from './onkosten'
import { haalKostenOpId } from './onkosten-goedkeuring'

/** Ruim boven wat iemand in één keer aanvinkt; houdt de `.in()` kort. */
const MAX_IN_EEN_KEER = 200

export type KostenKeurResultaat =
  | { ok: true; verwerkt: number }
  | { ok: false; error: string }

function ververs() {
  revalidatePath('/m/uren')
  revalidatePath('/m/uren/keuren')
  revalidatePath('/uren')
}

export async function keurOnkostenGoed(ids: string[]): Promise<KostenKeurResultaat> {
  const ik = await vereisSessie()
  const t = await getAppVertaler('uren')
  const uniek = [...new Set(ids)].slice(0, MAX_IN_EEN_KEER)
  if (!uniek.length) return { ok: false, error: t('kostenKeuren.fout.geenSelectie') }

  const mag = (await haalKostenOpId(uniek))
    .filter(p => p.teBeoordelen && p.goedkeurderId === ik.id)
    .map(p => p.id)
  if (!mag.length) return { ok: false, error: t('kostenKeuren.fout.nietBijJou') }

  const { data, error } = await createAdminClient()
    .from('uren_onkosten')
    .update({
      goedkeuring_status: 'goedgekeurd',
      beoordeeld_op: new Date().toISOString(),
      beoordeeld_door: ik.id,
      afkeur_reden: null,
    })
    .in('id', mag)
    .eq('goedkeuring_status', 'open')
    .select('id')
  if (error) return { ok: false, error: error.message }

  ververs()
  return { ok: true, verwerkt: data?.length ?? 0 }
}

export async function keurOnkostenAf(id: string, reden: string): Promise<KostenKeurResultaat> {
  const ik = await vereisSessie()
  const t = await getAppVertaler('uren')
  const toelichting = reden.trim()
  if (!toelichting) return { ok: false, error: t('kostenKeuren.fout.geefReden') }

  const [post] = await haalKostenOpId([id])
  if (!post || !post.teBeoordelen || post.goedkeurderId !== ik.id) {
    return { ok: false, error: t('kostenKeuren.fout.nietBijJou') }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('uren_onkosten')
    .update({
      goedkeuring_status: 'afgekeurd',
      beoordeeld_op: new Date().toISOString(),
      beoordeeld_door: ik.id,
      afkeur_reden: toelichting,
    })
    .eq('id', id)
    .eq('goedkeuring_status', 'open')
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: t('kostenKeuren.fout.alBeoordeeld') }

  // Een afgekeurde bon wordt niet vergoed; dat hoort de medewerker te horen, met de reden.
  // Een goedkeuring meldt niets: dat is de normale gang en zou alleen ruis zijn.
  const { data: mw } = await supabase
    .from('medewerkers').select('auth_user_id').eq('id', post.medewerkerId).maybeSingle()
  if (mw?.auth_user_id) {
    const bedrag = post.bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
    const datum = new Date(`${post.datum}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
    const door = [ik.voornaam, ik.tussenvoegsel, ik.achternaam].filter(Boolean).join(' ') || 'Je goedkeurder'
    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'uren',
      titel: 'Kosten afgekeurd',
      body: `${door} keurde je kosten van ${datum} af (${ONKOSTEN_LABEL[post.soort]}, ${bedrag}): ${toelichting}`,
      url: post.weekStart ? `/m/uren?week=${post.weekStart}` : '/m/uren',
    }).catch(() => { /* melding is bijzaak */ })
  }

  ververs()
  return { ok: true, verwerkt: 1 }
}
