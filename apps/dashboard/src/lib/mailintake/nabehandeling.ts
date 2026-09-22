/**
 * mailintake/nabehandeling.ts
 *
 * Wat er in Outlook met een bericht gebeurt zodra het in EVA is afgehandeld.
 *
 * ÉÉN VASTE REGEL, MET ÉÉN PRINCIPE:
 *
 *   Een beslissing van een mens haalt de mail uit het zicht.
 *   Een beslissing van de machine nooit.
 *
 * Dus: afgehandeld of door een mens genegeerd → naar de map "Verwerkt door EVA".
 * Door de AI bestempeld als "geen aanvraag" → blijft ongelezen in Postvak IN,
 * met alleen een categorie. Dat laatste is bewust: dat oordeel heeft niemand
 * gezien, en een gemiste aanvraag is de duurste fout die er is.
 *
 * Dit is de enige stap in de hele module die iets verandert in de mailbox van
 * collega's. Vandaar de bedrijfsbrede noodrem, en vandaar dat een mislukte
 * verplaatsing nóóit het dossier terugdraait — het bericht krijgt
 * `outlook_nabehandeling = 'mislukt'` en de bewakingscron probeert het opnieuw.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { markeerBericht, verplaatsBericht, zorgVoorVerwerktMap, zorgVoorCategorieen } from '@/lib/o365/inbox'

import { MAX_OUTLOOK_POGINGEN, type BerichtBesluit, type BerichtStatus, type NabehandelStand } from './types'

export { MAX_OUTLOOK_POGINGEN }

/**
 * Leest de bedrijfsbrede noodrem. Standaard 'alleen_categorie': verplaatsen is
 * de ingrijpendste stap en gaat pas aan als iemand daar bewust voor kiest.
 */
export async function haalNabehandelStand(): Promise<NabehandelStand> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const v = (data?.overige as Record<string, unknown> | null)?.mailintake_nabehandeling
  return v === 'aan' || v === 'uit' || v === 'alleen_categorie' ? v : 'alleen_categorie'
}

export interface Nabehandeling {
  /** Verplaats het bericht uit Postvak IN. */
  verplaatsen: boolean
  categorieen: string[]
  gelezen: boolean
}

/**
 * De regel zelf, los van de database zodat hij te lezen en te testen is.
 * `null` = niets doen (het bericht is nog niet klaar, of het is mislukt).
 */
export function bepaalNabehandeling(
  status: BerichtStatus,
  besluit: BerichtBesluit | null,
  dossiernummer: string | null,
): Nabehandeling | null {
  switch (status) {
    case 'verwerkt':
      // Afgehandeld: dossier aangemaakt, gekoppeld, meerwerk of offerte gewonnen.
      return {
        verplaatsen: true,
        categorieen: dossiernummer ? [`EVA: ${dossiernummer}`, 'EVA verwerkt'] : ['EVA verwerkt'],
        gelezen: true,
      }
    case 'genegeerd':
      // Een mens heeft besloten dat hier niets mee hoeft. Mag weg.
      return { verplaatsen: true, categorieen: ['EVA: genegeerd'], gelezen: true }
    case 'geen_aanvraag':
      // Blijft staan én ongelezen. Ook als een mens erop klikte: het oordeel is
      // hetzelfde oordeel, en dit is nu juist het oordeel dat fout kán zijn.
      // Verdwijnt zo'n mail naar een submap, dan is een gemiste aanvraag
      // onzichtbaar -- er is geen tweede signaal dat hem terugbrengt. Wie écht
      // wil dat hij weggaat, gebruikt Negeren; daar hoort een reden bij.
      return { verplaatsen: false, categorieen: ['EVA: geen aanvraag'], gelezen: false }
    default:
      // nieuw, bezig, wacht_op_mens, mislukt → Outlook onaangeroerd.
      return null
  }
}

/** Was dit besluit van een mens? Alleen dán mag de mail uit het zicht. */
export function isMenselijkBesluit(besluit: BerichtBesluit | null): boolean {
  return besluit != null && besluit !== 'geen_aanvraag'
}

export interface NabehandelResultaat {
  gedaan: boolean
  overgeslagen: boolean
  fout: string | null
  nieuwGraphId: string | null
}

/**
 * Voert de nabehandeling uit voor één bericht. Gooit niet: de aanroeper heeft op
 * dit punt al een dossier aangemaakt, en dat mag niet sneuvelen op een mailbox.
 */
export async function voerNabehandelingUit(berichtId: string): Promise<NabehandelResultaat> {
  const supabase = createAdminClient()

  const { data: bericht } = await supabase
    .from('mailintake_berichten')
    .select('id, graph_message_id, status, besluit, outlook_pogingen, dossier_id, postbus_id, dossier:dossiers!mailintake_berichten_dossier_id_fkey(dossiernummer)')
    .eq('id', berichtId)
    .maybeSingle()

  if (!bericht) return { gedaan: false, overgeslagen: true, fout: 'Bericht niet gevonden.', nieuwGraphId: null }

  // Status en besluit zijn in de DB tekst met een CHECK-constraint; TypeScript ziet
  // daar een kale string. De constraint is de garantie, deze versmalling maakt hem zichtbaar.
  const plan = bepaalNabehandeling(
    bericht.status as BerichtStatus,
    bericht.besluit as BerichtBesluit | null,
    bericht.dossier?.dossiernummer ?? null,
  )
  if (!plan) {
    await supabase.from('mailintake_berichten')
      .update({ outlook_nabehandeling: 'nvt', outlook_fout: null }).eq('id', berichtId)
    return { gedaan: false, overgeslagen: true, fout: null, nieuwGraphId: null }
  }

  const stand = await haalNabehandelStand()
  if (stand === 'uit') {
    await supabase.from('mailintake_berichten')
      .update({ outlook_nabehandeling: 'nvt', outlook_fout: 'Nabehandeling staat uit.' }).eq('id', berichtId)
    return { gedaan: false, overgeslagen: true, fout: null, nieuwGraphId: null }
  }

  if (!bericht.graph_message_id) {
    await supabase.from('mailintake_berichten')
      .update({ outlook_nabehandeling: 'mislukt', outlook_fout: 'Geen Graph-id bekend.' }).eq('id', berichtId)
    return { gedaan: false, overgeslagen: false, fout: 'Geen Graph-id bekend.', nieuwGraphId: null }
  }

  const { data: postbus } = await supabase
    .from('mailintake_postbussen')
    .select('id, adres, map_verwerkt_id, map_verwerkt_naam')
    .eq('id', bericht.postbus_id)
    .maybeSingle()

  if (!postbus) {
    return { gedaan: false, overgeslagen: false, fout: 'Postbus niet gevonden.', nieuwGraphId: null }
  }

  const pogingen = (bericht.outlook_pogingen ?? 0) + 1

  try {
    // Best-effort: zonder kleurdefinitie werkt categoriseren ook, alleen zonder blokje.
    await zorgVoorCategorieen(postbus.adres).catch(() => {})

    // Eerst markeren, dán verplaatsen — andersom moet de PATCH op het nieuwe id.
    await markeerBericht(postbus.adres, bericht.graph_message_id, plan.categorieen, plan.gelezen)

    let nieuwId = bericht.graph_message_id
    if (plan.verplaatsen && stand === 'aan') {
      let mapId: string | null = postbus.map_verwerkt_id
      if (!mapId) {
        mapId = await zorgVoorVerwerktMap(postbus.adres, postbus.map_verwerkt_naam)
        await supabase.from('mailintake_postbussen').update({ map_verwerkt_id: mapId }).eq('id', postbus.id)
      }
      try {
        nieuwId = await verplaatsBericht(postbus.adres, bericht.graph_message_id, mapId)
      } catch (e) {
        // De map kan hernoemd of verwijderd zijn; dan is de gecachete id waardeloos.
        const versId = await zorgVoorVerwerktMap(postbus.adres, postbus.map_verwerkt_naam)
        await supabase.from('mailintake_postbussen').update({ map_verwerkt_id: versId }).eq('id', postbus.id)
        nieuwId = await verplaatsBericht(postbus.adres, bericht.graph_message_id, versId)
      }
    }

    await supabase.from('mailintake_berichten').update({
      graph_message_id: nieuwId,
      outlook_nabehandeling: 'gedaan',
      outlook_nabehandeling_op: new Date().toISOString(),
      outlook_pogingen: pogingen,
      outlook_fout: null,
    }).eq('id', berichtId)

    return { gedaan: true, overgeslagen: false, fout: null, nieuwGraphId: nieuwId }
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e)
    await supabase.from('mailintake_berichten').update({
      outlook_nabehandeling: 'mislukt',
      outlook_pogingen: pogingen,
      outlook_fout: melding.slice(0, 500),
    }).eq('id', berichtId)
    return { gedaan: false, overgeslagen: false, fout: melding, nieuwGraphId: null }
  }
}

/**
 * Zet de nabehandeling in de wachtrij. Wordt aangeroepen zodra een bericht een
 * eindtoestand krijgt; de daadwerkelijke Graph-calls doet `voerNabehandelingUit`.
 */
export async function planNabehandeling(berichtId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('mailintake_berichten')
    .update({ outlook_nabehandeling: 'open', outlook_fout: null })
    .eq('id', berichtId)
}
