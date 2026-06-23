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
