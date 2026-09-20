import 'server-only'

/**
 * Alles over één contactpersoon, voor het mobiele scherm onder Commercieel.
 *
 * Bestaat naast het klantbeeld omdat je een persoon spreekt, niet een organisatie: je zoekt
 * op "Jan de Vries", je belt zijn mobiel, en je wilt weten wat je met hém hebt afgesproken.
 * De opdrachtgever staat er als link bij, want een contactpersoon kan aan meerdere
 * organisaties hangen (`contactpersoon_organisaties` is een n-op-n).
 *
 * Alle velden van de contactpersoon gaan mee, ook de privégegevens. Dat is dezelfde data die
 * de desktoppagina toont, achter hetzelfde recht (`relaties`) — dit scherm zet er niets
 * nieuws mee open. Het scherm toont alleen wat gevuld is, dus de privésectie blijft weg
 * zolang niemand die velden invult (vandaag: geen enkele).
 */

import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { getContactpersoonDossiers } from '@/lib/relaties/dossiers'
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import type { RelatieNotitie } from '@/lib/relaties/notities-types'

/** Eén organisatie waar deze persoon aan hangt, met zijn rol daar. */
export type ContactpersoonOrganisatie = {
  relatieId: string
  naam: string
  plaats: string | null
  functie: string | null
  isPrimair: boolean
  /** Vrije opmerking bij déze koppeling (niet bij de persoon zelf). */
  opmerkingen: string | null
}

export type ContactpersoonBeeld = {
  id: string
  naam: string
  actief: boolean
  /** Zakelijke bereikbaarheid. */
  email: string | null
  telefoon: string | null
  mobiel: string | null
  /* Persoonsgegevens — alleen gevuld wat er staat. */
  aanhef: string | null
  voorletter: string | null
  geslacht: string | null
  geboortedatum: string | null
  linkedinUrl: string | null
  /* Privé — vandaag nergens gevuld; het scherm laat de sectie dan weg. */
  priveEmail: string | null
  priveTelefoon: string | null
  priveAdres: string | null
  /** Vaste kenmerken bij de persoon ("alleen bereikbaar op dinsdag"), los van gesprekken. */
  opmerkingen: string | null
  organisaties: ContactpersoonOrganisatie[]
  /** Dossiers waarop hij de contactpersoon is. */
  dossiers: RelatieDossier[]
  /** Gespreksnotities die aan hém gekoppeld zijn. */
  notities: RelatieNotitie[]
}

type NaamVelden = { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

function volledigeNaam(m: NaamVelden | null | undefined, terugval = 'Onbekend'): string {
  if (!m) return terugval
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim() || terugval
}

/** Lege strings tellen als niet ingevuld: dan blijft het veld van het scherm. */
const leeg = (v: string | null | undefined): string | null => (v?.trim() ? v.trim() : null)

/** Eén adresregel, of niets als er geen enkel adresdeel staat. */
function adresRegel(straat: string | null, postcode: string | null, plaats: string | null): string | null {
  const onder = [postcode, plaats].filter(Boolean).join(' ').trim()
  return [leeg(straat), onder || null].filter(Boolean).join(', ') || null
}

/**
 * Gespreksnotities die aan deze persoon hangen, nieuwste eerst.
 *
 * Begrensd door `.eq('contactpersoon_id', …)` — één persoon blijft ruim onder de 1000 rijen
 * waarop PostgREST stil afkapt.
 */
async function leesNotities(
  supabase: ReturnType<typeof createAdminClient>,
  contactpersoonId: string,
): Promise<RelatieNotitie[]> {
  const { data } = await supabase
    .from('relatie_notities')
    .select('id, inhoud, created_at, medewerker_id, contactpersoon_id, medewerkers(voornaam, tussenvoegsel, achternaam)')
    .eq('contactpersoon_id', contactpersoonId)
    .order('created_at', { ascending: false })

  type Rij = {
    id: string; inhoud: string; created_at: string
    medewerker_id: string | null; contactpersoon_id: string | null
    medewerkers: NaamVelden | null
  }

  return ((data ?? []) as unknown as Rij[]).map(r => ({
    id: r.id,
    inhoud: r.inhoud,
    created_at: r.created_at,
    medewerker_id: r.medewerker_id,
    auteur_naam: volledigeNaam(r.medewerkers),
    contactpersoon_id: r.contactpersoon_id,
    // Overbodig op dit scherm: je kijkt al naar die persoon.
    contactpersoon_naam: null,
  }))
}

export async function getContactpersoonBeeld(
  contactpersoonId: string,
): Promise<ContactpersoonBeeld | null> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return null

  const supabase = createAdminClient()

  const [cpRes, koppelRes, dossiers, notities] = await Promise.all([
    supabase.from('contactpersonen')
      .select(`id, voornaam, tussenvoegsel, achternaam, actief, email, telefoon, mobiel,
               aanhef, voorletter, geslacht, geboortedatum, linkedin_url, opmerkingen,
               prive_email, prive_telefoon, prive_adres_straat, prive_adres_postcode,
               prive_adres_plaats`)
      .eq('id', contactpersoonId).maybeSingle(),
    // Begrensd op één persoon; de embed haalt de organisatie er in één ronde bij.
    supabase.from('contactpersoon_organisaties')
      .select('organisatie_id, functie, is_primair, opmerkingen, relaties(id, naam, adres_plaats)')
      .eq('contactpersoon_id', contactpersoonId)
      .order('is_primair', { ascending: false }),
    getContactpersoonDossiers(contactpersoonId),
    leesNotities(supabase, contactpersoonId),
  ])

  if (!cpRes.data) return null
  const c = cpRes.data

  type KoppelRij = {
    organisatie_id: string
    functie: string | null
    is_primair: boolean | null
    opmerkingen: string | null
    relaties: { id: string; naam: string; adres_plaats: string | null } | null
  }

  const organisaties = ((koppelRes.data ?? []) as unknown as KoppelRij[])
    // Een koppeling zonder organisatie zou een rij zonder naam en zonder link opleveren.
    .filter(k => !!k.relaties)
    .map((k): ContactpersoonOrganisatie => ({
      relatieId:   k.relaties!.id,
      naam:        k.relaties!.naam,
      plaats:      k.relaties!.adres_plaats,
      functie:     leeg(k.functie),
      isPrimair:   !!k.is_primair,
      opmerkingen: leeg(k.opmerkingen),
    }))

  return {
    id: c.id,
    naam: volledigeNaam(c, 'Naamloos'),
    actief: c.actief !== false,
    email:    leeg(c.email),
    telefoon: leeg(c.telefoon),
    mobiel:   leeg(c.mobiel),
    aanhef:        leeg(c.aanhef),
    voorletter:    leeg(c.voorletter),
    geslacht:      leeg(c.geslacht),
    geboortedatum: leeg(c.geboortedatum),
    linkedinUrl:   leeg(c.linkedin_url),
    priveEmail:    leeg(c.prive_email),
    priveTelefoon: leeg(c.prive_telefoon),
    // `prive_adres_land` staat overal op de standaardwaarde 'Nederland' en zegt dus niets;
    // die laten we weg zolang er geen straat of plaats bij staat.
    priveAdres: adresRegel(c.prive_adres_straat, c.prive_adres_postcode, c.prive_adres_plaats),
    opmerkingen: leeg(c.opmerkingen),
    organisaties,
    dossiers,
    notities,
  }
}
