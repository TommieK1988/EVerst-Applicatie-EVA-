import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * mailintake/werkadres-aanvullen.ts
 *
 * Het Werkadres-blok van een dossier bijwerken uit wat er in de mail stond.
 *
 * WAAROM
 * Een opdrachtbon van een VvE-beheerder noemt vrijwel altijd wie je ter plaatse
 * moet hebben: "U kunt ter plaatse contact opnemen met: De heer J.W. van Dop,
 * Icarusweg 121, 2624 BE DELFT, 06 - 126 876 43". Dat is precies wat de uitvoerder
 * nodig heeft om af te spreken, en het stond nergens in het dossier -- terwijl het
 * blok Werkadres velden voor Naam, Telefoon en E-mail heeft.
 *
 * DE REGEL DIE HIER TELT
 * **Een gevuld adres wordt nooit overschreven.** Een dossier dat al een werkadres
 * heeft, heeft dat meestal uit Bouw7 of van de calculator, en een mail die een
 * ander adres noemt is vaker een tweede locatie dan een correctie. Stil verplaatsen
 * is hier de duurste fout: dan staat er een ploeg voor de verkeerde deur.
 *
 * Er is één uitzondering, en die verandert het adres niet maar de vorm ervan: staat
 * het huisnummer in het straatveld geplakt ("Icarusweg 121" met een leeg
 * huisnummer) en zegt de mail hetzelfde adres, dan wordt het uit elkaar gehaald.
 * Dat is een herschrijving waarvan je kunt bewijzen dat hij hetzelfde betekent.
 *
 * `werkadres_huisnummer` en de drie contactvelden staan niet in
 * BOUW7_DOSSIER_VELDEN: die zijn EVA-eigen, dus de sync overschrijft ze niet en er
 * ontstaat geen handmatig-vlag. `werkadres_straat` komt wél uit Bouw7; daarom wordt
 * die alleen aangeraakt bij de splitsing hierboven.
 */

export interface WerkadresInvoer {
  straat: string | null
  huisnummer: string | null
  postcode: string | null
  stad: string | null
  naam: string | null
  telefoon: string | null
  email: string | null
}

export interface AanvulResultaat {
  /** Kolommen die zijn bijgewerkt, met hun nieuwe waarde. */
  gevuld: Record<string, string>
  /** Wat er is overgeslagen en waarom, in gewone taal. */
  overgeslagen: string[]
}

const schoon = (w: string | null | undefined) =>
  (w ?? '').replace(/\s+/g, ' ').trim()

/** Vergelijkbaar maken: zonder spaties, leestekens en hoofdletters. */
const kaal = (w: string | null | undefined) =>
  schoon(w).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Zit het huisnummer vastgeplakt aan de straat?
 *
 * Levert de losse straat als dat zo is én de mail hetzelfde adres noemt; anders
 * null. Bewust streng: alleen als de rest van het straatveld exact de straatnaam
 * uit de mail is, want "Icarusweg 121" mag "Icarusweg" + "121" worden, maar
 * "Icarusweg 121 achter" zegt iets extra's dat we niet mogen weggooien.
 */
export function splitsStraatEnNummer(
  straatVeld: string | null,
  mailStraat: string | null,
  mailNummer: string | null,
): { straat: string; huisnummer: string } | null {
  const veld = schoon(straatVeld)
  const s = schoon(mailStraat)
  const nr = schoon(mailNummer)
  if (!veld || !s || !nr) return null
  if (!veld.toLowerCase().endsWith(nr.toLowerCase())) return null

  const rest = schoon(veld.slice(0, veld.length - nr.length))
  if (kaal(rest) !== kaal(s)) return null
  return { straat: s, huisnummer: nr }
}

/**
 * Vult het werkadres van een bestaand dossier aan.
 *
 * Gooit niet: dit is nazorg bij een opdracht die al verwerkt is, en een mislukte
 * aanvulling mag die niet omverhalen.
 */
export async function vulWerkadresAan(
  dossierId: string,
  uit: WerkadresInvoer,
): Promise<AanvulResultaat> {
  const supabase = createAdminClient()
  const gevuld: Record<string, string> = {}
  const overgeslagen: string[] = []

  const { data: d } = await supabase
    .from('dossiers')
    .select('werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad, werkadres_naam, werkadres_telefoon, werkadres_email')
    .eq('id', dossierId)
    .maybeSingle()

  if (!d) return { gevuld, overgeslagen: ['Dossier niet gevonden.'] }

  // ── Eerst het huisnummer uit het straatveld halen ────────────────────────
  // Vóór de vul-lus hieronder, en die volgorde is niet vrijblijvend: die lus ziet
  // een leeg huisnummerveld, vult het, en dan heeft de splitsing niets meer te
  // doen -- waarna het nummer twee keer staat, in de straat én in het huisnummer.
  // Precies dat gebeurde bij de eerste poging op Icarusweg 121.
  if (!schoon(d.werkadres_huisnummer)) {
    const gesplitst = splitsStraatEnNummer(d.werkadres_straat, uit.straat, uit.huisnummer)
    if (gesplitst) {
      gevuld.werkadres_straat = gesplitst.straat
      gevuld.werkadres_huisnummer = gesplitst.huisnummer
    }
  }

  // ── Wat leeg is mag gevuld worden ────────────────────────────────────────
  const paren: [keyof typeof d, string | null, string][] = [
    ['werkadres_straat', uit.straat, 'Straat'],
    ['werkadres_huisnummer', uit.huisnummer, 'Huisnummer'],
    ['werkadres_postcode', uit.postcode, 'Postcode'],
    ['werkadres_stad', uit.stad, 'Plaats'],
    ['werkadres_naam', uit.naam, 'Contact ter plaatse'],
    ['werkadres_telefoon', uit.telefoon, 'Telefoon ter plaatse'],
    ['werkadres_email', uit.email, 'E-mail ter plaatse'],
  ]
  for (const [kolom, waarde, label] of paren) {
    // De splitsing hierboven is al beslist; die niet overschrijven.
    if (kolom in gevuld) continue
    const nieuw = schoon(waarde)
    if (!nieuw) continue
    const huidig = schoon(d[kolom] as string | null)
    if (!huidig) { gevuld[kolom] = nieuw; continue }
    if (kaal(huidig) !== kaal(nieuw)) {
      overgeslagen.push(`${label} stond al ingevuld als "${huidig}"; de mail noemt "${nieuw}".`)
    }
  }

  if (Object.keys(gevuld).length) {
    // Rechtstreeks en niet via `updateDossierInfo`: die kent `werkadres_huisnummer`
    // niet, en markeert velden als handmatig zodat de Bouw7-sync ze laat staan. Dat
    // laatste is hier ongewenst -- we vullen aan wat leeg was, we nemen het veld
    // niet over.
    const { error } = await supabase.from('dossiers').update(gevuld as never).eq('id', dossierId)
    if (error) return { gevuld: {}, overgeslagen: [...overgeslagen, error.message] }
  }

  return { gevuld, overgeslagen }
}
