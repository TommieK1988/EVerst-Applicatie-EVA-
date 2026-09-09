import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@everts/database/server'
import type { ModuleRechten, RechtenModule, RechtenSet } from '@everts/database/platform-types'
import { heeftModuleToegang } from './rechten-shared'

export { isBeheerder, heeftModuleToegang, magOnderdeelZien, AFGEDWONGEN_MODULES } from './rechten-shared'

export type CurrentMedewerker = {
  id: string
  /** Auth-user-id. Nodig omdat taken op `task_assignees.user_id` filteren en niet op medewerker-id. */
  auth_user_id: string | null
  voornaam: string | null
  tussenvoegsel: string | null
  achternaam: string | null
  functie: string | null
  afdeling: string | null
  foto_url: string | null
  gebruiker_type: string
  rechten_override: RechtenSet
}

/**
 * Haal het medewerker-record van de ingelogde gebruiker op (of null).
 *
 * Gecachet voor de duur van één request. Een gemiddelde pagina vraagt dit
 * meerdere keren: eerst indirect via `vereisModuleToegang`, daarna nog eens
 * rechtstreeks, en de layout eromheen ook. Elke keer was dat een netwerkcall
 * naar de auth-server plus twee database-reads, met steeds hetzelfde antwoord.
 * Op 9 september 2026 liep de auth-server daarop vast; zie
 * lib/auth/auth-bereikbaarheid.ts voor het hele verhaal.
 *
 * Bewust nog steeds `getUser()` en niet de lokale tokencontrole die de
 * middleware gebruikt: hier hangt gegevenstoegang aan, en dan willen we van de
 * auth-server horen dat de sessie op dit moment nog geldig is — niet alleen dat
 * het token ooit goed ondertekend is.
 */
export const getCurrentMedewerker = cache(async (): Promise<CurrentMedewerker | null> => {
  // Sessie-client alleen voor de geverifieerde gebruiker (auth-API, niet RLS-afhankelijk).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Het medewerker-record via de admin-client lezen: op `medewerkers` staat RLS aan
  // zónder policies, dus een sessie-client krijgt 0 rijen terug. We filteren strikt op
  // de geverifieerde auth_user_id, dus we lezen uitsluitend de eigen rij.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data } = await admin
    .from('medewerkers')
    .select('id, auth_user_id, voornaam, tussenvoegsel, achternaam, functie, afdeling, foto_url, gebruiker_type, rechten_override')
    .eq('auth_user_id', user.id)
    .eq('actief', true)
    .maybeSingle()

  return (data as CurrentMedewerker | null) ?? null
})

/**
 * Effectieve rechten = afdeling-standaard (`standaard_rechten`, gematcht op naam)
 * met de gebruiker-specifieke `rechten_override` eroverheen (override wint).
 * Geef `medewerker` mee om een dubbele fetch te voorkomen.
 *
 * Ook gecachet per request. Dat werkt hier omdat `getCurrentMedewerker()` binnen
 * één request altijd hetzélfde object teruggeeft: aanroepen die dat object
 * doorgeven vallen daardoor op dezelfde cache-sleutel als elkaar.
 */
export const getEffectieveRechten = cache(async (
  medewerker?: CurrentMedewerker | null,
): Promise<RechtenSet> => {
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
})

/** Server-guard: redirect naar de startpagina als de gebruiker onvoldoende recht heeft. */
export async function vereisModuleToegang(
  module: RechtenModule,
  min: ModuleRechten = 'lezen',
): Promise<void> {
  const rechten = await getEffectieveRechten()
  if (!heeftModuleToegang(rechten, module, min)) redirect('/')
}

/**
 * Fout die een muterende server-action gooit als de aanroeper onvoldoende
 * rechten heeft. Bewust een gewone Error (geen redirect): server-actions worden
 * ook vanuit fetch/RPC aangeroepen, en dan moet de mutatie hard falen.
 */
export class GeenToegangError extends Error {
  constructor(message = 'Geen toegang') {
    super(message)
    this.name = 'GeenToegangError'
  }
}

/**
 * Minimale gate: eist alleen een geldige sessie, geen specifiek modulerecht.
 *
 * Voor actions op modules die nog niet in `AFGEDWONGEN_MODULES` zitten: `vereisRecht`
 * zou die module daar eenzijdig uitrollen en gebruikers buitensluiten die de functie
 * vandaag gewoon gebruiken. Deze gate sluit wél het echte gat — een action met de
 * admin-client (service-role, bypast RLS) mag nooit zonder sessie aanroepbaar zijn.
 * Vervang door `vereisRecht` zodra de module wordt afgedwongen.
 */
export async function vereisSessie(): Promise<CurrentMedewerker> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) throw new GeenToegangError('Niet ingelogd')
  return medewerker
}

/**
 * Autorisatie-gate voor server-actions en route-handlers. Gooit `GeenToegangError`
 * als er geen geldige sessie is óf de gebruiker het gevraagde niveau op `module`
 * mist. Retourneert de ingelogde medewerker + effectieve rechten voor hergebruik.
 *
 * Gebruik dit aan het begin van ELKE muterende action die de admin-client
 * (service-role, bypast RLS) gebruikt — anders kan elke ingelogde gebruiker de
 * action als kale RPC aanroepen.
 */
export async function vereisRecht(
  module: RechtenModule,
  min: ModuleRechten = 'schrijven',
): Promise<{ medewerker: CurrentMedewerker; rechten: RechtenSet }> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) throw new GeenToegangError('Niet ingelogd')
  const rechten = await getEffectieveRechten(medewerker)
  if (!heeftModuleToegang(rechten, module, min)) {
    throw new GeenToegangError(`Onvoldoende rechten voor ${module} (${min})`)
  }
  return { medewerker, rechten }
}

/**
 * Zwaarste gate: alleen echte beheerders (instellingen = beheren). Voor
 * rechten-mutaties, gebruikersbeheer en uitnodigingen.
 */
export async function vereisBeheerder(): Promise<{ medewerker: CurrentMedewerker; rechten: RechtenSet }> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) throw new GeenToegangError('Niet ingelogd')
  const rechten = await getEffectieveRechten(medewerker)
  if (rechten.instellingen !== 'beheren') {
    throw new GeenToegangError('Alleen beheerders')
  }
  return { medewerker, rechten }
}
