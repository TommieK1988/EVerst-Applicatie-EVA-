import 'server-only'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@everts/database/server'
import type {
  PortaalGebruiker,
  PortaalDossierInstellingen,
  PortaalOnderdeel,
} from '@everts/database/platform-types'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { PORTAAL_ONDERDEEL_KOLOM } from './onderdelen'

/**
 * auth.ts — de enige poort van het klantportaal.
 *
 * Waarom dit bestand geen 'use server' heeft: dan zou elke export een publiek
 * aanroepbaar endpoint worden, en juist een guard mag dat nooit zijn. Met
 * `import 'server-only'` blijft de code server-side zonder die bijwerking —
 * dezelfde keuze als lib/auth/rechten.ts, waar dit bestand op geënt is.
 *
 * DE REGEL: een portaalgebruiker leest niets via RLS. Op elke portaaltabel staat
 * één policy die alleen platformgebruikers doorlaat, en een klant is dat niet.
 * Alle klantdata gaat dus via de admin-client (service-role) — en die bypast RLS.
 * Daarom is elke functie hieronder de enige scheiding tussen "klant A" en "alles".
 * Roep ze aan in ELK entrypoint dat de admin-client raakt: elke page, elke
 * server-action (ook de lezende — een 'use server'-export is een endpoint), en
 * elke route handler. De layout draait niet mee bij een action-aanroep.
 */

/** Zelfde foutsoort als de medewerkerskant, zodat aanroepers één catch hebben. */
export { GeenToegangError } from '@/lib/auth/rechten'
import {
  GeenToegangError, getCurrentMedewerker, getEffectieveRechten, heeftModuleToegang,
} from '@/lib/auth/rechten'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Kolommen die we van een portaalgebruiker nodig hebben — nooit `select('*')`. */
const GEBRUIKER_KOLOMMEN =
  'id, auth_user_id, email, contactpersoon_id, particulier_id, relatie_id, scope, actief, ' +
  'uitgenodigd_op, uitgenodigd_door, laatste_link_op, laatst_ingelogd_op, created_at, updated_at'

/**
 * De ingelogde portaalgebruiker, of null. Strikt op de geverifieerde auth-id
 * gefilterd, dus we lezen uitsluitend de eigen rij.
 */
export async function getPortaalGebruiker(): Promise<PortaalGebruiker | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await db()
    .from('portaal_gebruikers')
    .select(GEBRUIKER_KOLOMMEN)
    .eq('auth_user_id', user.id)
    .eq('actief', true)
    .maybeSingle()

  return (data as PortaalGebruiker | null) ?? null
}

/** Gate voor server-actions en route-handlers. Gooit; geen redirect. */
export async function vereisPortaalSessie(): Promise<PortaalGebruiker> {
  const gebruiker = await getPortaalGebruiker()
  if (!gebruiker) throw new GeenToegangError('Geen portaaltoegang')
  return gebruiker
}

/**
 * Gate voor pagina's. Stuurt door in plaats van te gooien, zodat een verlopen
 * sessie geen foutpagina oplevert maar een loginformulier.
 *
 * Twee gevallen die uit elkaar moeten blijven, anders ontstaat er een lus: wie
 * géén sessie heeft stuur je naar het inlogscherm, maar wie wél een sessie heeft
 * en tóch geen portaaltoegang (een medewerker zonder klantaccount, of een
 * ingetrokken account) zou daar meteen weer teruggestuurd worden — de middleware
 * ziet immers een ingelogde gebruiker. Die krijgt daarom een eigen pagina.
 */
export async function vereisPortaalPagina(): Promise<PortaalGebruiker> {
  const gebruiker = await getPortaalGebruiker()
  if (gebruiker) return gebruiker

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/portaal/geen-toegang' : '/portaal/login')
}

/**
 * Welke dossiers deze gebruiker mag zien. Dé scope-resolver — één plek, zodat er
 * geen tweede, net iets andere versie ontstaat.
 *
 * Drie bronnen, altijd optellend:
 *  1. scope 'organisatie' → alle dossiers van zijn relatie
 *  2. scope 'eigen_dossiers' → dossiers waar hij de contactpersoon van is
 *  3. scope 'alleen_gekoppeld' → niets uit een regel, alleen punt 4
 *  4. losse toekenningen in portaal_gebruiker_dossiers
 * en dan doorsneden met de dossiers die überhaupt aan het portaal zijn gegeven.
 *
 * Gepagineerd: een corporatie kan makkelijk meer dan 1000 dossiers hebben, en
 * PostgREST kapt dan stil af — precies de fout die de Medewerkerplanning velde.
 */
export async function getPortaalDossierIds(gebruiker: PortaalGebruiker): Promise<string[]> {
  const kandidaten = new Set<string>()

  // Een meekijker van buiten heeft geen regel-gebaseerde toegang: alleen wat
  // hieronder uit portaal_gebruiker_dossiers komt. Zo kan zijn blikveld nooit
  // uitdijen doordat hij elders contactpersoon wordt.
  if (gebruiker.scope === 'alleen_gekoppeld') {
    // niets
  } else if (gebruiker.scope === 'organisatie' && gebruiker.relatie_id) {
    const rijen = await haalAlleRijen<{ id: string }>((van, tot) =>
      db().from('dossiers').select('id').eq('klant_id', gebruiker.relatie_id).order('id').range(van, tot))
    rijen.forEach(r => kandidaten.add(r.id))
  } else if (gebruiker.contactpersoon_id) {
    const rijen = await haalAlleRijen<{ id: string }>((van, tot) =>
      db().from('dossiers').select('id')
        .eq('contactpersoon_id', gebruiker.contactpersoon_id).order('id').range(van, tot))
    rijen.forEach(r => kandidaten.add(r.id))
  } else if (gebruiker.particulier_id && gebruiker.relatie_id) {
    // Particulieren hangen niet als contactpersoon aan een dossier; voor hen is
    // de relatie de enige koppeling.
    const rijen = await haalAlleRijen<{ id: string }>((van, tot) =>
      db().from('dossiers').select('id').eq('klant_id', gebruiker.relatie_id).order('id').range(van, tot))
    rijen.forEach(r => kandidaten.add(r.id))
  }

  const { data: extra } = await db()
    .from('portaal_gebruiker_dossiers')
    .select('dossier_id')
    .eq('portaal_gebruiker_id', gebruiker.id)
  ;(extra as { dossier_id: string }[] | null)?.forEach(r => kandidaten.add(r.dossier_id))

  if (kandidaten.size === 0) return []

  // Alleen dossiers die daadwerkelijk voor het portaal zijn opengezet. Dit is de
  // opt-in: zonder rij met actief = true bestaat een dossier hier niet.
  const ids = [...kandidaten]
  const vrijgegeven: string[] = []
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db()
      .from('portaal_dossier_instellingen')
      .select('dossier_id')
      .eq('actief', true)
      .in('dossier_id', ids.slice(i, i + 500))
    ;(data as { dossier_id: string }[] | null)?.forEach(r => vrijgegeven.push(r.dossier_id))
  }
  return vrijgegeven
}

export type PortaalDossierContext = {
  gebruiker: PortaalGebruiker
  dossierId: string
  instellingen: PortaalDossierInstellingen
}

/**
 * Sessie + eigendom in één. Gebruik dit overal waar een dossier-id uit de URL of
 * uit een formulier komt: dat id is nooit te vertrouwen, ook niet als het net uit
 * een link van onze eigen pagina komt.
 */
export async function vereisPortaalDossier(dossierId: string): Promise<PortaalDossierContext> {
  const gebruiker = await vereisPortaalSessie()
  if (!dossierId) throw new GeenToegangError('Geen dossier')

  const toegestaan = await getPortaalDossierIds(gebruiker)
  if (!toegestaan.includes(dossierId)) throw new GeenToegangError('Dossier niet toegankelijk')

  // Expliciete kolommen, ook op onze eigen tabel: gewijzigd_door is een
  // medewerker-id en heeft in een portaalcontext niets te zoeken.
  const { data } = await db()
    .from('portaal_dossier_instellingen')
    .select(
      'dossier_id, actief, toon_bestanden, toon_fotos, toon_facturen, toon_meerwerk, ' +
      'toon_formulieren, toon_aandachtspunten, toon_planning, planning_detail, toon_chat, toon_afspraken',
    )
    .eq('dossier_id', dossierId)
    .maybeSingle()

  // getPortaalDossierIds heeft al op actief = true gefilterd, dus dit kan alleen
  // gebeuren bij een race met een beheerder die het dossier net dichtzet.
  if (!data) throw new GeenToegangError('Dossier niet toegankelijk')

  return { gebruiker, dossierId, instellingen: data as PortaalDossierInstellingen }
}

/**
 * Als vereisPortaalDossier, plus de eis dat dit specifieke onderdeel aanstaat.
 * Een uitgezet onderdeel moet niet leeg renderen maar niet bestaan — anders
 * bevestigt de pagina alsnog dát er facturen of foto's zijn.
 */
export async function vereisPortaalOnderdeel(
  dossierId: string,
  onderdeel: PortaalOnderdeel,
): Promise<PortaalDossierContext> {
  const context = await vereisPortaalDossier(dossierId)
  const kolom = PORTAAL_ONDERDEEL_KOLOM[onderdeel]
  if (!(context.instellingen as unknown as Record<string, boolean>)[kolom]) {
    throw new GeenToegangError(`Onderdeel ${onderdeel} staat uit voor dit dossier`)
  }
  return context
}

/* ── Meekijken door een collega ──────────────────────────────────────────────
 *
 * Een projectleider moet kunnen zien wát zijn opdrachtgever ziet, zonder in te
 * loggen als die opdrachtgever. Daarom mag een medewerker met leesrecht op de
 * module `klantportaal` de portaalpagina's openen — als VOORBEELD.
 *
 * Dat voorbeeld is alleen-lezen, en dat is hier geen belofte maar een gevolg van
 * waar deze functies wél en niet gebruikt worden. Alleen de lézende kant kreeg
 * een weergave-variant; elke muterende actie (een bericht plaatsen, meerwerk
 * goedkeuren, een bijlage uploaden) blijft op `vereisPortaalOnderdeel`, en dat
 * laat uitsluitend een klantaccount door. Een collega kan dus niet namens de
 * klant iets versturen of goedkeuren, ook niet met een geprepareerd verzoek.
 *
 * Bewust géén eis dat het portaal openstaat: juist vóórdat je het openzet wil je
 * zien wat er dan te zien is. Het scherm zegt er zelf bij of de klant hier al
 * kan komen. De onderdelen-gate geldt onverkort — de collega ziet daardoor
 * precies wat de klant ziet, niet meer.
 */

export type PortaalBezoeker =
  | { soort: 'klant'; gebruiker: PortaalGebruiker }
  | { soort: 'medewerker'; medewerkerId: string; naam: string }

export type PortaalWeergave = {
  bezoeker: PortaalBezoeker
  dossierId: string
  instellingen: PortaalDossierInstellingen
  /** Een collega kijkt mee. Het scherm hoort dat te zeggen en niets aan te bieden. */
  voorbeeld: boolean
}

const INSTELLINGEN_KOLOMMEN =
  'dossier_id, actief, toon_bestanden, toon_fotos, toon_facturen, toon_meerwerk, ' +
  'toon_formulieren, toon_aandachtspunten, toon_planning, planning_detail, toon_chat, toon_afspraken'

/** Een dossier dat nog nooit voor het portaal is ingericht: alles dicht. */
function legeInstellingen(dossierId: string): PortaalDossierInstellingen {
  return {
    dossier_id: dossierId,
    actief: false,
    toon_bestanden: false, toon_fotos: false, toon_facturen: false, toon_meerwerk: false,
    toon_meerwerk_handmatig: false, toon_formulieren: false, toon_aandachtspunten: false,
    toon_planning: false, planning_detail: false, toon_chat: false, toon_afspraken: false,
    gewijzigd_op: new Date(0).toISOString(),
    gewijzigd_door: null,
  }
}

/**
 * De medewerker die meekijkt, of null. Leesrecht op `klantportaal` volstaat:
 * wie in EVA de Portaal-tab van dit dossier mag openen, mag ook zien wat daar
 * het resultaat van is.
 */
export async function getPortaalVoorbeeldMedewerker(): Promise<{ id: string; naam: string } | null> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return null

  const rechten = await getEffectieveRechten(medewerker)
  if (!heeftModuleToegang(rechten, 'klantportaal', 'lezen')) return null

  return {
    id: medewerker.id,
    naam: [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam]
      .filter(Boolean).join(' ') || 'Collega',
  }
}

/** Wie is dit — een klant, een meekijkende collega, of niemand? */
export async function getPortaalBezoeker(): Promise<PortaalBezoeker | null> {
  const gebruiker = await getPortaalGebruiker()
  if (gebruiker) return { soort: 'klant', gebruiker }

  const medewerker = await getPortaalVoorbeeldMedewerker()
  return medewerker
    ? { soort: 'medewerker', medewerkerId: medewerker.id, naam: medewerker.naam }
    : null
}

/** Als `vereisPortaalPagina`, maar laat een meekijkende collega ook toe. */
export async function vereisPortaalWeergavePagina(): Promise<PortaalBezoeker> {
  const bezoeker = await getPortaalBezoeker()
  if (bezoeker) return bezoeker

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/portaal/geen-toegang' : '/portaal/login')
}

/**
 * Leesgate voor één dossier: de klant van dat dossier, of een meekijkende
 * collega. Gebruik dit in élke lezende functie; voor alles wat schrijft blijft
 * `vereisPortaalOnderdeel` gelden.
 */
export async function vereisPortaalWeergave(dossierId: string): Promise<PortaalWeergave> {
  if (!dossierId) throw new GeenToegangError('Geen dossier')

  // De klantkant eerst en ongewijzigd: één versie van die controle, geen tweede
  // die er net iets naast zit.
  if (await getPortaalGebruiker()) {
    const context = await vereisPortaalDossier(dossierId)
    return {
      bezoeker: { soort: 'klant', gebruiker: context.gebruiker },
      dossierId,
      instellingen: context.instellingen,
      voorbeeld: false,
    }
  }

  const medewerker = await getPortaalVoorbeeldMedewerker()
  if (!medewerker) throw new GeenToegangError('Geen portaaltoegang')

  // Bestaat het dossier eigenlijk wel? Zonder deze controle loopt een vertypt id
  // verderop stuk op een gewone Error, en dat wordt een foutscherm in plaats van
  // een 404.
  const { data: dossier } = await db().from('dossiers').select('id').eq('id', dossierId).maybeSingle()
  if (!dossier) throw new GeenToegangError('Dossier bestaat niet')

  const { data } = await db()
    .from('portaal_dossier_instellingen')
    .select(INSTELLINGEN_KOLOMMEN)
    .eq('dossier_id', dossierId)
    .maybeSingle()

  return {
    bezoeker: { soort: 'medewerker', medewerkerId: medewerker.id, naam: medewerker.naam },
    dossierId,
    instellingen: (data as PortaalDossierInstellingen | null) ?? legeInstellingen(dossierId),
    voorbeeld: true,
  }
}

/** Als `vereisPortaalOnderdeel`, maar lezend — dus ook voor een meekijker. */
export async function vereisPortaalOnderdeelWeergave(
  dossierId: string,
  onderdeel: PortaalOnderdeel,
): Promise<PortaalWeergave> {
  const weergave = await vereisPortaalWeergave(dossierId)
  const kolom = PORTAAL_ONDERDEEL_KOLOM[onderdeel]
  if (!(weergave.instellingen as unknown as Record<string, boolean>)[kolom]) {
    throw new GeenToegangError(`Onderdeel ${onderdeel} staat uit voor dit dossier`)
  }
  return weergave
}

/**
 * De naam achter een portaalaccount, voor vastlegging en meldingen. Valt terug
 * op het e-mailadres: een besluit zonder naam is onbruikbaar als bewijs.
 */
export async function portaalGebruikerNaam(gebruiker: PortaalGebruiker): Promise<string> {
  const tabel = gebruiker.contactpersoon_id ? 'contactpersonen'
    : gebruiker.particulier_id ? 'particulieren' : null
  const id = gebruiker.contactpersoon_id ?? gebruiker.particulier_id
  if (!tabel || !id) return gebruiker.email

  const { data } = await db().from(tabel)
    .select('voornaam, tussenvoegsel, achternaam').eq('id', id).maybeSingle()
  if (!data) return gebruiker.email
  return [data.voornaam, data.tussenvoegsel, data.achternaam].filter(Boolean).join(' ') || gebruiker.email
}

/**
 * Vastleggen wat iemand opvroeg. Gooit nooit: een mislukt logregeltje mag een
 * pagina niet omleggen. Alleen aanroepen voor echte inhoud (een bestand, een
 * dossier), niet voor elke navigatie — anders is het log niet meer te lezen.
 */
export async function logPortaalToegang(input: {
  portaalGebruikerId: string
  dossierId?: string | null
  onderdeel?: string | null
  sleutel?: string | null
  ip?: string | null
}): Promise<void> {
  try {
    await db().from('portaal_toegang_log').insert({
      portaal_gebruiker_id: input.portaalGebruikerId,
      dossier_id: input.dossierId ?? null,
      onderdeel: input.onderdeel ?? null,
      sleutel: input.sleutel ?? null,
      ip: input.ip ?? null,
    })
  } catch {
    // bewust stil
  }
}
