import 'server-only'
import { createAdminClient } from '@everts/database/server'

import type { ProefResultaat } from './proef'

/**
 * mailintake/controle.ts
 *
 * Teruglezen na het aanmaken: staat er werkelijk wat er verstuurd is?
 *
 * "Gelukt" van een schrijfactie betekent alleen dat er geen fout terugkwam. Het
 * betekent niet dat het veld gevuld is. Precies daar zat de stille fout die deze
 * module moet vangen: een project dat keurig wordt aangemaakt maar zonder klant,
 * of met een categorie die onderweg is weggevallen omdat hij niet in de witte
 * lijst stond.
 *
 * Wat hier uitkomt is geen foutmelding maar een vergelijking. Elk verschil wordt
 * benoemd met wat er verstuurd is en wat er staat, zodat een mens kan zien of het
 * erg is. De regel erboven is wél hard: bij een verschil gaan de bestanden er nog
 * niet in. Een half dossier is te repareren, een dossiermap vol stukken onder het
 * verkeerde project veel minder.
 */

export interface Afwijking {
  veld: string
  verstuurd: string | null
  teruggelezen: string | null
}

export interface ControleResultaat {
  /** Alles staat zoals het verstuurd is. */
  klopt: boolean
  afwijkingen: Afwijking[]
  /** Het nummer dat Bouw7 heeft toegekend; leeg als de push niet gelukt is. */
  dossiernummer: string | null
  bouw7Id: string | null
}

/** Maakt twee waarden vergelijkbaar zonder op spaties of hoofdletters te struikelen. */
function gelijk(a: unknown, b: unknown): boolean {
  const n = (x: unknown) =>
    x == null || x === '' ? '' : String(x).replace(/\s+/g, ' ').trim().toLowerCase()
  return n(a) === n(b)
}

/**
 * Leest het zojuist aangemaakte dossier terug en legt het naast het voorstel.
 *
 * Gooit niet: een mislukte controle mag een bestaand dossier niet omverhalen. Kan
 * er niet gelezen worden, dan komt dat als afwijking terug -- want "ik weet het
 * niet" is hier hetzelfde als "niet gecontroleerd", en dat moet zichtbaar zijn.
 */
export async function leesTerugNaAanmaken(
  dossierId: string,
  proef: ProefResultaat,
): Promise<ControleResultaat> {
  const supabase = createAdminClient()
  const v = proef.voorstel

  const { data: d, error } = await supabase
    .from('dossiers')
    // Eén tekenreeks, niet met + aan elkaar geplakt: de getypeerde client leest de
    // kolomlijst tijdens het compileren en kan een samengestelde string niet lezen.
    .select('id, dossiernummer, bouw7_id, titel, klant_id, contactpersoon_id, werkmaatschappij_id, bouw7_categorie_id, hoofdstatus, aanvraag_substatus, aanvraagdatum, deadline, vve_code, referentie, opmerkingen, werkadres_straat, werkadres_postcode, werkadres_stad')
    .eq('id', dossierId)
    .maybeSingle()

  if (error || !d) {
    return {
      klopt: false,
      afwijkingen: [{
        veld: 'dossier',
        verstuurd: v.titel,
        teruggelezen: error ? `niet te lezen: ${error.message}` : 'niet gevonden',
      }],
      dossiernummer: null,
      bouw7Id: null,
    }
  }

  const afwijkingen: Afwijking[] = []
  const vergelijk = (veld: string, verstuurd: unknown, teruggelezen: unknown) => {
    if (!gelijk(verstuurd, teruggelezen)) {
      afwijkingen.push({
        veld,
        verstuurd: verstuurd == null || verstuurd === '' ? null : String(verstuurd),
        teruggelezen: teruggelezen == null || teruggelezen === '' ? null : String(teruggelezen),
      })
    }
  }

  vergelijk('Projectnaam', v.titel, d.titel)
  vergelijk('Opdrachtgever', v.opdrachtgever?.id ?? null, d.klant_id)
  vergelijk('Contactpersoon', v.contactpersoon?.id ?? null, d.contactpersoon_id)
  vergelijk('Werkmaatschappij', v.werkmaatschappij?.id ?? null, d.werkmaatschappij_id)
  vergelijk('Categorie', v.categorie.id, d.bouw7_categorie_id)
  vergelijk('Aanvraagdatum', v.aanvraagdatum, d.aanvraagdatum)
  vergelijk('Uiterste datum', v.deadline, d.deadline)
  vergelijk('VvE-code', v.vveCode, d.vve_code)
  vergelijk('Referentie', v.referentie, d.referentie)
  vergelijk('Omschrijving', v.omschrijvingHtml, d.opmerkingen)

  // De fase is geen veld uit het voorstel maar een vaste eis: een aanvraag hoort in
  // fase Aanvraag met substatus Nieuw te staan. Staat hij ergens anders, dan heeft
  // een trigger of een parallelle sync iets gedaan en klopt het beeld niet meer.
  vergelijk('Fase', 'aanvraag', d.hoofdstatus)
  vergelijk('Substatus', 'nieuw', d.aanvraag_substatus)

  // Het werkadres wordt als losse velden weggeschreven; vergelijken op de delen die
  // ook echt in het dossier staan.
  if (v.werkadres) {
    const terug = [d.werkadres_straat, d.werkadres_postcode, d.werkadres_stad]
      .filter(Boolean).join(', ')
    if (!terug) {
      afwijkingen.push({ veld: 'Werkadres', verstuurd: v.werkadres, teruggelezen: null })
    }
  }

  return {
    klopt: afwijkingen.length === 0,
    afwijkingen,
    dossiernummer: d.dossiernummer ?? null,
    bouw7Id: d.bouw7_id ?? null,
  }
}
