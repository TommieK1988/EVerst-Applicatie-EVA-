'use server'

/**
 * Alles wat het zijpaneel in "Te doen" nodig heeft voor één offerte, in één ronde.
 *
 * Het paneel opent bij een klik op een rij in de werklijst. Wat in de rij al zit (titel, klant,
 * contactpersoon, bedrag) komt niet nog eens mee; hier staat alleen wat de lijst niet laadt: de
 * bewakingskaart met namen, de tijdlijn, de geldigheid van de offerte en of er een PDF is.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { kiesOfferteBronnen } from '@/lib/dossiers/offerte-bron'
import { ID_BLOK } from '@/lib/dossiers/kaart-bedragen'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { getBewaking, getTijdlijn, type BewakingWeergave, type TijdlijnRegel } from './actions'
import { magMegaEigenaarZijn } from './opvolging'
import { UITKOMST_LABELS, naamVan, type MedewerkerNaam, type UitkomstSleutel } from './types'

export type OffertePaneelData = {
  bewaking: BewakingWeergave
  tijdlijn: TijdlijnRegel[]
  /** `geldig_tot` van de nieuwste verzonden EVA-offerte; null bij een Bouw7-offerte. */
  geldigTot: string | null
  versie: number | null
  /** Is er een offerte-PDF te openen via /api/dossiers/[id]/offerte/pdf? */
  heeftPdf: boolean
  /** Mag de eigenaar een mega-offerte houden (projectleider/directie)? null = geen eigenaar. */
  eigenaarMagMega: boolean | null
}

export async function getOffertePaneel(dossierId: string): Promise<OffertePaneelData> {
  await vereisRecht('dossiers', 'lezen')
  // Het id komt van de client en gaat in een `.or()`-filter: alleen een uuid laten passeren.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dossierId)) {
    throw new Error('Ongeldig dossier.')
  }
  const supabase = createAdminClient()

  const { data: dossier } = await supabase.from('dossiers')
    .select('everts_calc_project_id').eq('id', dossierId).maybeSingle()
  const projectId = dossier?.everts_calc_project_id ? String(dossier.everts_calc_project_id) : null

  // Begrensd op één dossier: een handvol versies.
  const quoteFilter = projectId
    ? `dossier_id.eq.${dossierId},project_id.eq.${projectId}`
    : `dossier_id.eq.${dossierId}`

  const [bewaking, tijdlijn, { data: quotes }, bronnen] = await Promise.all([
    getBewaking(dossierId),
    getTijdlijn(dossierId),
    supabase.from('quotes')
      .select('versie, geldig_tot, verzonden_at')
      .or(quoteFilter)
      .eq('status', 'verzonden')
      .is('meerwerk_regel_id', null)
      .neq('type', 'interne_calculatie')
      .order('versie', { ascending: false })
      .limit(1),
    kiesOfferteBronnen([dossierId]),
  ])

  const quote = quotes?.[0] ?? null
  let eigenaarMagMega: boolean | null = null
  if (bewaking.kaart?.eigenaar_id) {
    const { data: eigenaar } = await supabase.from('medewerkers')
      .select('functie').eq('id', bewaking.kaart.eigenaar_id).maybeSingle()
    eigenaarMagMega = magMegaEigenaarZijn(eigenaar?.functie)
  }
  return {
    eigenaarMagMega,
    bewaking,
    tijdlijn,
    geldigTot: quote?.geldig_tot ?? null,
    versie: quote?.versie ?? null,
    heeftPdf: bronnen.has(dossierId),
  }
}

/** Het laatste klantcontact per offerte, voor de kolom in "Te doen". Geserialiseerd als lijst. */
export type LaatsteContactRegel = { dossierId: string; op: string; door: string | null; kop: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Per dossier het meest recente contactmoment uit de commerciële tijdlijn.
 *
 * In blokken van ID_BLOK dossiers en gepagineerd: een offerte kan tientallen contactmomenten
 * hebben, dus ook een blok van 150 dossiers kan boven de 1000 rijen uitkomen (zie CLAUDE.md
 * over de stille afkapping van PostgREST). De nieuwste per kaart wint.
 */
export async function getLaatsteContacten(dossierIds: string[]): Promise<LaatsteContactRegel[]> {
  await vereisRecht('dossiers', 'lezen')
  const ids = [...new Set(dossierIds.filter(id => UUID.test(id)))]
  if (ids.length === 0) return []
  const supabase = createAdminClient()

  const blokken: string[][] = []
  for (let i = 0; i < ids.length; i += ID_BLOK) blokken.push(ids.slice(i, i + ID_BLOK))

  // Kaart per dossier: hoogstens één rij per dossier, dus per blok ruim onder de grens.
  const kaarten = (await Promise.all(blokken.map(async blok => {
    const { data } = await supabase.from('commercie_bewaking')
      .select('id, dossier_id').in('dossier_id', blok)
    return (data ?? []) as { id: string; dossier_id: string }[]
  }))).flat()
  const dossierVanKaart = new Map(kaarten.map(k => [k.id, k.dossier_id]))
  const kaartIds = [...dossierVanKaart.keys()]
  if (kaartIds.length === 0) return []

  type Gebeurtenis = { bewaking_id: string; uitkomst: string | null; door: string | null; op: string; id: string }
  const kaartBlokken: string[][] = []
  for (let i = 0; i < kaartIds.length; i += ID_BLOK) kaartBlokken.push(kaartIds.slice(i, i + ID_BLOK))
  const gebeurtenissen = (await Promise.all(kaartBlokken.map(blok =>
    haalAlleRijen<Gebeurtenis>((van, tot) => supabase.from('commercie_gebeurtenissen')
      .select('id, bewaking_id, uitkomst, door, op')
      .in('bewaking_id', blok)
      .eq('soort', 'contact')
      .order('op', { ascending: false })
      .order('id')
      .range(van, tot)),
  ))).flat()

  const nieuwste = new Map<string, Gebeurtenis>()
  for (const g of gebeurtenissen) {
    const huidig = nieuwste.get(g.bewaking_id)
    if (!huidig || g.op > huidig.op) nieuwste.set(g.bewaking_id, g)
  }

  const mensIds = [...new Set([...nieuwste.values()].map(g => g.door).filter(Boolean))] as string[]
  const namen = new Map<string, string | null>()
  if (mensIds.length > 0) {
    // Begrensd: hoogstens het aantal collega's dat ooit een offerte belde.
    const { data } = await supabase.from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam').in('id', mensIds)
    for (const m of (data ?? []) as MedewerkerNaam[]) namen.set(m.id, m.voornaam ?? naamVan(m))
  }

  return [...nieuwste.values()].map(g => ({
    dossierId: dossierVanKaart.get(g.bewaking_id)!,
    op: g.op,
    door: g.door ? namen.get(g.door) ?? null : null,
    kop: g.uitkomst && g.uitkomst in UITKOMST_LABELS ? UITKOMST_LABELS[g.uitkomst as UitkomstSleutel] : 'Contact',
  }))
}

// ── Overige open offertes bij dezelfde partij ────────────────────────────────

/**
 * Welke andere open offertes horen bij wie je aan de lijn hebt?
 *
 * Bij VvE's bel je meestal de beheerder, soms rechtstreeks de voorzitter. Wie je spreekt is dus
 * niet altijd de opdrachtgever van het dossier: bij een beheerder met dertig VvE's is de
 * opdrachtgever per dossier een andere VvE. Daarom kijken we naar drie dingen tegelijk:
 *
 *  1. dezelfde opdrachtgever (`klant_id`);
 *  2. dezelfde contactpersoon (`contactpersoon_id`): de voorzitter of de vaste beheerder;
 *  3. de organisatie van die contactpersoon (`contactpersoon_organisaties`), meestal het
 *     beheerkantoor, en alle objecten waar die organisatie bij staat (`vastgoed_object_relaties`).
 *
 * Geeft alleen ids terug: de werklijst heeft alle open offertes al geladen en toont ze met
 * dezelfde stip, stap en bedrag als in de lijst.
 */
export type OverigeOffertes = { partij: string | null; dossierIds: string[] }

/** Grens per zoekvraag: een partij met meer open offertes dan dit is geen telefoongesprek meer. */
const MAX_OVERIG = 50

export async function getOverigeOffertes(dossierId: string): Promise<OverigeOffertes> {
  await vereisRecht('dossiers', 'lezen')
  if (!UUID.test(dossierId)) return { partij: null, dossierIds: [] }
  const supabase = createAdminClient()

  const { data: d } = await supabase.from('dossiers')
    .select('klant_id, contactpersoon_id, object_id, relaties!klant_id(naam)')
    .eq('id', dossierId).maybeSingle()
  if (!d) return { partij: null, dossierIds: [] }

  // De organisaties achter de contactpersoon (het beheerkantoor), begrensd per contactpersoon.
  const { data: orgs } = d.contactpersoon_id
    ? await supabase.from('contactpersoon_organisaties')
      .select('organisatie_id, relaties!organisatie_id(naam)')
      .eq('contactpersoon_id', d.contactpersoon_id).limit(10)
    : { data: [] as { organisatie_id: string; relaties: { naam: string | null } | null }[] }
  const orgIds = (orgs ?? []).map(o => o.organisatie_id)
  const partijIds = [...new Set([d.klant_id, ...orgIds].filter(Boolean))] as string[]

  // Objecten waar deze partijen bij staan (beheerder, VvE, eigenaar).
  const { data: objRel } = partijIds.length > 0
    ? await supabase.from('vastgoed_object_relaties')
      .select('object_id').in('relatie_id', partijIds).limit(500)
    : { data: [] as { object_id: string }[] }
  const objectIds = [...new Set([d.object_id, ...(objRel ?? []).map(o => o.object_id)].filter(Boolean))] as string[]

  const filters = [
    partijIds.length ? `klant_id.in.(${partijIds.join(',')})` : null,
    d.contactpersoon_id ? `contactpersoon_id.eq.${d.contactpersoon_id}` : null,
    objectIds.length ? `object_id.in.(${objectIds.slice(0, 300).join(',')})` : null,
  ].filter(Boolean)
  if (filters.length === 0) return { partij: null, dossierIds: [] }

  const { data: rijen } = await supabase.from('dossiers')
    .select('id')
    .eq('hoofdstatus', 'offerte')
    .not('offerte_substatus', 'in', '(verloren,vervallen)')
    .neq('id', dossierId)
    .or(filters.join(','))
    .order('id')
    .limit(MAX_OVERIG)

  // De naam van wie je belt: het kantoor achter de contactpersoon, anders de opdrachtgever.
  const orgNaam = (orgs ?? []).map(o => (o.relaties as { naam: string | null } | null)?.naam).find(Boolean) ?? null
  const klantNaam = (d.relaties as { naam: string | null } | null)?.naam ?? null
  return { partij: orgNaam ?? klantNaam, dossierIds: (rijen ?? []).map(r => r.id as string) }
}

/**
 * "Meebesproken": de notitie van het gesprek ook op de andere offertes van dezelfde partij, zodat
 * wie daar morgen belt ziet dat het al besproken is. Alleen een tijdlijnregel; de stap van die
 * offertes verandert niet, want wat er daar is afgesproken kan anders zijn.
 */
export async function legMeebesprokenVast(
  dossierIds: string[], tekst: string, bronNummer: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  const ids = [...new Set(dossierIds.filter(id => UUID.test(id)))].slice(0, MAX_OVERIG)
  if (ids.length === 0 || !tekst.trim()) return { ok: true }
  const supabase = createAdminClient()

  const { data: bestaand } = await supabase.from('commercie_bewaking')
    .select('id, dossier_id').in('dossier_id', ids)
  const kaartVan = new Map((bestaand ?? []).map(k => [k.dossier_id as string, k.id as string]))
  const zonder = ids.filter(id => !kaartVan.has(id))
  if (zonder.length > 0) {
    const { data: nieuw } = await supabase.from('commercie_bewaking')
      .insert(zonder.map(id => ({ dossier_id: id, soort: 'offerte' })))
      .select('id, dossier_id')
    for (const k of nieuw ?? []) kaartVan.set(k.dossier_id as string, k.id as string)
  }

  const kop = bronNummer ? `Meebesproken bij ${bronNummer}: ` : 'Meebesproken: '
  const { error } = await supabase.from('commercie_gebeurtenissen').insert(
    [...kaartVan.values()].map(bewaking_id => ({
      bewaking_id, soort: 'notitie', tekst: `${kop}${tekst.trim()}`, door: medewerker.id,
    })),
  )
  return error ? { ok: false, error: error.message } : { ok: true }
}
