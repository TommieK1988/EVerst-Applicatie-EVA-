'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import type { Database } from '@everts/database'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { openPortaalDossiersVoor, type PortaalStandaardOnderdelen } from './contactpersoon'
import type { BeheerResultaat } from './beheer-actions'

/**
 * contactpersoon-actions.ts — portaaltoegang beheren vanaf de contactpersoonpagina.
 *
 * Uitnodigen en intrekken lopen via de bestaande acties in beheer-actions.ts; hier staat
 * alleen wat daar niet kan: het bereik kiezen inclusief de organisatie, en de standaard
 * welke onderdelen aangaan bij automatisch openzetten. Beide met recht `beheren`: wie er
 * mag kijken en wat er standaard gedeeld wordt, raakt meer dan één dossier.
 */

const db = () => createAdminClient()

function fout(e: unknown): BeheerResultaat {
  if (e instanceof GeenToegangError) return { ok: false, error: 'Je hebt hier geen rechten voor.' }
  console.error('[portaal-contactpersoon]', e)
  return { ok: false, error: e instanceof Error ? e.message : 'Er ging iets mis.' }
}

/**
 * Welke dossiers deze persoon ziet: alleen de eigen, of alle dossiers van één organisatie
 * waar hij voor werkt (een manager die ook de projecten van collega's volgt).
 *
 * De organisatie moet er een zijn waar deze contactpersoon aan gekoppeld is. Zonder die
 * controle kan een geprepareerd verzoek iemand de dossiers van een willekeurige klant geven.
 */
export async function setPortaalBereik(input: {
  portaalGebruikerId: string
  scope: 'eigen_dossiers' | 'organisatie'
  relatieId: string | null
}): Promise<BeheerResultaat> {
  try {
    await vereisRecht('klantportaal', 'beheren')
    if (input.scope !== 'eigen_dossiers' && input.scope !== 'organisatie') {
      return { ok: false, error: 'Onbekend bereik.' }
    }

    const { data: gebruiker } = await db().from('portaal_gebruikers')
      .select('id, contactpersoon_id, relatie_id')
      .eq('id', input.portaalGebruikerId).maybeSingle()
    if (!gebruiker?.contactpersoon_id) return { ok: false, error: 'Portaalaccount niet gevonden.' }

    const relatieId = input.relatieId ?? gebruiker.relatie_id
    if (input.scope === 'organisatie' && !relatieId) {
      return { ok: false, error: 'Kies van welke organisatie deze persoon alle dossiers ziet.' }
    }
    if (relatieId && relatieId !== gebruiker.relatie_id) {
      const { data: koppeling } = await db().from('contactpersoon_organisaties')
        .select('id')
        .eq('contactpersoon_id', gebruiker.contactpersoon_id)
        .eq('organisatie_id', relatieId)
        .maybeSingle()
      if (!koppeling) return { ok: false, error: 'Deze persoon werkt niet voor die organisatie.' }
    }

    await db().from('portaal_gebruikers').update({
      scope: input.scope,
      relatie_id: relatieId,
      updated_at: new Date().toISOString(),
    }).eq('id', gebruiker.id)

    const geopend = await openPortaalDossiersVoor(gebruiker.id)
    revalidatePath(`/relaties/contactpersonen/${gebruiker.contactpersoon_id}`)
    return { ok: true, geopend }
  } catch (e) { return fout(e) }
}

const STANDAARD_KOLOMMEN: (keyof PortaalStandaardOnderdelen)[] = [
  'toon_bestanden', 'toon_fotos', 'toon_facturen', 'toon_formulieren',
  'toon_aandachtspunten', 'toon_planning', 'toon_chat',
]

/**
 * Eén onderdeel in de standaard aan of uit. Geldt alleen voor dossiers die vanaf nu
 * automatisch opengaan; wat al open staat, blijft zoals het per dossier is ingesteld.
 */
export async function setPortaalStandaardOnderdeel(
  kolom: keyof PortaalStandaardOnderdelen,
  aan: boolean,
): Promise<BeheerResultaat> {
  try {
    const { medewerker } = await vereisRecht('klantportaal', 'beheren')
    if (!STANDAARD_KOLOMMEN.includes(kolom)) return { ok: false, error: 'Onbekend onderdeel.' }

    const rij: Database['public']['Tables']['portaal_standaard_onderdelen']['Insert'] = {
      id: true,
      gewijzigd_op: new Date().toISOString(),
      gewijzigd_door: medewerker.id,
    }
    rij[kolom] = aan

    const { error } = await db().from('portaal_standaard_onderdelen').upsert(rij, { onConflict: 'id' })
    if (error) throw error

    revalidatePath('/instellingen/klantportaal')
    return { ok: true }
  } catch (e) { return fout(e) }
}
