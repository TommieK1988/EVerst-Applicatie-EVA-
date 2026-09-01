import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { meerwerkStatusLabels, type MeerwerkStatus } from '@everts/database'
import { getDossierMeerwerk, type MeerwerkRegelView } from './meerwerk'
import { veilig, wikkel, type PdfFont } from '@/lib/pdf/tekst'
import { fetchBriefpapier, mergeBriefpapierBackground } from '@/lib/everts-calc/briefpapier'

/**
 * Meerwerkoverzicht als PDF voor de opdrachtgever: alle meerwerkregels van een dossier,
 * gegroepeerd en getotaliseerd per status, met de bedragen exclusief en inclusief btw.
 *
 * Zelfde aanpak als het opleverrapport: direct tekenen met pdf-lib. HTML->PDF vraagt een headless
 * browser die op Vercel serverless niet draait, en de docx->PDF-route van de offerte vereist O365.
 */

const A4 = { breedte: 595.28, hoogte: 841.89 }
const MARGE = 48
const KOLOM = A4.breedte - MARGE * 2

/**
 * Vrije ruimte boven en onder wanneer het overzicht op briefpapier wordt gezet: daar staan het
 * briefhoofd en de bedrijfsvoet al voorgedrukt, dus daar mag niets van ons overheen. 42 en 26 mm,
 * dezelfde veilige zone die de formulier-PDF's aanhouden.
 */
const BRIEF_BOVEN = (42 / 25.4) * 72
const BRIEF_ONDER = (26 / 25.4) * 72

/**
 * Volgorde van de statusblokken: de procesvolgorde die de klant kent, met afgewezen als sluitstuk.
 * Afgewezen regels staan er bewust in — de klant wil kunnen zien wat er besproken is en niet
 * doorgegaan — maar tellen nergens in een totaal mee.
 */
const STATUS_VOLGORDE: MeerwerkStatus[] = [
  'aangevraagd', 'offerte_verstuurd', 'akkoord', 'voltooid', 'afgewezen',
]

/** Statussen die als goedgekeurd meerwerk meetellen (gelijk aan `GOEDGEKEURD` in meerwerk.ts). */
const GOEDGEKEURD: MeerwerkStatus[] = ['akkoord', 'voltooid']

/*
 * Kolommen: de bedragkolommen zijn rechts uitgelijnd op hun rechterrand. Het btw-percentage staat
 * tussen de twee bedragen in, zodat je van links naar rechts leest hoe het bedrag is opgebouwd.
 */
const X_NR = MARGE
const X_OMS = MARGE + 34
const R_DATUM = 352
const R_EXCL = 440
const R_BTW = 478
const R_INCL = A4.breedte - MARGE
/** Ruimte voor de datum (~45pt) plus een marge, zodat een lange omschrijving er niet tegenaan loopt. */
const OMS_BREEDTE = R_DATUM - X_OMS - 54

/*
 * De totaaltabellen hebben een eigen raster: daar staat in de btw-kolom een bedrag in plaats van
 * een percentage, en dat past niet in de smalle percentagekolom van de regeltabel.
 */
const T_AANTAL = 300
const T_EXCL = 385
const T_BTW = 465
const T_INCL = A4.breedte - MARGE

const euro = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

const rond = (n: number): number => Math.round(n * 100) / 100

/** De btw-tarieven die in een set regels voorkomen, oplopend en zonder dubbelen. */
const tarievenIn = (regels: MeerwerkRegelView[]): number[] =>
  [...new Set(regels.map(r => r.btwEffectief))].sort((a, b) => a - b)

/**
 * Wat er in de btw-kolom van een totaalregel komt te staan. Eén tarief in de groep? Dan het
 * percentage. Meerdere tarieven? Dan is één percentage misleidend en verwijzen we naar de
 * btw-specificatie onderaan het overzicht.
 */
const tariefLabel = (regels: MeerwerkRegelView[]): string => {
  const t = tarievenIn(regels)
  return t.length === 1 ? `${t[0]}%` : 'divers'
}

const datumKort = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

type Groep = {
  status: MeerwerkStatus
  regels: MeerwerkRegelView[]
  excl: number
  incl: number
}

export type MeerwerkOverzichtDossier = {
  titel: string | null
  nummer: string | null
  klant: string | null
  werkadres: string | null
}

/**
 * Het briefpapier van de offerte-layout, als bytes. Bewust dezelfde bron als de offerte: dat is het
 * briefpapier dat de klant van ons kent, en het wordt op één plek beheerd (Instellingen > Offertes).
 * De standaard-layout gaat voor; is daar niets ingesteld, dan de laatst bijgewerkte layout die wél
 * briefpapier heeft. Best-effort: zonder briefpapier komt het overzicht er kaal uit, niet fout.
 */
async function haalBriefpapier(): Promise<Buffer | null> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('quote_layouts')
    .select('briefpapier_pdf_url, is_standaard, updated_at')
    .not('briefpapier_pdf_url', 'is', null)
    .order('is_standaard', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return fetchBriefpapier(data?.briefpapier_pdf_url ?? null)
}

/** Kopgegevens van het dossier voor op het overzicht (titel, nummer, opdrachtgever, werkadres). */
export async function getMeerwerkOverzichtDossier(dossierId: string): Promise<MeerwerkOverzichtDossier | null> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('titel, dossiernummer, klant_id, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad')
    .eq('id', dossierId)
    .maybeSingle()
  if (!dossier) return null

  let klant: string | null = null
  if (dossier.klant_id) {
    const { data: r } = await supabase.from('relaties').select('naam').eq('id', dossier.klant_id).maybeSingle()
    klant = r?.naam ?? null
  }
  const werkadres = [
    [dossier.werkadres_straat, dossier.werkadres_huisnummer].filter(Boolean).join(' '),
    [dossier.werkadres_postcode, dossier.werkadres_stad].filter(Boolean).join('  '),
  ].filter(Boolean).join(', ') || null

  return { titel: dossier.titel ?? null, nummer: dossier.dossiernummer ?? null, klant, werkadres }
}

/**
 * Bouwt het meerwerkoverzicht voor één dossier.
 *
 * @param koptekst Vrije inleiding boven de tabel (optioneel) — bijvoorbeeld waar het overzicht bij
 *                 hoort of tot welke datum het loopt. Wordt letterlijk overgenomen.
 * @returns PDF-bytes, of null als het dossier niet bestaat.
 */
export async function genereerMeerwerkOverzichtPdf(
  dossierId: string,
  koptekst?: string | null,
): Promise<Uint8Array | null> {
  const dossier = await getMeerwerkOverzichtDossier(dossierId)
  if (!dossier) return null
  const [{ regels }, briefpapier] = await Promise.all([
    getDossierMeerwerk(dossierId),
    haalBriefpapier(),
  ])
  // Pas de smallere bladspiegel gebruiken als het briefpapier er ook écht is: anders staat de
  // inhoud ingesprongen op een leeg vel.
  const opBriefpapier = briefpapier !== null
  const BOVEN = opBriefpapier ? BRIEF_BOVEN : MARGE
  const ONDER = opBriefpapier ? BRIEF_ONDER : MARGE

  // Groeperen per status; binnen een groep op volgnummer (de volgorde waarin het meerwerk ontstond).
  const groepen: Groep[] = STATUS_VOLGORDE
    .map(status => {
      const eigen = regels.filter(r => r.status === status).sort((a, b) => a.volgnummer - b.volgnummer)
      return {
        status,
        regels: eigen,
        excl: eigen.reduce((s, r) => s + r.effectiefExcl, 0),
        incl: eigen.reduce((s, r) => s + r.effectiefIncl, 0),
      }
    })
    .filter(g => g.regels.length > 0)

  const goedgekeurd = groepen.filter(g => GOEDGEKEURD.includes(g.status))
  const totaalExcl = goedgekeurd.reduce((s, g) => s + g.excl, 0)
  const totaalIncl = goedgekeurd.reduce((s, g) => s + g.incl, 0)
  const totaalAantal = goedgekeurd.reduce((s, g) => s + g.regels.length, 0)

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(veilig(`Meerwerkoverzicht ${dossier.nummer ?? ''} ${dossier.titel ?? ''}`.trim()))
  doc.setCreator('EVA - Everts')

  const normaal = await doc.embedFont(StandardFonts.Helvetica)
  const vet = await doc.embedFont(StandardFonts.HelveticaBold)
  const GROEN = rgb(0, 0.58, 0.22)
  const GRIJS = rgb(0.42, 0.46, 0.49)
  const LICHTGRIJS = rgb(0.89, 0.91, 0.91)
  const ZWART = rgb(0.1, 0.12, 0.14)

  let pagina = doc.addPage([A4.breedte, A4.hoogte])
  let y = A4.hoogte - BOVEN

  const nieuwePagina = () => {
    pagina = doc.addPage([A4.breedte, A4.hoogte])
    y = A4.hoogte - BOVEN
  }
  /** Zorgt dat er nog `nodig` punten verticale ruimte is; zo niet: nieuwe pagina. */
  const ruimte = (nodig: number) => {
    if (y - nodig < ONDER + 28) nieuwePagina()
  }
  type TekstOpts = { x?: number; grootte?: number; font?: PdfFont; kleur?: ReturnType<typeof rgb> }
  const tekst = (s: string, opts: TekstOpts = {}) => {
    pagina.drawText(veilig(s), {
      x: opts.x ?? MARGE, y, size: opts.grootte ?? 10,
      font: opts.font ?? normaal, color: opts.kleur ?? ZWART,
    })
  }
  /** Zelfde als `tekst`, maar uitgelijnd op een rechterrand — voor de bedragkolommen. */
  const rechts = (s: string, rechterrand: number, opts: TekstOpts = {}) => {
    const font = opts.font ?? normaal
    const grootte = opts.grootte ?? 10
    const v = veilig(s)
    pagina.drawText(v, {
      x: rechterrand - font.widthOfTextAtSize(v, grootte), y, size: grootte,
      font, color: opts.kleur ?? ZWART,
    })
  }
  const streep = (dikte = 0.5, kleur = LICHTGRIJS) => {
    pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: dikte, color: kleur })
  }

  /* ── Kop ── */
  // Op briefpapier staat het briefhoofd al voorgedrukt; een tweede woordmerk zou ernaast komen.
  if (!opBriefpapier) {
    pagina.drawText('EVERTS.', { x: A4.breedte - MARGE - vet.widthOfTextAtSize('EVERTS.', 14), y: y - 4, size: 14, font: vet, color: ZWART })
  }
  tekst('Meerwerkoverzicht', { grootte: 20, font: vet })
  y -= 18
  tekst(`Opgesteld op ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, { grootte: 9.5, kleur: GRIJS })
  y -= 10
  streep(1.6, GROEN)
  y -= 22

  /* ── Projectgegevens ── */
  const info: [string, string][] = [
    ['Project', dossier.titel ?? '-'],
    ['Projectnummer', dossier.nummer ?? '-'],
    ['Opdrachtgever', dossier.klant ?? '-'],
    ['Werkadres', dossier.werkadres ?? '-'],
  ]
  for (const [label, waarde] of info) {
    ruimte(16)
    tekst(label, { grootte: 9, kleur: GRIJS })
    for (const regel of wikkel(waarde, normaal, 10, KOLOM - 110)) {
      tekst(regel, { x: MARGE + 110, grootte: 10 })
      y -= 13
    }
    y -= 2
  }

  /* ── Koptekst ── */
  const kop = (koptekst ?? '').trim()
  if (kop) {
    y -= 10
    // Handmatige regeleindes in de koptekst respecteren; lege regels worden witregels.
    for (const alinea of kop.split(/\r?\n/)) {
      if (!alinea.trim()) { ruimte(7); y -= 7; continue }
      for (const regel of wikkel(alinea, normaal, 10, KOLOM)) {
        ruimte(14); tekst(regel, { grootte: 10 }); y -= 13
      }
    }
  }

  y -= 14

  if (groepen.length === 0) {
    ruimte(20)
    tekst('Er is voor dit project nog geen meerwerk vastgelegd.', { grootte: 10, kleur: GRIJS })
    y -= 14
  }

  /** Kolomkoppen van de regeltabel; wordt boven elk statusblok herhaald. */
  const tabelkop = () => {
    tekst('Nr', { x: X_NR, grootte: 8, font: vet, kleur: GRIJS })
    tekst('Omschrijving', { x: X_OMS, grootte: 8, font: vet, kleur: GRIJS })
    rechts('Datum', R_DATUM, { grootte: 8, font: vet, kleur: GRIJS })
    rechts('Excl. btw', R_EXCL, { grootte: 8, font: vet, kleur: GRIJS })
    rechts('Btw %', R_BTW, { grootte: 8, font: vet, kleur: GRIJS })
    rechts('Incl. btw', R_INCL, { grootte: 8, font: vet, kleur: GRIJS })
    y -= 5
    streep()
    y -= 12
  }

  /** Kop van een statusblok; `vervolg` markeert de voortzetting op een volgende pagina. */
  const groepskop = (groep: Groep, vervolg = false) => {
    const label = `${meerwerkStatusLabels[groep.status]} (${groep.regels.length})`
    tekst(vervolg ? `${label} - vervolg` : label, { grootte: 11.5, font: vet })
    y -= 6
    streep(0.8)
    y -= 14
    tabelkop()
  }

  for (const groep of groepen) {
    // Kop + kolomkoppen + minstens één regel bij elkaar houden.
    ruimte(74)
    groepskop(groep)

    for (const r of groep.regels) {
      const omschrijving = wikkel(r.omschrijving, normaal, 9.5, OMS_BREEDTE)
      // Toelichtingsregel: hoe wordt deze post afgerekend, en waar hoort hij bij.
      const stelpostUitleg = r.stelpost_grondslag === 'geboekte_kosten'
        ? 'stelpost op nacalculatie'
        // Zonder hoeveelheid en prijs is er nog niets te verrekenen; "0 x EUR 0,00" zou dat
        // ten onrechte als een afgerond nulbedrag laten lezen.
        : r.hoeveelheid_werkelijk == null && r.eenheidsprijs == null
          ? 'stelpost, nog niet verrekend'
          : `stelpost ${r.hoeveelheid_werkelijk ?? 0} ${r.eenheid ?? ''} x ${euro(Number(r.eenheidsprijs) || 0)}`.replace(/\s+/g, ' ')
      const sub = [
        r.is_stelpost ? stelpostUitleg : r.afrekenwijze === 'regie' ? 'in regie' : null,
        r.factuurreferentie ? `ref. ${r.factuurreferentie}` : null,
      ].filter(Boolean).join('  -  ')

      const paginasVoor = doc.getPageCount()
      ruimte(omschrijving.length * 12 + (sub ? 11 : 0) + 8)
      // Sloeg de regel om naar een nieuwe pagina? Dan de kop en kolomnamen herhalen,
      // anders staat er een tabel zonder uitleg waar de bedragen bij horen.
      if (doc.getPageCount() > paginasVoor) groepskop(groep, true)
      const topY = y
      // Nummer, datum en bedragen staan op de eerste regel van de omschrijving.
      tekst(`MW${String(r.volgnummer).padStart(2, '0')}`, { x: X_NR, grootte: 9, kleur: GRIJS })
      rechts(datumKort(r.created_at), R_DATUM, { grootte: 9, kleur: GRIJS })
      rechts(euro(r.effectiefExcl), R_EXCL, { grootte: 9.5 })
      rechts(`${r.btwEffectief}%`, R_BTW, { grootte: 9, kleur: GRIJS })
      rechts(euro(r.effectiefIncl), R_INCL, { grootte: 9.5 })
      for (const regel of omschrijving) {
        tekst(regel, { x: X_OMS, grootte: 9.5 })
        y -= 12
      }
      if (sub) { tekst(sub, { x: X_OMS, grootte: 8, kleur: GRIJS }); y -= 11 }
      y = Math.min(y, topY - 12) - 4
      streep()
      y -= 12
    }

    /* Subtotaal per status */
    ruimte(20)
    rechts(`Subtotaal ${meerwerkStatusLabels[groep.status].toLowerCase()}`, R_EXCL - 90, { grootte: 9.5, font: vet })
    rechts(euro(groep.excl), R_EXCL, { grootte: 9.5, font: vet })
    rechts(tariefLabel(groep.regels), R_BTW, { grootte: 9, font: vet, kleur: GRIJS })
    rechts(euro(groep.incl), R_INCL, { grootte: 9.5, font: vet })
    y -= 22
  }

  /* ── Samenvatting ── */
  if (groepen.length > 0) {
    ruimte(48 + groepen.length * 14)
    tekst('Totalen per status', { grootte: 11.5, font: vet })
    y -= 6
    streep(0.8)
    y -= 14

    rechts('Aantal', T_AANTAL, { grootte: 8, font: vet, kleur: GRIJS })
    rechts('Excl. btw', T_EXCL, { grootte: 8, font: vet, kleur: GRIJS })
    rechts('Btw', T_BTW, { grootte: 8, font: vet, kleur: GRIJS })
    rechts('Incl. btw', T_INCL, { grootte: 8, font: vet, kleur: GRIJS })
    y -= 14

    for (const groep of groepen) {
      ruimte(14)
      tekst(meerwerkStatusLabels[groep.status], { grootte: 9.5 })
      rechts(String(groep.regels.length), T_AANTAL, { grootte: 9.5 })
      rechts(euro(groep.excl), T_EXCL, { grootte: 9.5 })
      // In een totaalregel is het btw-bédrag de enige waarde die bij meerdere tarieven klopt.
      rechts(euro(rond(groep.incl - groep.excl)), T_BTW, { grootte: 9.5 })
      rechts(euro(groep.incl), T_INCL, { grootte: 9.5 })
      y -= 14
    }

    y -= 2
    streep(0.8)
    y -= 16
    ruimte(24)
    tekst('Totaal goedgekeurd meerwerk', { grootte: 10.5, font: vet, kleur: GROEN })
    rechts(String(totaalAantal), T_AANTAL, { grootte: 10.5, font: vet, kleur: GROEN })
    rechts(euro(totaalExcl), T_EXCL, { grootte: 10.5, font: vet, kleur: GROEN })
    rechts(euro(rond(totaalIncl - totaalExcl)), T_BTW, { grootte: 10.5, font: vet, kleur: GROEN })
    rechts(euro(totaalIncl), T_INCL, { grootte: 10.5, font: vet, kleur: GROEN })
    y -= 13
    for (const regel of wikkel(
      'Dit zijn de regels met status Akkoord of Voltooid. Aangevraagd en Offerte verstuurd zijn nog niet opgedragen; afgewezen regels tellen niet mee.',
      normaal, 8, KOLOM)) {
      tekst(regel, { grootte: 8, kleur: GRIJS })
      y -= 10
    }

    /*
     * Btw-specificatie: alleen zinvol als er meer dan één tarief in het goedgekeurde meerwerk zit.
     * Dan staat er in de btw-kolom van de totaalregels 'divers' en moet hier te lezen zijn welk
     * bedrag onder welk tarief valt - hetzelfde uitsplitsen dat straks op de factuur staat.
     */
    const goedgekeurdeRegels = goedgekeurd.flatMap(g => g.regels)
    const specTarieven = tarievenIn(goedgekeurdeRegels)
    if (specTarieven.length > 1) {
      y -= 12
      ruimte(46 + specTarieven.length * 14)
      tekst('Btw-specificatie over het goedgekeurde meerwerk', { grootte: 11.5, font: vet })
      y -= 6
      streep(0.8)
      y -= 14

      tekst('Tarief', { grootte: 8, font: vet, kleur: GRIJS })
      rechts('Grondslag', T_EXCL, { grootte: 8, font: vet, kleur: GRIJS })
      rechts('Btw', T_BTW, { grootte: 8, font: vet, kleur: GRIJS })
      rechts('Totaal', T_INCL, { grootte: 8, font: vet, kleur: GRIJS })
      y -= 14

      for (const pct of specTarieven) {
        const eigen = goedgekeurdeRegels.filter(r => r.btwEffectief === pct)
        const excl = rond(eigen.reduce((sum, r) => sum + r.effectiefExcl, 0))
        const incl = rond(eigen.reduce((sum, r) => sum + r.effectiefIncl, 0))
        ruimte(14)
        tekst(`Btw ${pct}%`, { grootte: 9.5 })
        rechts(euro(excl), T_EXCL, { grootte: 9.5 })
        rechts(euro(rond(incl - excl)), T_BTW, { grootte: 9.5 })
        rechts(euro(incl), T_INCL, { grootte: 9.5 })
        y -= 14
      }
    }
  }

  /* ── Voettekst + paginanummers ── */
  // Op briefpapier hoort de eigen bedrijfsvoet er niet nog eens onder; dan blijft alleen de
  // toelichting op de bedragen staan, binnen de veilige zone boven het voorgedrukte deel.
  const voettekst = opBriefpapier
    ? 'Alle bedragen in euro.'
    : 'Opgesteld via EVA - Everts. Alle bedragen in euro.'
  const paginas = doc.getPages()
  paginas.forEach((p, i) => {
    p.drawRectangle({ x: MARGE, y: ONDER + 14, width: KOLOM, height: 0.5, color: LICHTGRIJS })
    p.drawText(veilig(voettekst), { x: MARGE, y: ONDER, size: 8, font: normaal, color: GRIJS })
    const nr = `${i + 1} / ${paginas.length}`
    p.drawText(nr, { x: A4.breedte - MARGE - normaal.widthOfTextAtSize(nr, 8), y: ONDER, size: 8, font: normaal, color: GRIJS })
  })

  const inhoud = await doc.save()
  if (!briefpapier) return inhoud
  try {
    return await mergeBriefpapierBackground(inhoud, briefpapier)
  } catch (err) {
    // Een onleesbaar briefpapier mag het overzicht niet tegenhouden; dan maar zonder achtergrond.
    console.warn('Briefpapier-merge mislukt, meerwerkoverzicht zonder briefpapier:', err)
    return inhoud
  }
}

/** Nette bestandsnaam voor de download/bijlage. */
export function meerwerkOverzichtBestandsnaam(nummer: string | null, titel: string | null): string {
  const kern = [nummer, titel].filter(Boolean).join(' - ')
  const schoon = veilig(kern).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'project'
  return `Meerwerkoverzicht ${schoon}.pdf`.slice(0, 120)
}
