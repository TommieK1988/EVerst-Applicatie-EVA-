/**
 * Bouwt het Word-sjabloon voor de interne begroting (de begrotingsstaat).
 *
 * Het sjabloon is een docxtemplater-template: het bevat samenvoegvelden, geen data.
 * Upload het resultaat in EVA onder Instellingen > Offertes > Opmaak, bij een lay-out
 * van de soort "Interne begroting".
 *
 * Alle kolommen van het rekenblad staan erin (zie COL_DEFS in CalculatieGrid.tsx),
 * met per (sub)groep een totaalregel en onderaan de eindtotalen.
 *
 * Draaien:
 *   npm install          (in deze map; de enige afhankelijkheid is `docx`)
 *   node build-docx.mjs  [uitvoerpad.docx]
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AlignmentType, BorderStyle, Document, Footer, Header,
  PageNumber, PageOrientation, Packer, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'

// ─── Huisstijl ────────────────────────────────────────────────────────────────

const GROEN       = '009439'  // Everts primair
const GROEN_DIEP  = '007530'
const INKT        = '1F2933'
const GRIJS       = '6B7280'
const LIJN        = 'D7DBE0'

// Kolomgroepen krijgen dezelfde tinten als in het rekenblad, zodat de staat op
// papier net zo te lezen is als op het scherm.
const TINT_ARBEID    = 'EAF1FD'  // blauw   — uren, tarief, bedrag AB
const TINT_MATERIAAL = 'FCE9F1'  // roze    — materiaal
const TINT_OA        = 'F3E8F7'  // paars   — onderaanneming
const TINT_KOSTPRIJS = 'E6F6EC'  // groen   — kostprijs en opslag
const TINT_VERKOOP   = 'E3F3EE'  // diepgroen — verkoopprijs
const TINT_BTW       = 'FBEEE0'  // oranje  — btw

const TINT_NIVEAU = ['D7EEDF', 'E8F5ED', 'F2F9F5']  // groepskoppen niveau 1/2/3
const TINT_TOTAAL = ['C4E6D2', 'DCEFE4', 'EDF6F1']  // totaalregels niveau 1/2/3
const TINT_EIGEN  = 'F6F8F7'                        // "waarvan eigen regels"

const LETTER      = 'Calibri'
const LETTER_KOP  = 'Cambria'
const PT_TABEL    = 13   // half-points: 6,5 pt
const PT_KOP      = 13
const PT_TOTAAL   = 14

// ─── Kolommen ─────────────────────────────────────────────────────────────────
//
// Eén bron voor kop, breedte, uitlijning en tint. De volgorde volgt COL_DEFS in
// CalculatieGrid.tsx, zodat de staat dezelfde leesvolgorde heeft als het rekenblad.
// `markeer` en `acties` zitten er niet in: dat zijn schermknoppen, geen gegevens.
//
// De breedtes zijn percentages van de tabelbreedte, niet millimeters. Zo loopt de
// tabel mee met het papier: A3 liggend is het uitgangspunt, maar wie de sectie in
// Word op A4 zet (of bij het afdrukken "Aanpassen aan papierformaat: A4" kiest)
// houdt exact dezelfde indeling, alleen kleiner.

const KOL = [
  { id: 'kostengroep',  kop: 'Kostengroep',  pct: 50,  uit: 'left'  },
  { id: 'omschrijving', kop: 'Omschrijving', pct: 150, uit: 'left'  },
  { id: 'aant',         kop: 'Aant.',        pct: 38,  uit: 'right' },
  { id: 'eenh',         kop: 'Eenh.',        pct: 32,  uit: 'left'  },
  { id: 'stp',          kop: 'STP',          pct: 24,  uit: 'center' },
  { id: 'vrr',          kop: 'VRR',          pct: 24,  uit: 'center' },

  { id: 'uur_eenh',  kop: 'Uur/e.',      pct: 38, uit: 'right', tint: TINT_ARBEID },
  { id: 'min_eenh',  kop: 'Min/e.',      pct: 34, uit: 'right', tint: TINT_ARBEID },
  { id: 'tarief_ab', kop: 'Tarief AB €', pct: 44, uit: 'right', tint: TINT_ARBEID },
  { id: 'bedrag_ab', kop: 'Bedrag AB €', pct: 56, uit: 'right', tint: TINT_ARBEID },

  { id: 'prijs_ma',  kop: 'Prijs MA €',  pct: 44, uit: 'right', tint: TINT_MATERIAAL },
  { id: 'bedrag_ma', kop: 'Bedrag MA €', pct: 56, uit: 'right', tint: TINT_MATERIAAL },

  { id: 'prijs_oa',  kop: 'Prijs OA €',  pct: 44, uit: 'right', tint: TINT_OA },
  { id: 'bedrag_oa', kop: 'Bedrag OA €', pct: 56, uit: 'right', tint: TINT_OA },

  { id: 'tot_uren',  kop: 'Tot. uren',   pct: 42, uit: 'right', tint: TINT_ARBEID },

  { id: 'kp_eenh',   kop: 'KP/e. €',     pct: 44, uit: 'right', tint: TINT_KOSTPRIJS },
  { id: 'tot_kp',    kop: 'Tot. KP €',   pct: 58, uit: 'right', tint: TINT_KOSTPRIJS },
  { id: 'opslag',    kop: 'Opsl. %',     pct: 38, uit: 'right', tint: TINT_KOSTPRIJS },

  { id: 'vp_eenh',   kop: 'VP/e. €',     pct: 44, uit: 'right', tint: TINT_VERKOOP },
  { id: 'tot_vp',    kop: 'Tot. VP €',   pct: 58, uit: 'right', tint: TINT_VERKOOP },

  { id: 'btw',       kop: 'BTW %',       pct: 30, uit: 'right', tint: TINT_BTW },
]

const PCT_TOTAAL = KOL.reduce((s, k) => s + k.pct, 0)

/**
 * Bruikbare breedte op A3 liggend: 420 mm papier min 2 × 10 mm marge, in twips
 * (1 mm = 1440/25,4). De kolomindeling wordt hierin uitgedrukt én de tabel krijgt
 * daarnaast een breedte van 100%: Word leest de indeling dan als verhouding en
 * schaalt hem mee met de pagina, terwijl een lezer die alleen naar de rasterbreedtes
 * kijkt toch de juiste millimeters ziet.
 */
const BRUIKBAAR_TWIPS = Math.round((420 - 20) * (1440 / 25.4))
const breedte = (k) => Math.round((k.pct / PCT_TOTAAL) * BRUIKBAAR_TWIPS)

const UIT = { left: AlignmentType.LEFT, right: AlignmentType.RIGHT, center: AlignmentType.CENTER }

// ─── Bouwstenen ───────────────────────────────────────────────────────────────

function tekst(inhoud, opties = {}) {
  return new TextRun({
    text: inhoud,
    font: opties.font ?? LETTER,
    size: opties.size ?? PT_TABEL,
    bold: opties.bold ?? false,
    italics: opties.italics ?? false,
    color: opties.color ?? INKT,
  })
}

function cel(inhoud, { uit = 'left', tint, bold, italics, color, span, size, inspring } = {}) {
  return new TableCell({
    columnSpan: span,
    shading: tint ? { type: ShadingType.CLEAR, fill: tint, color: 'auto' } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 20, bottom: 20, left: 45, right: 45 },
    children: [
      new Paragraph({
        alignment: UIT[uit],
        spacing: { before: 0, after: 0 },
        // Inspringen per groepsniveau, net als in het rekenblad: zonder dat verschil
        // zijn een hoofdstuk en een subgroep alleen aan een lichte tint te
        // onderscheiden, en dat overleeft een zwart-witafdruk niet.
        indent: inspring ? { left: inspring } : undefined,
        children: [tekst(inhoud, { bold, italics, color, size })],
      }),
    ],
  })
}

/** Inspringing van een groepskop of -totaal, in twips (≈ 3,2 mm per niveau). */
const inspringing = (niveau) => (niveau - 1) * 180

/**
 * Eén rij waarin per kolom-id een waarde staat. Kolommen die niet in `waarden`
 * voorkomen blijven leeg — zo hoeft een totaalregel alleen de kolommen te noemen
 * waar een totaal in thuishoort, en blijven "per eenheid"-kolommen vanzelf leeg.
 */
function rij(waarden, { tint, bold, italics, color, size, header } = {}) {
  return new TableRow({
    tableHeader: header,
    cantSplit: true,
    children: KOL.map(k =>
      cel(waarden[k.id] ?? '', {
        uit: k.uit,
        tint: tint ?? k.tint,
        bold, italics, color, size,
      }),
    ),
  })
}

/** Detailregel: één calculatieregel, alle kolommen van het rekenblad. */
function detailRij(openTag, sluitTag) {
  const waarden = {
    kostengroep:  `${openTag}{kostengroep_naam}`,  // detailregels springen niet mee: de kostengroep is een eigen kolom
    omschrijving: '{omschrijving}',
    aant:         '{hoeveelheid}',
    eenh:         '{eenheid}',
    stp:          '{#is_stelpost}•{/is_stelpost}',
    vrr:          '{#is_verrekenbaar}•{/is_verrekenbaar}',
    uur_eenh:     '{uren_per_eenheid}',
    min_eenh:     '{minuten_per_eenheid}',
    tarief_ab:    '{arbeid_tarief_bedrag}',
    bedrag_ab:    '{arbeid_bedrag_getal}',
    prijs_ma:     '{materiaal_prijs_per_eenheid_bedrag}',
    bedrag_ma:    '{materiaal_bedrag_getal}',
    prijs_oa:     '{oa_prijs_per_eenheid_bedrag}',
    bedrag_oa:    '{oa_bedrag_getal}',
    tot_uren:     '{uren_totaal}',
    kp_eenh:      '{kostprijs_per_eenheid_bedrag}',
    tot_kp:       '{kostprijs_totaal_bedrag}',
    opslag:       '{opslag_pct}',
    vp_eenh:      '{eenheidsprijs_bedrag}',
    tot_vp:       '{totaal_bedrag}',
    // Een tekstregel heeft geen bedrag en dus geen btw. Alle andere getalvelden komen
    // al leeg uit de renderer; `btw_pct` niet, want dat is een getal dat altijd een
    // waarde heeft. Vandaar hier de omgekeerde voorwaarde.
    btw:          `{^is_tekstregel}{btw_pct}{/is_tekstregel}${sluitTag}`,
  }
  return rij(waarden)
}

/** Kolomkoppen; herhaalt zich bovenaan elke pagina. */
function kopRij() {
  return new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: KOL.map(k =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: k.tint ?? 'EFF2F4', color: 'auto' },
        verticalAlign: VerticalAlign.BOTTOM,
        margins: { top: 40, bottom: 40, left: 45, right: 45 },
        children: [
          new Paragraph({
            alignment: UIT[k.uit],
            spacing: { before: 0, after: 0 },
            children: [tekst(k.kop, { bold: true, size: PT_KOP, color: GROEN_DIEP })],
          }),
        ],
      }),
    ),
  })
}

/** Eindtotaal over de hele begroting. */
function eindTotaalRij() {
  const waarden = {
    bedrag_ab: '{totalen.arbeid_bedrag_getal}',
    bedrag_ma: '{totalen.materiaal_bedrag_getal}',
    bedrag_oa: '{totalen.oa_bedrag_getal}',
    tot_uren:  '{totalen.uren}',
    tot_kp:    '{totalen.kostprijs_bedrag}',
    opslag:    '{totalen.opslag_pct}',
    tot_vp:    '{totalen.verkoop_bedrag}',
  }
  const cellen = [
    cel('Totaal begroting', { uit: 'left', tint: GROEN, bold: true, color: 'FFFFFF', size: 16, span: 6 }),
    ...KOL.slice(6).map(k =>
      cel(waarden[k.id] ?? '', { uit: k.uit, tint: GROEN, bold: true, color: 'FFFFFF', size: 16 }),
    ),
  ]
  return new TableRow({ cantSplit: true, children: cellen })
}

// ─── De tabel ─────────────────────────────────────────────────────────────────
//
// De lus-structuur. docxtemplater herhaalt de rijen tússen een openings- en
// sluitingstag; staan beide in dezelfde rij, dan is die ene rij de lus-inhoud
// (zo werken de detailregels en de voorwaardelijke "waarvan"-regel).
//
// EVA kent drie groepsniveaus, dus de nesting is drie lagen diep uitgeschreven:
// een Word-sjabloon kan niet recursief zijn.

function begrotingsTabel() {
  const rijen = [kopRij()]

  // Niveau 1
  rijen.push(nivKop(1, '{#boom}'))
  rijen.push(detailRij('{#regels}', '{/regels}'))
  rijen.push(eigenRij(1))

  // Niveau 2
  rijen.push(nivKop(2, '{#kinderen}'))
  rijen.push(detailRij('{#regels}', '{/regels}'))
  rijen.push(eigenRij(2))

  // Niveau 3
  rijen.push(nivKop(3, '{#kinderen}'))
  rijen.push(detailRij('{#regels}', '{/regels}'))
  rijen.push(nivTotaal(3, '{/kinderen}'))

  rijen.push(nivTotaal(2, '{/kinderen}'))
  rijen.push(nivTotaal(1, '{/boom}'))

  rijen.push(eindTotaalRij())

  return new Table({
    // Breedte in procenten + een vaste kolomindeling: Word schaalt de kolommen dan
    // mee met de paginabreedte. Zet iemand de sectie op A4, dan blijft de indeling
    // dezelfde — alleen smaller. Met vaste millimeters zou de tabel van de pagina lopen.
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: KOL.map(breedte),
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: LIJN },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LIJN },
      left:   { style: BorderStyle.SINGLE, size: 4, color: LIJN },
      right:  { style: BorderStyle.SINGLE, size: 4, color: LIJN },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LIJN },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: LIJN },
    },
    rows: rijen,
  })
}

/** Groepskop met de openingstag van de lus in de eerste cel. */
function nivKop(niveau, openTag) {
  const tint = TINT_NIVEAU[niveau - 1]
  const cellen = [
    cel(`${openTag}{display_naam}`, { uit: 'left', tint, bold: true, size: PT_KOP, span: 6, inspring: inspringing(niveau) }),
    ...KOL.slice(6).map(k => cel('', { uit: k.uit, tint })),
  ]
  return new TableRow({ cantSplit: true, children: cellen })
}

/** Groepstotaal met de sluitingstag van de lus in de laatste cel. */
function nivTotaal(niveau, sluitTag) {
  const tint = TINT_TOTAAL[niveau - 1]
  const waarden = {
    bedrag_ab: '{incl.arbeid_bedrag_getal}',
    bedrag_ma: '{incl.materiaal_bedrag_getal}',
    bedrag_oa: '{incl.oa_bedrag_getal}',
    tot_uren:  '{incl.uren}',
    tot_kp:    '{incl.kostprijs_bedrag}',
    opslag:    '{incl.opslag_pct}',
    tot_vp:    '{incl.verkoop_bedrag}',
  }
  const laatste = KOL.length - 1
  const cellen = [
    cel('Totaal {display_naam}', { uit: 'left', tint, bold: true, size: PT_TOTAAL, span: 6, inspring: inspringing(niveau) }),
    ...KOL.slice(6).map((k, i) => {
      const waarde = (waarden[k.id] ?? '') + (6 + i === laatste ? sluitTag : '')
      return cel(waarde, { uit: k.uit, tint, bold: true, size: PT_TOTAAL })
    }),
  ]
  return new TableRow({ cantSplit: true, children: cellen })
}

/**
 * "Waarvan eigen regels" — alleen zichtbaar bij een groep die én eigen regels én
 * subgroepen heeft. Anders zegt deze regel hetzelfde als het groepstotaal eronder.
 */
function eigenRij(niveau) {
  const waarden = {
    bedrag_ab: '{eigen.arbeid_bedrag_getal}',
    bedrag_ma: '{eigen.materiaal_bedrag_getal}',
    bedrag_oa: '{eigen.oa_bedrag_getal}',
    tot_uren:  '{eigen.uren}',
    tot_kp:    '{eigen.kostprijs_bedrag}',
    opslag:    '{eigen.opslag_pct}',
    tot_vp:    '{eigen.verkoop_bedrag}',
  }
  const laatste = KOL.length - 1
  const cellen = [
    cel('{#toon_eigen_totaal}waarvan eigen regels', {
      uit: 'left', tint: TINT_EIGEN, italics: true, color: GRIJS, size: PT_TOTAAL, span: 6,
      inspring: inspringing(niveau) + 180,
    }),
    ...KOL.slice(6).map((k, i) => {
      const waarde = (waarden[k.id] ?? '') + (6 + i === laatste ? '{/toon_eigen_totaal}' : '')
      return cel(waarde, { uit: k.uit, tint: TINT_EIGEN, italics: true, color: GRIJS, size: PT_TOTAAL })
    }),
  ]
  return new TableRow({ cantSplit: true, children: cellen })
}

// ─── Kop- en slotblok ─────────────────────────────────────────────────────────

function regel(label, veld, { bold = false } = {}) {
  return new Paragraph({
    spacing: { before: 0, after: 20 },
    children: [
      tekst(`${label}: `, { size: 16, color: GRIJS }),
      tekst(veld, { size: 16, bold, color: INKT }),
    ],
  })
}

function kopblok() {
  return [
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [tekst('Interne begroting', { font: LETTER_KOP, size: 30, bold: true, color: GROEN_DIEP })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 160 },
      children: [tekst('{offerte.titel}', { font: LETTER_KOP, size: 22, color: INKT })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [1, 1, 1].map(() => Math.round(BRUIKBAAR_TWIPS / 3)),
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            kopKolom([
              regel('Begrotingsnummer', '{offerte.nummer}', { bold: true }),
              regel('Datum', '{offerte.datum}'),
              regel('Dossier', '{dossier.dossiernummer}'),
            ]),
            kopKolom([
              regel('Opdrachtgever', '{klant.bedrijf_of_naam}'),
              regel('Werkadres', '{dossier.werkadres}'),
              regel('Referentie', '{offerte.referentie}'),
            ]),
            kopKolom([
              regel('Calculator', '{dossier.calculator}'),
              regel('Projectleider', '{dossier.projectleider}'),
              regel('Werkmaatschappij', '{bedrijf.naam}'),
            ]),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }),
  ]
}

function kopKolom(alineas) {
  return new TableCell({
    width: { size: 33, type: WidthType.PERCENTAGE },
    margins: { top: 0, bottom: 0, left: 0, right: 180 },
    children: alineas,
  })
}

function slotblok() {
  const regels = [
    ['Kostprijs', '{totalen.kostprijs}'],
    ['Opslag (op de kostprijs, AK inbegrepen)', '{totalen.opslag_bedrag}  ({totalen.opslag_pct})'],
    ['Verkoopprijs excl. btw', '{totalen.subtotaal}'],
    ['Marge (op de verkoopprijs)', '{totalen.marge_bedrag}  ({totalen.marge_pct})'],
    ['Totaal uren', '{totalen.uren}'],
  ]
  return [
    new Paragraph({ spacing: { before: 240, after: 80 }, children: [
      tekst('Samenvatting', { font: LETTER_KOP, size: 22, bold: true, color: GROEN_DIEP }),
    ]}),
    new Table({
      width: { size: 45, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      columnWidths: [Math.round(BRUIKBAAR_TWIPS * 0.27), Math.round(BRUIKBAAR_TWIPS * 0.18)],
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 4, color: LIJN },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: LIJN },
        left:   { style: BorderStyle.SINGLE, size: 4, color: LIJN },
        right:  { style: BorderStyle.SINGLE, size: 4, color: LIJN },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LIJN },
        insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: LIJN },
      },
      rows: regels.map(([label, veld], i) => new TableRow({
        children: [
          cel(label, { uit: 'left', size: 16, bold: i === regels.length - 3, tint: i % 2 ? 'F7F9F8' : undefined }),
          cel(veld, { uit: 'right', size: 16, bold: i === regels.length - 3, tint: i % 2 ? 'F7F9F8' : undefined }),
        ],
      })),
    }),
    // Voorbehoud: alleen zichtbaar als niet elke regel een kostprijs had. Zonder deze
    // waarschuwing oogt een staat met ontbrekende kostprijzen kloppend, terwijl de
    // opslag en de marge dan te hoog uitvallen.
    new Paragraph({
      spacing: { before: 160, after: 0 },
      children: [
        tekst('{^totalen.kostprijs_volledig}', { size: 15, italics: true, color: 'B45309' }),
        tekst(
          'Let op: niet elke regel heeft een kostprijs uit de calculatie. De verkoopprijs van die '
          + 'regels telt wel mee in de opslag en de marge, de kostprijs niet — beide percentages '
          + 'vallen daardoor te hoog uit.',
          { size: 15, italics: true, color: 'B45309' },
        ),
        tekst('{/totalen.kostprijs_volledig}', { size: 15, italics: true, color: 'B45309' }),
      ],
    }),
  ]
}

// ─── Document ─────────────────────────────────────────────────────────────────

const doc = new Document({
  creator: 'EVA',
  title: 'Interne begroting',
  description: 'Word-sjabloon voor de begrotingsstaat van een interne begroting in EVA',
  styles: {
    default: {
      document: { run: { font: LETTER, size: 18, color: INKT } },
      heading1: { run: { font: LETTER_KOP, size: 30, bold: true, color: GROEN_DIEP } },
    },
  },
  sections: [{
    properties: {
      page: {
        // A3 liggend. LET OP: bij `LANDSCAPE` verwisselt de docx-bibliotheek breedte
        // en hoogte zelf, dus hier staan de staánde maten. Andersom levert het een
        // pagina van 297 mm breed op — A3 portret met een landschapsvlaggetje.
        // Wie A4 wil, kiest bij het afdrukken "Aanpassen aan papierformaat: A4"; de
        // tabelbreedte is een percentage, dus de indeling blijft dezelfde.
        size: {
          orientation: PageOrientation.LANDSCAPE,
          width: 16839,   // 297 mm  -> wordt de hoogte
          height: 23814,  // 420 mm  -> wordt de breedte
        },
        margin: { top: 567, right: 567, bottom: 567, left: 567 },  // 10 mm
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 0, after: 0 },
            children: [tekst('INTERN — niet bestemd voor de opdrachtgever', { size: 14, bold: true, color: 'B45309' })],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 0, after: 0 },
            children: [
              tekst('{offerte.nummer} · {offerte.datum} · pagina ', { size: 14, color: GRIJS }),
              new TextRun({ children: [PageNumber.CURRENT], font: LETTER, size: 14, color: GRIJS }),
              tekst(' van ', { size: 14, color: GRIJS }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: LETTER, size: 14, color: GRIJS }),
            ],
          }),
        ],
      }),
    },
    children: [
      ...kopblok(),
      begrotingsTabel(),
      ...slotblok(),
    ],
  }],
})

const doel = resolve(process.argv[2] ?? 'Interne-begroting-sjabloon.docx')
const buffer = await Packer.toBuffer(doc)
writeFileSync(doel, buffer)
console.log(`Geschreven: ${doel} (${(buffer.length / 1024).toFixed(1)} kB, ${KOL.length} kolommen)`)
