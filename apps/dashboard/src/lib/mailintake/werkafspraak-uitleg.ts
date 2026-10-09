import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

/**
 * mailintake/werkafspraak-uitleg.ts
 *
 * EVA zegt terug wat hij van een afspraak begrijpt.
 *
 * WAAROM DIT DE MOEITE WAARD IS
 * Een afspraak in gewone taal kan anders landen dan hij bedoeld was, en dat merk je
 * anders pas bij de tiende mail die verkeerd gelezen is -- of nooit. Door hem meteen
 * terug te laten zeggen staat de misvatting er terwijl je er nog naar kijkt. Het
 * antwoord wordt opgeslagen naast de afspraak, zodat later navraag mogelijk blijft.
 *
 * Het tweede doel is nee zeggen. "Stuur de klant een antwoord" is een redelijke
 * opdracht die het intakeformulier niet kan uitvoeren: het model vult velden in en
 * doet verder niets. Dan hoort daar een eerlijk antwoord op te komen in plaats van
 * een stilzwijgend half resultaat.
 *
 * Splitsen kán wel, en daar zei EVA eerst ook nee tegen -- met als gevolg dat een
 * mail over twee panden één dossier werd en het tweede adres zoekraakte. Het
 * formulier draagt de eerste klus en somt de andere op; het behandelscherm maakt er
 * per klus een dossier van (zie `splitsen.ts`).
 *
 * WAAROM HAIKU EN NIET HET GROTE MODEL
 * Dit is begrijpend lezen van twee regels tekst, en iemand staat ernaar te kijken.
 * Snel en goedkoop weegt hier zwaarder dan het laatste beetje nuance; het echte
 * leeswerk gebeurt in `extractie.ts` met Opus.
 */

const MODEL = 'claude-haiku-4-5-20251001'

/** Wat het formulier kan en wat niet; letterlijk de grens die EVA moet uitleggen. */
const SYSTEEM = `Je bent EVA, de intake van een Nederlands onderhouds- en renovatiebedrijf.

Een medewerker geeft je een werkafspraak of een aanwijzing over het lezen van binnenkomende
post. Jij zegt in twee of drie korte zinnen terug wat je ervan begrijpt en wat je er vanaf nu
mee doet. Schrijf in de ik-vorm, in gewoon Nederlands, zonder vaktaal en zonder opsomming.

WAT JE KUNT
Je leest een mail met bijlagen en vult daarmee één intakeformulier in: opdrachtgever,
contactpersoon, werkadres, omschrijving, scope, categorie, referenties, datums, bedragen,
mandaat, regie, factuuradres, opmerkingen. Een aanwijzing kan je daarin sturen: waar je op let,
hoe je iets uitlegt, welk veld je waar uit haalt.

Je kunt ook één mail opsplitsen in meerdere aanvragen op dezelfde opdrachtgever, bijvoorbeeld
één per werkadres. Dan vul je het formulier voor de eerste klus en zet je de andere adressen
met hun werk ernaast; op het behandelscherm maakt de medewerker er per klus een dossier van,
elk met een eigen Bouw7-project. Zeg daar dus gewoon ja tegen.

WAT JE NIET KUNT
Je maakt zelf geen dossier aan -- dat doet de medewerker, met één klik per dossier --, je
verstuurt niets en je wijzigt geen bestaande dossiers. Je kunt ook
niet buiten de vaste lijsten om: de categorie en de werkmaatschappij komen uit een vaste lijst,
het werkadres wordt tegen de landelijke adressen gecontroleerd, en bedragen worden op
redelijkheid getoetst. Een afspraak kan die controles niet uitzetten.

Vraagt de afspraak iets uit die tweede lijst, zeg dat dan meteen en in één zin, en noem wat je
wél voor hem kunt doen. Verzin geen mogelijkheden die je niet hebt.`

export interface AfspraakUitleg {
  /** Wat EVA ervan begrijpt, voor het scherm en voor de opslag. */
  uitleg: string
  /** Kan de afspraak helemaal worden opgevolgd, of maar deels? */
  volledig: boolean
}

/**
 * Laat EVA een afspraak terugzeggen. Gooit nooit: een mislukte uitleg mag het
 * opslaan van de afspraak niet tegenhouden -- de afspraak zelf is het punt.
 */
export async function legWerkafspraakUit(
  tekst: string,
  context?: { watHetIs: 'werkafspraak' | 'aanwijzing'; onderwerp?: string | null },
): Promise<AfspraakUitleg | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const soort = context?.watHetIs ?? 'werkafspraak'
  const bij = context?.onderwerp
    ? `\n\nDit gaat over één bericht, met als onderwerp: ${context.onderwerp}`
    : ''

  try {
    const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 })
    const antwoord = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEEM,
      messages: [{
        role: 'user',
        content:
          `De medewerker geeft deze ${soort === 'aanwijzing' ? 'aanwijzing' : 'werkafspraak'}:\n\n` +
          `${tekst}${bij}`,
      }],
    })

    const uitleg = (antwoord.content ?? [])
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()

    if (!uitleg) return null

    // Of de afspraak helemaal kan, leidt het scherm hieruit af in plaats van het
    // model er een apart veld voor te laten vullen: één antwoord is minder dat
    // scheef kan lopen. De woorden komen uit de instructie hierboven.
    // "niet zelf" en "geen dossier" stonden hier ook, maar die zegt EVA nu bij elke
    // splitsvraag ("ik maak niet zelf een dossier aan, dat doe jij") terwijl het
    // splitsen gewoon kan -- dan kleurde een haalbare aanwijzing als half.
    const kanNiet = /\b(kan ik niet|lukt niet|niet mogelijk|niet opsplitsen|verstuur geen)\b/i
    return { uitleg, volledig: !kanNiet.test(uitleg) }
  } catch {
    return null
  }
}
