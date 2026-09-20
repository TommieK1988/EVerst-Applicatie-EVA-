import 'server-only'

/**
 * Welke offerte hoort bij dit dossier, en waar komt hij vandaan?
 *
 * Eén plek die de drie bronnen op volgorde afloopt, zodat het mobiele klantbeeld (toont de knop
 * alleen als er iets te openen valt) en de PDF-route (`/api/dossiers/[id]/offerte/pdf`) nooit
 * uit elkaar kunnen lopen:
 *
 *  1. **EVA-offerte** (`quotes`) — de nieuwste verzonden versie, anders de nieuwste versie. Wordt
 *     bij het openen live gerenderd, dus altijd de actuele tekst en prijzen.
 *  2. **Handmatig gekoppelde PDF** (`dossiers.offerte_pdf_pad`) — dezelfde koppeling die het
 *     Offerte-paneel op de desktop gebruikt.
 *  3. **Bouw7-projectbestand** — een PDF uit de snapshot van `/list/project-files`, voor de
 *     offertes die in Bouw7 zijn opgesteld en in EVA dus geen quote-rij hebben.
 *
 * Bron 3 is bewust streng, want de Bouw7-categorie "09. Aanvraag, offerte & opdracht" is een
 * verzamelbak: daar zitten ook werkschema's, MJOP's, bestekken, de offerte-*aanvraag* van de
 * klant en offertes van ónze onderaannemers in. Op categorie alleen matchen leverde op productie
 * 59 dossiers op, maar met picks als `werkschema_17500.pdf` en negen keer `Offerte aanvraag.pdf`.
 * Aan de telefoon een werkschema of het prijsblad van een onderaannemer openen terwijl je denkt
 * de eigen offerte te tonen is erger dan geen knop. Daarom moet de bestandsnaam het zeggen, en
 * draagt de knop in de UI de bestandsnaam zodat je ziet wát je opent.
 *
 * Wat dat kost: van de 185 openstaande offertes vindt dit er 36 (24 EVA-offertes, 14 Bouw7-PDF's,
 * 2 overlappend). De overige 90 zijn Gilde-imports van vóór beide systemen — daar staat in EVA
 * simpelweg geen document.
 *
 * SharePoint zit er bewust NIET bij. De dossiermap is het calculatie-archief en bevat vooral de
 * concept-PDF's van EVA-offertes — die zijn via bron 1 al beter bereikbaar (live gerenderd) — en
 * uitlezen kost een live Graph-call per dossier. Voor een lijst met twintig offertes zou dat
 * twintig externe calls betekenen.
 */

import { createAdminClient } from '@everts/database/server'

export type OfferteBron =
  /** In EVA gemaakte offerte; de PDF wordt bij het openen gerenderd. */
  | { soort: 'eva'; quoteId: string; naam: string }
  /** Handmatig aan het dossier gekoppelde PDF in de bucket `dossier-offertes`. */
  | { soort: 'gekoppeld'; pad: string; naam: string }
  /** Projectbestand uit Bouw7; downloaden loopt via de proxy `/api/bouw7/bestand`. */
  | { soort: 'bouw7'; fileHash: string | null; bestandId: number | null; naam: string }

/**
 * Bouw7-bestandscategorie waarin de offertedocumenten thuishoren ("09. Aanvraag, offerte &
 * opdracht"). Op het nummer matchen en niet op de hele naam: de categorie is in Bouw7 vrij
 * hernoembaar, het volgnummer is de afspraak. Telt als voorkeur bij gelijke namen, niet als
 * toelating — zie de kop van dit bestand.
 */
const OFFERTE_CATEGORIE = '09.'

/** Het woord "offerte", of een Gilde-offertenummer zoals `OF25100038` in de bestandsnaam. */
const OFFERTE_NAAM = /offerte|\bOF\d{6,}\b/i

/**
 * Woorden die verraden dat het juist NIET onze offerte is maar de vraag erom: "Offerte
 * aanvraag.pdf", "Offerteuitvraag …", "… offerte verzoek …", "Fwd aanleveren offerte …".
 */
const GEEN_OFFERTE_NAAM = /aanvraag|uitvraag|verzoek|aanleveren/i

type DossierRij = {
  id: string
  everts_calc_project_id: string | null
  offerte_pdf_pad: string | null
  offerte_pdf_naam: string | null
}

type QuoteRij = {
  id: string
  quote_nummer: string | null
  versie: number | null
  status: string | null
  dossier_id: string | null
  project_id: string | null
}

type Bouw7Bestand = {
  id?: number
  name?: string | null
  fileName?: string | null
  extension?: string | null
  category?: { name?: string | null } | null
  fileHash?: string | null
  createdAt?: string | null
}

const bestandsnaam = (f: Bouw7Bestand): string => {
  const naam = (f.name ?? '').trim() || (f.fileName ?? '').trim() || 'Offerte'
  return /\.pdf$/i.test(naam) ? naam : `${naam}.pdf`
}

/** Een PDF waarvan de naam zegt dat het een offerte is, en niet de vraag om een offerte. */
function isOffertePdf(f: Bouw7Bestand): boolean {
  if ((f.extension ?? '').toLowerCase() !== 'pdf') return false
  const naam = `${f.name ?? ''} ${f.fileName ?? ''}`
  return OFFERTE_NAAM.test(naam) && !GEEN_OFFERTE_NAAM.test(naam)
}

/** De beste van de kandidaten: die in de offertecategorie wint, daarna de nieuwste. */
function kiesBouw7Bestand(items: Bouw7Bestand[]): Bouw7Bestand | null {
  const kandidaten = items.filter(isOffertePdf)
  if (kandidaten.length === 0) return null
  const inCategorie = (f: Bouw7Bestand) =>
    (f.category?.name ?? '').trim().startsWith(OFFERTE_CATEGORIE) ? 1 : 0
  return kandidaten.sort((a, b) =>
    inCategorie(b) - inCategorie(a) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  )[0]
}

/** De versie die je wilt zien: de nieuwste verzonden, anders de nieuwste die er is. */
function kiesQuote(quotes: QuoteRij[]): QuoteRij | null {
  if (quotes.length === 0) return null
  const oplopend = [...quotes].sort((a, b) => (a.versie ?? 1) - (b.versie ?? 1))
  const verzonden = [...oplopend].reverse().find(q => q.status === 'verzonden')
  return verzonden ?? oplopend[oplopend.length - 1]
}

/**
 * De offertebron per dossier, voor een **begrensde** lijst ids.
 *
 * Aanroepers geven een lijst die aantoonbaar klein is (de openstaande offertes van één klant:
 * hoogstens twintig op productie). Er wordt dus niet gepagineerd — geef hier geen honderden ids
 * aan mee zonder de queries op te knippen.
 */
export async function kiesOfferteBronnen(dossierIds: string[]): Promise<Map<string, OfferteBron>> {
  const uit = new Map<string, OfferteBron>()
  const ids = [...new Set(dossierIds.filter(Boolean))]
  if (ids.length === 0) return uit

  const db = createAdminClient()

  const { data: dossierData } = await db
    .from('dossiers')
    .select('id, everts_calc_project_id, offerte_pdf_pad, offerte_pdf_naam')
    .in('id', ids)
  const dossiers = (dossierData ?? []) as DossierRij[]
  if (dossiers.length === 0) return uit

  // `quotes.project_id` is text, `everts_calc_project_id` uuid — daarom als string vergelijken.
  const projectNaarDossier = new Map<string, string>()
  for (const d of dossiers) {
    if (d.everts_calc_project_id) projectNaarDossier.set(String(d.everts_calc_project_id), d.id)
  }
  const projectIds = [...projectNaarDossier.keys()]

  const QUOTE_KOLOMMEN = 'id, quote_nummer, versie, status, dossier_id, project_id'
  const [viaDossier, viaProject, snapshots] = await Promise.all([
    // Interne calculaties zijn geen klantdocument; zelfde uitsluiting als het Offerte-paneel.
    db.from('quotes').select(QUOTE_KOLOMMEN).neq('type', 'interne_calculatie').in('dossier_id', ids),
    projectIds.length > 0
      ? db.from('quotes').select(QUOTE_KOLOMMEN).neq('type', 'interne_calculatie').in('project_id', projectIds)
      : Promise.resolve({ data: [] as QuoteRij[] }),
    db.from('bouw7_snapshots').select('dossier_id, payload').eq('soort', 'project_files').in('dossier_id', ids),
  ])

  const quotesPer = new Map<string, QuoteRij[]>()
  const noteerQuote = (dossierId: string | null, q: QuoteRij) => {
    if (!dossierId) return
    const lijst = quotesPer.get(dossierId) ?? []
    // Een offerte die zowel aan het dossier als aan het calculatieproject hangt komt twee keer langs.
    if (lijst.some(x => x.id === q.id)) return
    lijst.push(q)
    quotesPer.set(dossierId, lijst)
  }
  for (const q of (viaDossier.data ?? []) as QuoteRij[]) noteerQuote(q.dossier_id, q)
  for (const q of (viaProject.data ?? []) as QuoteRij[]) {
    noteerQuote(projectNaarDossier.get(String(q.project_id ?? '')) ?? null, q)
  }

  const bouw7Per = new Map<string, Bouw7Bestand | null>()
  for (const rij of (snapshots.data ?? []) as { dossier_id: string; payload: { items?: Bouw7Bestand[] } | null }[]) {
    bouw7Per.set(rij.dossier_id, kiesBouw7Bestand(rij.payload?.items ?? []))
  }

  for (const d of dossiers) {
    const quote = kiesQuote(quotesPer.get(d.id) ?? [])
    if (quote) {
      uit.set(d.id, { soort: 'eva', quoteId: quote.id, naam: quote.quote_nummer ?? 'Offerte' })
      continue
    }
    if (d.offerte_pdf_pad) {
      uit.set(d.id, { soort: 'gekoppeld', pad: d.offerte_pdf_pad, naam: d.offerte_pdf_naam ?? 'Offerte.pdf' })
      continue
    }
    const bestand = bouw7Per.get(d.id)
    if (bestand) {
      uit.set(d.id, {
        soort: 'bouw7',
        fileHash: bestand.fileHash ?? null,
        bestandId: bestand.id ?? null,
        naam: bestandsnaam(bestand),
      })
    }
  }

  return uit
}

/** De offertebron van één dossier; `null` als er niets te openen valt. */
export async function kiesOfferteBron(dossierId: string): Promise<OfferteBron | null> {
  const bronnen = await kiesOfferteBronnen([dossierId])
  return bronnen.get(dossierId) ?? null
}
