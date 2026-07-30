'use server'
import { createClient } from '@everts/database/server'
import { cookies } from 'next/headers'
import { MOBIEL_MARKER_COOKIE } from '@everts/database/cookies'
import { redirect } from 'next/navigation'
import { COOKIE_SESSIE_VERLOOPT } from '@/lib/sessie'

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Verval- + markercookie wissen: die hebben op mobiel een Max-Age van 3 dagen
  // en zouden anders in de volgende login blijven hangen (verkeerd vervalmoment).
  const store = await cookies()
  store.set(COOKIE_SESSIE_VERLOOPT, '', { maxAge: 0, path: '/' })
  store.set(MOBIEL_MARKER_COOKIE, '', { maxAge: 0, path: '/' })
  redirect('/login')
}
