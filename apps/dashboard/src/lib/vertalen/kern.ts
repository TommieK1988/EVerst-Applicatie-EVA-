import 'server-only'
import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@everts/database/server'
import { logFout } from '@/lib/fouten/log'
import type { Taal } from '@/i18n/talen'
import { PROMPT_VERSIE, systeemPrompt } from './prompt'

/**
 * Tijdelijk vertalen van teksten van kantoor voor EVA Mobiel.
 *
 * Elke tekst wordt één keer per taal vertaald en in `vertaal_cache` bewaard. De
 * Nederlandse tekst blijft altijd de echte; dit is alleen een leeshulp. Lukt vertalen
 * niet (geen sleutel, storing, weigering), dan komt er `null` terug en toont de app
 * gewoon het Nederlands — vertalen mag nooit iets blokkeren.
 *
 * Zie docs/plan-meertaligheid-app.md.
 */

export const MODEL = 'claude-opus-5-5'

/** Grenzen per aanroep, zodat één scherm nooit een enorme rekening of wachttijd geeft. */
export const MAX_TEKSTEN = 200
export const MAX_TEKENS_PER_TEKST = 20_000
/** Per verzoek aan Claude: zoveel teksten of tekens, wat het eerst bereikt is. */
const BUNDEL_TEKSTEN = 60
const BUNDEL_TEKENS = 24_000
/** Cache-opzoekingen per query: ruim onder de 1000-rijengrens van PostgREST. */
const OPZOEK_BLOK = 200

export function cacheSleutel(tekst: string, doeltaal: Taal): string {
  return createHash('sha256').update(`${doeltaal}\n${PROMPT_VERSIE}\n${tekst}`).digest('hex')
}

/** Heeft deze tekst iets om te vertalen? Lege tekst, alleen cijfers/tekens: nee. */
export function heeftTaal(tekst: string): boolean {
  return /\p{L}{2,}/u.test(tekst)
}

let client: Anthropic | null = null
function claude(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic()
  return client
}

/** JSON-schema voor het antwoord: precies één vertaling per invoertekst. */
const ANTWOORD_SCHEMA = {
  type: 'object',
  properties: {
    vertalingen: { type: 'array', items: { type: 'string' } },
  },
  required: ['vertalingen'],
  additionalProperties: false,
} as const

/** Eén verzoek aan Claude voor een bundel teksten. `null` als het niet lukt. */
async function vraagClaude(teksten: string[], doeltaal: Taal): Promise<string[] | null> {
  const api = claude()
  if (!api) return null

  // De SDK-versie in deze repo kent `output_config` en `fallbacks` nog niet als type; het
  // object gaat ongewijzigd mee naar de API. Via een variabele (geen letterlijke cast) zodat
  // er geen any-cast nodig is.
  const verzoek = {
    model: MODEL,
    max_tokens: 16_000,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ANTWOORD_SCHEMA },
    },
    // Bij een (onterechte) weigering het verzoek op een ander model laten afmaken.
    fallbacks: 'default',
    system: [{ type: 'text', text: systeemPrompt(doeltaal), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify({ teksten }) }],
  }

  try {
    const bericht = await api.messages.create(
      verzoek as unknown as Anthropic.MessageCreateParamsNonStreaming,
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' }, timeout: 60_000 },
    )
    if ((bericht.stop_reason as string) === 'refusal' || bericht.stop_reason === 'max_tokens') return null
    const tekst = bericht.content.find((b) => b.type === 'text')
    if (!tekst || tekst.type !== 'text') return null
    const json = JSON.parse(tekst.text) as { vertalingen?: unknown }
    const lijst = json.vertalingen
    if (!Array.isArray(lijst) || lijst.length !== teksten.length) return null
    if (!lijst.every((v) => typeof v === 'string')) return null
    return lijst as string[]
  } catch (fout) {
    await logFout({
      omgeving: 'server',
      bron: 'lib/vertalen/kern',
      melding: `Vertalen mislukt: ${(fout as Error)?.message ?? 'onbekend'}`,
      extra: { doeltaal, aantal: teksten.length },
    })
    return null
  }
}

/** Verdeel teksten in bundels die binnen de grenzen van één verzoek blijven. */
function bundels(teksten: string[]): string[][] {
  const uit: string[][] = []
  let huidig: string[] = []
  let tekens = 0
  for (const t of teksten) {
    if (huidig.length && (huidig.length >= BUNDEL_TEKSTEN || tekens + t.length > BUNDEL_TEKENS)) {
      uit.push(huidig); huidig = []; tekens = 0
    }
    huidig.push(t); tekens += t.length
  }
  if (huidig.length) uit.push(huidig)
  return uit
}

/**
 * Vertaal teksten naar `doeltaal`. Geeft per invoertekst de vertaling, of `null` als er
 * niets te vertalen viel of vertalen niet lukte (toon dan het origineel).
 */
export async function vertaal(teksten: string[], doeltaal: Taal): Promise<(string | null)[]> {
  const uit: (string | null)[] = teksten.map(() => null)
  if (doeltaal === 'nl' || teksten.length === 0) return uit

  // Uniek maken: dezelfde tekst staat vaak meerdere keren op een scherm.
  const teVertalen = new Map<string, string>() // sleutel → tekst
  const sleutelVan = teksten.map((t) => {
    const tekst = (t ?? '').slice(0, MAX_TEKENS_PER_TEKST)
    if (!tekst.trim() || !heeftTaal(tekst)) return null
    const s = cacheSleutel(tekst, doeltaal)
    teVertalen.set(s, tekst)
    return s
  })
  if (teVertalen.size === 0) return uit

  const admin = createAdminClient()
  const gevonden = new Map<string, string>()
  const sleutels = [...teVertalen.keys()]

  // 1. Uit de cache.
  try {
    for (let i = 0; i < sleutels.length; i += OPZOEK_BLOK) {
      const blok = sleutels.slice(i, i + OPZOEK_BLOK)
      const { data } = await admin.from('vertaal_cache').select('sleutel, vertaling').in('sleutel', blok)
      for (const r of data ?? []) gevonden.set(r.sleutel, r.vertaling)
    }
    if (gevonden.size > 0) {
      // Laatst-gebruikt bijwerken; niet afwachten, het opruimen is niet op de minuut.
      void admin.from('vertaal_cache')
        .update({ laatst_gebruikt_op: new Date().toISOString() })
        .in('sleutel', [...gevonden.keys()].slice(0, OPZOEK_BLOK))
        .then(() => undefined, () => undefined)
    }
  } catch {
    // Cache onbereikbaar (of tabel nog niet aangemaakt): gewoon vertalen.
  }

  // 2. Wat ontbreekt, vertalen.
  const ontbreekt = sleutels.filter((s) => !gevonden.has(s))
  if (ontbreekt.length > 0) {
    const nieuw: { sleutel: string; doeltaal: Taal; vertaling: string; model: string }[] = []
    const groepen = bundels(ontbreekt.map((s) => teVertalen.get(s)!))
    let positie = 0
    const resultaten = await Promise.all(groepen.map((g) => vraagClaude(g, doeltaal)))
    groepen.forEach((groep, gi) => {
      const res = resultaten[gi]
      groep.forEach((_, i) => {
        const sleutel = ontbreekt[positie + i]
        const vertaling = res?.[i]
        if (vertaling && vertaling.trim()) {
          gevonden.set(sleutel, vertaling)
          nieuw.push({ sleutel, doeltaal, vertaling, model: MODEL })
        }
      })
      positie += groep.length
    })
    if (nieuw.length > 0) {
      try {
        await admin.from('vertaal_cache').upsert(nieuw, { onConflict: 'sleutel', ignoreDuplicates: true })
      } catch {
        // Niet bewaard is niet erg: volgende keer opnieuw vertaald.
      }
    }
  }

  sleutelVan.forEach((s, i) => {
    if (!s) return
    const v = gevonden.get(s)
    // Een "vertaling" die gelijk is aan het origineel tonen we niet als vertaald.
    if (v && v !== teVertalen.get(s)) uit[i] = v
  })
  return uit
}

/** Eén tekst vertalen, met een tijdslimiet. Bij te traag of mislukt: `null`. */
export async function vertaalEen(tekst: string, doeltaal: Taal, maxMs = 8_000): Promise<string | null> {
  if (doeltaal === 'nl' || !tekst?.trim()) return null
  const tijdslimiet = new Promise<null>((r) => setTimeout(() => r(null), maxMs))
  const res = await Promise.race([vertaal([tekst], doeltaal).then((v) => v[0]), tijdslimiet])
  return res ?? null
}
