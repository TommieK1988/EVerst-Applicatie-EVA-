/**
 * Rollen van een relatie naar Bouw7 brengen (EVA → Bouw7).
 *
 * In EVA is een bedrijf één relatie, ook als het opdrachtgever én leverancier is. Bouw7 geeft
 * een contact precies één type, dus daar is elke rol een eigen contact — met exact dezelfde
 * gegevens. Zet iemand in EVA een type bij, dan maakt `zorgVoorBouw7Rollen` dat extra contact
 * aan en legt het vast als spiegel (`relatie_bouw7_koppelingen`), zodat de sync het herkent als
 * dezelfde relatie in plaats van er een tweede EVA-relatie van te maken. Latere wijzigingen gaan
 * via `schrijfBouw7Relatie` naar alle spiegels tegelijk.
 */

import { createAdminClient } from '@everts/database/server'
import type { OrganisatieType } from '@everts/database'
import { getBouw7Client } from './sync'
import type { Bouw7Contact, Bouw7ListResponse } from './client'
import { maakBouw7RelatieOfFout, mapType } from './create-contact'
import { spiegelsVanRelatie, legRelatieSpiegelVast, type RelatieRol } from './relatie-spiegel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Maatwerkveld "Soort opdrachtgever" — het extra contact neemt de waarde van het eerste over. */
const SOORT_OPDRACHTGEVER_ATTR_ID = 19272

const ROL_LABEL: Record<RelatieRol, string> = {
  opdrachtgever: 'Opdrachtgever', leverancier: 'Leverancier', onderaannemer: 'Onderaannemer',
}

async function bouw7TypeVanContact(bouw7Id: string): Promise<RelatieRol | null> {
  const client = await getBouw7Client()
  const c = (await client.get<Bouw7ListResponse<Bouw7Contact>>('/list/contacts', { q: `id = ${Number(bouw7Id)}` })).items?.[0]
  return c ? mapType(c.type?.name) : null
}

/**
 * De rollen waarin deze relatie in Bouw7 bestaat, één per spiegel. Oudere spiegels hebben geen
 * `bouw7_type`; die vragen we bij Bouw7 op en leggen we meteen vast — anders zou een rol die er
 * al is als ontbrekend gelden en dubbel worden aangemaakt.
 */
export async function bouw7RollenVanRelatie(relatieId: string): Promise<RelatieRol[]> {
  const supabase = db()
  const spiegels = await spiegelsVanRelatie(relatieId)

  if (spiegels.length === 0) {
    // Relatie met een Bouw7-id maar zonder spiegelrij (vóór okt 2026 in EVA aangemaakt).
    const { data } = await supabase.from('relaties').select('bouw7_id').eq('id', relatieId).maybeSingle()
    if (!data?.bouw7_id) return []
    const rol = await bouw7TypeVanContact(data.bouw7_id)
    await legRelatieSpiegelVast({ relatieId, bouw7Id: data.bouw7_id, bouw7Type: rol })
    return rol ? [rol] : []
  }

  const rollen = new Set<RelatieRol>()
  for (const s of spiegels) {
    let rol = s.bouw7_type as RelatieRol | null
    if (!rol) {
      rol = await bouw7TypeVanContact(s.bouw7_id)
      if (rol) await supabase.from('relatie_bouw7_koppelingen').update({ bouw7_type: rol }).eq('id', s.id)
    }
    if (rol) rollen.add(rol)
  }
  return [...rollen]
}

export type RollenResultaat = { aangemaakt: RelatieRol[]; fouten: string[] }

/**
 * Maak in Bouw7 een contact aan voor elk EVA-type van deze relatie dat daar nog geen contact
 * heeft. Alleen voor relaties die al in Bouw7 staan; een relatie die alleen in EVA bestaat
 * blijft dat. Gooit niet: wat mislukt staat in `fouten`.
 */
export async function zorgVoorBouw7Rollen(relatieId: string): Promise<RollenResultaat> {
  const res: RollenResultaat = { aangemaakt: [], fouten: [] }
  try {
    const supabase = db()
    const { data: r } = await supabase
      .from('relaties')
      .select('id, naam, types, bouw7_id, samengevoegd_in, kvk_nummer, btw_nummer, email, telefoon, mobiel, opmerkingen, adres_straat, adres_postcode, adres_plaats, adres_land')
      .eq('id', relatieId)
      .maybeSingle()
    if (!r || r.samengevoegd_in) return res

    const bestaand = await bouw7RollenVanRelatie(relatieId)
    if (bestaand.length === 0) return res
    const ontbrekend = ((r.types ?? []) as OrganisatieType[]).filter(t => !bestaand.includes(t))
    if (ontbrekend.length === 0) return res

    // Gegevens die niet op de relatierij staan: IBAN en de "Soort opdrachtgever" van het
    // bestaande contact — dat tweede contact moet er in Bouw7 hetzelfde uitzien.
    const { data: bank } = await supabase.from('relatie_bankgegevens').select('iban').eq('relatie_id', relatieId).maybeSingle()
    const [primair] = await spiegelsVanRelatie(relatieId)
    let soort: string | null = null
    if (primair) {
      const client = await getBouw7Client()
      const detail = await client.get<{ customAttributeValues?: { customAttribute?: { id?: number }; value?: string | null }[] }>(
        `/contact/${Number(primair.bouw7_id)}`,
      ).catch(() => null)
      soort = detail?.customAttributeValues?.find(v => v.customAttribute?.id === SOORT_OPDRACHTGEVER_ATTR_ID)?.value ?? null
    }

    for (const rol of ontbrekend) {
      // Staat hetzelfde bedrijf al als losse EVA-relatie in deze rol in Bouw7, dan is aanmaken
      // het verkeerde antwoord: dat geeft een derde rij. Die twee horen samengevoegd te worden.
      if (r.kvk_nummer) {
        const dubbel = await bestaandeRelatieInRol(relatieId, r.kvk_nummer, rol)
        if (dubbel) {
          res.fouten.push(`${ROL_LABEL[rol]}: staat in Bouw7 al als "${dubbel}" (zelfde KvK). Voeg die relaties samen in plaats van een nieuw contact aan te maken.`)
          continue
        }
      }

      const nieuw = await maakBouw7RelatieOfFout({
        naam: r.naam,
        types: r.types ?? [],
        rol,
        soort,
        kvk_nummer: r.kvk_nummer,
        btw_nummer: r.btw_nummer,
        email: r.email,
        telefoon: r.telefoon,
        mobiel: r.mobiel,
        iban: bank?.iban ?? null,
        adres_straat: r.adres_straat,
        adres_postcode: r.adres_postcode,
        adres_plaats: r.adres_plaats,
        adres_land: r.adres_land,
        opmerkingen: r.opmerkingen,
      })
      if ('error' in nieuw) { res.fouten.push(`${ROL_LABEL[rol]}: ${nieuw.error}`); continue }
      await legRelatieSpiegelVast({ relatieId, bouw7Id: nieuw.id, bouw7Type: rol })
      res.aangemaakt.push(rol)
    }
  } catch (e) {
    res.fouten.push(e instanceof Error ? e.message : 'Onbekende fout bij aanmaken in Bouw7.')
  }
  return res
}

/** Naam van een andere actieve relatie met dit KvK-nummer die al een Bouw7-contact in deze rol heeft. */
async function bestaandeRelatieInRol(relatieId: string, kvk: string, rol: RelatieRol): Promise<string | null> {
  const supabase = db()
  const { data: anderen } = await supabase
    .from('relaties')
    .select('id, naam')
    .eq('kvk_nummer', kvk)
    .neq('id', relatieId)
    .is('samengevoegd_in', null)
    .limit(20)
  const ids = ((anderen ?? []) as { id: string }[]).map(a => a.id)
  if (ids.length === 0) return null
  const { data: raak } = await supabase
    .from('relatie_bouw7_koppelingen')
    .select('relatie_id')
    .in('relatie_id', ids)
    .eq('bouw7_type', rol)
    .limit(1)
  const id = (raak ?? [])[0]?.relatie_id
  return id ? ((anderen as { id: string; naam: string }[]).find(a => a.id === id)?.naam ?? null) : null
}
