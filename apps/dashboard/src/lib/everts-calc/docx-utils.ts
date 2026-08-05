/**
 * docx-utils.ts
 *
 * Hulpfuncties voor .docx verwerking via docxtemplater + PizZip.
 */

// ─── HTML stripper ────────────────────────────────────────────────────────────

/** Strip HTML-tags en vervang <br> door newline — voor plain-text velden in docx. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
}

// ─── Tag-detectie ─────────────────────────────────────────────────────────────

/**
 * Scant een .docx-buffer op alle docxtemplater-`{tag}`-placeholders. Voegt eerst
 * gesplitste tags samen (Word knipt tags soms op), zodat ook die herkend worden.
 *
 * Geeft de unieke tag-namen terug zonder accolades en zonder loop/conditie-
 * prefixen (`#`, `/`, `^`, `%`). Bedoeld voor validatie en het tonen van welke
 * variabelen een template gebruikt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function listDocxTags(zip: any): string[] {
  const xmlFiles = Object.keys(zip.files as Record<string, unknown>).filter(
    (name) => name.startsWith('word/') && name.endsWith('.xml') && !name.includes('_rels'),
  )

  const gevonden = new Set<string>()
  for (const fileName of xmlFiles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = (zip.files as any)[fileName]
    if (!file || file.dir) continue
    // Alle XML-tags strippen → platte tekst, dan {tag}-tokens zoeken
    const tekst = mergeSplitTagsInXml(file.asText()).replace(/<[^>]+>/g, '')
    const matches = tekst.matchAll(/\{([^{}]+)\}/g)
    for (const m of matches) {
      const naam = m[1].trim().replace(/^[#/^%]/, '').trim()
      if (naam) gevonden.add(naam)
    }
  }
  return Array.from(gevonden).sort()
}

// ─── Split-tag fixer ──────────────────────────────────────────────────────────

/**
 * Voegt gesplitste docxtemplater-tags samen in alle XML-bestanden van een PizZip-archief.
 *
 * Probleem: Word knipt een tag zoals `{offerte.nummer}` soms op over meerdere
 * aaneengesloten `<w:r>` XML-runs. docxtemplater herkent alleen complete tags
 * binnen één run en laat gesplitste tags onveranderd staan.
 *
 * Oplossing: iteratief aaneengesloten runs samenvoegen waarbij de gecombineerde
 * tekst een volledige `{tag}` vormt. Dit wordt herhaald totdat er geen
 * wijzigingen meer zijn (maximaal 30 passes per bestand).
 *
 * @param zip  Een PizZip-instantie met het uitgepakte .docx archief
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fixSplitDocxTags(zip: any): void {
  // Verwerk alle Word-XML-bestanden (document, headers, footers, enz.)
  const xmlFiles = Object.keys(zip.files as Record<string, unknown>).filter(
    (name) =>
      name.startsWith('word/') &&
      name.endsWith('.xml') &&
      !name.includes('_rels') &&
      !name.includes('theme') &&
      !name.includes('fontTable') &&
      !name.includes('settings') &&
      !name.includes('webSettings') &&
      !name.includes('endnotes') &&
      !name.includes('footnotes')
  )

  for (const fileName of xmlFiles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = (zip.files as any)[fileName]
    if (!file || file.dir) continue

    const original: string = file.asText()
    const fixed = mergeSplitTagsInXml(original)

    if (fixed !== original) {
      zip.file(fileName, fixed)
    }
  }
}

/**
 * Voegt in één XML-string gesplitste `{tag}`-fragmenten samen die verspreid
 * zijn over meerdere aaneengesloten `<w:r>` runs.
 *
 * Typisch patroon dat Word genereert (tag opgesplitst over 2 runs):
 * ```xml
 * <w:r><w:rPr>…</w:rPr><w:t>{offerte</w:t></w:r>
 * <w:r><w:rPr>…</w:rPr><w:t>.nummer}</w:t></w:r>
 * ```
 *
 * Na fix:
 * ```xml
 * <w:r><w:rPr>…</w:rPr><w:t>{offerte.nummer}</w:t></w:r>
 * ```
 *
 * De iteratieve aanpak handelt ook tags die over 3+ runs verspreid zijn.
 */
function mergeSplitTagsInXml(xml: string): string {
  let result = xml

  for (let pass = 0; pass < 30; pass++) {
    const prev = result

    /**
     * Regex-opbouw:
     *
     * Groep 1 — de openende run inclusief optionele opmaak en openende <w:t>:
     *   <w:r>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>
     *
     * Groep 2 — tekst die BEGINT met een gedeeltelijke tag (heeft { maar geen }):
     *   ((?:[^<])*\{(?:[^<}])*)
     *
     * Niet-capturerende groep — de grens tussen de twee runs (weggegooid):
     *   <\/w:t>\s*<\/w:r>
     *   \s*(?:optionele tussenliggende elementen)*\s*
     *   <w:r>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>
     *
     * Groep 3 — tekst van de tweede run die de tag SLUIT (bevat }):
     *   ((?:[^<}])*\}[^<]*)
     *
     * Groep 4 — sluitende </w:t></w:r> van de tweede run (bewaard):
     *   (<\/w:t>\s*<\/w:r>)
     *
     * Vervanging: groep1 + groep2 + groep3 + groep4
     * → de eerste run absorbeert de tekst van de tweede run; de tweede run verdwijnt.
     */
    result = result.replace(
      /(<w:r>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>)((?:[^<])*\{(?:[^<}])*)<\/w:t>\s*<\/w:r>\s*(?:(?:<w:proofErr[^>]*\/>|<w:bookmarkStart[^>]*\/>|<w:bookmarkEnd[^>]*\/>|<w:rPrChange[^>]*>[\s\S]*?<\/w:rPrChange>)\s*)*<w:r>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>([^<}]*\}[^<]*)(<\/w:t>\s*<\/w:r>)/,
      '$1$2$3$4'
    )

    if (result === prev) break
  }

  return result
}

// ─── Onderstreepte tag-splitsing ──────────────────────────────────────────────

/**
 * Eén tag die tijdens het renderen wordt opgesplitst in twee Word-runs: een
 * onderstreepte en een normale. Zo kan een deel van een variabele opgemaakt worden
 * zonder dat het template daar iets voor hoeft te doen.
 */
export interface OnderstreeptSplitsing {
  /** Tag zoals hij in het template staat, bv. `schilderbehandeling`. */
  tag: string
  /** Tag voor de onderstreepte run, bv. `behandeling_naam`. */
  onderstreept: string
  /** Tag voor de normale run erachter, bv. `behandeling_tekst`. */
  normaal: string
  /**
   * Alleen splitsen binnen deze loop (`{#binnen}` … `{/binnen}`). Nodig voor een tag
   * die elders een andere betekenis heeft — `{.}` staat in élke string-loop.
   */
  binnen?: string
  /**
   * Vervanger voor tags die niet gesplitst konden worden omdat de run een afwijkende
   * opbouw heeft. Alleen zinvol samen met `binnen`: buiten die loop weten we niet of de
   * vervanging klopt. Zonder terugval blijft de tag staan zoals hij is.
   */
  terugval?: string
}

/**
 * Splitst in alle Word-XML van een PizZip-archief de opgegeven tags op in een
 * onderstreepte en een normale run. Draai dit ná `fixSplitDocxTags`, zodat elke tag
 * gegarandeerd in één `<w:t>` staat.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function splitOnderstreepteTags(zip: any, splitsingen: OnderstreeptSplitsing[]): void {
  if (splitsingen.length === 0) return

  const xmlFiles = Object.keys(zip.files as Record<string, unknown>).filter(
    (name) =>
      name.startsWith('word/') &&
      name.endsWith('.xml') &&
      !name.includes('_rels') &&
      !name.includes('theme') &&
      !name.includes('fontTable') &&
      !name.includes('settings') &&
      !name.includes('webSettings'),
  )

  for (const fileName of xmlFiles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = (zip.files as any)[fileName]
    if (!file || file.dir) continue

    const original: string = file.asText()
    const nieuw = splitOnderstreepteTagsInXml(original, splitsingen)
    if (nieuw !== original) zip.file(fileName, nieuw)
  }
}

/** Eén tekst-run: `<w:r>`, optionele opmaak, één `<w:t>`, `</w:r>`. */
const SIMPELE_RUN =
  /<w:r(?:\s[^>]*)?>\s*(<w:rPr(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:rPr>))?\s*<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>\s*<\/w:r>/g

/**
 * Vervangt in één XML-string elke run die `{tag}` bevat door maximaal vier runs:
 * de tekst vóór de tag, de onderstreepte tag, de normale tag, en de tekst erna.
 * De oorspronkelijke opmaak (`<w:rPr>`) gaat mee naar álle runs — alleen de eerste
 * krijgt er onderstreping bij, zodat lettertype, grootte en kleur van het template
 * behouden blijven.
 *
 * Runs met een afwijkende opbouw (tabs, breaks, meerdere `<w:t>`'s in één run) worden
 * bewust met rust gelaten: de tag blijft dan gewoon staan en rendert als platte tekst.
 * Liever geen onderstreping dan kapotte XML.
 */
export function splitOnderstreepteTagsInXml(xml: string, splitsingen: OnderstreeptSplitsing[]): string {
  if (splitsingen.length === 0) return xml
  // Snelle uitweg: staat geen van de tags in dit bestand, dan niets te doen.
  if (!splitsingen.some(s => xml.includes(`{${s.tag}}`))) return xml

  const gesplitst = xml.replace(SIMPELE_RUN, (heleRun, rPr: string | undefined, tekst: string, offset: number) => {
    const s = splitsingen.find(x =>
      tekst.includes(`{${x.tag}}`) && (!x.binnen || binnenLoop(xml, offset, x.binnen, tekst)),
    )
    if (!s) return heleRun

    const run = (opmaak: string, inhoud: string) =>
      `<w:r>${opmaak}<w:t xml:space="preserve">${inhoud}</w:t></w:r>`

    // De omringende tekst blijft behouden; tussen elk paar delen komt het gesplitste
    // stel runs. Staat de tag meer dan één keer in dezelfde run, dan gaan ze allemaal mee.
    const delen = tekst.split(`{${s.tag}}`)
    let runs = ''
    delen.forEach((deel, i) => {
      if (deel) runs += run(rPr ?? '', deel)
      if (i < delen.length - 1) {
        runs += run(metOnderstreping(rPr), `{${s.onderstreept}}`)
        runs += run(rPr ?? '', `{${s.normaal}}`)
      }
    })
    return runs
  })

  // Wat nu nog over is, zat in een run met een afwijkende opbouw. Binnen een loop met
  // een terugval-tag weten we wél waar de waarde vandaan komt: die tag is de veilige
  // platte-tekst-variant. Zonder dit zou `{.}` daar een object opleveren.
  return splitsingen.reduce(
    (acc, s) => (s.binnen && s.terugval ? vervangInLoop(acc, s.binnen, s.tag, s.terugval) : acc),
    gesplitst,
  )
}

/**
 * Staat de match op `offset` binnen `{#loop}` … `{/loop}`? Een tag in dezelfde run als
 * de loop-opening telt mee — dat is de veelvoorkomende `{#loop}{.}{/loop}` op één regel.
 */
function binnenLoop(xml: string, offset: number, loop: string, runTekst: string): boolean {
  if (runTekst.includes(`{#${loop}}`)) return true
  const ervoor = xml.slice(0, offset)
  return ervoor.lastIndexOf(`{#${loop}}`) > ervoor.lastIndexOf(`{/${loop}}`)
}

/** Vervangt `{van}` door `{naar}`, maar alleen tussen `{#loop}` en `{/loop}`. */
function vervangInLoop(xml: string, loop: string, van: string, naar: string): string {
  const start = `{#${loop}}`
  const eind = `{/${loop}}`
  let resultaat = ''
  let pos = 0
  for (;;) {
    const s = xml.indexOf(start, pos)
    if (s < 0) break
    const e = xml.indexOf(eind, s + start.length)
    if (e < 0) break
    const na = e + eind.length
    resultaat += xml.slice(pos, s) + xml.slice(s, na).split(`{${van}}`).join(`{${naar}}`)
    pos = na
  }
  return resultaat + xml.slice(pos)
}

/**
 * Elementen die in `<w:rPr>` ná `<w:u>` horen te staan. De volgorde binnen `<w:rPr>`
 * ligt in het OOXML-schema vast; `<w:u>` er achteraan plakken levert een bestand op
 * dat Word als beschadigd kan aanmerken. Daarom zoeken we het eerste element dat ná
 * de onderstreping komt en zetten `<w:u>` daarvóór.
 */
const NA_ONDERSTREPING =
  /<w:(?:effect|bdr|shd|fitText|vertAlign|rtl|cs|em|lang|eastAsianLayout|specVanish|oMath|rPrChange)(?=[\s/>])/

/** Geeft dezelfde run-opmaak terug, maar dan onderstreept. */
function metOnderstreping(rPr: string | undefined): string {
  const U = '<w:u w:val="single"/>'
  if (!rPr || /^<w:rPr(?:\s[^>]*)?\/>$/.test(rPr)) return `<w:rPr>${U}</w:rPr>`
  // Al onderstreept (of expliciet op "none" gezet door de template-auteur): niet aanraken.
  if (/<w:u(?=[\s/>])/.test(rPr)) return rPr

  const treffer = NA_ONDERSTREPING.exec(rPr)
  if (treffer) return rPr.slice(0, treffer.index) + U + rPr.slice(treffer.index)
  return rPr.replace(/<\/w:rPr>$/, `${U}</w:rPr>`)
}

// ─── Template-analyse (proactieve controle) ─────────────────────────────────────

export type TagType = 'waarde' | 'loop-open' | 'loop-sluit' | 'inverse' | 'afbeelding'

export interface TemplateTag {
  naam: string
  type: TagType
  context: string
}

export interface TemplateProbleem {
  ernst: 'fout' | 'let_op'
  uitleg: string
  tag?: string
  context?: string
}

export interface TemplateAnalyse {
  tags: TemplateTag[]
  problemen: TemplateProbleem[]
}

/** ~48 tekens rond een positie in de tekst, whitespace-genormaliseerd, met …-randen. */
function contextRond(tekst: string, index: number, lengte: number): string {
  const W = 48
  const start = Math.max(0, index - W)
  const end = Math.min(tekst.length, index + lengte + W)
  const snippet = tekst.slice(start, end).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + snippet + (end < tekst.length ? '…' : '')
}

/**
 * Analyseert een .docx-template proactief: alle tags mét omringende tekst, plus
 * structurele problemen (ongebalanceerde loops, losse accolades). Draait op de al
 * gerepareerde tekst (`mergeSplitTagsInXml`), zodat alleen écht kapotte tags overblijven.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function analyseerTemplate(zip: any): TemplateAnalyse {
  const xmlFiles = Object.keys(zip.files as Record<string, unknown>).filter(
    (name) => name.startsWith('word/') && name.endsWith('.xml') && !name.includes('_rels'),
  )

  const tags: TemplateTag[] = []
  const problemen: TemplateProbleem[] = []
  const open: Record<string, { n: number; context: string }> = {}
  let losseAccolades = 0

  for (const fileName of xmlFiles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = (zip.files as any)[fileName]
    if (!file || file.dir) continue
    const tekst = mergeSplitTagsInXml(file.asText()).replace(/<[^>]+>/g, ' ')

    const re = /\{([^{}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(tekst)) !== null) {
      const rauw = m[1].trim()
      const ctx = contextRond(tekst, m.index, m[0].length)
      if (!rauw) {
        problemen.push({ ernst: 'fout', uitleg: 'Lege accolades {} gevonden.', context: ctx })
        continue
      }
      const prefix = rauw[0]
      const naam = rauw.replace(/^[#/^%]/, '').trim()
      const type: TagType =
        prefix === '#' ? 'loop-open' :
        prefix === '/' ? 'loop-sluit' :
        prefix === '^' ? 'inverse' :
        prefix === '%' ? 'afbeelding' : 'waarde'
      tags.push({ naam, type, context: ctx })

      if (type === 'loop-open' || type === 'inverse') {
        open[naam] = { n: (open[naam]?.n ?? 0) + 1, context: ctx }
      } else if (type === 'loop-sluit') {
        if (!open[naam] || open[naam].n <= 0) {
          problemen.push({
            ernst: 'fout', tag: `/${naam}`, context: ctx,
            uitleg: `Sluit-tag {/${naam}} zonder bijbehorende {#${naam}} of {^${naam}}.`,
          })
        } else {
          open[naam].n--
        }
      }
    }

    // Losse accolades: verwijder alle geldige {..} en tel wat overblijft.
    const rest = tekst.replace(/\{[^{}]*\}/g, '')
    losseAccolades += (rest.match(/[{}]/g) ?? []).length
  }

  for (const naam of Object.keys(open)) {
    if (open[naam].n > 0) {
      problemen.push({
        ernst: 'fout', tag: `#${naam}`, context: open[naam].context,
        uitleg: `Loop {#${naam}} is niet afgesloten met {/${naam}}.`,
      })
    }
  }

  if (losseAccolades > 0) {
    problemen.push({
      ernst: 'fout',
      uitleg: `${losseAccolades} losse accolade(s) ({ of }) gevonden — waarschijnlijk een tag die Word heeft opgeknipt. Verwijder de tag en typ hem in één keer opnieuw.`,
    })
  }

  return { tags, problemen }
}
