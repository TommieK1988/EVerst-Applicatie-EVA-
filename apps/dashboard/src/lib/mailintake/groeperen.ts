import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { adresOvereenkomst, kaalOnderwerp } from './regels'

/**
 * mailintake/groeperen.ts
 *
 * Bepaalt welke binnengekomen mails over dezelfde klus gaan.
 *
 * Waarom dit bestaat: een opdracht komt lang niet altijd als één mail binnen. In de
 * praktijk zat de bon -- met de opdrachtreferentie en het factuuradres -- in de ene
 * mail, en de mededeling dat het onder regie valt in een andere, doorgestuurd door
 * een collega, met een eigen conversation-id. EVA las ze los van elkaar, vulde twee
 * halve formulieren en ging op elk van die helften beslissen. Wie dan de offerte
 * aanwees op de verkeerde helft, zag een leeg scherm.
 *
 * De regel is bewust in twee soorten gesplitst:
 *
 *  - **Hard**: te bepalen vóór de AI iets gelezen heeft (gesprek, identieke bijlage,
 *    zelfde onderwerp). Daarmee kan de leesronde meteen over de hele groep gaan.
 *  - **Zacht**: pas te bepalen ná de extractie (zelfde opdrachtgever op hetzelfde
 *    werkadres, of hetzelfde bonnummer). Blijkt een mail dan alsnog bij een groep te
 *    horen, dan wordt er één keer opnieuw gelezen over het geheel.
 *
 * Er wordt nooit samengevoegd op alleen de klant: een beheerder heeft tientallen
 * lopende klussen. Het adres of een letterlijk nummer moet er altijd bij.
 */

/** Hoe ver terug een mail nog bij dezelfde klus kan horen. */
const VENSTER_DAGEN = 60

export interface GroepTreffer {
  groepId: string
  /** Waarom deze mails bij elkaar horen; gaat naar het besluitenlog en het scherm. */
  reden: string
}

export interface GroepLid {
  id: string
  onderwerp: string | null
  ontvangenOp: string
  vanNaam: string | null
  vanAdres: string | null
  bodyTekst: string | null
}

function vanaf(): string {
  const d = new Date()
  d.setDate(d.getDate() - VENSTER_DAGEN)
  return d.toISOString()
}

/**
 * Harde signalen: zelfde gesprek, identieke bijlage, of hetzelfde onderwerp.
 *
 * Draait vóór de AI-ronde, zodat die meteen de hele groep kan lezen.
 */
export async function zoekGroepVooraf(berichtId: string): Promise<GroepTreffer | null> {
  const supabase = createAdminClient()
  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('id, groep_id, conversation_id, onderwerp, ontvangen_op, postbus_id')
    .eq('id', berichtId)
    .maybeSingle()
  if (!b) return null

  // 1. Zelfde gesprek. Het sterkste signaal dat er is.
  if (b.conversation_id) {
    const { data } = await supabase
      .from('mailintake_berichten')
      .select('id, groep_id')
      .eq('conversation_id', b.conversation_id)
      .neq('id', berichtId)
      .gte('ontvangen_op', vanaf())
      .limit(20)
    const met = (data ?? []).find(r => r.groep_id)
    if (met?.groep_id) return { groepId: met.groep_id, reden: 'Zelfde e-mailgesprek' }
  }

  // 2. Een identieke bijlage. Dezelfde bon die twee keer wordt doorgestuurd is één klus.
  const { data: eigenBijlagen } = await supabase
    .from('mailintake_bijlagen')
    .select('sha256')
    .eq('bericht_id', berichtId)
    .not('sha256', 'is', null)
    .eq('is_inline', false)
    .limit(20)
  const hashes = (eigenBijlagen ?? []).map(r => r.sha256).filter((h): h is string => Boolean(h))
  if (hashes.length) {
    const { data: elders } = await supabase
      .from('mailintake_bijlagen')
      .select('bericht_id')
      .in('sha256', hashes)
      .neq('bericht_id', berichtId)
      .limit(20)
    const ids = [...new Set((elders ?? []).map(r => r.bericht_id))]
    if (ids.length) {
      const { data: berichten } = await supabase
        .from('mailintake_berichten')
        .select('groep_id')
        .in('id', ids)
        .gte('ontvangen_op', vanaf())
        .limit(20)
      const met = (berichten ?? []).find(r => r.groep_id)
      if (met?.groep_id) return { groepId: met.groep_id, reden: 'Dezelfde bijlage' }
    }
  }

  // 3. Hetzelfde onderwerp zonder Re:/Fw:. Alleen binnen dezelfde postbus, en alleen
  //    als het onderwerp genoeg om het lijf heeft -- "Opdracht" matcht anders alles.
  const kaal = kaalOnderwerp(b.onderwerp)
  if (kaal.length >= 12) {
    const { data } = await supabase
      .from('mailintake_berichten')
      .select('id, groep_id, onderwerp')
      .eq('postbus_id', b.postbus_id)
      .neq('id', berichtId)
      .gte('ontvangen_op', vanaf())
      .order('ontvangen_op', { ascending: false })
      .limit(200)
    const met = (data ?? []).find(r => r.groep_id && kaalOnderwerp(r.onderwerp) === kaal)
    if (met?.groep_id) return { groepId: met.groep_id, reden: 'Zelfde onderwerp' }
  }

  return null
}

/**
 * Zachte signalen: dezelfde opdrachtgever op hetzelfde werkadres, of hetzelfde
 * bon-/offertenummer. Pas bruikbaar als de velden gelezen zijn.
 *
 * Dit is het signaal dat het echte geval ving: twee mails, twee gesprekken, één klus
 * aan de Steenlaan.
 */
export async function zoekGroepAchteraf(
  berichtId: string,
  velden: {
    relatieId: string | null
    straat: string | null
    huisnummer: string | null
    opdrachtReferentie: string | null
  },
): Promise<GroepTreffer | null> {
  if (!velden.relatieId) return null
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('id, groep_id')
    .eq('id', berichtId)
    .maybeSingle()
  if (!b) return null

  const { data: buren } = await supabase
    .from('mailintake_berichten')
    .select('id, groep_id, onderwerp, gevraagde_werkzaamheden')
    .eq('relatie_id', velden.relatieId)
    .neq('id', berichtId)
    .gte('ontvangen_op', vanaf())
    .order('ontvangen_op', { ascending: false })
    .limit(100)

  const kandidaten = (buren ?? []).filter(r => r.groep_id && r.groep_id !== b.groep_id)
  if (!kandidaten.length) return null

  // De laatst gekeurde velden van de buren, om op adres en referentie te vergelijken.
  const { data: extracties } = await supabase
    .from('mailintake_extracties')
    .select('bericht_id, gekeurde_velden, versie')
    .in('bericht_id', kandidaten.map(r => r.id))
    .eq('ronde', 'velden')
    .not('gekeurde_velden', 'is', null)
    .order('versie', { ascending: false })
    .limit(200)

  const perBericht = new Map<string, Record<string, unknown>>()
  for (const e of extracties ?? []) {
    if (!perBericht.has(e.bericht_id)) {
      perBericht.set(e.bericht_id, (e.gekeurde_velden ?? {}) as Record<string, unknown>)
    }
  }

  const eigenRef = (velden.opdrachtReferentie ?? '').trim().toLowerCase()

  for (const r of kandidaten) {
    const v = perBericht.get(r.id) ?? {}

    // Hetzelfde bonnummer is eenduidig genoeg om op te varen.
    const hunRef = String(v.opdrachtReferentie ?? '').trim().toLowerCase()
    if (eigenRef.length >= 4 && hunRef === eigenRef) {
      return {
        groepId: r.groep_id as string,
        reden: `Zelfde opdrachtreferentie ${velden.opdrachtReferentie}`,
      }
    }

    // Zelfde opdrachtgever op hetzelfde adres. Alleen straat is te weinig: een VvE
    // heeft al het werk aan dezelfde straat.
    const bron = [v.werkadresStraat, v.werkadresHuisnummer, r.onderwerp, r.gevraagde_werkzaamheden]
      .filter(Boolean).join(' ')
    if (adresOvereenkomst(velden.straat, velden.huisnummer, bron) === 'straat_en_nummer') {
      return { groepId: r.groep_id as string, reden: 'Zelfde opdrachtgever op hetzelfde werkadres' }
    }
  }

  return null
}

/** Zet het bericht in een groep. Zonder treffer wordt het zijn eigen groep. */
export async function zetGroep(berichtId: string, groepId: string | null): Promise<string> {
  const supabase = createAdminClient()
  const id = groepId ?? berichtId
  await supabase.from('mailintake_berichten').update({ groep_id: id }).eq('id', berichtId)
  return id
}

/** De andere berichten van de groep, oudste eerst. Zonder het bericht zelf. */
export async function andereLeden(groepId: string, behalve: string): Promise<GroepLid[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, ontvangen_op, van_naam, van_adres, body_tekst')
    .eq('groep_id', groepId)
    .neq('id', behalve)
    .order('ontvangen_op', { ascending: true })
    .limit(20)
  return (data ?? []).map(r => ({
    id: r.id,
    onderwerp: r.onderwerp,
    ontvangenOp: r.ontvangen_op,
    vanNaam: r.van_naam,
    vanAdres: r.van_adres,
    bodyTekst: r.body_tekst,
  }))
}
