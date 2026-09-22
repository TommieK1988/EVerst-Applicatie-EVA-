import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * mailintake/mail-bestand.ts
 *
 * De mail zelf als bestand voor de dossiermap.
 *
 * WAAROM
 * Tot nu toe gingen alleen de bijlagen mee. De vraag zelf -- wat de klant schreef,
 * wie er in de cc stond, op welke datum -- bleef achter in EVA en in de postbus, en
 * na de bewaartermijn nergens meer. Terwijl een calculator die het dossier maanden
 * later opent juist dát wil lezen, en bij discussie over de scope is het de enige
 * plek waar staat wat er is gevraagd.
 *
 * TWEE WEGEN
 * Liefst het origineel: `GET /messages/{id}/$value` levert de ruwe MIME, en die
 * opent in Outlook precies zoals de mail binnenkwam. Dat kan alleen zolang de mail
 * nog in de postbus staat en we zijn Graph-id kennen.
 *
 * Lukt dat niet -- geen Graph-id (handmatig ingeladen), mail verplaatst of
 * verwijderd, Graph onbereikbaar -- dan bouwen we er zelf een `.eml` van uit wat in
 * de database staat. Dat is een weergave en geen kopie, en dat staat er dan ook
 * letterlijk boven. Beter een leesbare weergave in de map dan een lege plek: de
 * gebruiker vroeg dat de mail er **altijd** bij staat, en een terugval die soms
 * niets oplevert is geen terugval.
 */

export interface MailBestand {
  naam: string
  contentType: string
  bytes: Buffer
  /** True = de mail zoals hij binnenkwam. False = door EVA opgemaakte weergave. */
  origineel: boolean
}

/** Tekens die SharePoint en Windows niet in een bestandsnaam accepteren. */
function veiligeNaam(tekst: string): string {
  return tekst
    .replace(/[\\/:*?"<>|#%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'zonder onderwerp'
}

/**
 * Kopregel volgens RFC 5322: niet-ASCII moet gecodeerd, anders raken accenten en
 * het euroteken onderweg kwijt of breekt de mailclient op de regel.
 */
function kopregel(naam: string, waarde: string | null | undefined): string {
  const w = (waarde ?? '').replace(/[\r\n]+/g, ' ').trim()
  if (!w) return ''
  const gecodeerd = /^[\x20-\x7E]*$/.test(w)
    ? w
    : `=?UTF-8?B?${Buffer.from(w, 'utf-8').toString('base64')}?=`
  return `${naam}: ${gecodeerd}\r\n`
}

/**
 * Bouwt een `.eml` uit de opgeslagen velden.
 *
 * Bewust zonder de bijlagen: die staan al los in de dossiermap, en ze hier nog een
 * keer inpakken zou de map twee keer zo zwaar maken zonder dat er iets bijkomt.
 * De regel bovenaan de tekst zegt dat, zodat niemand denkt dat er iets ontbreekt.
 */
export function bouwEmlUitBericht(b: {
  onderwerp: string | null
  van_naam: string | null
  van_adres: string | null
  aan: string[] | null
  cc: string[] | null
  ontvangen_op: string
  body_tekst: string | null
  aantalBijlagen: number
}): Buffer {
  const van = b.van_naam && b.van_adres ? `${b.van_naam} <${b.van_adres}>` : (b.van_adres ?? 'onbekend')

  const inleiding = [
    'Deze weergave is door EVA opgemaakt uit de binnengekomen mail;',
    'het oorspronkelijke bestand was niet meer op te halen.',
    b.aantalBijlagen > 0
      ? `De ${b.aantalBijlagen} bijlage${b.aantalBijlagen === 1 ? '' : 'n'} staan los in deze map.`
      : 'Er zaten geen bijlagen bij.',
    '', '----------------------------------------------------------------', '',
  ].join('\r\n')

  const kop =
    kopregel('From', van) +
    kopregel('To', (b.aan ?? []).join(', ')) +
    kopregel('Cc', (b.cc ?? []).join(', ')) +
    kopregel('Subject', b.onderwerp ?? '(geen onderwerp)') +
    `Date: ${new Date(b.ontvangen_op).toUTCString()}\r\n` +
    'MIME-Version: 1.0\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n'

  // Base64 in regels van 76 tekens; langere regels zijn niet toegestaan en sommige
  // clients kappen ze af in plaats van ze te accepteren.
  const body = Buffer.from(inleiding + (b.body_tekst ?? '(lege mail)'), 'utf-8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n')

  return Buffer.from(kop + body, 'utf-8')
}

/**
 * Levert de mail als bestand, klaar om in de dossiermap te zetten.
 *
 * Gooit niet: lukt zelfs de terugval niet, dan komt er null terug en blijft het
 * dossier gewoon staan. Een mislukt mailbestand mag nooit een aanmaak omverhalen.
 */
export async function haalMailBestand(berichtId: string): Promise<MailBestand | null> {
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, van_naam, van_adres, aan, cc, ontvangen_op, body_tekst, graph_message_id, postbus:mailintake_postbussen(adres)')
    .eq('id', berichtId)
    .maybeSingle()

  if (!b) return null

  const datum = (b.ontvangen_op ?? new Date().toISOString()).slice(0, 10)
  const naam = `${datum} Mail - ${veiligeNaam(b.onderwerp ?? '')}.eml`
  const postbusAdres = (b.postbus as { adres?: string } | null)?.adres

  // Eerst het origineel.
  if (b.graph_message_id && postbusAdres) {
    try {
      const { haalBerichtMime } = await import('@/lib/o365/inbox')
      const bytes = await haalBerichtMime(postbusAdres, b.graph_message_id)
      if (bytes.length > 0) return { naam, contentType: 'message/rfc822', bytes, origineel: true }
    } catch {
      // Valt door naar de weergave hieronder; de reden staat in het besluitenlog
      // van de aanroeper, niet hier -- deze functie kent het dossier niet.
    }
  }

  try {
    const { count } = await supabase
      .from('mailintake_bijlagen')
      .select('id', { count: 'exact', head: true })
      .eq('bericht_id', berichtId)
      .eq('is_inline', false)

    return {
      naam,
      contentType: 'message/rfc822',
      bytes: bouwEmlUitBericht({ ...b, aantalBijlagen: count ?? 0 }),
      origineel: false,
    }
  } catch {
    return null
  }
}
