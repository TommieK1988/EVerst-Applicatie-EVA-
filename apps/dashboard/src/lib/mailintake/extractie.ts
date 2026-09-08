/**
 * mailintake/extractie.ts
 *
 * De AI-stap: mail plus bijlagen erin, een ingevuld intakeformulier eruit.
 *
 * Twee dingen die dit bestand bewust doet:
 *
 * 1. **Forceren van de tool.** Met `tool_choice` op de schemadrager levert het
 *    model gegarandeerd gestructureerd JSON. Dat is beter dan een tekstantwoord
 *    dat we met een regex openbreken (zoals de CAO-extractie doet) — daar kost
 *    één afwijkend antwoord je de hele verwerking.
 *
 * 2. **Een tweede, deterministische poort.** Alles wat terugkomt is een voorstel.
 *    Categorie en werkmaatschappij moeten in een witte lijst voorkomen, het adres
 *    moet door PDOK worden bevestigd, datums en bedragen moeten binnen bereik
 *    liggen. Wat die poort niet haalt, wordt leeggemaakt — niet overgenomen.
 *
 * De SDK in dit project is 0.32.1 en kent `document`-blokken nog niet in zijn
 * typen; vandaar dezelfde `as any`-cast als in instellingen/cao/actions.ts.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

import { zoekAdres, eersteHuisnummer } from '@/lib/adres/pdok'

import { LEVER_EXTRACTIE_TOOL, PROMPT_VERSIE, veiligParse, type Extractie } from './schema'
import { SYSTEM_PROMPT, bouwTekstBlok, type PromptContext } from './prompt'
import { VELD_BETROUWBAAR } from './types'

/**
 * Eén plek voor de modelkeuze. Opus 5 omdat de lastige stap hier niet het
 * overtikken van velden is maar het oordeel "is dit werk of ruis" — en een
 * verkeerd oordeel daar is duurder dan de tokens.
 */
export const MODEL = 'claude-opus-5'

/** Prijs per miljoen tokens, voor de kostenteller. Bijwerken als het model wisselt. */
const PRIJS_INVOER_PER_MTOK = 5.0
const PRIJS_UITVOER_PER_MTOK = 25.0

/** Bijlagen boven deze grenzen gaan niet naar het model; een mens leest ze beter. */
const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_DOCUMENTEN = 5
const MAX_AFBEELDINGEN = 3

const PDF_TYPES = new Set(['application/pdf'])
const AFBEELDING_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'])

export interface BijlageVoorAI {
  bestandsnaam: string
  contentType: string | null
  bytes: Buffer
}

export interface ExtractieResultaat {
  ok: boolean
  data: Extractie | null
  fout: string | null
  model: string
  promptVersie: string
  invoerTokens: number
  uitvoerTokens: number
  kostenCent: number
  /** Bestandsnamen die wél zijn meegestuurd. */
  gelezenBijlagen: string[]
  /** Bestandsnamen die zijn overgeslagen, met reden. */
  overgeslagenBijlagen: { naam: string; reden: string }[]
  ruweUitvoer: string | null
}

/** Sorteer bijlagen zodat een opdrachtbon vóór een bestek van 80 pagina's komt. */
function bijlageGewicht(naam: string): number {
  const n = naam.toLowerCase()
  if (/(bon|opdracht|order|werkbon|melding)/.test(n)) return 0
  if (/(offerte|aanvraag)/.test(n)) return 1
  if (/(bestek|tekening|plattegrond)/.test(n)) return 3
  return 2
}

/**
 * Voert de extractie uit. Gooit niet: een fout komt terug in het resultaat, zodat
 * de aanroeper het bericht netjes op 'mislukt' kan zetten in plaats van de hele
 * cron-run te laten klappen.
 */
export async function extraheer(
  ctx: PromptContext,
  bijlagen: BijlageVoorAI[],
): Promise<ExtractieResultaat> {
  const leeg: ExtractieResultaat = {
    ok: false, data: null, fout: null, model: MODEL, promptVersie: PROMPT_VERSIE,
    invoerTokens: 0, uitvoerTokens: 0, kostenCent: 0,
    gelezenBijlagen: [], overgeslagenBijlagen: [], ruweUitvoer: null,
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ...leeg, fout: 'ANTHROPIC_API_KEY ontbreekt.' }

  // ── Bijlagen selecteren ────────────────────────────────────────────────────
  const overgeslagen: { naam: string; reden: string }[] = []
  const gelezen: string[] = []
  const inhoud: unknown[] = []

  const gesorteerd = [...bijlagen].sort((a, b) => bijlageGewicht(a.bestandsnaam) - bijlageGewicht(b.bestandsnaam))
  let pdfs = 0
  let plaatjes = 0

  for (const b of gesorteerd) {
    const type = (b.contentType ?? '').toLowerCase().split(';')[0].trim()
    if (PDF_TYPES.has(type)) {
      if (b.bytes.length > MAX_PDF_BYTES) {
        overgeslagen.push({ naam: b.bestandsnaam, reden: 'PDF groter dan 10 MB' })
        continue
      }
      if (pdfs >= MAX_DOCUMENTEN) {
        overgeslagen.push({ naam: b.bestandsnaam, reden: 'meer dan 5 documenten' })
        continue
      }
      inhoud.push({ type: 'text', text: `<bijlage naam="${b.bestandsnaam}" grootte="${Math.round(b.bytes.length / 1024)} kB">` })
      inhoud.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: b.bytes.toString('base64') },
      })
      inhoud.push({ type: 'text', text: '</bijlage>' })
      gelezen.push(b.bestandsnaam)
      pdfs++
    } else if (AFBEELDING_TYPES.has(type)) {
      if (plaatjes >= MAX_AFBEELDINGEN) {
        overgeslagen.push({ naam: b.bestandsnaam, reden: 'meer dan 3 afbeeldingen' })
        continue
      }
      if (b.bytes.length > 5 * 1024 * 1024) {
        overgeslagen.push({ naam: b.bestandsnaam, reden: 'afbeelding groter dan 5 MB' })
        continue
      }
      inhoud.push({ type: 'text', text: `<bijlage naam="${b.bestandsnaam}" soort="foto">` })
      inhoud.push({
        type: 'image',
        source: { type: 'base64', media_type: type === 'image/jpg' ? 'image/jpeg' : type, data: b.bytes.toString('base64') },
      })
      inhoud.push({ type: 'text', text: '</bijlage>' })
      gelezen.push(b.bestandsnaam)
      plaatjes++
    } else {
      // Word, Excel, dwg, zip: die kunnen we niet als document meesturen. Ze zijn
      // wél gearchiveerd, en de bestandsnaam staat in de metadata.
      overgeslagen.push({ naam: b.bestandsnaam, reden: `bestandstype ${type || 'onbekend'} kan niet gelezen worden` })
    }
  }

  inhoud.unshift({ type: 'text', text: bouwTekstBlok(ctx) })
  if (overgeslagen.length) {
    inhoud.push({
      type: 'text',
      text:
        `<niet_gelezen>\nDeze bijlagen konden niet worden meegestuurd: ` +
        overgeslagen.map(o => `${o.naam} (${o.reden})`).join('; ') +
        `\nHoud er rekening mee dat daar informatie in kan staan die je niet ziet.\n</niet_gelezen>`,
    })
  }

  // ── Aanroep ────────────────────────────────────────────────────────────────
  // De SDK doet zijn eigen fetch, dus fetchMetDeadline grijpt hier niet: zet de
  // grenzen daarom expliciet op de client. Zonder dat is dit precies de aanroep
  // die een cron in zijn functiebudget laat lopen.
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bericht = await (client.messages.create as any)({
      model: MODEL,
      max_tokens: 2000,
      // Bounded invulwerk; het schema doet het zware werk. Volledige diepgang
      // levert hier weinig op en kost per mail geld.
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [LEVER_EXTRACTIE_TOOL],
      tool_choice: { type: 'tool', name: LEVER_EXTRACTIE_TOOL.name },
      messages: [{ role: 'user', content: inhoud }],
    })

    const invoer = (bericht.usage?.input_tokens ?? 0) + (bericht.usage?.cache_read_input_tokens ?? 0)
    const uitvoer = bericht.usage?.output_tokens ?? 0
    const kostenCent = Math.ceil(
      ((invoer / 1_000_000) * PRIJS_INVOER_PER_MTOK + (uitvoer / 1_000_000) * PRIJS_UITVOER_PER_MTOK) * 100,
    )

    const blok = (bericht.content ?? []).find((b: any) => b.type === 'tool_use' && b.name === LEVER_EXTRACTIE_TOOL.name)
    if (!blok) {
      const tekst = (bericht.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
      return {
        ...leeg,
        fout: 'Het model leverde geen ingevuld formulier.',
        invoerTokens: invoer, uitvoerTokens: uitvoer, kostenCent,
        gelezenBijlagen: gelezen, overgeslagenBijlagen: overgeslagen,
        ruweUitvoer: tekst.slice(0, 20_000) || null,
      }
    }

    const geparsed = veiligParse(blok.input)
    const ruw = JSON.stringify(blok.input).slice(0, 20_000)
    if (!geparsed.ok) {
      return {
        ...leeg, fout: geparsed.fout,
        invoerTokens: invoer, uitvoerTokens: uitvoer, kostenCent,
        gelezenBijlagen: gelezen, overgeslagenBijlagen: overgeslagen, ruweUitvoer: ruw,
      }
    }

    return {
      ok: true, data: geparsed.data, fout: null, model: MODEL, promptVersie: PROMPT_VERSIE,
      invoerTokens: invoer, uitvoerTokens: uitvoer, kostenCent,
      gelezenBijlagen: gelezen, overgeslagenBijlagen: overgeslagen, ruweUitvoer: ruw,
    }
  } catch (e) {
    return { ...leeg, fout: e instanceof Error ? e.message : String(e), overgeslagenBijlagen: overgeslagen }
  }
}

// ─── De deterministische poort ────────────────────────────────────────────────

export interface WitteLijsten {
  categorieen: { id: number; naam: string }[]
  werkmaatschappijen: { id: string; naam: string }[]
}

export interface GekeurdeVelden {
  omschrijving: string | null
  klantNaam: string | null
  contactpersoonNaam: string | null
  contactpersoonEmail: string | null
  contactpersoonTelefoon: string | null
  werkadresStraat: string | null
  werkadresHuisnummer: string | null
  werkadresPostcode: string | null
  werkadresStad: string | null
  adresBevestigd: boolean
  referentie: string | null
  onzeReferentie: string | null
  vveCode: string | null
  bouw7CategorieId: number | null
  categorieNaam: string | null
  werkmaatschappijId: string | null
  aanvraagdatum: string | null
  deadline: string | null
  bedragExclBtw: number | null
  spoed: boolean
  opmerkingen: string | null
  meerdereWerkadressen: boolean
  /** Gekalibreerd vertrouwen per veld, na de controles hieronder. */
  vertrouwen: Record<string, number>
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

function geldigeDatum(waarde: string | null): string | null {
  if (!waarde || !ISO_DATUM.test(waarde)) return null
  const d = new Date(waarde + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  const nu = Date.now()
  const ondergrens = nu - 365 * 24 * 3600 * 1000
  const bovengrens = nu + 3 * 365 * 24 * 3600 * 1000
  return d.getTime() >= ondergrens && d.getTime() <= bovengrens ? waarde : null
}

function normaliseerPostcode(pc: string | null): string | null {
  const m = (pc ?? '').replace(/\s+/g, '').toUpperCase().match(/^(\d{4})([A-Z]{2})$/)
  return m ? `${m[1]} ${m[2]}` : null
}

/** true als de waarde letterlijk in de brontekst voorkomt. */
function komtLetterlijkVoor(waarde: string | null, bron: string): boolean {
  const v = (waarde ?? '').trim().toLowerCase()
  return v.length >= 3 && bron.toLowerCase().includes(v)
}

/**
 * Keurt de modeluitvoer en kalibreert het vertrouwen.
 *
 * Het model geeft zelf een inschatting per veld, maar dat is een zelfrapportage.
 * Hier wordt die gecorrigeerd met wat we kunnen controleren: een adres dat PDOK
 * bevestigt is zeker, een waarde die nergens letterlijk in de bron staat is dat
 * juist niet.
 */
export async function keurEnKalibreer(
  data: Extractie,
  lijsten: WitteLijsten,
  brontekst: string,
  standaardWerkmaatschappijId: string | null,
): Promise<GekeurdeVelden> {
  const v: Record<string, number> = {}
  const modelScore = (veld: string): number => {
    const n = data.vertrouwen?.[veld]
    return typeof n === 'number' && n >= 0 && n <= 1 ? n : 0.5
  }
  const zet = (veld: string, waarde: unknown, score: number) => {
    v[veld] = waarde == null || waarde === '' ? 0 : Math.round(Math.min(1, Math.max(0, score)) * 100) / 100
  }

  // ── Adres: PDOK is de scheidsrechter ──────────────────────────────────────
  let straat = data.werkadres_straat
  // Bewust const: het huisnummer uit de mail houden we altijd aan. PDOK levert het
  // basisnummer, terwijl de mail vaak de toevoeging heeft ("12 A", "12-16").
  const huisnummer = data.werkadres_huisnummer
  let postcode = normaliseerPostcode(data.werkadres_postcode)
  let stad = data.werkadres_stad
  let adresBevestigd = false

  if ((postcode && huisnummer) || (straat && huisnummer && stad)) {
    try {
      const treffers = await zoekAdres({
        postcode: postcode ?? undefined,
        huisnummer: huisnummer ?? undefined,
        straat: straat ?? undefined,
        stad: stad ?? undefined,
        rows: 1,
      })
      const t = treffers[0]
      if (t) {
        // Het huisnummer uit de mail winnen we niet weg: PDOK levert het
        // basisnummer, de mail heeft soms een toevoeging ("12 A", "12-16").
        const zelfdeNummer = eersteHuisnummer(t.huisnummer) === eersteHuisnummer(huisnummer ?? '')
        if (zelfdeNummer) {
          straat = t.straat || straat
          postcode = t.postcode || postcode
          stad = t.stad || stad
          adresBevestigd = true
        }
      }
    } catch {
      // PDOK onbereikbaar: dan is het adres niet bevestigd en gaat het bericht
      // sowieso naar een mens. Geen reden om de hele extractie te laten falen.
    }
  }

  const adresScore = adresBevestigd ? 1 : Math.min(modelScore('werkadres_straat'), 0.6)
  zet('werkadres_straat', straat, adresScore)
  zet('werkadres_huisnummer', huisnummer, adresScore)
  zet('werkadres_postcode', postcode, adresScore)
  zet('werkadres_stad', stad, adresScore)

  // ── Categorie: alleen uit de witte lijst ──────────────────────────────────
  const catNaam = (data.categorie_voorstel ?? '').trim().toLowerCase()
  const cat = lijsten.categorieen.find(c => c.naam.toLowerCase() === catNaam)
    ?? lijsten.categorieen.find(c => catNaam.length >= 4 && c.naam.toLowerCase().includes(catNaam))
  zet('categorie_voorstel', cat?.naam ?? null, cat ? 1 : 0)

  // ── Werkmaatschappij: witte lijst, anders de standaard van de postbus ─────
  const wmNaam = (data.werkmaatschappij_voorstel ?? '').trim().toLowerCase()
  const wm = wmNaam ? lijsten.werkmaatschappijen.find(w => w.naam.toLowerCase() === wmNaam) : undefined
  const werkmaatschappijId = wm?.id ?? standaardWerkmaatschappijId
  zet('werkmaatschappij_voorstel', werkmaatschappijId, wm ? 1 : werkmaatschappijId ? 0.7 : 0)

  // ── Tekstvelden: staat het er letterlijk? ─────────────────────────────────
  for (const veld of ['omschrijving', 'klant_naam', 'contactpersoon_naam', 'contactpersoon_email', 'referentie', 'onze_offerte_referentie', 'vve_code'] as const) {
    const waarde = data[veld] as string | null
    const basis = modelScore(veld)
    const score = komtLetterlijkVoor(waarde, brontekst) ? Math.max(basis, 0.85) : Math.min(basis, 0.5)
    zet(veld, waarde, score)
  }

  const aanvraagdatum = geldigeDatum(data.aanvraagdatum)
  const deadline = geldigeDatum(data.deadline)
  zet('aanvraagdatum', aanvraagdatum, aanvraagdatum ? modelScore('aanvraagdatum') : 0)
  zet('deadline', deadline, deadline ? modelScore('deadline') : 0)

  const bedrag = data.bedrag_excl_btw != null && data.bedrag_excl_btw >= 0 && data.bedrag_excl_btw < 10_000_000
    ? data.bedrag_excl_btw
    : null
  zet('bedrag_excl_btw', bedrag, bedrag != null ? modelScore('bedrag_excl_btw') : 0)

  const email = (data.contactpersoon_email ?? '').trim().toLowerCase()
  const emailGeldig = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  return {
    omschrijving: data.omschrijving,
    klantNaam: data.klant_naam,
    contactpersoonNaam: data.contactpersoon_naam,
    contactpersoonEmail: emailGeldig ? email : null,
    contactpersoonTelefoon: data.contactpersoon_telefoon,
    werkadresStraat: straat,
    werkadresHuisnummer: huisnummer,
    werkadresPostcode: postcode,
    werkadresStad: stad,
    adresBevestigd,
    referentie: data.referentie,
    onzeReferentie: data.onze_offerte_referentie,
    vveCode: data.vve_code,
    bouw7CategorieId: cat?.id ?? null,
    categorieNaam: cat?.naam ?? null,
    werkmaatschappijId,
    aanvraagdatum,
    deadline,
    bedragExclBtw: bedrag,
    spoed: Boolean(data.spoed),
    opmerkingen: data.opmerkingen,
    meerdereWerkadressen: Boolean(data.meerdere_werkadressen),
    vertrouwen: v,
  }
}

/** Gemiddeld vertrouwen over de velden die ertoe doen voor automatisch aanmaken. */
export function kernVertrouwen(v: Record<string, number>): number {
  const kern = ['omschrijving', 'werkadres_straat', 'categorie_voorstel']
  const scores = kern.map(k => v[k] ?? 0)
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
}

export function isBetrouwbaar(v: Record<string, number>, veld: string): boolean {
  return (v[veld] ?? 0) >= VELD_BETROUWBAAR
}
