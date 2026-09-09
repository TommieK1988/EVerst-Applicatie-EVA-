'use server'

/**
 * Het dagsaldo uit de werktijdenlijst reserveren als tijd voor tijd.
 *
 * Waarom niet gewoon de uren aanpassen: dan zou EVA in Bouw7 gaan schrijven in
 * boekingen die al geaccordeerd zijn en misschien al naar de salarisadministratie
 * door zijn. Een reservering laat die boekingen met rust en legt alleen vast dát
 * het verschil van die dag bekend is en als tijd voor tijd geldt. De dag valt
 * daarmee uit het openstaande saldo, en wat er gereserveerd staat is als eigen
 * totaal terug te zien.
 *
 * Het is nadrukkelijk een tussenstap. Zodra het bij het uren boeken zelf als
 * tijd voor tijd wordt vastgelegd, is dit de plek waar je die twee tegen elkaar
 * kunt houden.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import { pgQuery } from '@/lib/wagenpark/db'

export type TvtResultaat = { ok: true } | { ok: false; error: string }

/** Auth-user-id van de ingelogde gebruiker; zie werktijd-afhandeling.ts. */
async function huidigeAuthUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

function ververs(): void {
  revalidatePath('/wagenpark/bestuurders', 'layout')
  revalidatePath('/wagenpark/dashboard')
}

/**
 * Leg vast dat het saldo van deze dag als tijd voor tijd verrekend wordt.
 *
 * `uren` is ondertekend, net als het saldo zelf: positief = langer aanwezig dan
 * geschreven, negatief = meer geschreven dan aanwezig. De aanroeper vult het
 * dagsaldo voor, maar het bedrag is aanpasbaar — de helft van een verschil
 * afspreken is een normale uitkomst van een gesprek.
 *
 * Opnieuw reserveren op dezelfde dag overschrijft; dat is bewust, zodat een
 * bijgestelde afspraak niet naast de oude komt te staan.
 */
export async function reserveerTijdVoorTijd(
  user_id_ulu: string,
  datum: string,
  uren: number,
  toelichting = '',
): Promise<TvtResultaat> {
  await vereisRecht('wagenpark', 'schrijven')
  if (!(await magPriveRittenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen werktijden aanpassen.' }
  }
  if (!/^\d+$/.test(user_id_ulu) || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return { ok: false, error: 'Onbekende bestuurder of datum.' }
  }
  if (!Number.isFinite(uren) || uren === 0) {
    return { ok: false, error: 'Vul een aantal uren in dat niet nul is.' }
  }
  // Een dag kan nooit meer dan een etmaal opleveren; een tikfout van 80 in
  // plaats van 8 hoort niet stilletijgend in een saldo te belanden.
  if (Math.abs(uren) > 24) {
    return { ok: false, error: 'Meer dan 24 uur op één dag kan niet kloppen.' }
  }

  try {
    await pgQuery(
      `insert into public.werktijd_tvt_reserveringen
         (user_id_ulu, datum, uren, toelichting, gebruiker_id)
       values ($1::bigint, $2::date, $3::numeric, nullif($4::text, ''), $5::uuid)
       on conflict (user_id_ulu, datum) do update set
         uren          = excluded.uren,
         toelichting   = excluded.toelichting,
         gebruiker_id  = excluded.gebruiker_id,
         aangemaakt_op = now()`,
      [user_id_ulu, datum, Math.round(uren * 100) / 100, toelichting.trim(), await huidigeAuthUserId()],
    )
    ververs()
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Reserveren mislukt.' }
  }
}

/** De reservering van een dag weer intrekken; de dag telt daarna weer mee. */
export async function verwijderTijdVoorTijd(
  user_id_ulu: string,
  datum: string,
): Promise<TvtResultaat> {
  await vereisRecht('wagenpark', 'schrijven')
  if (!(await magPriveRittenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen werktijden aanpassen.' }
  }
  try {
    await pgQuery(
      `delete from public.werktijd_tvt_reserveringen
        where user_id_ulu::text = $1 and datum = $2::date`,
      [user_id_ulu, datum],
    )
    ververs()
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Intrekken mislukt.' }
  }
}
