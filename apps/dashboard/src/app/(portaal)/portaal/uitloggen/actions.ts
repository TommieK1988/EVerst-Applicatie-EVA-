'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@everts/database/server'
import { PORTAAL_MARKER_COOKIE } from '@everts/database/cookies'
import { COOKIE_SESSIE_VERLOOPT } from '@/lib/sessie'

/**
 * Uitloggen uit het klantportaal.
 *
 * Bewust geen gate ervoor: uitloggen mag altijd lukken, ook — juist — als de
 * sessie half kapot is. Behalve de sessie zelf gaan ook de verval- en
 * markercookie eruit; blijft de marker staan, dan denkt de middleware bij de
 * volgende login nog steeds dat dit een portaalsessie is.
 */
export async function portaalUitloggen(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const store = await cookies()
  store.set(PORTAAL_MARKER_COOKIE, '', { path: '/', maxAge: 0 })
  store.set(COOKIE_SESSIE_VERLOOPT, '', { path: '/', maxAge: 0 })

  redirect('/portaal/login')
}
