import 'server-only'

/**
 * Tekst-hulpjes voor de met pdf-lib getekende rapportages (opleverrapport, meerwerkoverzicht).
 *
 * pdf-lib tekent letterlijk wat je hem geeft: er is geen tekstopmaak, geen regelafbreking en
 * geen tekenset-onderhandeling. Die drie dingen regelen we hier één keer.
 */

export type PdfFont = Awaited<
  ReturnType<Awaited<ReturnType<(typeof import('pdf-lib'))['PDFDocument']['create']>>['embedFont']>
>

/**
 * De standaardfonts van pdf-lib kunnen alleen WinAnsi coderen; een em-dash of krul-apostrof laat
 * het tekenen crashen. Vervang de gangbare tekens en gooi de rest eruit.
 */
export function veilig(tekst: unknown): string {
  return String(tekst ?? '')
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/\u00A0/g, ' ')
    // Alles buiten WinAnsi (en stuurtekens) eruit; anders klapt drawText. Het euroteken valt
    // buiten Latin-1 maar zit wél in WinAnsi (0x80), dus dat houden we expliciet — zonder deze
    // uitzondering verdwijnt het uit elk bedrag.
    .replace(/[^\x20-\xFF€]/g, '')
}

/** Breekt tekst af op woordgrenzen binnen `maxBreedte`. */
export function wikkel(tekst: string, font: PdfFont, grootte: number, maxBreedte: number): string[] {
  const woorden = veilig(tekst).split(/\s+/).filter(Boolean)
  if (woorden.length === 0) return ['']
  const regels: string[] = []
  let regel = ''
  for (const w of woorden) {
    const kandidaat = regel ? `${regel} ${w}` : w
    if (font.widthOfTextAtSize(kandidaat, grootte) <= maxBreedte) {
      regel = kandidaat
    } else {
      if (regel) regels.push(regel)
      // Losse woorden die zelf te breed zijn hard afkappen.
      let rest = w
      while (font.widthOfTextAtSize(rest, grootte) > maxBreedte && rest.length > 1) {
        let n = rest.length
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), grootte) > maxBreedte) n--
        regels.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      regel = rest
    }
  }
  if (regel) regels.push(regel)
  return regels
}
