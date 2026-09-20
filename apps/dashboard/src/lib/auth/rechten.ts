import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@everts/database/server'
import type {
  ModuleRechten, RechtenModule, RechtenSet, FunctieKey, RechtenDocument, Kanaal,
} from '@everts/database/platform-types'
import { leesRechtenDocument, mergeKanaal } from '@everts/database/rechten'
import {
  heeftModuleToegang, heeftFunctie, kiesKanaal, alsRechtenSet,
  type KanaalSet, type KanaalKeuze, type RechtenBundel,
} from './rechten-shared'
import { getVerzoekKanaal } from './kanaal'

export {
  isBeheerder, heeftModuleToegang, heeftFunctie, magOnderdeelZien,
  kiesKanaal, alsRechtenSet, AFGEDWONGEN_MODULES,
} from './rechten-shared'
export type { KanaalSet, KanaalKeuze, RechtenBundel } from './rechten-shared'

export type CurrentMedewerker = {
  id: string
  /** Auth-user-id. Nodig omdat taken op `task_assignees.user_id` filteren en niet op medewerker-id. */
  auth_user_id: string | null
  voornaam: string | null
  tussenvoegsel: string | null
  achternaam: string | null
  functie: string | null
  afdeling: string | null
  /** Leidend voor de standaardrechten; `afdeling` is de tekstspiegel. Zie 20260920d. */
  afdeling_id: string | null
  foto_url: string | null
  gebruiker_type: string
  /** Platte v1-spiegel. Blijft bestaan tot de laatste SQL-lezer om is. */
  rechten_override: RechtenSet
  /** De v2-vorm: per kanaal modules + functies. Leeg → val terug op de spiegel. */
  rechten: unknown
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
    .select('id, auth_user_id, voornaam, tussenvoegsel, achternaam, functie, afdeling, afdeling_id, foto_url, gebruiker_type, rechten_override, rechten')
    .eq('auth_user_id', user.id)
    .eq('actief', true)
    .maybeSingle()

  return (data as CurrentMedewerker | null) ?? null
})

const LEGE_BUNDEL = (kanaal: Kanaal): RechtenBundel => ({
  verzoekKanaal: kanaal,
  desktop: { modules: {}, functies: {}, beheerder: false },
  mobiel: { modules: {}, functies: {}, beheerder: false },
  beheerder: false,
})

/**
 * Beide kanalen, samengevoegd uit de afdelingsstandaard en de persoonlijke
 * afwijking (de afwijking wint). Geef `medewerker` mee om een dubbele fetch te
 * voorkomen.
 *
 * Gecachet per request. Dat werkt omdat `getCurrentMedewerker()` binnen één
 * request altijd hetzélfde object teruggeeft: aanroepen die dat object
 * doorgeven vallen daardoor op dezelfde cache-sleutel.
 */
export const getRechtenBundel = cache(async (
  medewerker?: CurrentMedewerker | null,
): Promise<RechtenBundel> => {
  const verzoekKanaal = await getVerzoekKanaal()
  const mw = medewerker !== undefined ? medewerker : await getCurrentMedewerker()
  if (!mw) return LEGE_BUNDEL(verzoekKanaal)

  let afdeling: RechtenDocument = leesRechtenDocument(null, null)
  // Op `afdeling_id`, niet op naam. De naam-match verloor stil alle standaardrechten
  // zodra iemand een afdeling hernoemde: geen match, geen fout, geen rechten. Zie 20260920d.
  if (mw.afdeling_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data } = await admin
      .from('medewerker_afdelingen')
      .select('rechten, standaard_rechten')
      .eq('id', mw.afdeling_id)
      .eq('actief', true)
      .maybeSingle()
    // De v2-kolom is leidend; staat hij nog leeg, dan leest `leesRechtenDocument`
    // de platte spiegel. Zo werkt dit ook op een omgeving waar 20260920g nog niet
    // gedraaid heeft.
    afdeling = leesRechtenDocument(data?.rechten, data?.standaard_rechten)
  }
  const eigen = leesRechtenDocument(mw.rechten, mw.rechten_override)

  const desktop = mergeKanaal(afdeling.desktop, eigen.desktop)
  const mobiel = mergeKanaal(afdeling.mobiel, eigen.mobiel)
  // Beheerder is bewust kanaal-onafhankelijk: anders sluit een beheerder zichzelf
  // op mobiel buiten en kan hij het daar niet meer repareren.
  const beheerder =
    desktop.modules.instellingen === 'beheren' || mobiel.modules.instellingen === 'beheren'

  return {
    verzoekKanaal,
    desktop: { ...desktop, beheerder },
    mobiel: { ...mobiel, beheerder },
    beheerder,
  }
})

/**
 * Effectieve rechten van het kanaal waar dit verzoek vandaan komt, in de platte
 * v1-vorm. Signatuur bewust ongewijzigd: alle bestaande aanroepers blijven doen
 * wat ze deden, alleen krijgt `/m` nu zijn eigen set in plaats van de
 * desktopset.
 *
 * Nieuwe code die functies of een specifiek kanaal nodig heeft, gebruikt
 * `getRechtenBundel()` met `kiesKanaal()`.
 */
export const getEffectieveRechten = cache(async (
  medewerker?: CurrentMedewerker | null,
): Promise<RechtenSet> =>
  alsRechtenSet(kiesKanaal(await getRechtenBundel(medewerker), 'verzoek')))

/**
 * Server-guard voor pagina's: stuurt weg als de gebruiker onvoldoende recht heeft.
 *
 * Standaard het kanaal van het verzoek — deze guard bewaakt een scherm, en welk
 * scherm dat is volgt uit het pad. De terugval is `/m` op mobiel: wie op zijn
 * telefoon een guard raakt hoort terug naar het mobiele startscherm, niet naar de
 * desktopweergave waar hij niets te zoeken heeft.
 */
export async function vereisModuleToegang(
  module: RechtenModule,
  min: ModuleRechten = 'lezen',
  opties: { kanaal?: KanaalKeuze; terug?: string } = {},
): Promise<void> {
  const bundel = await getRechtenBundel()
  const set = kiesKanaal(bundel, opties.kanaal ?? 'verzoek')
  if (!heeftModuleToegang(set, module, min)) {
    redirect(opties.terug ?? (bundel.verzoekKanaal === 'mobiel' ? '/m' : '/'))
  }
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
 *
 * Het kanaal staat standaard op 'beide' en dat is bewust. Een server action
 * wordt geadresseerd via de `Next-Action`-header en niet via het pad, dus de
 * aanroeper kiest zelf vanaf welke pagina hij hem post. Zou deze gate op het
 * verzoekkanaal afgaan, dan zou hij een grens suggereren die er niet is — en
 * zouden route-handlers die vanaf /m worden aangeroepen ten onrechte de
 * desktopset krijgen. Kanaal is een zichtbaarheidsscheiding, geen
 * datatoegangsscheiding; zie kanaalVoorPad in rechten-catalogus.ts.
 */
export async function vereisRecht(
  module: RechtenModule,
  min: ModuleRechten = 'schrijven',
  opties: { kanaal?: KanaalKeuze } = {},
): Promise<{ medewerker: CurrentMedewerker; rechten: RechtenSet; set: KanaalSet }> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) throw new GeenToegangError('Niet ingelogd')
  const set = kiesKanaal(await getRechtenBundel(medewerker), opties.kanaal ?? 'beide')
  if (!heeftModuleToegang(set, module, min)) {
    throw new GeenToegangError(`Onvoldoende rechten voor ${module} (${min})`)
  }
  return { medewerker, rechten: alsRechtenSet(set), set }
}

/**
 * Paginaguard op een losse functie: stuurt weg in plaats van te gooien.
 * De tegenhanger van `vereisModuleToegang`, met dezelfde kanaalkeuze.
 */
export async function vereisFunctieToegang(
  functie: FunctieKey,
  opties: { kanaal?: KanaalKeuze; terug?: string } = {},
): Promise<void> {
  const bundel = await getRechtenBundel()
  if (!heeftFunctie(kiesKanaal(bundel, opties.kanaal ?? 'verzoek'), functie)) {
    redirect(opties.terug ?? (bundel.verzoekKanaal === 'mobiel' ? '/m' : '/'))
  }
}

/**
 * Autorisatie-gate op een losse functie, voor handelingen waar het niveau te
 * grof voor is: bedragen zien, iets definitief verwijderen, accorderen.
 * Zelfde kanaalkeuze en zelfde reden als bij `vereisRecht`.
 */
export async function vereisFunctie(
  functie: FunctieKey,
  opties: { kanaal?: KanaalKeuze } = {},
): Promise<{ medewerker: CurrentMedewerker; set: KanaalSet }> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) throw new GeenToegangError('Niet ingelogd')
  const set = kiesKanaal(await getRechtenBundel(medewerker), opties.kanaal ?? 'beide')
  if (!heeftFunctie(set, functie)) {
    throw new GeenToegangError(`Onvoldoende rechten voor ${functie}`)
  }
  return { medewerker, set }
}

/**
 * Zwaarste gate: alleen echte beheerders. Voor rechten-mutaties,
 * gebruikersbeheer en uitnodigingen.
 *
 * Loopt via de functie `instellingen.rechten_beheren`, die `inbegrepenVanaf:
 * 'beheren'` heeft — vandaag dus gedragsgelijk aan de oude check op
 * `instellingen === 'beheren'`. Het verschil komt later van pas: je kunt iemand
 * de instellingen laten beheren zonder dat hij zichzelf rechten kan toekennen.
 *
 * Bewust NIET op het verzoekkanaal: `instellingen` bestaat alleen op desktop, en
 * een beheerder die op zijn telefoon iets doet is nog steeds beheerder.
 */
export async function vereisBeheerder(): Promise<{ medewerker: CurrentMedewerker; rechten: RechtenSet }> {
  try {
    const { medewerker, set } = await vereisFunctie('instellingen.rechten_beheren')
    return { medewerker, rechten: alsRechtenSet(set) }
  } catch (e) {
    if (e instanceof GeenToegangError && e.message.includes('rechten_beheren')) {
      throw new GeenToegangError('Alleen beheerders')
    }
    throw e
  }
}
