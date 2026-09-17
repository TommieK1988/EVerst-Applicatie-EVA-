/**
 * factuur-import/extractie.ts
 *
 * De AI-stap: één factuur-PDF erin, een ingevuld factuurformulier eruit.
 *
 * Gooit niet. Een fout komt terug in het resultaat, zodat het scherm "lezen
 * mislukt, probeer opnieuw" kan tonen in plaats van een 500.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

import { SYSTEM_PROMPT } from './prompt'
import { LEVER_FACTUUR_TOOL, PROMPT_VERSIE, veiligParse, type FactuurExtractie } from './schema'

/**
 * Eén plek voor de modelkeuze. Opus 5 omdat het lastige hier niet het overtikken
 * van bedragen is, maar het oordeel "is dit gereedschap of verbruik" — en dat
 * oordeel verkeerd krijgen kost meer dan de tokens.
 */
export const MODEL = 'claude-opus-5'

/** Prijs per miljoen tokens, voor de kostenteller. Bijwerken als het model wisselt. */
const PRIJS_INVOER_PER_MTOK = 5.0
const PRIJS_UITVOER_PER_MTOK = 25.0

/** Boven deze grens gaat de PDF niet naar het model; dat is geen factuur meer. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024

export interface ExtractieResultaat {
  ok: boolean
  data: FactuurExtractie | null
  fout: string | null
  model: string
  promptVersie: string
  invoerTokens: number
  uitvoerTokens: number
  kostenCent: number
}

/**
 * Het stukje van het SDK-antwoord dat wij gebruiken.
 *
 * De SDK in dit project (0.32.1) kent `document`-blokken en `output_config` nog
 * niet in zijn typen, dus de aanroep moet langs de compiler heen. Dat doen we
 * met een expliciet getypeerde functiehandle in plaats van een kale `any`-cast:
 * zo staat hier zwart-op-wit welke velden we van het antwoord verwachten, en
 * breekt dit bestand zichtbaar zodra die vorm verandert.
 */
interface AnthropicAntwoord {
  content?: { type: string; name?: string; text?: string; input?: unknown }[]
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
}
type MaakBericht = (params: Record<string, unknown>) => Promise<AnthropicAntwoord>

export async function leesFactuur(pdf: Buffer, bestandsnaam: string): Promise<ExtractieResultaat> {
  const leeg: ExtractieResultaat = {
    ok: false, data: null, fout: null, model: MODEL, promptVersie: PROMPT_VERSIE,
    invoerTokens: 0, uitvoerTokens: 0, kostenCent: 0,
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ...leeg, fout: 'ANTHROPIC_API_KEY ontbreekt.' }
  if (pdf.length > MAX_PDF_BYTES) return { ...leeg, fout: 'De PDF is groter dan 10 MB.' }

  const inhoud = [
    {
      type: 'text',
      text:
        `Hieronder staat één inkoopfactuur (bestandsnaam: ${bestandsnaam}). ` +
        `Lees hem en lever het resultaat via de tool.`,
    },
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
    },
  ]

  // De SDK doet zijn eigen fetch, dus fetchMetDeadline grijpt hier niet: zet de
  // grenzen expliciet op de client, anders kan dit verzoek blijven hangen.
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })
  // `.bind` is geen franje: de methode losmaken van `client.messages` verliest
  // zijn `this` en de SDK klapt dan op een interne `_client`.
  const maakBericht = client.messages.create.bind(client.messages) as unknown as MaakBericht

  try {
    const bericht = await maakBericht({
      model: MODEL,
      max_tokens: 8000,
      // Een factuur met twintig regels is bounded invulwerk; het schema doet het
      // zware werk. Volledige diepgang levert hier weinig op en kost per factuur geld.
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [LEVER_FACTUUR_TOOL],
      tool_choice: { type: 'tool', name: LEVER_FACTUUR_TOOL.name },
      messages: [{ role: 'user', content: inhoud }],
    })

    const invoer = (bericht.usage?.input_tokens ?? 0) + (bericht.usage?.cache_read_input_tokens ?? 0)
    const uitvoer = bericht.usage?.output_tokens ?? 0
    const kostenCent = Math.ceil(
      ((invoer / 1_000_000) * PRIJS_INVOER_PER_MTOK + (uitvoer / 1_000_000) * PRIJS_UITVOER_PER_MTOK) * 100,
    )
    const meting = { invoerTokens: invoer, uitvoerTokens: uitvoer, kostenCent }

    const blok = (bericht.content ?? []).find((b) => b.type === 'tool_use' && b.name === LEVER_FACTUUR_TOOL.name)
    if (!blok) return { ...leeg, ...meting, fout: 'Het model leverde geen ingevuld formulier.' }

    const geparsed = veiligParse(blok.input)
    if (!geparsed.ok) return { ...leeg, ...meting, fout: geparsed.fout }

    return { ...leeg, ...meting, ok: true, data: geparsed.data }
  } catch (e) {
    return { ...leeg, fout: e instanceof Error ? e.message : String(e) }
  }
}
