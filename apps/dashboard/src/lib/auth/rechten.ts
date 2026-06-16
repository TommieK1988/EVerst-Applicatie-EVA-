import 'server-only'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@everts/database/server'
import type { ModuleRechten, RechtenModule, RechtenSet } from '@everts/database/platform-types'
import { heeftModuleToegang } from './rechten-shared'

export { isBeheerder, heeftModuleToegang, magOnderdeelZien, AFGEDWONGEN_MODULES } from './rechten-shared'

export type CurrentMedewerker = {
  id: string
  voornaam: string | null
  tussenvoegsel: string | null
  achternaam: string | null
  functie: string | null
  afdeling: string | null
  foto_url: string | null
  gebruiker_type: string
  rechten_override: RechtenSet
}

/** Haal het medewerker-record van de ingelogde gebruiker op (of null). */
export async function getCurrentMedewerker(): Promise<CurrentMedewerker | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, functie, afdeling, foto_url, gebruiker_type, rechten_override')
    .eq('auth_user_id', user.id)
    .eq('actief', true)
    .maybeSingle()

  return (data as CurrentMedewerker | null) ?? null
}

/**
 * Effectieve rechten = afdeling-standaard (`standaard_rechten`, gematcht op naam)
 * met de gebruiker-specifieke `rechten_override` eroverheen (override wint).
 * Geef `medewerker` mee om een dubbele fetch te voorkomen.
 */
export async function getEffectieveRechten(
  medewerker?: CurrentMedewerker | null,
): Promise<RechtenSet> {
  const mw = medewerker !== undefined ? medewerker : await getCurrentMedewerker()
  if (!mw) return {}

  let afdelingRechten: RechtenSet = {}
  if (mw.afdeling) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data } = await admin
      .from('medewerker_afdelingen')
      .select('standaard_rechten')
      .eq('naam', mw.afdeling)
      .eq('actief', true)
      .maybeSingle()
    afdelingRechten = (data?.standaard_rechten as RechtenSet) ?? {}
  }

  const effectief: RechtenSet = { ...afdelingRechten }
  for (const [k, v] of Object.entries(mw.rechten_override ?? {})) {
    if (v !== undefined) (effectief as Record<string, unknown>)[k] = v
  }
  return effectief
}

/** Server-guard: redirect naar de startpagina als de gebruiker onvoldoende recht heeft. */
export async function vereisModuleToegang(
  module: RechtenModule,
  min: ModuleRechten = 'lezen',
): Promise<void> {
  const rechten = await getEffectieveRechten()
  if (!heeftModuleToegang(rechten, module, min)) redirect('/')
}
