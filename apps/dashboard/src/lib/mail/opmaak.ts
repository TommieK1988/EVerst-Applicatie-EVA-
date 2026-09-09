/**
 * opmaak.ts — van een beheerde mailtekst naar Outlook-proof HTML.
 *
 * De e-mailsjablonen (Instellingen → E-mailsjablonen) worden bewerkt als gewone tekst: alinea's
 * gescheiden door een lege regel. Dat is de enige vorm die een niet-technische collega zonder
 * uitleg goed krijgt. Deze module maakt daar HTML van die ook in Outlook klopt.
 *
 * Waarom niet gewoon `white-space: pre-wrap` in een <div>: Outlook rendert met de Word-engine en
 * negeert die eigenschap. Alle regeleinden vielen daardoor weg en de mail werd één doorlopende zin.
 * Regeleinden moeten dus als echte <p>/<br> in de HTML staan — zelfde reden als in
 * `lib/mail/uitvraag-mail.ts` en `lib/bouw7/bestelling-mail.ts`.
 *
 * Drie dingen die de beheerder in de tekst kan gebruiken:
 *   {variabele}   — wordt gevuld met gegevens uit het dossier/de offerte (per sjabloon getoond)
 *   {blok}        — een stuk dat EVA zelf opmaakt (een knop, een tabel); alleen daar waar het mag
 *   [klein]…      — die alinea in kleine grijze letters (de "deze link is persoonlijk"-regels)
 * Daarnaast **vet** en [tekst](https://…) voor een link, zodat de bestaande mails hun accenten
 * houden zonder dat er HTML in het invulveld hoeft.
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, c => ESC[c]!)

/** Markeert een alinea als kleine grijze voetnoot. */
const KLEIN = /^\[klein\]\s*/i

const P_NORMAAL = 'margin:0 0 14px 0;font-size:13px;line-height:1.6'
const P_KLEIN   = 'margin:0 0 14px 0;font-size:12px;line-height:1.6;color:#8a938f'

export type MailOpmaakInput = {
  /** Waarden voor {variabele}. Worden geëscaped ingevoegd. */
  vars?: Record<string, string>
  /**
   * Kant-en-klare HTML-blokken voor {blok}-plaatshouders (een knop, een tabel). Bewust
   * gescheiden van `vars`: dit is HTML die EVA zelf opbouwt, niet iets wat de beheerder typt.
   */
  blokken?: Record<string, string>
}

/** Vult {sleutel} met een geëscapete waarde; onbekende sleutels worden leeggemaakt. */
function vulVars(tekst: string, vars: Record<string, string>): string {
  return tekst.replace(/\{([a-z0-9_.]+)\}/gi, (_, sleutel: string) => esc(vars[sleutel] ?? ''))
}

/** **vet** en [tekst](url) — het enige opmaakgereedschap in het invulveld. */
function inlineOpmaak(html: string): string {
  return html
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, label: string, url: string) =>
        `<a href="${url}" style="color:#009439;font-weight:600;text-decoration:none">${label}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
}

/**
 * Bouwt de alinea's van een mailbody. Een alinea die alléén uit een {blok}-plaatshouder bestaat
 * wordt vervangen door dat blok; onbekende blokken verdwijnen (dan heeft de beheerder een
 * plaatshouder gebruikt die bij deze mail niet bestaat — beter niets dan een letterlijke accolade).
 */
export function mailTekstNaarHtml(tekst: string, input: MailOpmaakInput = {}): string {
  const vars = input.vars ?? {}
  const blokken = input.blokken ?? {}

  return (tekst ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(blok => blok.trim())
    .filter(Boolean)
    .map(alinea => {
      // Alleen een echt bestaand blok vervangt de hele alinea. Anders zou een alinea die uit
      // niets dan een variabele bestaat — de aanhef bijvoorbeeld — geruisloos verdwijnen.
      const blokNaam = /^\{([a-z0-9_.]+)\}$/i.exec(alinea)?.[1]
      if (blokNaam && blokNaam in blokken) return blokken[blokNaam]

      const klein = KLEIN.test(alinea)
      const kaal = alinea.replace(KLEIN, '')
      const html = inlineOpmaak(vulVars(esc(kaal), vars)).replace(/\n/g, '<br>')
      return `<p style="${klein ? P_KLEIN : P_NORMAAL}">${html}</p>`
    })
    .filter(Boolean)
    .join('')
}

/**
 * Onderwerpregel: één regel, dus geen alinea's en geen opmaak — alleen variabelen invullen en de
 * rommel opruimen die een leeg gebleven variabele achterlaat ("Offerte 123 — ").
 */
export function mailOnderwerp(sjabloon: string, vars: Record<string, string> = {}): string {
  return (sjabloon ?? '')
    .replace(/\{([a-z0-9_.]+)\}/gi, (_, sleutel: string) => vars[sleutel] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*[—–|-]\s*$/, '')
    .replace(/^\s*[—–|-]\s*/, '')
    .trim()
}
