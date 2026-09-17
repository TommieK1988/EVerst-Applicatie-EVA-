/**
 * factuur-import/schema.ts
 *
 * Het formulier dat het model invult als het een inkoopfactuur leest, in twee
 * gedaanten: als JSON-schema voor de tool (wat het model ziet) en als
 * zod-schema (waar het antwoord doorheen moet voordat wij het geloven).
 *
 * Twee dingen die dit bestand bewust doet, net als de mailintake:
 *
 * 1. **De tool forceren.** Met `tool_choice` op deze tool komt er gegarandeerd
 *    gestructureerd JSON terug, geen tekst die we met een regex openbreken.
 *
 * 2. **Alles is een voorstel.** Het model noemt een naam, nooit een
 *    medewerker-id; het noemt een categorie, en de code controleert of die
 *    bestaat. De koppeling naar echte records gebeurt in `poort.ts`.
 */

import { z } from 'zod'
import { MATERIEEL_CATEGORIEEN } from '../types'

/** Bump bij elke inhoudelijke wijziging van prompt of schema; landt in het importlog. */
export const PROMPT_VERSIE = '2026-09-17.2'

const korteTekst = z.string().trim().min(1).max(200).nullable().catch(null)
const langeTekst = z.string().trim().min(1).max(600).nullable().catch(null)

/**
 * Waar een naam op de factuur vandaan komt. Dit onderscheid is het halve werk:
 * "afgehaald door" is de monteur die het gereedschap meenam en dus de houder,
 * "besteld door" is vaak kantoor of directie die voorraad inkoopt. Die laatste
 * mag je niet als houder invullen — zie de afspraak in de importmemo.
 */
export const NAAM_SOORTEN = ['afgehaald_door', 'besteld_door', 'referentie', 'onbekend'] as const
export type NaamSoort = typeof NAAM_SOORTEN[number]

export const regelSchema = z.object({
  omschrijving: z.string().trim().min(1).max(200),
  /** Is dit een stuk materieel dat we terugverwachten, of verbruik? */
  is_materieel: z.boolean(),
  /** Waarom wel of niet — komt letterlijk in beeld bij de gebruiker. */
  reden: korteTekst,
  categorie: z.enum(MATERIEEL_CATEGORIEEN).nullable().catch(null),
  merk: korteTekst,
  type: korteTekst,
  serienummer: korteTekst,
  aantal: z.number().int().min(1).max(200).catch(1),
  /** Prijs per stuk ná korting, exclusief btw. */
  stukprijs: z.number().min(0).max(1_000_000).nullable().catch(null),
  artikelcode: korteTekst,
  /**
   * Als de regel een set is: wat er blijkens de factuurtekst in zit. Leeg laten
   * als de factuur het niet zegt — de inhoud van een set raden levert spookaccu's.
   */
  set_inhoud: langeTekst,
  opmerking: langeTekst,
})
export type Regel = z.infer<typeof regelSchema>

export const factuurSchema = z.object({
  leverancier: korteTekst,
  factuurnummer: korteTekst,
  /** ISO-datum van de factuur zelf. */
  factuurdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  /** ISO-datum waarop het spul is geleverd of afgehaald; vaak de bondatum. */
  leverdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  bonnummer: korteTekst,
  /** Op wiens naam de factuur staat (werkmaatschappij). */
  administratie: korteTekst,
  /** De naam die op de factuur staat, precies zoals hij er staat. */
  naam_op_factuur: korteTekst,
  naam_soort: z.enum(NAAM_SOORTEN).catch('onbekend'),
  regels: z.array(regelSchema).max(100),
})
export type FactuurExtractie = z.infer<typeof factuurSchema>

/* ── Hetzelfde, als tool-schema ──────────────────────────────────────────── */

export const LEVER_FACTUUR_TOOL = {
  name: 'lever_factuurregels',
  description:
    'Lever de gelezen factuur. Roep deze functie precies één keer aan. ' +
    'Neem élke artikelregel van de factuur op, óók de regels die geen materieel zijn — ' +
    'die zet je op is_materieel=false met een reden. Een regel weglaten is erger dan ' +
    'hem afgevinkt aanbieden: wat je weglaat ziet de gebruiker nooit. ' +
    'Laat velden leeg (null) die niet met redelijke zekerheid op de factuur staan; ' +
    'gokken is schadelijker dan leeglaten.',
  input_schema: {
    type: 'object' as const,
    properties: {
      leverancier: { type: 'string', description: 'Naam van de leverancier die de factuur stuurde.' },
      factuurnummer: { type: 'string', description: 'Het factuurnummer zoals de leverancier het schrijft.' },
      factuurdatum: { type: 'string', description: 'Datum van de factuur, als JJJJ-MM-DD.' },
      leverdatum: {
        type: 'string',
        description:
          'Datum waarop het geleverd of afgehaald is, als JJJJ-MM-DD. Staat vaak bij de bon ' +
          '("DATUM 20-02-2026") of bij het levernummer. Dit is de aankoopdatum die we willen, ' +
          'niet de factuurdatum.',
      },
      bonnummer: { type: 'string', description: 'Bon- of leverbonnummer, als de factuur dat noemt.' },
      administratie: {
        type: 'string',
        description: 'Op wiens naam de factuur staat, bijvoorbeeld de werkmaatschappij in de adressering.',
      },
      naam_op_factuur: {
        type: 'string',
        description:
          'De persoonsnaam die op de factuur staat, precies zoals er staat ("CHRIS", "Ap van der Pluijm"). ' +
          'Niet vertalen of aanvullen.',
      },
      naam_soort: {
        type: 'string',
        enum: [...NAAM_SOORTEN],
        description:
          'In welke hoedanigheid die naam er staat. afgehaald_door = deze persoon heeft het opgehaald ' +
          'of het is expliciet zijn gereedschap ("UW ORDER GEREEDSCHAP DANNY"). besteld_door = deze ' +
          'persoon heeft de bestelling geplaatst, wat vaak kantoor of inkoop is. referentie = een naam ' +
          'in een referentieveld ("UW REF.: JOHN") zonder dat duidelijk is wat zijn rol is. ' +
          'onbekend = er staat geen naam.',
      },
      regels: {
        type: 'array',
        maxItems: 100,
        description: 'Elke artikelregel van de factuur, in de volgorde waarin ze op de factuur staan.',
        items: {
          type: 'object',
          properties: {
            omschrijving: {
              type: 'string',
              description:
                'Korte, leesbare naam van het artikel in het Nederlands, zoals een collega het zou ' +
                'noemen: "Accu Schroef-/Boormachine", "Accupack 18V 5,0 Ah", "Acculader". Niet de ' +
                'schreeuwlelijke factuurtekst overnemen.',
            },
            is_materieel: {
              type: 'boolean',
              description:
                'true als dit gereedschap of materieel is dat we terugverwachten en willen kunnen ' +
                'terugvinden. false bij verbruik en slijtdelen.',
            },
            reden: {
              type: 'string',
              description:
                'Eén korte zin waarom je is_materieel zo hebt gezet. Bij false is dit wat de ' +
                'gebruiker leest om te beoordelen of je gelijk hebt, dus wees concreet: ' +
                '"schuurpapier, verbruik" is bruikbaar, "geen materieel" niet.',
            },
            categorie: {
              type: 'string',
              enum: [...MATERIEEL_CATEGORIEEN],
              description:
                'gereedschap = handzaam (accu)gereedschap, accupacks, laders. machine = zwaarder ' +
                'stationair gereedschap zoals afkort-, tafel- en tegelzagen. ladder = ladders, ' +
                'trappen en opstapjes. pbm = persoonlijke beschermingsmiddelen. Laat leeg bij twijfel.',
            },
            merk: { type: 'string', description: 'Merk, bijvoorbeeld Makita, Flex, Festool, Altrex.' },
            type: { type: 'string', description: 'Typeaanduiding van de fabrikant, bijvoorbeeld DLS600Z.' },
            serienummer: {
              type: 'string',
              description:
                'Serienummer, als het er staat. Op deze facturen staat dat vaak op een losse regel ' +
                'direct ónder het artikel. Let op: een artikelcode van de leverancier is géén ' +
                'serienummer — die hoort in artikelcode.',
            },
            aantal: { type: 'integer', description: 'Aantal stuks op deze regel. Standaard 1.' },
            stukprijs: {
              type: 'number',
              description:
                'Prijs per stuk in euro, exclusief btw en ná aftrek van de korting. Staat er een ' +
                'regeltotaal en een aantal, deel dan.',
            },
            artikelcode: { type: 'string', description: 'Artikelnummer van de leverancier.' },
            set_inhoud: {
              type: 'string',
              description:
                'Alleen invullen als de factuurtekst zélf zegt wat er in de set zit ' +
                '("POWERSET + SNELLADER 2X ACCU 5AHP"). Zegt de factuur alleen "SET" zonder inhoud, ' +
                'laat dit dan leeg en zet het in opmerking. Nooit de inhoud van een set invullen ' +
                'op basis van wat je van het product weet: dat levert accu\'s in het register die ' +
                'niemand ooit in handen heeft gehad.',
            },
            opmerking: {
              type: 'string',
              description:
                'Wat een collega later moet weten en niet in de andere velden past: "zonder accu\'s ' +
                'en lader", "losse body in doos", "SET-uitvoering, inhoud niet op de factuur".',
            },
          },
          required: ['omschrijving', 'is_materieel', 'aantal'],
        },
      },
    },
    required: ['regels'],
  },
}

export function veiligParse(ruw: unknown): { ok: true; data: FactuurExtractie } | { ok: false; fout: string } {
  const res = factuurSchema.safeParse(ruw)
  if (res.success) return { ok: true, data: res.data }
  const eerste = res.error.issues[0]
  return {
    ok: false,
    fout: `Onbruikbaar antwoord van het model: ${eerste?.path.join('.') || '?'} — ${eerste?.message ?? 'onbekend'}`,
  }
}
