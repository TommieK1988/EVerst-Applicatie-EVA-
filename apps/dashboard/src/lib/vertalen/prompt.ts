import type { Taal } from '@/i18n/talen'

/**
 * Verhoog bij elke inhoudelijke wijziging van de prompt of de woordenlijst. De versie zit
 * in de cachesleutel, dus een nieuwe versie vertaalt alles opnieuw (geleidelijk, bij gebruik).
 */
export const PROMPT_VERSIE = 'v1'

const TAAL_OMSCHRIJVING: Record<Taal, string> = {
  nl: 'Dutch (as used in the Netherlands)',
  pl: 'Polish. Use the informal "ty" form, like Dutch "je".',
  ta: 'Tamil as written in Sri Lanka (not Indian Tamil). Use the polite "நீங்கள்" form and simple, everyday words.',
}

/**
 * Vaste vakwoorden, zodat de app en de vertaalde kantoorteksten dezelfde woorden
 * gebruiken. Gelijk houden met de woordenlijst in src/i18n/README.md.
 */
const WOORDENLIJST: [nl: string, pl: string, ta: string][] = [
  ['dossier', 'projekt', 'திட்டம்'],
  ['opdracht', 'zlecenie', 'பணி ஆணை'],
  ['actie / taak', 'zadanie', 'பணி'],
  ['planning', 'grafik', 'பணி அட்டவணை'],
  ['prikklok', 'rejestracja czasu', 'நேரப் பதிவு'],
  ['uren', 'godziny', 'மணிநேரம்'],
  ['weekstaat', 'karta tygodniowa', 'வாராந்திர நேர அட்டவணை'],
  ['verlof', 'urlop', 'விடுப்பு'],
  ['werkbon', 'karta pracy', 'பணிச் சீட்டு'],
  ['opname', 'oględziny', 'ஆய்வு'],
  ['oplevering', 'odbiór', 'ஒப்படைப்பு'],
  ['opleverpunt', 'usterka do odbioru', 'ஒப்படைப்புக் குறை'],
  ['afwijking', 'niezgodność', 'குறைபாடு'],
  ['toolbox(meeting)', 'toolbox (szkolenie BHP)', 'டூல்பாக்ஸ் (பாதுகாப்புக் கூட்டம்)'],
  ['handboek', 'podręcznik pracownika', 'பணியாளர் கையேடு'],
  ['materieel', 'sprzęt', 'உபகரணங்கள்'],
  ['houtrot', 'zgnilizna drewna', 'மர அழுகல்'],
  ['kozijn', 'rama (okienna/drzwiowa)', 'ஜன்னல்/கதவுச் சட்டம்'],
  ['steiger', 'rusztowanie', 'சாரம்'],
  ['schilderwerk', 'malowanie', 'வர்ணம் பூசுதல்'],
  ['meerwerk', 'prace dodatkowe', 'கூடுதல் வேலை'],
  ['storing', 'awaria', 'பழுது'],
  ['formulier', 'formularz', 'படிவம்'],
  ['handtekening', 'podpis', 'கையொப்பம்'],
  ['opdrachtgever / klant', 'klient', 'வாடிக்கையாளர்'],
  ['uitvoerder', 'kierownik robót', 'பணி மேற்பார்வையாளர்'],
  ['VCA', 'VCA', 'VCA'],
]

/**
 * Systeemprompt per doeltaal. Bewust per taal vast (geen datum, geen variabelen), zodat
 * hij gecachet kan worden.
 */
export function systeemPrompt(doeltaal: Taal): string {
  const kolom = doeltaal === 'pl' ? 1 : doeltaal === 'ta' ? 2 : 0
  const lijst = doeltaal === 'nl'
    ? ''
    : WOORDENLIJST.map((r) => `- ${r[0]} → ${r[kolom]}`).join('\n')

  return [
    'You translate short work texts for construction and maintenance workers of a Dutch',
    'painting, maintenance and renovation company. The texts are written by office staff:',
    'task descriptions, planning notes, notifications, safety instructions, handbook',
    'chapters and form questions. Workers read them on a phone, on site.',
    '',
    `Translate every text into ${TAAL_OMSCHRIJVING[doeltaal]}`,
    '',
    'Rules:',
    '- Keep the meaning exact. Safety instructions must stay just as strict.',
    '- Do NOT translate: names of people, companies and streets; addresses; postcodes;',
    '  project/dossier numbers and codes; product and brand names; licence plates;',
    '  e-mail addresses; URLs; amounts, numbers, dates and times. Copy them as they are.',
    '- Keep Markdown, line breaks, bullet points and placeholders like {naam} unchanged.',
    '- If a text is already in the target language, or has nothing to translate',
    '  (only a name, number or code), return it unchanged.',
    '- Do not add explanations, notes or quotes. Return only the translations.',
    '- Return exactly one translation per input text, in the same order.',
    lijst ? '\nUse these terms consistently (Dutch → target):\n' + lijst : '',
  ].join('\n')
}
