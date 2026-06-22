import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@everts/database/server'
import {
  searchAllEntities,
  getMedewerkerProfiel,
  getDossiersVoorRelatie,
  getRelatieFinancien,
} from '@/lib/search/global'
import { getDossierById } from '@/lib/dossiers/actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-sonnet-4-6'
const MAX_ROUNDS = 6

const SYSTEM_PROMPT = `Je bent EVA, de interne assistent van onderhouds- en renovatiebedrijf Everts.
Je beantwoordt vragen UITSLUITEND op basis van de gegevens die je via de tools uit het EVA-platform ophaalt.

Harde regels:
- Gebruik NOOIT kennis van buiten EVA. Zoek niet op internet. Verzin geen namen, bedragen of statussen.
- Begin bij een vraag over een persoon of organisatie altijd met de tool "zoek" om de naam te koppelen aan een id en type.
- Als de gebruiker enkel een naam typt (geen echte vraag), geef dan een korte samenvatting van DIE entiteit zelf — niet een lijst van alle dossiers waar die persoon bij betrokken is, tenzij daar expliciet om gevraagd wordt.
- Vind je niets, zeg dat dan eerlijk ("Niets gevonden in EVA over ..."). Niet gokken.
- Bedragen in euro's, Nederlandse notatie (bv. € 12.500). Noem bij financiële antwoorden de relevante dossiernummers.
- Bij "hoeveel staat open bij <opdrachtgever>": gebruik "relatie_financien". Toon het openstaande werk uit EVA en vermeld expliciet dat openstaande facturen/debiteuren (Bouw7/Exact) nog niet aan EVA gekoppeld zijn.
- Antwoord in het Nederlands, bondig en zakelijk. Gebruik markdown (vetgedrukt, lijstjes) waar dat helpt.`

const TOOLS = [
  {
    name: 'zoek',
    description:
      'Doorzoek alle EVA-data (relaties, medewerkers, dossiers, contactpersonen, particulieren) op een vrije term. Gebruik dit eerst om een naam te koppelen aan een id en type.',
    input_schema: {
      type: 'object',
      properties: { term: { type: 'string', description: 'Zoekterm, bv. een naam of dossiertitel.' } },
      required: ['term'],
    },
  },
  {
    name: 'relatie_financien',
    description:
      'Geef het openstaande werk (opdrachten die financieel nog niet afgesloten zijn) voor een relatie/opdrachtgever. Bevat ook een notitie over facturen uit Bouw7/Exact.',
    input_schema: {
      type: 'object',
      properties: { relatie_id: { type: 'string' } },
      required: ['relatie_id'],
    },
  },
  {
    name: 'dossiers_van_relatie',
    description: 'Lijst van dossiers van een relatie/opdrachtgever, optioneel gefilterd op hoofdstatus (aanvraag, offerte, opdracht).',
    input_schema: {
      type: 'object',
      properties: {
        relatie_id: { type: 'string' },
        hoofdstatus: { type: 'string', enum: ['aanvraag', 'offerte', 'opdracht'] },
      },
      required: ['relatie_id'],
    },
  },
  {
    name: 'medewerker_profiel',
    description: 'Profielgegevens van één medewerker (functie, afdeling, contact, in dienst, tarieven).',
    input_schema: {
      type: 'object',
      properties: { medewerker_id: { type: 'string' } },
      required: ['medewerker_id'],
    },
  },
  {
    name: 'dossier_details',
    description: 'Volledige gegevens van één dossier (status, bedragen, rollen, klant).',
    input_schema: {
      type: 'object',
      properties: { dossier_id: { type: 'string' } },
      required: ['dossier_id'],
    },
  },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTool(name: string, input: any): Promise<unknown> {
  switch (name) {
    case 'zoek':
      return searchAllEntities(String(input?.term ?? ''))
    case 'relatie_financien':
      return getRelatieFinancien(String(input?.relatie_id))
    case 'dossiers_van_relatie':
      return getDossiersVoorRelatie(String(input?.relatie_id), {
        hoofdstatus: input?.hoofdstatus,
      })
    case 'medewerker_profiel':
      return getMedewerkerProfiel(String(input?.medewerker_id))
    case 'dossier_details': {
      const res = await getDossierById(String(input?.dossier_id))
      return res.ok ? res.data : { error: res.error }
    }
    default:
      return { error: `Onbekende tool: ${name}` }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY niet ingesteld' }, { status: 503 })
  }

  let vraag = ''
  try {
    const body = await request.json()
    vraag = String(body?.vraag ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag' }, { status: 400 })
  }
  if (!vraag) return NextResponse.json({ error: 'Geen vraag meegegeven' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: 'user', content: vraag }]

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await (client.messages.create as any)({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      })

      if (response.stop_reason !== 'tool_use') {
        const answer = (response.content ?? [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n')
          .trim()
        return NextResponse.json({ answer: answer || 'Ik kon hier geen antwoord op formuleren.' })
      }

      // Voer alle gevraagde tools uit en stuur de resultaten terug.
      messages.push({ role: 'assistant', content: response.content })

      const toolUses = (response.content ?? []).filter((b: any) => b.type === 'tool_use')
      const toolResults = await Promise.all(
        toolUses.map(async (tu: any) => {
          let result: unknown
          try {
            result = await runTool(tu.name, tu.input)
          } catch (err) {
            result = { error: String(err) }
          }
          return {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result ?? null),
          }
        }),
      )
      messages.push({ role: 'user', content: toolResults })
    }

    return NextResponse.json({
      answer: 'Het lukte niet om de vraag binnen de beschikbare stappen te beantwoorden. Probeer hem iets specifieker te stellen.',
    })
  } catch (err) {
    console.error('EVA-vraag fout:', err)
    return NextResponse.json({ error: 'Er ging iets mis bij het beantwoorden van de vraag.' }, { status: 500 })
  }
}
