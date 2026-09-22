/**
 * mailintake/ai-storing.ts
 *
 * Ligt de AI eruit, of is er iets mis met dít bericht?
 *
 * WAAROM HET VERSCHIL UITMAAKT
 * Toen het Anthropic-tegoed op was, behandelde EVA dat als een fout in één mail.
 * Elke mail verbruikte drie pogingen, belandde daarna op "Te behandelen" met de
 * tekst `400 {"type":"error",...,"Your credit balance is too low..."}` erbij, en de
 * behandelaar zag een stapel post die hij zelf moest doen. Terwijl er één ding aan
 * de hand was, en niemand dat ergens kon zien.
 *
 * Een storing is iets anders dan een mislukking:
 *
 * * **Storing** -- het ligt niet aan de mail. Pogingen niet opsouperen, de rest van
 *   de batch niet proberen (dat lukt toch niet en kost alleen geld), en het één keer
 *   melden in gewone taal.
 * * **Mislukking** -- deze mail is te groot, te raar of onleesbaar. Dan is de
 *   bestaande weg goed: drie pogingen en daarna voorleggen aan een mens.
 *
 * Bewust op de tekst van de fout en niet op een foutklasse: de SDK gooit voor al
 * deze gevallen `APIError`, en het verschil zit in de statuscode en de boodschap.
 * Een losse pure functie, zodat de regel te lezen en te toetsen is zonder dat er
 * ergens een API wordt gebeld.
 */

export type StoringSoort = 'tegoed' | 'sleutel' | 'te_druk' | 'onbereikbaar'

export interface AiStoring {
  soort: StoringSoort
  /** Wat de beheerder moet weten, zonder JSON of statuscodes. */
  uitleg: string
}

const UITLEG: Record<StoringSoort, string> = {
  tegoed: 'Het tegoed bij Anthropic is op. Vul het bij; daarna leest EVA de wachtende post vanzelf.',
  sleutel: 'De API-sleutel van Anthropic wordt niet geaccepteerd. Controleer ANTHROPIC_API_KEY.',
  te_druk: 'Anthropic wees het verzoek af wegens drukte. EVA probeert het bij de volgende ronde opnieuw.',
  onbereikbaar: 'Anthropic is nu niet bereikbaar. EVA probeert het bij de volgende ronde opnieuw.',
}

/**
 * Herkent een storing aan de foutmelding. `null` = het ligt aan dit bericht.
 *
 * Volgorde telt: "credit balance" komt binnen als een 400, en een 400 is normaal
 * juist wél een probleem met het verzoek. De tekst wint dus van de code.
 */
export function bepaalAiStoring(fout: string | null | undefined): AiStoring | null {
  const t = (fout ?? '').toLowerCase()
  if (!t) return null

  const als = (soort: StoringSoort): AiStoring => ({ soort, uitleg: UITLEG[soort] })

  if (t.includes('credit balance') || t.includes('billing') || t.includes('quota')) return als('tegoed')
  if (t.includes('ontbreekt') && t.includes('anthropic_api_key')) return als('sleutel')
  if (t.includes('authentication') || t.includes('invalid x-api-key')
      || /\b401\b/.test(t) || /\b403\b/.test(t)) return als('sleutel')
  if (t.includes('rate limit') || t.includes('overloaded') || /\b429\b/.test(t)) return als('te_druk')
  if (/\b5\d\d\b/.test(t) || t.includes('econnrefused') || t.includes('enotfound')
      || t.includes('etimedout') || t.includes('socket hang up')
      || t.includes('fetch failed') || t.includes('network')) return als('onbereikbaar')

  // Alles wat hier komt gaat over de inhoud van dit ene verzoek: een te groot
  // bericht, een antwoord dat niet parst, een bijlage die de API weigert.
  return null
}

/** Korte regel voor in het scherm en de melding. */
export function storingTekst(s: AiStoring): string {
  return `De mailintake ligt stil: ${s.uitleg}`
}
