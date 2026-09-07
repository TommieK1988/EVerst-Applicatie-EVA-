import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { PortaalGebruiker } from '@everts/database/platform-types'
import { getPortaalDossierIds, vereisPortaalWeergave } from './auth'
import { PORTAAL_ROLLEN, portaalStatusLabel } from './onderdelen'

/**
 * dossiers.ts — wat een klant van zijn project te zien krijgt.
 *
 * DE REGEL VOOR DIT HELE BESTAND: opsommen wat mee mag, nooit weglaten wat niet
 * mee mag. Geen `select('*')`, geen EVA-type dat rechtstreeks naar de client
 * gaat, altijd een expliciete mapping naar een Portaal…-type. Dat is de enige
 * bescherming die blijft werken als er morgen een kolom bij komt: een blacklist
 * vergeet je bij te werken, een whitelist laat nieuwe velden vanzelf buiten.
 *
 * Wat hier dus niet in staat en er ook niet in hoort: aanneemsom, meerwerk,
 * marges, interne substatussen, de Bouw7-projectstatus, calculator en controller,
 * uurtarieven, en alles uit dossier_notities.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Precies de dossierkolommen die de klant mag zien. */
const DOSSIER_KOLOMMEN =
  'id, dossiernummer, titel, hoofdstatus, opdracht_substatus, ' +
  'werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad'

export type PortaalDossierKaart = {
  id: string
  nummer: string | null
  titel: string
  status: string
  adres: string | null
}

export type PortaalBetrokkene = {
  rol: string
  naam: string
  email: string | null
  /**
   * Twee aparte nummers, want ze doen iets anders: een uitvoerder is doorgaans op
   * zijn mobiel bereikbaar, het vaste nummer is wat je belt als hij niet opneemt.
   * Stond eerder als één veld `telefoon` waar de mobiel in zat -- misleidend.
   */
  mobiel: string | null
  telefoon: string | null
  fotoUrl: string | null
}

export type PortaalDossierDetail = PortaalDossierKaart & {
  betrokkenen: PortaalBetrokkene[]
  /**
   * Een collega kijkt mee in plaats van de klant. Alleen dán zegt `portaalActief`
   * iets: een klant komt nooit op een dossier dat dichtstaat.
   */
  voorbeeld: boolean
  /** Staat het portaal voor dit dossier open — kan de klant hier al komen? */
  portaalActief: boolean
  /** Welke onderdelen deze klant bij dit dossier open kan klappen. */
  onderdelen: {
    bestanden: boolean
    fotos: boolean
    facturen: boolean
    meerwerk: boolean
    formulieren: boolean
    aandachtspunten: boolean
    planning: boolean
    chat: boolean
  }
}

function adresVan(rij: Record<string, unknown>): string | null {
  const straat = [rij.werkadres_straat, rij.werkadres_huisnummer].filter(Boolean).join(' ')
  const plaats = [rij.werkadres_postcode, rij.werkadres_stad].filter(Boolean).join(' ')
  const heel = [straat, plaats].filter(Boolean).join(', ')
  return heel || null
}

function naarKaart(rij: Record<string, unknown>): PortaalDossierKaart {
  return {
    id: String(rij.id),
    nummer: (rij.dossiernummer as string | null) ?? null,
    titel: (rij.titel as string | null) ?? 'Project',
    status: portaalStatusLabel(rij.hoofdstatus as string, rij.opdracht_substatus as string),
    adres: adresVan(rij),
  }
}

/** De dossiers van deze klant, nieuwste eerst. */
export async function getPortaalDossiers(gebruiker: PortaalGebruiker): Promise<PortaalDossierKaart[]> {
  const ids = await getPortaalDossierIds(gebruiker)
  if (ids.length === 0) return []

  // In blokken, want `.in()` met duizenden ids wordt een onwerkbaar lange URL.
  const kaarten: PortaalDossierKaart[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db()
      .from('dossiers')
      .select(DOSSIER_KOLOMMEN)
      .in('id', ids.slice(i, i + 200))
      .order('created_at', { ascending: false })
    ;(data as Record<string, unknown>[] | null)?.forEach(r => kaarten.push(naarKaart(r)))
  }
  return kaarten
}

/**
 * Eén dossier met zijn betrokkenen. Doet zelf de toegangscontrole, zodat een
 * aanroeper die dat vergeet nog steeds niets krijgt.
 */
export async function getPortaalDossier(dossierId: string): Promise<PortaalDossierDetail> {
  const { instellingen, voorbeeld } = await vereisPortaalWeergave(dossierId)

  const rolKolommen = PORTAAL_ROLLEN.map(r => r.kolom).join(', ')
  const { data: rij } = await db()
    .from('dossiers')
    .select(`${DOSSIER_KOLOMMEN}, ${rolKolommen}`)
    .eq('id', dossierId)
    .maybeSingle()

  if (!rij) throw new Error('Dossier niet gevonden')

  return {
    ...naarKaart(rij),
    betrokkenen: await haalBetrokkenen(rij),
    voorbeeld,
    portaalActief: instellingen.actief,
    onderdelen: {
      bestanden:       instellingen.toon_bestanden,
      fotos:           instellingen.toon_fotos,
      facturen:        instellingen.toon_facturen,
      meerwerk:        instellingen.toon_meerwerk,
      formulieren:     instellingen.toon_formulieren,
      aandachtspunten: instellingen.toon_aandachtspunten,
      planning:        instellingen.toon_planning,
      chat:            instellingen.toon_chat,
    },
  }
}

/**
 * Wie er van onze kant aan het project werkt.
 *
 * Bewust niet via `getMailOntvangers` uit lib/mail/ontvangers.ts: die eist een
 * medewerkerssessie en valt als vangnet terug op álle medewerkers — precies wat
 * hier niet mag gebeuren. Van elke rolhouder gaan alleen naam, functie, zakelijk
 * e-mailadres, mobiel en foto mee; één persoon met twee rollen komt één keer in
 * de lijst met beide rollen erachter.
 */
async function haalBetrokkenen(rij: Record<string, unknown>): Promise<PortaalBetrokkene[]> {
  const rollenPerId = new Map<string, string[]>()
  for (const rol of PORTAAL_ROLLEN) {
    const id = rij[rol.kolom] as string | null
    if (!id) continue
    rollenPerId.set(id, [...(rollenPerId.get(id) ?? []), rol.label])
  }
  if (rollenPerId.size === 0) return []

  const { data } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, email, o365_email, mobiel, telefoon, foto_url')
    .in('id', [...rollenPerId.keys()])
    .eq('actief', true)

  return ((data as Record<string, unknown>[] | null) ?? []).map(m => ({
    rol: (rollenPerId.get(String(m.id)) ?? []).join(' · '),
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
    email: ((m.o365_email as string | null) ?? (m.email as string | null)) || null,
    mobiel: (m.mobiel as string | null) || null,
    telefoon: (m.telefoon as string | null) || null,
    fotoUrl: (m.foto_url as string | null) || null,
  }))
  // Volgorde van PORTAAL_ROLLEN aanhouden: projectleider eerst, niet op naam.
  .sort((a, b) => volgorde(a.rol) - volgorde(b.rol))
}

function volgorde(rolLabel: string): number {
  const eerste = rolLabel.split(' · ')[0]
  const i = PORTAAL_ROLLEN.findIndex(r => r.label === eerste)
  return i < 0 ? 99 : i
}
