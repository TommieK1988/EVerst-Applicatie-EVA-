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
import { UITKOMST_LABELS, naamVan, type MedewerkerNaam, type UitkomstSleutel } from './types'

export type OffertePaneelData = {
  bewaking: BewakingWeergave
  tijdlijn: TijdlijnRegel[]
  /** `geldig_tot` van de nieuwste verzonden EVA-offerte; null bij een Bouw7-offerte. */
  geldigTot: string | null
  versie: number | null
  /** Is er een offerte-PDF te openen via /api/dossiers/[id]/offerte/pdf? */
  heeftPdf: boolean
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
  return {
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
